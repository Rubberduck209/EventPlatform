import sys
if sys.platform == "win32":
    import asyncio
    from asyncio.selector_events import BaseSelectorEventLoop
    _orig_read_from_self = BaseSelectorEventLoop._read_from_self
    def _read_from_self_patched(self):
        try:
            _orig_read_from_self(self)
        except (ConnectionResetError, OSError):
            pass
    BaseSelectorEventLoop._read_from_self = _read_from_self_patched

import hashlib
import json
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from auth import TokenUser, get_current_user, require_roles
from db import Base, engine, get_db
from mail import (
    get_mail_logs,
    notify_payment_failed,
    notify_payment_refunded,
    notify_payment_succeeded,
)
from model import (
    IdempotencyRecord,
    IdempotencyStatus,
    Payment,
    PaymentMethod,
    PaymentRefund,
    PaymentStatus,
    RefundStatus,
)
from schemas import (
    IdempotencyRecordResponse,
    PaymentCreateRequest,
    PaymentResponse,
    RefundCreateRequest,
    RefundResponse,
    SimulateIPNRequest,
    VNPayIPNResponse,
)
from vnpay import (
    build_signed_vnpay_ipn_params,
    build_vnpay_payment_url,
    get_vnpay_config,
    verify_vnpay_signature,
)
import urllib.request
import urllib.parse

BOOKING_SERVICE_URL = os.getenv("BOOKING_SERVICE_URL", "http://localhost:8003").rstrip("/")


def notify_booking_service(booking_id: int, status: str) -> bool:
    """
    Đồng bộ kết quả thanh toán sang Booking Service (Port 8003):
    - status="CONFIRMED": Thanh toán thành công (ghế HELD -> SOLD, vé đứng -> sold_quantity).
    - status="CANCELLED": Thanh toán thất bại hoặc hoàn tiền (trả lại ghế và vé đứng về kho).
    """
    if not booking_id:
        return False
    raw_base = os.getenv("BOOKING_SERVICE_URL", "http://localhost:8003").rstrip("/")
    clean_base = raw_base.replace("/api/v1", "").rstrip("/") or "http://localhost:8003"

    candidate_endpoints = [
        f"{clean_base}/bookings/{booking_id}/status",
        f"{raw_base}/bookings/{booking_id}/status",
        f"{clean_base}/api/v1/bookings/{booking_id}/status",
    ]

    # Thử qua httpx trước (ổn định và truyền params/headers chuẩn HTTP/1.1)
    try:
        import httpx
        for endpoint in candidate_endpoints:
            try:
                with httpx.Client(timeout=6.0) as client:
                    resp = client.put(endpoint, params={"status": status})
                    if resp.status_code in (200, 201):
                        return True
                    if resp.status_code == 409 and status in resp.text:
                        return True
            except Exception:
                continue
    except ImportError:
        pass

    # Dự phòng bằng urllib nếu môi trường thiếu httpx
    for endpoint in candidate_endpoints:
        try:
            url = f"{endpoint}?status={status}"
            req = urllib.request.Request(url, data=b"", headers={"Content-Length": "0"}, method="PUT")
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status in (200, 201):
                    return True
        except urllib.error.HTTPError as he:
            body = ""
            try:
                body = he.read().decode("utf-8", errors="ignore")
            except Exception:
                pass
            if he.code == 409 and status in body:
                return True
        except Exception:
            continue

    print(f"[Notice] Không thể kết nối cập nhật đơn #{booking_id} sang Booking Service ({clean_base})")
    return False


def compute_request_hash(data: Dict[str, Any]) -> str:
    """Băm nội dung request bằng SHA-256 để kiểm tra tính toàn vẹn của Idempotency Key."""
    canonical = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def generate_payment_code(db: Session) -> str:
    """Sinh mã giao dịch duy nhất theo định dạng chuẩn: PAY-YYYYMMDD-XXXX."""
    date_part = datetime.utcnow().strftime("%Y%m%d")
    for _ in range(10):
        suffix = f"{secrets.randbelow(9000) + 1000}"
        code = f"PAY-{date_part}-{suffix}"
        if not db.query(Payment).filter(Payment.payment_code == code).first():
            return code
    return f"PAY-{date_part}-{secrets.token_hex(3).upper()}"


