from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from model import ApprovalStatus, UserRole, UserStatus


# ==================== AUTH & USER SCHEMAS ====================

class UserRegisterRequest(BaseModel):
    email: EmailStr = Field(..., example="customer@example.com")
    password: str = Field(..., min_length=6, example="Password123@")
    full_name: str = Field(..., min_length=2, max_length=100, example="Nguyễn Văn A")
    phone: Optional[str] = Field(None, example="0901234567")


class UserLoginRequest(BaseModel):
    email: str = Field(..., example="admin")
    password: str = Field(..., example="admin123")


class GoogleAuthRequest(BaseModel):
    """Payload gửi lên từ frontend sau khi người dùng đăng nhập Google."""
    id_token: str = Field(..., description="Google ID Token nhận được từ Google OAuth / One Tap SDK")


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    role: UserRole
    status: UserStatus
    auth_provider: str
    avatar_url: Optional[str] = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ==================== ORGANIZER SCHEMAS ====================

class OrganizerApplyRequest(BaseModel):
    organization_name: str = Field(..., min_length=3, max_length=191, example="Công ty TNHH Sự Kiện TDTU")
    tax_code: Optional[str] = Field(None, example="0312345678")
    contact_phone: str = Field(..., min_length=9, max_length=20, example="0918889999")
    business_license_url: Optional[str] = Field(None, example="https://storage.example.com/license.pdf")


class OrganizerApprovalRequest(BaseModel):
    status: ApprovalStatus = Field(..., description="APPROVED hoặc REJECTED")


class OrganizerProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    organization_name: str
    tax_code: Optional[str] = None
    contact_phone: str
    business_license_url: Optional[str] = None
    approval_status: ApprovalStatus
    approved_by_admin_id: Optional[int] = None
    approved_at: Optional[datetime] = None
    created_at: datetime


# ==================== EVENT STAFF SCHEMAS ====================

class StaffCreateRequest(BaseModel):
    """Ban tổ chức tạo tài khoản riêng biệt cho Nhân viên (STAFF)."""
    email: EmailStr = Field(..., example="staff01@tdtu.edu.vn")
    password: str = Field(..., min_length=6, example="StaffPassword123@")
    full_name: str = Field(..., min_length=2, max_length=100, example="Nguyễn Văn Nhân Viên")
    phone: Optional[str] = Field(None, example="0987654321")


class StaffUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    role: UserRole
    status: UserStatus
    created_by_organizer_id: Optional[int] = None
    created_at: datetime


class StaffAssignRequest(BaseModel):
    event_id: int = Field(..., example=1, description="ID sự kiện bên Event Service")
    event_title: Optional[str] = Field("TDTU Music Festival 2027", example="TDTU Music Festival 2027", description="Tên sự kiện")
    staff_email: EmailStr = Field(..., example="staff01@example.com", description="Email của nhân viên cần phân công")
    staff_role_title: str = Field(
        default="Nhân viên Soát vé Cổng A",
        example="Nhân viên Soát vé Cổng A",
        description="Vai trò / Chức danh cụ thể của nhân viên trong sự kiện"
    )
    permissions: List[str] = Field(
        default=["CHECKIN"],
        example=["CHECKIN", "VIEW_ATTENDEES"],
        description="Các quyền hạn gán cho nhân viên: CHECKIN, VIEW_ATTENDEES"
    )


class StaffAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    event_title: Optional[str] = None
    staff_user_id: int
    staff_name: str
    staff_email: str
    staff_role_title: str
    permissions: List[str]
    is_active: bool
    created_at: datetime


class StaffVerifyResponse(BaseModel):
    """Phản hồi cho các Microservice khác (Ticket/Event Service) khi xác thực quyền nhân viên."""
    allowed: bool
    staff_user_id: int
    event_id: int
    staff_role_title: Optional[str] = None
    permissions: List[str] = []
    reason: Optional[str] = None
