import enum
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func
)
from sqlalchemy.orm import relationship
from db import Base

# Tương thích đồng thời MySQL (BIGINT AUTO_INCREMENT) và SQLite In-Memory (INTEGER PRIMARY KEY AUTOINCREMENT)
PKBigInt = BigInteger().with_variant(Integer, "sqlite")


class EventStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ON_SALE = "ON_SALE"
    HAPPENING = "HAPPENING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ZoneType(str, enum.Enum):
    STANDING = "STANDING"
    SEATED = "SEATED"


class EventCategory(Base):
    """Bảng danh mục sự kiện (event_categories)."""
    __tablename__ = "event_categories"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(120), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    events = relationship("Event", back_populates="category")


class Event(Base):
    """Bảng thông tin sự kiện (events)."""
    __tablename__ = "events"
    __table_args__ = (
        Index("idx_event_status_time", "status", "start_time"),
        Index("idx_event_organizer", "organizer_id"),
    )

    id = Column(PKBigInt, primary_key=True, index=True, autoincrement=True)
    organizer_id = Column(PKBigInt, nullable=False, index=True)  # Tham chiếu logic sang Identity Service
    category_id = Column(Integer, ForeignKey("event_categories.id"), nullable=False)
    title = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    short_description = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    banner_url = Column(String(255), nullable=True)
    venue_name = Column(String(191), nullable=False)
    venue_address = Column(String(255), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(Enum(EventStatus), default=EventStatus.DRAFT, nullable=False)
    refund_policy = Column(Text, nullable=True)
    cancel_reason = Column(Text, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    category = relationship("EventCategory", back_populates="events")
    zones = relationship("EventZone", back_populates="event", cascade="all, delete-orphan")
    ticket_types = relationship("TicketType", back_populates="event", cascade="all, delete-orphan")


class EventZone(Base):
    """Bảng khu vực tổ chức: Khu vực đứng (STANDING) hoặc Khu vực có ghế ngồi (SEATED)."""
    __tablename__ = "event_zones"

    id = Column(PKBigInt, primary_key=True, index=True, autoincrement=True)
    event_id = Column(PKBigInt, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    zone_type = Column(Enum(ZoneType), nullable=False)
    total_capacity = Column(Integer, nullable=False, default=0)
    grid_rows = Column(Integer, nullable=True)  # Số hàng ghế trong Grid Map Editor (nếu SEATED)
    grid_cols = Column(Integer, nullable=True)  # Số cột ghế trong Grid Map Editor (nếu SEATED)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    event = relationship("Event", back_populates="zones")
    seats = relationship("Seat", back_populates="zone", cascade="all, delete-orphan")
    ticket_types = relationship("TicketType", back_populates="zone", cascade="all, delete-orphan")


class Seat(Base):
    """Bảng chi tiết chỗ ngồi trên Grid Map Editor (cho khu vực SEATED)."""
    __tablename__ = "seats"
    __table_args__ = (
        UniqueConstraint("zone_id", "row_index", "col_index", name="uk_zone_seat_coord"),
        UniqueConstraint("zone_id", "seat_code", name="uk_zone_seat_code"),
    )

    id = Column(PKBigInt, primary_key=True, index=True, autoincrement=True)
    zone_id = Column(PKBigInt, ForeignKey("event_zones.id", ondelete="CASCADE"), nullable=False, index=True)
    row_index = Column(Integer, nullable=False)
    col_index = Column(Integer, nullable=False)
    row_code = Column(String(10), nullable=False)      # A, B, C...
    seat_number = Column(Integer, nullable=False)     # 1, 2, 3...
    seat_code = Column(String(20), nullable=False)    # A01, B12...
    is_disabled = Column(Boolean, default=False, nullable=False)  # Ghế bị tô đen (lối đi, cột nhà, ghế hỏng)
    seat_tier = Column(String(50), default="STANDARD", nullable=False)  # Hạng ghế phân màu (VIP, STANDARD, STUDENT)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    zone = relationship("EventZone", back_populates="seats")


class TicketType(Base):
    """Bảng loại vé (VIP, Standard, Student...) và điều kiện ràng buộc mua vé."""
    __tablename__ = "ticket_types"

    id = Column(PKBigInt, primary_key=True, index=True, autoincrement=True)
    event_id = Column(PKBigInt, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    zone_id = Column(PKBigInt, ForeignKey("event_zones.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    total_quantity = Column(Integer, nullable=False)
    max_per_order = Column(Integer, default=4, nullable=False)  # Chống đầu cơ: tối đa 4 vé/đơn
    is_student_only = Column(Boolean, default=False, nullable=False)  # Ràng buộc email trường học
    student_email_domain = Column(String(100), nullable=True)         # VD: @tdtu.edu.vn
    sale_start_time = Column(DateTime, nullable=True)                 # Thời điểm bắt đầu mở bán loại vé
    sale_end_time = Column(DateTime, nullable=True)                   # Thời điểm kết thúc bán loại vé (mặc định trước thời gian diễn ra sự kiện)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    event = relationship("Event", back_populates="ticket_types")
    zone = relationship("EventZone", back_populates="ticket_types")
    pricing_rules = relationship("TicketPricingRule", back_populates="ticket_type", cascade="all, delete-orphan")


class TicketPricingRule(Base):
    """Bảng quy tắc giá vé động theo khung thời gian (Early Bird, Regular, Late)."""
    __tablename__ = "ticket_pricing_rules"
    __table_args__ = (
        Index("idx_pricing_lookup", "ticket_type_id", "start_time", "end_time"),
    )

    id = Column(PKBigInt, primary_key=True, index=True, autoincrement=True)
    ticket_type_id = Column(PKBigInt, ForeignKey("ticket_types.id", ondelete="CASCADE"), nullable=False)
    rule_name = Column(String(100), nullable=False)  # Early Bird, Regular, Late
    price = Column(Numeric(12, 2), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    ticket_type = relationship("TicketType", back_populates="pricing_rules")