def format_payment_response(
    payment: Payment,
    payment_url: Optional[str] = None,
    is_idempotent_replay: bool = False,
) -> PaymentResponse:
    """Chuẩn hóa đối tượng Payment trả về kèm danh sách lịch sử hoàn tiền."""
    if not payment_url and payment.status == PaymentStatus.PENDING:
        if payment.payment_method == PaymentMethod.VNPAY_SANDBOX:
            payment_url = build_vnpay_payment_url(
                payment_code=payment.payment_code,
                amount_vnd=float(payment.amount),
                order_desc=f"Thanh toan don dat ve {payment.booking_id} - {payment.payment_code}",
            )
        else:
            payment_url = f"http://localhost:8004/api/v1/payments/mock-checkout/{payment.payment_code}"

    return PaymentResponse(
        id=payment.id,
        payment_code=payment.payment_code,
        booking_id=payment.booking_id,
        customer_id=payment.customer_id,
        amount=float(payment.amount),
        currency=payment.currency,
        payment_method=payment.payment_method,
        status=payment.status,
        gateway_transaction_no=payment.gateway_transaction_no,
        idempotency_key=payment.idempotency_key,
        payment_url=payment_url,
        is_idempotent_replay=is_idempotent_replay,
        paid_at=payment.paid_at,
        created_at=payment.created_at,
        updated_at=payment.updated_at,
        refunds=[
            RefundResponse(
                id=r.id,
                payment_id=r.payment_id,
                booking_id=r.booking_id,
                refund_amount=float(r.refund_amount),
                reason=r.reason,
                status=r.status,
                gateway_refund_id=r.gateway_refund_id,
                error_details=r.error_details,
                processed_at=r.processed_at,
                created_at=r.created_at,
            )
            for r in (payment.refunds or [])
        ],
    )


