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

# Bộ nhớ lưu vết lịch sử phát tán thông báo / email sự kiện (Domain Events & Mail Logs)
_mail_dispatch_logs: List[Dict] = []


def get_mail_logs() -> List[Dict]:
    """Trả về danh sách nhật ký thông báo email / sự kiện đã phát ra từ Event Service."""
    return list(_mail_dispatch_logs)


def send_event_email(
    recipient_email: str,
    subject: str,
    html_body: str,
    domain_event_type: str = "EVENT_NOTIFICATION",
    event_id: Optional[int] = None
) -> Dict:
    """
    Gửi email thông báo vòng đời sự kiện (hoặc ghi nhận Domain Event nếu chạy ở môi trường dev).
    """
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "domain_event": domain_event_type,
        "event_id": event_id,
        "recipient": recipient_email,
        "subject": subject,
        "status": "DISPATCHED"
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

    _mail_dispatch_logs.insert(0, log_entry)
    if len(_mail_dispatch_logs) > 200:
        _mail_dispatch_logs.pop()

    return log_entry


def notify_event_published(
    event_id: int,
    title: str,
    venue_name: str,
    start_time: datetime,
    organizer_email: str = "organizer@gmail.com"
) -> Dict:
    """Phát sự kiện EventPublishedEvent và gửi thông báo khi sự kiện được công bố / mở bán."""
    subject = f"[EventHub] Sự kiện '{title}' đã được công bố"
    html_body = (
        f"<h3>Sự kiện <strong>{title}</strong> (ID #{event_id}) đã chính thức công bố!</h3>"
        f"<p>Địa điểm: {venue_name}</p>"
        f"<p>Thời gian bắt đầu: {start_time.strftime('%d/%m/%Y %H:%M')}</p>"
    )
    return send_event_email(
        recipient_email=organizer_email,
        subject=subject,
        html_body=html_body,
        domain_event_type="EventPublishedEvent",
        event_id=event_id
    )


def notify_event_time_changed(
    event_id: int,
    title: str,
    old_start: datetime,
    new_start: datetime,
    organizer_email: str = "organizer@gmail.com"
) -> Dict:
    """Phát sự kiện EventTimeChangedEvent và gửi thông báo khi sự kiện thay đổi lịch diễn."""
    subject = f"[EventHub] Thông báo thay đổi thời gian sự kiện '{title}'"
    html_body = (
        f"<h3>Sự kiện <strong>{title}</strong> (ID #{event_id}) đã cập nhật lịch diễn</h3>"
        f"<p>Thời gian cũ: {old_start.strftime('%d/%m/%Y %H:%M')}</p>"
        f"<p>Thời gian mới: <strong>{new_start.strftime('%d/%m/%Y %H:%M')}</strong></p>"
    )
    return send_event_email(
        recipient_email=organizer_email,
        subject=subject,
        html_body=html_body,
        domain_event_type="EventTimeChangedEvent",
        event_id=event_id
    )


def notify_event_cancelled(
    event_id: int,
    title: str,
    reason: Optional[str] = None,
    organizer_email: str = "organizer@gmail.com"
) -> Dict:
    """Phát sự kiện EventCancelledEvent và kích hoạt thông báo hủy sự kiện."""
    subject = f"[EventHub] Thông báo HỦY sự kiện '{title}'"
    html_body = (
        f"<h3>Sự kiện <strong>{title}</strong> (ID #{event_id}) đã bị hủy.</h3>"
        f"<p>Lý do: {reason or 'Theo quyết định từ Ban tổ chức'}</p>"
    )
    return send_event_email(
        recipient_email=organizer_email,
        subject=subject,
        html_body=html_body,
        domain_event_type="EventCancelledEvent",
        event_id=event_id
    )


def notify_event_cancel_otp(
    event_id: int,
    title: str,
    otp_code: str,
    organizer_email: str = "organizer@gmail.com"
) -> Dict:
    """Gửi mã bảo mật OTP 6 chữ số tới email của Ban tổ chức khi yêu cầu hủy sự kiện."""
    subject = f"[EventHub] Mã OTP xác nhận hủy sự kiện '{title}': {otp_code}"
    html_body = (
        f"<h3>Yêu cầu xác thực hủy sự kiện <strong>{title}</strong> (ID #{event_id})</h3>"
        f"<p>Mã OTP bảo mật của bạn là: <strong style='font-size:18px;color:#dc2626'>{otp_code}</strong> (hiệu lực 5 phút).</p>"
        f"<p>Nếu bạn không thực hiện yêu cầu này, vui lòng đổi mật khẩu ngay lập tức.</p>"
    )
    return send_event_email(
        recipient_email=organizer_email,
        subject=subject,
        html_body=html_body,
        domain_event_type="EventCancellationOTPRequested",
        event_id=event_id
    )


def __getattr__(name: str):
    """Hỗ trợ chạy `uvicorn mail:app` tương đương với `uvicorn main:app`."""
    if name == "app":
        from main import app as fastapi_app
        return fastapi_app
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
