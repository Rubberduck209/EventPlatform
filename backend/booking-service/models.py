from sqlalchemy import (
    Column, Integer, String, DateTime, Numeric, ForeignKey,
    Computed, UniqueConstraint, CheckConstraint,
)
from sqlalchemy.orm import relationship
from database import Base
from utils import now_vn


class Booking(Base):
    """Phần đầu của đơn đặt vé."""
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(50), index=True, nullable=False)
    event_id = Column(String(50), index=True, nullable=False)
    status = Column(String(20), nullable=False, default="PENDING_PAYMENT")  # PENDING_PAYMENT, CONFIRMED, CANCELLED, EXPIRED
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=now_vn)
    expires_at = Column(DateTime, nullable=False)

    items = relationship("BookingItem", back_populates="booking", cascade="all, delete-orphan")
    reservations = relationship("SeatReservation", back_populates="booking")


class BookingItem(Base):
    """Từng dòng vé trong đơn. Ghế ngồi: 1 dòng = 1 ghế. Vé đứng: 1 dòng = n vé, seat_id để trống."""
    __tablename__ = "booking_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    ticket_type_id = Column(String(50), nullable=False)
    seat_id = Column(String(50), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False)

    booking = relationship("Booking", back_populates="items")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_booking_items_quantity_positive"),
    )


class SeatReservation(Base):
    """Khóa ghế ngồi. UNIQUE trên active_seat_key chặn 2 người cùng giữ 1 ghế."""
    __tablename__ = "seat_reservations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String(50), nullable=False, index=True)
    seat_id = Column(String(50), nullable=False)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    status = Column(String(10), nullable=False, default="HELD")  # HELD, SOLD, RELEASED

    # Có giá trị khi ghế còn bị giữ/bán; NULL khi đã nhả -> cho phép đặt lại
    active_seat_key = Column(
        String(110),
        Computed(
            "IF(status IN ('HELD','SOLD'), CONCAT(event_id, ':', seat_id), NULL)",
            persisted=True,
        ),
        unique=True,
    )

    booking = relationship("Booking", back_populates="reservations")


class TicketInventory(Base):
    """Tồn kho vé đứng theo từng sự kiện và loại vé."""
    __tablename__ = "ticket_inventory"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String(50), nullable=False)
    ticket_type_id = Column(String(50), nullable=False)
    total_quantity = Column(Integer, nullable=False)
    held_quantity = Column(Integer, nullable=False, default=0)
    sold_quantity = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("event_id", "ticket_type_id", name="uq_inventory_event_type"),
        CheckConstraint("held_quantity >= 0 AND sold_quantity >= 0", name="ck_inventory_non_negative"),
        CheckConstraint("held_quantity + sold_quantity <= total_quantity", name="ck_inventory_no_oversell"),
    )