def seed_initial_payment_data(db: Session):
    """Khởi tạo 2 giao dịch thanh toán mẫu nếu `payment_db` đang trống."""
    if db.query(Payment).count() > 0:
        return

    now = datetime.utcnow()
    # Giao dịch mẫu 1: Đã thanh toán thành công qua VNPay Sandbox
    p1 = Payment(
        payment_code="PAY-20261114-1001",
        booking_id=101,
        customer_id=3,  # customer1@gmail.com
        amount=Decimal("450000.00"),
        currency="VND",
        payment_method=PaymentMethod.VNPAY_SANDBOX,
        status=PaymentStatus.SUCCESS,
        gateway_transaction_no="14500981",
        gateway_response_raw={
            "vnp_TxnRef": "PAY-20261114-1001",
            "vnp_Amount": "45000000",
            "vnp_ResponseCode": "00",
            "vnp_BankCode": "NCB",
        },
        idempotency_key="seed-idem-booking-101",
        paid_at=now - timedelta(hours=2),
    )
    # Giao dịch mẫu 2: Đang chờ thanh toán (PENDING) qua VNPay Sandbox
    p2 = Payment(
        payment_code="PAY-20261114-1002",
        booking_id=102,
        customer_id=3,
        amount=Decimal("240000.00"),
        currency="VND",
        payment_method=PaymentMethod.VNPAY_SANDBOX,
        status=PaymentStatus.PENDING,
        idempotency_key="seed-idem-booking-102",
    )
    db.add_all([p1, p2])
    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Khởi tạo các bảng trong `payment_db` và nạp dữ liệu mẫu ban đầu."""
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        for alter_sql in (
            "ALTER TABLE payment_refunds ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
            "ALTER TABLE payments ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
            "ALTER TABLE payments MODIFY COLUMN status ENUM('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING'",
        ):
            try:
                conn.execute(text(alter_sql))
                conn.commit()
            except Exception:
                pass

    db = next(get_db())
    try:
        seed_initial_payment_data(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Payment Service API (VNPay Sandbox & Idempotency)",
    description="Dịch vụ Xử lý Thanh toán VNPay Sandbox, Tiếp nhận IPN Webhook, Chống trừ tiền trùng (Idempotency) & Hoàn tiền (Refund)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# 1. TẠO PHIÊN THANH TOÁN (VNPAY SANDBOX / MOCK GATEWAY) + IDEMPOTENCY
# ==============================================================================

@app.post(
    "/api/v1/payments/create",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Payments"],
)
def create_payment_session(
    payload: PaymentCreateRequest,
    request: Request,
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Tạo phiên thanh toán mới cho đơn đặt vé (`booking_id`):
    - Kiểm tra `idempotency_key` để chống tạo giao dịch / trừ tiền 2 lần khi người dùng bấm đúp hoặc retry mạng.
    - Sinh đường dẫn thanh toán chuẩn **VNPay Sandbox v2.1.0** có chữ ký số **HMAC-SHA512**.
    """
    idem_key = payload.idempotency_key.strip()
    req_fingerprint = compute_request_hash(
        {
            "booking_id": payload.booking_id,
            "amount": str(Decimal(str(payload.amount)).quantize(Decimal("0.01"))),
            "payment_method": payload.payment_method.value,
        }
    )

    # 1. Kiểm tra Idempotency Record
    existing_idem = (
        db.query(IdempotencyRecord)
        .filter(IdempotencyRecord.idempotency_key == idem_key)
        .first()
    )
    existing_payment = (
        db.query(Payment)
        .options(joinedload(Payment.refunds))
        .filter(Payment.idempotency_key == idem_key)
        .first()
    )

    if existing_idem and existing_payment:
        if existing_idem.request_hash != req_fingerprint:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency key này đã được sử dụng cho một đơn hàng hoặc số tiền khác.",
            )
        return format_payment_response(existing_payment, is_idempotent_replay=True)

    # 2. Tạo bản ghi Idempotency ở trạng thái IN_PROGRESS
    now = datetime.utcnow()
    if not existing_idem:
        idem_record = IdempotencyRecord(
            idempotency_key=idem_key,
            handler_name="create_payment_session",
            request_hash=req_fingerprint,
            status=IdempotencyStatus.IN_PROGRESS,
            expires_at=now + timedelta(hours=24),
        )
        db.add(idem_record)
        db.flush()
    else:
        idem_record = existing_idem

    # 3. Khởi tạo giao dịch Payment
    payment_code = generate_payment_code(db)
    new_payment = Payment(
        payment_code=payment_code,
        booking_id=payload.booking_id,
        customer_id=current_user.id,
        amount=payload.amount,
        currency="VND",
        payment_method=payload.payment_method,
        status=PaymentStatus.PENDING,
        idempotency_key=idem_key,
    )
    db.add(new_payment)
    db.commit()
    db.refresh(new_payment)

    # 4. Sinh URL chuyển hướng sang VNPay Sandbox hoặc Mock Gateway
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    order_desc = payload.order_desc or f"Thanh toan don dat ve {payload.booking_id} - {payment_code}"

    if payload.payment_method == PaymentMethod.VNPAY_SANDBOX:
        payment_url = build_vnpay_payment_url(
            payment_code=payment_code,
            amount_vnd=float(payload.amount),
            order_desc=order_desc,
            client_ip=client_ip,
            bank_code=payload.bank_code,
        )
    else:
        payment_url = f"http://localhost:8004/api/v1/payments/mock-checkout/{payment_code}"

    # 5. Hoàn tất lưu vết Idempotency Record
    idem_record.status = IdempotencyStatus.COMPLETED
    idem_record.response_body = {
        "payment_id": new_payment.id,
        "payment_code": new_payment.payment_code,
        "amount": float(new_payment.amount),
        "payment_url": payment_url,
    }
    db.commit()

    return format_payment_response(new_payment, payment_url=payment_url, is_idempotent_replay=False)


# ==============================================================================
# 2. LUỒNG VNPAY IPN WEBHOOK (NGROK) & RETURN URL + IDEMPOTENCY
# ==============================================================================

