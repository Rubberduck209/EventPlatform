import enum
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    JSON,
    String,
    UniqueConstraint,
    func
)
from sqlalchemy.orm import relationship
from db import Base


class UserRole(str, enum.Enum):
    CUSTOMER = "CUSTOMER"
    ORGANIZER = "ORGANIZER"
    STAFF = "STAFF"
    ADMIN = "ADMIN"


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    PENDING_APPROVAL = "PENDING_APPROVAL"


class ApprovalStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class User(Base):
    """Bảng tài khoản người dùng của hệ thống."""
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_user_role_organizer", "role", "created_by_organizer_id"),
    )

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    email = Column(String(191), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)  # Nullable đối với người dùng đăng nhập qua Google OAuth
    full_name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=True)
    role = Column(Enum(UserRole), default=UserRole.CUSTOMER, nullable=False, index=True)
    status = Column(Enum(UserStatus), default=UserStatus.ACTIVE, nullable=False, index=True)

    # Thông tin đăng nhập Google OAuth 2.0
    google_id = Column(String(100), unique=True, nullable=True, index=True)
    auth_provider = Column(String(20), default="LOCAL", nullable=False)  # "LOCAL" hoặc "GOOGLE"
    avatar_url = Column(String(255), nullable=True)

    # Nếu là tài khoản STAFF: lưu ID của Organizer quản lý nhân viên này
    created_by_organizer_id = Column(BigInteger, nullable=True, index=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Quan hệ nội bộ
    organizer_profile = relationship("OrganizerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    staff_assignments = relationship("EventStaffAssignment", back_populates="staff_user", cascade="all, delete-orphan")


class OrganizerProfile(Base):
    """Bảng lưu hồ sơ doanh nghiệp / ban tổ chức sự kiện, cần Admin xét duyệt."""
    __tablename__ = "organizer_profiles"

    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    organization_name = Column(String(191), nullable=False)
    tax_code = Column(String(50), nullable=True)
    contact_phone = Column(String(20), nullable=False)
    business_license_url = Column(String(255), nullable=True)

    approval_status = Column(Enum(ApprovalStatus), default=ApprovalStatus.PENDING, nullable=False, index=True)
    approved_by_admin_id = Column(BigInteger, nullable=True)
    approved_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="organizer_profile")

    @property
    def user_email(self):
        return self.user.email if self.user else None

    @property
    def user_full_name(self):
        return self.user.full_name if self.user else None


class EventStaffAssignment(Base):
    """Bảng phân công nhân viên theo từng sự kiện và phân quyền chi tiết."""
    __tablename__ = "event_staff_assignments"
    __table_args__ = (
        UniqueConstraint("event_id", "staff_user_id", name="uq_event_staff_user"),
        Index("ix_event_organizer_active", "assigned_by_organizer_id", "event_id", "is_active"),
    )

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    event_id = Column(BigInteger, nullable=False, index=True)  # Tham chiếu logic sang Event Service
    event_title = Column(String(255), nullable=True)           # Tên sự kiện để hiển thị trực tiếp
    staff_user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_by_organizer_id = Column(BigInteger, nullable=False, index=True)

    # Chức danh / Vai trò cụ thể của nhân viên trong sự kiện này
    staff_role_title = Column(String(100), nullable=False, default="Nhân viên Soát vé")

    # Danh sách quyền: ví dụ ["CHECKIN", "VIEW_ATTENDEES"]
    permissions = Column(JSON, nullable=False, default=list)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    staff_user = relationship("User", back_populates="staff_assignments")
