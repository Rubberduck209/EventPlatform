from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from model import IdempotencyStatus, PaymentMethod, PaymentStatus, RefundStatus


# ==================== PAYMENT SCHEMAS ====================

class PaymentCreateRequest(BaseModel):
    booking_id: int = Field(..., ge=1, examples=[101], description="Mã đơn đặt vé từ Booking Service")
    amount: Decimal = Field(..., gt=0, examples=[298000], description="Số tiền cần thanh toán (VNĐ)")
    payment_method: PaymentMethod = Field(
        default=PaymentMethod.VNPAY_SANDBOX,
        examples=["VNPAY_SANDBOX"],
        description="VNPAY_SANDBOX hoặc MOCK_GATEWAY",
    )
    idempotency_key: str = Field(
        ...,
        min_length=4,
        max_length=128,
        examples=["idem-booking-101-attempt-1"],
        description="Khóa chống tạo giao dịch / trừ tiền trùng lặp",
    )
    order_desc: Optional[str] = Field(
        default=None,
        max_length=255,
        examples=["Thanh toan ve su kien TDTU Music Festival"],
    )
    bank_code: Optional[str] = Field(
        default="NCB",
        max_length=32,
        examples=["NCB"],
        description="Mã ngân hàng test trên VNPay Sandbox (mặc định: NCB)",
    )


class RefundResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    payment_id: int
    booking_id: int
    refund_amount: float
    reason: str
    status: RefundStatus
    gateway_refund_id: Optional[str] = None
    error_details: Optional[str] = None
    processed_at: Optional[datetime] = None
    created_at: datetime


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    payment_code: str
    booking_id: int
    customer_id: int
    amount: float
    currency: str
    payment_method: PaymentMethod
    status: PaymentStatus
    gateway_transaction_no: Optional[str] = None
    idempotency_key: str
    payment_url: Optional[str] = None
    is_idempotent_replay: bool = False
    paid_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    refunds: List[RefundResponse] = []


# ==================== REFUND SCHEMAS ====================

class RefundCreateRequest(BaseModel):
    refund_amount: Optional[Decimal] = Field(
        default=None,
        gt=0,
        examples=[298000],
        description="Số tiền cần hoàn (nếu để trống sẽ hoàn 100% số tiền khả dụng)",
    )
    reason: str = Field(
        ...,
        min_length=3,
        max_length=255,
        examples=["Khách hàng hủy vé trước hạn 7 ngày theo chính sách sự kiện"],
    )


# ==================== VNPAY IPN & MOCK CALLBACK SCHEMAS ====================

class VNPayIPNResponse(BaseModel):
    RspCode: str = Field(..., examples=["00"], description="Mã phản hồi chuẩn VNPay IPN (00, 01, 02, 04, 97, 99)")
    Message: str = Field(..., examples=["Confirm Success"])


class SimulateIPNRequest(BaseModel):
    payment_code: str = Field(..., examples=["PAY-20261114-0001"])
    response_code: str = Field(
        default="00",
        examples=["00"],
        description="00 = Giao dịch thành công, 24 = Khách hàng hủy giao dịch, 51 = Không đủ số dư",
    )
    bank_code: str = Field(default="NCB", examples=["NCB"])


class IdempotencyRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    idempotency_key: str
    handler_name: str
    request_hash: str
    response_body: Optional[Dict[str, Any]] = None
    status: IdempotencyStatus
    expires_at: datetime
    created_at: datetime