def process_vnpay_ipn_params(
    params: Dict[str, Any],
    db: Session,
    customer_email: str = "customer1@gmail.com",
) -> VNPayIPNResponse:
    """
    Xử lý chuẩn xác luồng Instant Payment Notification (IPN) từ VNPay:
    - Mã 97: Sai chữ ký bảo mật HMAC-SHA512 (`Invalid Signature`)
    - Mã 01: Không tìm thấy giao dịch (`Order not found`)
    - Mã 04: Sai lệch số tiền thanh toán (`Invalid amount`)
    - Mã 02: Giao dịch đã được xác nhận trước đó - Chống xử lý trùng lặp (`Order already confirmed`)
    - Mã 00: Xác nhận IPN thành công (`Confirm Success`)
    """
    # Bước 1: Kiểm tra chữ ký HMAC-SHA512
    if not verify_vnpay_signature(params):
        return VNPayIPNResponse(RspCode="97", Message="Invalid Signature")

    txn_ref = str(params.get("vnp_TxnRef", "")).strip()
    vnp_amount_raw = params.get("vnp_Amount")
    response_code = str(params.get("vnp_ResponseCode", "")).strip()
    transaction_status = str(params.get("vnp_TransactionStatus", response_code)).strip()
    transaction_no = str(params.get("vnp_TransactionNo", "")).strip() or "VNP_TXN"

    # Bước 2: Tìm giao dịch theo vnp_TxnRef (payment_code)
    payment = db.query(Payment).filter(Payment.payment_code == txn_ref).first()
    if not payment:
        return VNPayIPNResponse(RspCode="01", Message="Order not found")

    # Bước 3: Kiểm tra số tiền (VNPay nhân 100)
    try:
        expected_vnp_amount = int(round(float(payment.amount) * 100))
        received_vnp_amount = int(vnp_amount_raw)
    except (TypeError, ValueError):
        return VNPayIPNResponse(RspCode="04", Message="Invalid amount")

    if expected_vnp_amount != received_vnp_amount:
        return VNPayIPNResponse(RspCode="04", Message="Invalid amount")

    # Bước 4: Kiểm tra Idempotency chống callback IPN lặp lại nhiều lần
    ipn_idem_key = f"vnpay_ipn:{txn_ref}"
    existing_ipn_idem = (
        db.query(IdempotencyRecord)
        .filter(IdempotencyRecord.idempotency_key == ipn_idem_key)
        .first()
    )
    if existing_ipn_idem or payment.status != PaymentStatus.PENDING:
        return VNPayIPNResponse(RspCode="02", Message="Order already confirmed")

    # Bước 5: Ghi nhận kết quả giao dịch và lưu khóa Idempotency
    now = datetime.utcnow()
    req_hash = compute_request_hash(params)

    if response_code == "00" and transaction_status == "00":
        payment.status = PaymentStatus.SUCCESS
        payment.gateway_transaction_no = transaction_no
        payment.gateway_response_raw = dict(params)
        payment.paid_at = now
        notify_booking_service(payment.booking_id, "CONFIRMED")
        notify_payment_succeeded(
            payment_code=payment.payment_code,
            booking_id=payment.booking_id,
            amount=float(payment.amount),
            gateway_transaction_no=transaction_no,
            customer_email=customer_email,
        )
    else:
        payment.status = PaymentStatus.FAILED
        payment.gateway_transaction_no = transaction_no
        payment.gateway_response_raw = dict(params)
        notify_booking_service(payment.booking_id, "CANCELLED")
        notify_payment_failed(
            payment_code=payment.payment_code,
            booking_id=payment.booking_id,
            amount=float(payment.amount),
            reason=f"VNPay ResponseCode={response_code}",
            customer_email=customer_email,
        )

    result = VNPayIPNResponse(RspCode="00", Message="Confirm Success")
    db.add(
        IdempotencyRecord(
            idempotency_key=ipn_idem_key,
            handler_name="vnpay_ipn_webhook",
            request_hash=req_hash,
            response_body=result.model_dump(),
            status=IdempotencyStatus.COMPLETED,
            expires_at=now + timedelta(days=7),
        )
    )
    db.commit()
    return result


