import hashlib
import hmac
import os
import re
import unicodedata
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from dotenv import load_dotenv

# Múi giờ Việt Nam (GMT+7) theo chuẩn bắt buộc của cổng VNPay
VN_TZ = timezone(timedelta(hours=7))


def clean_vnpay_order_info(text: str) -> str:
    """
    Chuẩn hóa nội dung đơn hàng (vnp_OrderInfo) theo chuẩn bắt buộc của VNPay:
    - Bỏ dấu tiếng Việt (đ -> d, é -> e, ...)
    - Loại bỏ ký tự đặc biệt (#, (, ), [, ], /, ...)
    - Rút gọn khoảng trắng, giới hạn tối đa 250 ký tự
    Tránh tuyệt đối lỗi 'Thông báo: Sai chữ ký' do lệch URL-encoding khi cổng VNPay kiểm tra chữ ký.
    """
    if not text:
        return "Thanh toan don dat ve"
    text = text.replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9\s\-]", " ", text)
    text = " ".join(text.split())
    return text[:250] or "Thanh toan don dat ve"


def get_vnpay_config() -> Dict[str, str]:
    """
    Lấy cấu hình VNPay Sandbox từ biến môi trường (.env).
    Gọi `load_dotenv(override=True)` để tự động cập nhật ngay khi bạn sửa file `.env`
    mà không cần tắt bật lại server.
    """
    load_dotenv(override=True)
    return {
        "tmn_code": os.getenv("VNPAY_TMN_CODE", "CBGUI0ST").strip(),
        "hash_secret": os.getenv("VNPAY_HASH_SECRET", "IEBIPOBKOKRPCNHGPZFGITFFBJXJDBIU").strip(),
        "payment_url": os.getenv(
            "VNPAY_PAYMENT_URL",
            "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"
        ).strip(),
        "return_url": os.getenv(
            "VNPAY_RETURN_URL",
            "http://localhost:8004/api/v1/payments/vnpay-return"
        ).strip(),
    }


def hmac_sha512(key: str, data: str) -> str:
    """Tạo chữ ký số HMAC-SHA512 theo chuẩn VNPay v2.1.0."""
    byte_key = key.encode("utf-8")
    byte_data = data.encode("utf-8")
    return hmac.new(byte_key, byte_data, hashlib.sha512).hexdigest()


def build_vnpay_payment_url(
    payment_code: str,
    amount_vnd: float,
    order_desc: str,
    client_ip: str = "127.0.0.1",
    bank_code: Optional[str] = None,
    locale: str = "vn",
) -> str:
    """
    Tạo URL chuyển hướng thanh toán sang VNPay Sandbox (v2.1.0).
    - `vnp_Amount`: Nhân 100 theo quy định của VNPay (khử phần thập phân).
    - Sắp xếp các tham số theo thứ tự bảng chữ cái a-z trước khi ký HMAC-SHA512.
    """
    cfg = get_vnpay_config()
    now_vn = datetime.now(VN_TZ)

    # Chuẩn hóa IPv4 nếu trình duyệt gửi IPv6 loopback (::1)
    if not client_ip or client_ip == "::1":
        client_ip = "127.0.0.1"

    safe_order_info = clean_vnpay_order_info(order_desc or f"Thanh toan don dat ve {payment_code}")

    vnp_params: Dict[str, Any] = {
        "vnp_Version": "2.1.0",
        "vnp_Command": "pay",
        "vnp_TmnCode": cfg["tmn_code"],
        "vnp_Amount": int(round(float(amount_vnd) * 100)),
        "vnp_CurrCode": "VND",
        "vnp_TxnRef": payment_code,
        "vnp_OrderInfo": safe_order_info,
        "vnp_OrderType": "other",
        "vnp_Locale": locale or "vn",
        "vnp_ReturnUrl": cfg["return_url"],
        "vnp_IpAddr": client_ip,
        "vnp_CreateDate": now_vn.strftime("%Y%m%d%H%M%S"),
    }

    if bank_code and bank_code.strip():
        vnp_params["vnp_BankCode"] = bank_code.strip()

    sorted_items = sorted(vnp_params.items())
    query_parts = []
    for k, v in sorted_items:
        if v is not None and str(v) != "":
            query_parts.append(f"{urllib.parse.quote_plus(str(k))}={urllib.parse.quote_plus(str(v))}")

    query_string = "&".join(query_parts)
    secure_hash = hmac_sha512(cfg["hash_secret"], query_string)
    return f"{cfg['payment_url']}?{query_string}&vnp_SecureHash={secure_hash}"


def verify_vnpay_signature(params: Dict[str, Any]) -> bool:
    """
    Kiểm tra tính toàn vẹn của chữ ký `vnp_SecureHash` do VNPay gửi về qua IPN / Return URL.
    Chống giả mạo kết quả giao dịch hoặc sửa đổi số tiền thanh toán.
    """
    cfg = get_vnpay_config()
    received_hash = str(params.get("vnp_SecureHash", "")).strip()
    if not received_hash:
        return False

    filtered_items = [
        (k, v)
        for k, v in params.items()
        if k not in ("vnp_SecureHash", "vnp_SecureHashType") and v is not None and str(v) != ""
    ]
    filtered_items.sort(key=lambda item: item[0])

    hash_data = "&".join(
        f"{urllib.parse.quote_plus(str(k))}={urllib.parse.quote_plus(str(v))}"
        for k, v in filtered_items
    )
    expected_hash = hmac_sha512(cfg["hash_secret"], hash_data)
    return hmac.compare_digest(received_hash.lower(), expected_hash.lower())


def build_signed_vnpay_ipn_params(
    payment_code: str,
    amount_vnd: float,
    response_code: str = "00",
    transaction_no: str = "14567890",
    bank_code: str = "NCB",
) -> Dict[str, str]:
    """
    Hàm tiện ích sinh bộ tham số VNPay IPN hợp lệ (có chữ ký HMAC-SHA512 chuẩn)
    phục vụ kiểm thử tự động (Unit Test) hoặc giả lập luồng IPN trên giao diện.
    """
    cfg = get_vnpay_config()
    now_vn = datetime.now(VN_TZ)
    raw_params: Dict[str, str] = {
        "vnp_Amount": str(int(round(float(amount_vnd) * 100))),
        "vnp_BankCode": bank_code,
        "vnp_BankTranNo": f"VNP{transaction_no}",
        "vnp_CardType": "ATM",
        "vnp_OrderInfo": f"Thanh toan don dat ve {payment_code}",
        "vnp_PayDate": now_vn.strftime("%Y%m%d%H%M%S"),
        "vnp_ResponseCode": response_code,
        "vnp_TmnCode": cfg["tmn_code"],
        "vnp_TransactionNo": transaction_no,
        "vnp_TransactionStatus": response_code,
        "vnp_TxnRef": payment_code,
    }
    sorted_items = sorted(raw_params.items())
    hash_data = "&".join(
        f"{urllib.parse.quote_plus(str(k))}={urllib.parse.quote_plus(str(v))}"
        for k, v in sorted_items
    )
    raw_params["vnp_SecureHash"] = hmac_sha512(cfg["hash_secret"], hash_data)
    return raw_params
