import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, List, Optional

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "no-reply@eventhub.vn")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
MAIL_ENABLED = os.getenv("MAIL_ENABLED", "false").lower() == "true"

_payment_mail_logs: List[Dict] = []


def get_mail_logs() -> List[Dict]:
    """Lấy danh sách nhật ký thông báo thanh toán / hoàn tiền đã phát ra."""
    return list(_payment_mail_logs)


def send_payment_email(
    recipient_email: str,
    subject: str,
    html_body: str,
    domain_event_type: str = "PAYMENT_NOTIFICATION",
    payment_code: Optional[str] = None,
    booking_id: Optional[int] = None,
) -> Dict:
    """Gửi email thông báo trạng thái thanh toán/hoàn tiền hoặc lưu vết Domain Event."""
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "domain_event": domain_event_type,
        "payment_code": payment_code,
        "booking_id": booking_id,
        "recipient": recipient_email,
        "subject": subject,
        "status": "DISPATCHED",
    }

    if MAIL_ENABLED and SMTP_USER and SMTP_PASSWORD:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = SMTP_USER
            msg["To"] = recipient_email
            msg.attach(MIMEText(html_body, "html", "utf-8"))

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_USER, [recipient_email], msg.as_string())
            log_entry["status"] = "SENT_SMTP"
        except Exception as exc:
            log_entry["status"] = f"FAILED: {str(exc)}"

    _payment_mail_logs.insert(0, log_entry)
    if len(_payment_mail_logs) > 200:
        _payment_mail_logs.pop()

    return log_entry


def notify_payment_succeeded(
    payment_code: str,
    booking_id: int,
    amount: float,
    gateway_transaction_no: str,
    customer_email: str = "customer1@gmail.com",
) -> Dict:
    """Phát sự kiện PaymentSucceededEvent khi nhận IPN thanh toán thành công từ VNPay / Mock Gateway."""
    subject = f"[EventHub] Xác nhận thanh toán thành công #{payment_code}"
    html_body = (
        f"<h3>Giao dịch thanh toán <strong>{payment_code}</strong> đã thành công!</h3>"
        f"<p>Mã đơn đặt vé (Booking ID): <strong>#{booking_id}</strong></p>"
        f"<p>Số tiền đã thanh toán: <strong>{amount:,.0f} VNĐ</strong></p>"
        f"<p>Mã giao dịch cổng thanh toán: <code>{gateway_transaction_no}</code></p>"
    )
    return send_payment_email(
        recipient_email=customer_email,
        subject=subject,
        html_body=html_body,
        domain_event_type="PaymentSucceededEvent",
        payment_code=payment_code,
        booking_id=booking_id,
    )


def notify_payment_failed(
    payment_code: str,
    booking_id: int,
    amount: float,
    reason: str,
    customer_email: str = "customer1@gmail.com",
) -> Dict:
    """Phát sự kiện PaymentFailedEvent khi thanh toán thất bại hoặc bị hủy."""
    subject = f"[EventHub] Giao dịch thanh toán #{payment_code} không thành công"
    html_body = (
        f"<h3>Giao dịch <strong>{payment_code}</strong> cho đơn #{booking_id} chưa hoàn tất.</h3>"
        f"<p>Số tiền: {amount:,.0f} VNĐ</p>"
        f"<p>Lý do: {reason}</p>"
    )
    return send_payment_email(
        recipient_email=customer_email,
        subject=subject,
        html_body=html_body,
        domain_event_type="PaymentFailedEvent",
        payment_code=payment_code,
        booking_id=booking_id,
    )


def notify_payment_refunded(
    payment_code: str,
    booking_id: int,
    refund_amount: float,
    reason: str,
    customer_email: str = "customer1@gmail.com",
) -> Dict:
    """Phát sự kiện PaymentRefundedEvent khi hoàn tiền thành công cho khách hàng."""
    subject = f"[EventHub] Hoàn tiền thành công cho giao dịch #{payment_code}"
    html_body = (
        f"<h3>Yêu cầu hoàn tiền cho giao dịch <strong>{payment_code}</strong> đã được xử lý!</h3>"
        f"<p>Mã đơn đặt vé (Booking ID): <strong>#{booking_id}</strong></p>"
        f"<p>Số tiền hoàn trả: <strong>{refund_amount:,.0f} VNĐ</strong></p>"
        f"<p>Lý do hoàn tiền: {reason}</p>"
    )
    return send_payment_email(
        recipient_email=customer_email,
        subject=subject,
        html_body=html_body,
        domain_event_type="PaymentRefundedEvent",
        payment_code=payment_code,
        booking_id=booking_id,
    )


def __getattr__(name: str):
    """Hỗ trợ chạy `uvicorn mail:app` tương đương với `uvicorn main:app`."""
    if name == "app":
        from main import app as fastapi_app
        return fastapi_app
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