@app.get("/api/v1/payments/vnpay-ipn", response_model=VNPayIPNResponse, tags=["VNPay Webhook & IPN"])
def vnpay_ipn_get(request: Request, db: Session = Depends(get_db)):
    """
    Endpoint chính thức để cấu hình **IPN URL** trên trang quản trị VNPay Sandbox (qua ngrok):
    Ví dụ: `https://<your-ngrok-domain>.ngrok-free.app/api/v1/payments/vnpay-ipn`
    """
    query_params = dict(request.query_params)
    return process_vnpay_ipn_params(query_params, db)


@app.post("/api/v1/payments/vnpay-ipn", response_model=VNPayIPNResponse, tags=["VNPay Webhook & IPN"])
async def vnpay_ipn_post(request: Request, db: Session = Depends(get_db)):
    """Hỗ trợ nhận IPN qua cả phương thức POST (query params hoặc JSON body)."""
    params = dict(request.query_params)
    if not params:
        try:
            body = await request.json()
            if isinstance(body, dict):
                params.update(body)
        except Exception:
            pass
    return process_vnpay_ipn_params(params, db)


@app.get("/api/v1/payments/vnpay-return", response_class=HTMLResponse, tags=["VNPay Webhook & IPN"])
def vnpay_return_page(request: Request, db: Session = Depends(get_db)):
    """
    Return URL: Trang hiển thị kết quả cho trình duyệt khách hàng sau khi thanh toán xong trên VNPay Sandbox.
    Đồng thời cập nhật trạng thái đơn hàng nếu IPN chưa kịp gọi tới.
    """
    params = dict(request.query_params)
    is_valid_sig = verify_vnpay_signature(params)
    txn_ref = params.get("vnp_TxnRef", "")
    resp_code = params.get("vnp_ResponseCode", "")
    frontend_url = os.getenv("FRONTEND_RETURN_URL", "http://localhost:3000")

    if is_valid_sig and txn_ref:
        process_vnpay_ipn_params(params, db)

    status_title = "Thanh toán Thành công!" if (is_valid_sig and resp_code == "00") else "Giao dịch Không thành công"
    status_color = "#16a34a" if (is_valid_sig and resp_code == "00") else "#dc2626"
    sig_note = "Hợp lệ (HMAC-SHA512 Verified)" if is_valid_sig else "Chữ ký không hợp lệ!"

    html = f"""
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8" />
        <title>Kết quả thanh toán VNPay - EventHub</title>
        <style>
            body {{ font-family: system-ui, sans-serif; background: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 95vh; margin: 0; }}
            .box {{ background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 2rem; max-width: 480px; width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
            h2 {{ color: {status_color}; margin-top: 0; }}
            .row {{ display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }}
            .btn {{ display: inline-block; margin-top: 1.25rem; padding: 0.6rem 1.2rem; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 0.9rem; }}
        </style>
    </head>
    <body>
        <div class="box">
            <h2>{status_title}</h2>
            <div class="row"><span>Mã giao dịch (vnp_TxnRef):</span><strong>{txn_ref}</strong></div>
            <div class="row"><span>Mã phản hồi VNPay:</span><strong>{resp_code}</strong></div>
            <div class="row"><span>Kiểm tra chữ ký số:</span><strong>{sig_note}</strong></div>
            <a class="btn" href="{frontend_url}">← Quay về trang ứng dụng EventHub</a>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)


@app.post("/api/v1/payments/simulate-vnpay-ipn", response_model=VNPayIPNResponse, tags=["VNPay Webhook & IPN"])
def simulate_vnpay_ipn_callback(
    payload: SimulateIPNRequest,
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Tiện ích giả lập cuộc gọi **VNPay IPN có chữ ký HMAC-SHA512 hợp lệ**:
    Giúp kiểm thử nhanh luồng xác thực chữ ký, cập nhật trạng thái thanh toán và chống gọi lặp (Idempotency)
    ngay trên giao diện Frontend hoặc khi chưa bật ngrok.
    """
    payment = db.query(Payment).filter(Payment.payment_code == payload.payment_code.strip()).first()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy mã giao dịch thanh toán.")

    signed_params = build_signed_vnpay_ipn_params(
        payment_code=payment.payment_code,
        amount_vnd=float(payment.amount),
        response_code=payload.response_code.strip(),
        transaction_no=f"14{secrets.randbelow(900000) + 100000}",
        bank_code=payload.bank_code.strip() or "NCB",
    )
    return process_vnpay_ipn_params(
        signed_params,
        db=db,
        customer_email=current_user.email or "customer1@gmail.com",
    )


