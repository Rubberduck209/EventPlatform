from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from database import Base
from utils import now_vn


class Ticket(Base):
    """Vé điện tử: mỗi ghế hoặc mỗi người là một vé."""

    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_code = Column(String(40), unique=True, nullable=False, index=True)  # mã nằm trong QR
    booking_id = Column(Integer, nullable=False, index=True)  # tham chiếu Booking Service, không có khóa ngoại
    ticket_index = Column(Integer, nullable=False, default=1)  # thứ tự vé trong đơn, dùng chống phát hành trùng
    event_id = Column(String(50), nullable=False, index=True)
    ticket_type_id = Column(String(50), nullable=False)
    seat_id = Column(String(50), nullable=True)  # trống nếu là vé đứng
    owner_user_id = Column(String(50), nullable=False, index=True)
    owner_name = Column(String(100), nullable=False)
    status = Column(String(20), nullable=False, default="ISSUED")  # ISSUED, CHECKED_IN, CANCELLED
    qr_version = Column(Integer, nullable=False, default=1)  # tăng khi chuyển nhượng để QR cũ hết hiệu lực
    issued_at = Column(DateTime, nullable=False, default=now_vn)
    checked_in_at = Column(DateTime, nullable=True)
    checked_in_by = Column(String(50), nullable=True)

    __table_args__ = (
        UniqueConstraint("booking_id", "ticket_index", name="uq_ticket_booking_index"),
    )


class CheckinLog(Base):
    """Nhật ký mọi lượt quét, cả thành công lẫn thất bại."""

    __tablename__ = "checkin_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True, index=True)  # trống nếu QR không khớp vé nào
    ticket_code = Column(String(60), nullable=True)
    event_id = Column(String(50), nullable=True, index=True)
    staff_id = Column(String(50), nullable=False)
    # SUCCESS, ALREADY_CHECKED_IN, INVALID_SIGNATURE, WRONG_EVENT, NOT_FOUND, OLD_QR, CANCELLED, NOT_VALID
    result = Column(String(30), nullable=False)
    scanned_at = Column(DateTime, nullable=False, default=now_vn, index=True)


class TicketTransfer(Base):
    """Lịch sử chuyển nhượng vé."""

    __tablename__ = "ticket_transfers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    from_user_id = Column(String(50), nullable=False)
    to_user_id = Column(String(50), nullable=False)
    to_owner_name = Column(String(100), nullable=False)
    transferred_at = Column(DateTime, nullable=False, default=now_vn)
