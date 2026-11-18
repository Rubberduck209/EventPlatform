from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from model import EventStatus, ZoneType


# ==================== CATEGORY SCHEMAS ====================

class CategoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, examples=["Âm nhạc & Concert"])
    slug: Optional[str] = Field(None, max_length=120, examples=["am-nhac-concert"])


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


# ==================== SEAT & ZONE SCHEMAS (GRID MAP EDITOR) ====================

class SeatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    zone_id: int
    row_index: int
    col_index: int
    row_code: str
    seat_number: int
    seat_code: str
    is_disabled: bool
    seat_tier: str


class SeatBatchUpdateItem(BaseModel):
    seat_code: str = Field(..., examples=["A01"], description="Mã ghế trên lưới, ví dụ A01, B05")
    is_disabled: Optional[bool] = Field(None, description="True: tô đen/vô hiệu hóa (lối đi, cột nhà, ghế hỏng)")
    seat_tier: Optional[str] = Field(None, examples=["VIP"], description="Phân màu hạng ghế: VIP, STANDARD, STUDENT")


class SeatBatchUpdateRequest(BaseModel):
    seats: List[SeatBatchUpdateItem]


class ZoneCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, examples=["Khán đài A (Ghế ngồi)"])
    zone_type: ZoneType = Field(..., examples=["SEATED"], description="STANDING (Khu đứng) hoặc SEATED (Khu có ghế)")
    total_capacity: Optional[int] = Field(None, ge=1, examples=[1000], description="Sức chứa (bắt buộc nếu là STANDING)")
    grid_rows: Optional[int] = Field(None, ge=1, le=26, examples=[5], description="Số hàng ghế (A..Z) nếu là SEATED")
    grid_cols: Optional[int] = Field(None, ge=1, le=50, examples=[10], description="Số cột ghế mỗi hàng nếu là SEATED")
    default_seat_tier: Optional[str] = Field("STANDARD", examples=["VIP"], description="Hạng ghế mặc định khi sinh lưới")


class ZoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    name: str
    zone_type: ZoneType
    total_capacity: int
    grid_rows: Optional[int] = None
    grid_cols: Optional[int] = None
    created_at: datetime


class ZoneWithSeatsResponse(ZoneResponse):
    seats: List[SeatResponse] = []


# ==================== TICKET TYPE & DYNAMIC PRICING SCHEMAS ====================

class PricingRuleCreateRequest(BaseModel):
    rule_name: str = Field(..., min_length=2, max_length=100, examples=["Early Bird"])
    price: Decimal = Field(..., ge=0, examples=[250000])
    start_time: datetime = Field(..., examples=["2026-11-01T00:00:00"])
    end_time: datetime = Field(..., examples=["2026-11-20T23:59:59"])


class PricingRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_type_id: int
    rule_name: str
    price: float
    start_time: datetime
    end_time: datetime


class TicketTypeCreateRequest(BaseModel):
    zone_id: int = Field(..., description="ID khu vực (Zone) áp dụng loại vé này")
    name: str = Field(..., min_length=2, max_length=100, examples=["Vé Sinh Viên (Student)"])
    description: Optional[str] = Field(None, max_length=255, examples=["Ưu đãi dành riêng cho sinh viên TDTU"])
    total_quantity: int = Field(..., ge=1, examples=[200])
    max_per_order: int = Field(default=4, ge=1, le=20, examples=[4], description="Tối đa số vé mỗi đơn (mặc định 4)")
    is_student_only: bool = Field(default=False, description="Ràng buộc email trường học")
    student_email_domain: Optional[str] = Field(None, examples=["@tdtu.edu.vn"])
    base_price: Optional[Decimal] = Field(None, ge=0, examples=[300000], description="Giá vé mặc định nếu tạo nhanh")
    pricing_rules: Optional[List[PricingRuleCreateRequest]] = Field(default=None, description="Danh sách quy tắc giá theo thời gian")


class TicketTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    zone_id: int
    name: str
    description: Optional[str] = None
    total_quantity: int
    max_per_order: int
    is_student_only: bool
    student_email_domain: Optional[str] = None
    current_price: Optional[float] = None
    active_rule_name: Optional[str] = None
    pricing_rules: List[PricingRuleResponse] = []
    created_at: datetime


# ==================== EVENT SCHEMAS ====================

class EventCreateRequest(BaseModel):
    category_id: int = Field(..., examples=[1])
    title: str = Field(..., min_length=3, max_length=255, examples=["TDTU Music Festival 2027"])
    slug: Optional[str] = Field(None, max_length=255)
    short_description: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    banner_url: Optional[str] = None
    venue_name: str = Field(..., min_length=2, max_length=191, examples=["Sân vận động Đại học Tôn Đức Thắng"])
    venue_address: str = Field(..., min_length=2, max_length=255, examples=["19 Nguyễn Hữu Thọ, Tân Phong, Quận 7, TP.HCM"])
    start_time: datetime = Field(..., examples=["2027-05-15T18:00:00"])
    end_time: datetime = Field(..., examples=["2027-05-15T22:30:00"])
    refund_policy: Optional[str] = Field("Hoàn tiền 100% nếu hủy trước 7 ngày diễn ra sự kiện.")


class EventUpdateRequest(BaseModel):
    category_id: Optional[int] = None
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    short_description: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    banner_url: Optional[str] = None
    venue_name: Optional[str] = None
    venue_address: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    refund_policy: Optional[str] = None


class EventStatusUpdateRequest(BaseModel):
    status: EventStatus = Field(..., description="DRAFT | PUBLISHED | ON_SALE | HAPPENING | COMPLETED | CANCELLED")
    reason: Optional[str] = Field(None, description="Lý do hủy sự kiện (nếu chuyển sang CANCELLED)")


class EventCancelVerifyRequest(BaseModel):
    password: str = Field(..., min_length=1, description="Mật khẩu hiện tại của tài khoản Ban tổ chức")
    otp_code: str = Field(..., min_length=6, max_length=6, description="Mã bảo mật OTP 6 chữ số")
    confirm_title: str = Field(..., min_length=1, description="Nhập chính xác tên sự kiện để xác nhận hủy")
    reason: str = Field(..., min_length=10, max_length=500, description="Lý do hủy sự kiện (tối thiểu 10 ký tự)")


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organizer_id: int
    category_id: int
    category_name: Optional[str] = None
    title: str
    slug: str
    short_description: Optional[str] = None
    description: Optional[str] = None
    banner_url: Optional[str] = None
    venue_name: str
    venue_address: str
    start_time: datetime
    end_time: datetime
    status: EventStatus
    refund_policy: Optional[str] = None
    cancel_reason: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class EventDetailResponse(EventResponse):
    zones: List[ZoneResponse] = []
    ticket_types: List[TicketTypeResponse] = []


class SeatMapResponse(BaseModel):
    event_id: int
    event_title: str
    zones: List[ZoneWithSeatsResponse]


# ==================== PURCHASE RULE VALIDATION SCHEMAS ====================

class PurchaseValidationRequest(BaseModel):
    ticket_type_id: int
    quantity: int = Field(..., ge=1)
    buyer_email: str
    at_time: Optional[datetime] = Field(None, description="Thời điểm mua vé (mặc định là thời gian hiện tại)")


class PurchaseValidationResponse(BaseModel):
    allowed: bool
    ticket_type_id: int
    ticket_type_name: str
    quantity: int
    unit_price: Optional[float] = None
    total_price: Optional[float] = None
    applied_rule_name: Optional[str] = None
    reason: Optional[str] = None