# ==============================================================================
# 3. XỬ LÝ HOÀN TIỀN (REFUND)
# ==============================================================================

@app.post(
    "/api/v1/payments/{payment_id}/refund",
    response_model=RefundResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Refunds"],
)
def refund_payment(
    payment_id: int,
    payload: RefundCreateRequest,
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Thực hiện hoàn tiền (Refund) cho giao dịch đã thanh toán thành công (`SUCCESS`):
    - Kiểm tra tổng số tiền hoàn không vượt quá số tiền gốc đã thu.
    - Lưu lịch sử vào bảng `payment_refunds` và gửi thông báo hoàn tiền qua `mail.py`.
    """
    payment = (
        db.query(Payment)
        .options(joinedload(Payment.refunds))
        .filter(Payment.id == payment_id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy giao dịch thanh toán.")

    if current_user.role == "CUSTOMER" and payment.customer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn chỉ có thể yêu cầu hoàn tiền cho giao dịch của chính mình.",
        )

    if payment.status != PaymentStatus.SUCCESS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chỉ có thể hoàn tiền cho giao dịch ở trạng thái SUCCESS (hiện tại: {payment.status.value}).",
        )

    already_refunded = sum(
        Decimal(str(r.refund_amount))
        for r in (payment.refunds or [])
        if r.status == RefundStatus.SUCCESS
    )
    remaining_refundable = Decimal(str(payment.amount)) - already_refunded
    if remaining_refundable <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Giao dịch này đã được hoàn tiền toàn bộ trước đó.",
        )

    requested_amount = (
        Decimal(str(payload.refund_amount)).quantize(Decimal("0.01"))
        if payload.refund_amount is not None
        else remaining_refundable
    )

    if requested_amount > remaining_refundable:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Số tiền yêu cầu hoàn ({requested_amount:,.0f} đ) vượt quá số dư khả dụng ({remaining_refundable:,.0f} đ).",
        )

    now = datetime.utcnow()
    refund_record = PaymentRefund(
        payment_id=payment.id,
        booking_id=payment.booking_id,
        refund_amount=requested_amount,
        reason=payload.reason.strip(),
        status=RefundStatus.SUCCESS,
        gateway_refund_id=f"VNP-REF-{now.strftime('%Y%m%d')}-{secrets.randbelow(9000) + 1000}",
        processed_at=now,
    )
    db.add(refund_record)
    db.commit()
    db.refresh(refund_record)

    notify_booking_service(payment.booking_id, "CANCELLED")
    notify_payment_refunded(
        payment_code=payment.payment_code,
        booking_id=payment.booking_id,
        refund_amount=float(refund_record.refund_amount),
        reason=refund_record.reason,
        customer_email=current_user.email or "customer1@gmail.com",
    )

    return RefundResponse(
        id=refund_record.id,
        payment_id=refund_record.payment_id,
        booking_id=refund_record.booking_id,
        refund_amount=float(refund_record.refund_amount),
        reason=refund_record.reason,
        status=refund_record.status,
        gateway_refund_id=refund_record.gateway_refund_id,
        error_details=refund_record.error_details,
        processed_at=refund_record.processed_at,
        created_at=refund_record.created_at,
    )


@app.post("/api/v1/payments/refund-by-event/{event_id}", tags=["Refunds"])
def refund_payments_by_event(
    event_id: int,
    payload: RefundCreateRequest,
    current_user: TokenUser = Depends(require_roles(["ORGANIZER", "ADMIN"])),
    db: Session = Depends(get_db),
):
    """
    Tự động hoàn tiền 100% hàng loạt cho các giao dịch đã thanh toán (`SUCCESS`) khi Sự kiện bị hủy.
    Lưu lịch sử hoàn tiền và gửi thông báo hoàn tiền qua `mail.py`.
    """
    payments = (
        db.query(Payment)
        .options(joinedload(Payment.refunds))
        .filter(Payment.status == PaymentStatus.SUCCESS)
        .all()
    )
    now = datetime.utcnow()
    refunded_count = 0
    total_refunded_amount = Decimal("0.00")

    for payment in payments:
        already_refunded = sum(
            Decimal(str(r.refund_amount))
            for r in (payment.refunds or [])
            if r.status == RefundStatus.SUCCESS
        )
        remaining = Decimal(str(payment.amount)) - already_refunded
        if remaining <= Decimal("0.00"):
            continue

        refund_record = PaymentRefund(
            payment_id=payment.id,
            booking_id=payment.booking_id,
            refund_amount=remaining,
            reason=f"[Hủy sự kiện #{event_id}] {payload.reason.strip()}",
            status=RefundStatus.SUCCESS,
            gateway_refund_id=f"VNP-EVREF-{now.strftime('%Y%m%d')}-{secrets.randbelow(9000) + 1000}",
            processed_at=now,
        )
        db.add(refund_record)
        refunded_count += 1
        total_refunded_amount += remaining

        notify_booking_service(payment.booking_id, "CANCELLED")
        notify_payment_refunded(
            payment_code=payment.payment_code,
            booking_id=payment.booking_id,
            refund_amount=float(remaining),
            reason=refund_record.reason,
            customer_email="customer1@gmail.com",
        )

    db.commit()
    return {
        "event_id": event_id,
        "refunded_transactions": refunded_count,
        "total_refunded_amount": float(total_refunded_amount),
        "message": f"Đã hoàn tiền tự động cho {refunded_count} giao dịch ({float(total_refunded_amount):,.0f} đ).",
    }


# ==============================================================================
# 4. TRA CỨU GIAO DỊCH, CẤU HÌNH NGROK/VNPAY & NHẬT KÝ IDEMPOTENCY
# ==============================================================================

@app.get("/api/v1/payments/my-payments", response_model=List[PaymentResponse], tags=["Payments"])
def list_my_payments(
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Khách hàng xem danh sách các giao dịch thanh toán & hoàn tiền của mình."""
    # Tự động đồng bộ customer_id của 2 giao dịch mẫu cho tài khoản customer1@gmail.com
    if current_user.email == "customer1@gmail.com":
        seeded = db.query(Payment).filter(Payment.idempotency_key.like("seed-idem-%")).all()
        for sp in seeded:
            if sp.customer_id != current_user.id:
                sp.customer_id = current_user.id
        db.commit()

    # Tự động quét và cập nhật các đơn PENDING đã quá 10 phút sang EXPIRED
    now = datetime.utcnow()
    pending_payments = (
        db.query(Payment)
        .filter(Payment.status == PaymentStatus.PENDING)
        .all()
    )
    has_expired_update = False
    for p in pending_payments:
        if p.created_at and (now - p.created_at) > timedelta(minutes=10):
            p.status = PaymentStatus.EXPIRED
            has_expired_update = True
    if has_expired_update:
        db.commit()

    query = db.query(Payment).options(joinedload(Payment.refunds))
    if current_user.role == "CUSTOMER":
        query = query.filter(Payment.customer_id == current_user.id)
    payments = query.order_by(Payment.id.desc()).all()
    return [format_payment_response(p) for p in payments]


@app.get("/api/v1/payments/config-info", tags=["VNPay Webhook & IPN"])
def get_vnpay_and_ngrok_info():
    """Trả về thông tin cấu hình VNPay Sandbox & đường dẫn IPN Webhook cho ngrok."""
    cfg = get_vnpay_config()
    ngrok_base = os.getenv("PUBLIC_NGROK_URL", "http://localhost:8004").rstrip("/")
    return {
        "vnpay_tmn_code": cfg["tmn_code"],
        "vnpay_payment_url": cfg["payment_url"],
        "vnpay_return_url": cfg["return_url"],
        "ipn_webhook_url": f"{ngrok_base}/api/v1/payments/vnpay-ipn",
    }


@app.get("/api/v1/payments/idempotency-records", response_model=List[IdempotencyRecordResponse], tags=["Idempotency"])
def list_idempotency_records(
    current_user: TokenUser = Depends(require_roles(["ADMIN", "ORGANIZER", "CUSTOMER"])),
    db: Session = Depends(get_db),
):
    """Xem danh sách các khóa chống trùng lặp (Idempotency Records) đã ghi nhận."""
    return db.query(IdempotencyRecord).order_by(IdempotencyRecord.created_at.desc()).limit(50).all()


@app.get("/api/v1/payments/mail-logs", tags=["Payments"])
def list_payment_mail_logs():
    """Xem lịch sử Domain Events & Email đã phát ra từ Payment Service (qua mail.py)."""
    return get_mail_logs()


@app.get("/api/v1/payments/{payment_id}/checkout", tags=["Payments"])
def redirect_to_vnpay_checkout(
    payment_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Sinh URL VNPay Sandbox mới nhất (với `VNPAY_TMN_CODE` hiện tại trong `.env` và `vnp_CreateDate` tức thời)
    rồi chuyển hướng (302 Redirect) trình duyệt sang cổng thanh toán VNPay Sandbox.
    Nếu đơn đã hết hạn (quá 10 phút) hoặc không ở trạng thái PENDING, chặn thanh toán và hiển thị thông báo.
    """
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy giao dịch thanh toán.")

    now = datetime.utcnow()
    is_expired = (
        payment.status == PaymentStatus.EXPIRED
        or (payment.status == PaymentStatus.PENDING and payment.created_at and (now - payment.created_at) > timedelta(minutes=10))
    )
    if is_expired:
        payment.status = PaymentStatus.EXPIRED
        db.commit()
        html = """
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <title>Đơn hàng hết hạn thanh toán - EventHub</title>
            <style>
                body { font-family: system-ui, sans-serif; background: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 90vh; margin: 0; }
                .box { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 2.5rem; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
                h2 { color: #dc2626; margin-top: 0; }
                p { color: #64748b; font-size: 0.95rem; line-height: 1.5; }
                .btn { display: inline-block; margin-top: 1.5rem; padding: 0.65rem 1.25rem; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 0.9rem; }
            </style>
        </head>
        <body>
            <div class="box">
                <h2>⏰ Đơn hàng đã hết hạn thanh toán</h2>
                <p>Thời gian giữ chỗ (10 phút) cho đơn hàng này đã kết thúc. Vé/chỗ ngồi đã được trả lại kho cho người khác.</p>
                <p>Vui lòng quay lại ứng dụng để thực hiện đặt chỗ mới.</p>
                <a class="btn" href="http://localhost:3000">Quay về trang EventHub</a>
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=html, status_code=400)

    if payment.status != PaymentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Giao dịch đã được xử lý (trạng thái: {payment.status}). Không thể tiếp tục thanh toán.",
        )

    client_ip = request.client.host if request and request.client else "127.0.0.1"
    fresh_url = build_vnpay_payment_url(
        payment_code=payment.payment_code,
        amount_vnd=float(payment.amount),
        order_desc=f"Thanh toan don dat ve {payment.booking_id} - {payment.payment_code}",
        client_ip=client_ip,
    )
    return RedirectResponse(url=fresh_url, status_code=status.HTTP_302_FOUND)


@app.get("/api/v1/payments/{payment_id}", response_model=PaymentResponse, tags=["Payments"])
def get_payment_detail(
    payment_id: int,
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Xem chi tiết một giao dịch thanh toán và danh sách hoàn tiền đi kèm."""
    payment = (
        db.query(Payment)
        .options(joinedload(Payment.refunds))
        .filter(Payment.id == payment_id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy giao dịch thanh toán.")
    return format_payment_response(payment)
