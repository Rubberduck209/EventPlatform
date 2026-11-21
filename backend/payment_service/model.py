import enum
from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    func
)
from sqlalchemy.orm import relationship
from db import Base

# Tương thích đồng thời MySQL (BIGINT AUTO_INCREMENT) và SQLite In-Memory (INTEGER PRIMARY KEY AUTOINCREMENT)
PKBigInt = BigInteger().with_variant(Integer, "sqlite")


class PaymentMethod(str, enum.Enum):
    VNPAY_SANDBOX = "VNPAY_SANDBOX"
    MOCK_GATEWAY = "MOCK_GATEWAY"


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class RefundStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class IdempotencyStatus(str, enum.Enum):
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Payment(Base):
    """Bảng giao dịch thanh toán (payments) trong payment_db."""
    __tablename__ = "payments"
    __table_args__ = (
        Index("idx_payment_booking", "booking_id"),
        Index("idx_payment_customer", "customer_id"),
    )

    id = Column(PKBigInt, primary_key=True, index=True, autoincrement=True)
    payment_code = Column(String(64), unique=True, nullable=False, index=True)  # PAY-YYYYMMDD-XXXX
    booking_id = Column(PKBigInt, nullable=False)    # Tham chiếu logic sang Booking Service
    customer_id = Column(PKBigInt, nullable=False)   # Tham chiếu logic sang Identity Service
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(10), default="VND", nullable=False)
    payment_method = Column(
        Enum(PaymentMethod),
        default=PaymentMethod.VNPAY_SANDBOX,
        nullable=False
    )
    status = Column(
        Enum(PaymentStatus),
        default=PaymentStatus.PENDING,
        nullable=False
    )
    gateway_transaction_no = Column(String(100), nullable=True)
    gateway_response_raw = Column(JSON, nullable=True)
    idempotency_key = Column(String(128), unique=True, nullable=False, index=True)
    paid_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    refunds = relationship("PaymentRefund", back_populates="payment", cascade="all, delete-orphan")


class PaymentRefund(Base):
    """Bảng lịch sử hoàn tiền (payment_refunds) trong payment_db."""
    __tablename__ = "payment_refunds"
    __table_args__ = (
        Index("idx_refund_payment", "payment_id"),
    )

    id = Column(PKBigInt, primary_key=True, index=True, autoincrement=True)
    payment_id = Column(PKBigInt, ForeignKey("payments.id", ondelete="CASCADE"), nullable=False)
    booking_id = Column(PKBigInt, nullable=False)
    refund_amount = Column(Numeric(12, 2), nullable=False)
    reason = Column(String(255), nullable=False)
    status = Column(
        Enum(RefundStatus),
        default=RefundStatus.PENDING,
        nullable=False
    )
    gateway_refund_id = Column(String(100), nullable=True)
    error_details = Column(Text, nullable=True)
    processed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    payment = relationship("Payment", back_populates="refunds")


class IdempotencyRecord(Base):
    """Bảng kiểm soát khóa chống lặp request / callback webhook (idempotency_records)."""
    __tablename__ = "idempotency_records"

    idempotency_key = Column(String(128), primary_key=True, index=True)
    handler_name = Column(String(100), nullable=False)
    request_hash = Column(String(64), nullable=False)
    response_body = Column(JSON, nullable=True)
    status = Column(
        Enum(IdempotencyStatus),
        default=IdempotencyStatus.IN_PROGRESS,
        nullable=False
    )
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
