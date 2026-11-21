import sys
if sys.platform == "win32":
    import asyncio
    from asyncio.selector_events import BaseSelectorEventLoop
    _orig_read_from_self = BaseSelectorEventLoop._read_from_self
    def _read_from_self_patched(self):
        try:
            _orig_read_from_self(self)
        except (ConnectionResetError, OSError):
            pass
    BaseSelectorEventLoop._read_from_self = _read_from_self_patched

from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from db import Base, engine, get_db
from model import (
    ApprovalStatus,
    EventStaffAssignment,
    OrganizerProfile,
    User,
    UserRole,
    UserStatus
)
from schemas import (
    GoogleAuthRequest,
    OrganizerApplyRequest,
    OrganizerApprovalRequest,
    OrganizerProfileResponse,
    StaffAssignRequest,
    StaffAssignmentResponse,
    StaffCreateRequest,
    StaffUserResponse,
    StaffVerifyResponse,
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse
)
from auth import (
    check_login_rate_limit,
    clear_login_failures,
    close_http_client,
    create_access_token,
    get_current_user,
    hash_password,
    record_login_failure,
    require_roles,
    verify_google_id_token,
    verify_password
)


def seed_demo_accounts(db: Session):
    """Đảm bảo các tài khoản mẫu luôn tồn tại trong Database."""
    # 1. Tài khoản Admin mẫu: username = "admin", password = "admin123"
    admin_user = db.query(User).filter(User.email == "admin").first()
    if not admin_user:
        admin_user = User(
            email="admin",
            password_hash=hash_password("admin123"),
            full_name="Quản Trị Viên Hệ Thống",
            phone="0999999999",
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
            auth_provider="LOCAL"
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

    # Giữ thêm admin@platform.com cho bộ Pytest tự động
    if not db.query(User).filter(User.email == "admin@platform.com").first():
        db.add(User(
            email="admin@platform.com",
            password_hash=hash_password("Admin@2027"),
            full_name="Platform Administrator",
            phone="0999999999",
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
            auth_provider="LOCAL"
        ))
        db.commit()

    # 2. Ba (03) Tài khoản Customer mẫu (password: 123456)
    sample_customers = [
        ("customer1@gmail.com", "Nguyễn Văn An", "0901111222"),
        ("customer2@gmail.com", "Trần Thị Bích", "0902222333"),
        ("customer3@gmail.com", "Lê Hoàng Nam", "0903333444"),
    ]
    for c_email, c_name, c_phone in sample_customers:
        existing_c = db.query(User).filter(User.email == c_email).first()
        if not existing_c:
            db.add(User(
                email=c_email,
                password_hash=hash_password("123456"),
                full_name=c_name,
                phone=c_phone,
                role=UserRole.CUSTOMER,
                status=UserStatus.ACTIVE,
                auth_provider="LOCAL"
            ))
        elif "(" in (existing_c.full_name or ""):
            existing_c.full_name = c_name
    db.commit()

    # 3. Một (01) Tài khoản Organization mẫu (organizer@gmail.com / 123456)
    org_email = "organizer@gmail.com"
    org_user = db.query(User).filter(User.email == org_email).first()
    if not org_user:
        org_user = User(
            email=org_email,
            password_hash=hash_password("123456"),
            full_name="Công ty Sự Kiện TDTU",
            phone="0918888999",
            role=UserRole.ORGANIZER,
            status=UserStatus.ACTIVE,
            auth_provider="LOCAL"
        )
        db.add(org_user)
        db.commit()
        db.refresh(org_user)
    elif "(" in (org_user.full_name or ""):
        org_user.full_name = "Công ty Sự Kiện TDTU"
        db.commit()

    if org_user and not db.query(OrganizerProfile).filter(OrganizerProfile.user_id == org_user.id).first():
        db.add(OrganizerProfile(
            user_id=org_user.id,
            organization_name="Công ty TNHH Tổ Chức Sự Kiện TDTU",
            tax_code="0312345678",
            contact_phone="0918888999",
            business_license_url="https://example.com/giay-phep-tdtu.pdf",
            approval_status=ApprovalStatus.APPROVED,
            approved_by_admin_id=admin_user.id if admin_user else 1,
            approved_at=datetime.utcnow()
        ))
        db.commit()

    # 4. Một (01) Tài khoản Staff mẫu thuộc quyền quản lý riêng của organizer@gmail.com
    staff_email = "staff@gmail.com"
    staff_user = db.query(User).filter(User.email == staff_email).first()
    if not staff_user and org_user:
        staff_user = User(
            email=staff_email,
            password_hash=hash_password("123456"),
            full_name="Phạm Minh Quân",
            phone="0987654321",
            role=UserRole.STAFF,
            status=UserStatus.ACTIVE,
            created_by_organizer_id=org_user.id,
            auth_provider="LOCAL"
        )
        db.add(staff_user)
        db.commit()
        db.refresh(staff_user)

        db.add(EventStaffAssignment(
            event_id=1,
            event_title="TDTU Music Festival 2027",
            staff_user_id=staff_user.id,
            assigned_by_organizer_id=org_user.id,
            staff_role_title="Nhân viên Soát vé Cổng A",
            permissions=["CHECKIN", "VIEW_ATTENDEES"],
            is_active=True
        ))
        db.commit()
    elif staff_user:
        if "(" in (staff_user.full_name or ""):
            staff_user.full_name = "Phạm Minh Quân"
        if org_user and staff_user.created_by_organizer_id is None:
            staff_user.created_by_organizer_id = org_user.id
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Quản lý vòng đời ứng dụng (Lifespan): Khởi tạo DB, Index và đóng Connection Pool khi tắt."""
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        for ddl_sql in [
            "ALTER TABLE users ADD COLUMN created_by_organizer_id BIGINT UNSIGNED NULL AFTER avatar_url",
            "ALTER TABLE users ADD COLUMN google_id VARCHAR(100) NULL AFTER status",
            "ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'LOCAL' AFTER google_id",
            "ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) NULL AFTER auth_provider",
            "ALTER TABLE event_staff_assignments ADD COLUMN event_title VARCHAR(255) NULL AFTER event_id",
            "ALTER TABLE event_staff_assignments ADD COLUMN staff_role_title VARCHAR(100) NOT NULL DEFAULT 'Nhân viên Soát vé' AFTER assigned_by_organizer_id",
            "CREATE INDEX ix_user_role_organizer ON users (role, created_by_organizer_id)",
            "CREATE INDEX ix_event_organizer_active ON event_staff_assignments (assigned_by_organizer_id, event_id, is_active)",
            "ALTER TABLE event_staff_assignments ADD CONSTRAINT uq_event_staff_user UNIQUE (event_id, staff_user_id)"
        ]:
            try:
                conn.execute(text(ddl_sql))
                conn.commit()
            except Exception:
                pass

    db = next(get_db())
    try:
        seed_demo_accounts(db)
    finally:
        db.close()

    yield

    await close_http_client()


app = FastAPI(
    title="Identity Service API",
    description="Dịch vụ Định danh, Phân quyền & Quản lý Nhân sự sự kiện (Môn Kiến trúc Hướng Dịch vụ - SOA)",
    version="1.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# 1. AUTHENTICATION & GOOGLE OAUTH 2.0 ENDPOINTS
# ==============================================================================

@app.post("/api/v1/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, tags=["Auth"])
def register_customer(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    """Đăng ký tài khoản Khách hàng (Customer) bằng Email và Mật khẩu."""
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email này đã được sử dụng")

    new_user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role=UserRole.CUSTOMER,
        status=UserStatus.ACTIVE,
        auth_provider="LOCAL"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.post("/api/v1/auth/login", response_model=TokenResponse, tags=["Auth"])
def login_with_password(payload: UserLoginRequest, db: Session = Depends(get_db)):
    """Đăng nhập bằng Email/Username và Mật khẩu, có bảo vệ chống Brute-force và trả về JWT Token."""
    check_login_rate_limit(payload.email)

    demo_identifiers = {"admin", "customer1@gmail.com", "customer2@gmail.com", "customer3@gmail.com", "organizer@gmail.com", "staff@gmail.com"}
    if payload.email in demo_identifiers and not db.query(User).filter(User.email == payload.email).first():
        seed_demo_accounts(db)

    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        record_login_failure(payload.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác"
        )

    if user.status == UserStatus.INACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản này đang bị khóa")

    clear_login_failures(payload.email)

    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value
    }
    access_token = create_access_token(token_data)

    return TokenResponse(access_token=access_token, user=UserResponse.model_validate(user))


@app.post("/api/v1/auth/google", response_model=TokenResponse, tags=["Auth"])
async def login_with_google(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Đăng nhập / Đăng ký nhanh qua Google OAuth 2.0 bằng Google ID Token.
    - Xác thực ID Token với máy chủ Google (có Connection Pooling & Cache)
    - Nếu email chưa có trong DB: tự động tạo mới tài khoản Customer
    - Trả về JWT Access Token của hệ thống
    """
    google_info = await verify_google_id_token(payload.id_token)
    email = google_info.get("email")
    google_sub = google_info.get("sub")
    full_name = google_info.get("name") or email.split("@")[0]
    avatar_url = google_info.get("picture")

    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không tìm thấy email từ tài khoản Google")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            password_hash=None,
            full_name=full_name,
            role=UserRole.CUSTOMER,
            status=UserStatus.ACTIVE,
            google_id=google_sub,
            auth_provider="GOOGLE",
            avatar_url=avatar_url
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if not user.google_id:
            user.google_id = google_sub
            user.avatar_url = avatar_url or user.avatar_url
            db.commit()

    if user.status == UserStatus.INACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản này đang bị khóa")

    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value
    }
    access_token = create_access_token(token_data)

    return TokenResponse(access_token=access_token, user=UserResponse.model_validate(user))


@app.get("/api/v1/auth/me", response_model=UserResponse, tags=["Auth"])
def get_my_profile(current_user: User = Depends(get_current_user)):
    """Lấy thông tin cá nhân của người dùng hiện tại thông qua JWT Token."""
    return current_user


@app.post("/api/v1/auth/refresh", response_model=TokenResponse, tags=["Auth"])
def refresh_jwt_token(current_user: User = Depends(get_current_user)):
    """
    Làm mới JWT Access Token để đồng bộ Role mới nhất từ Database
    (ví dụ: ngay sau khi Customer được Admin phê duyệt nâng cấp lên ORGANIZER).
    """
    token_data = {
        "sub": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role.value
    }
    new_token = create_access_token(token_data)
    return TokenResponse(access_token=new_token, user=UserResponse.model_validate(current_user))


# ==============================================================================
# 2. ORGANIZER APPLICATION & APPROVAL ENDPOINTS
# ==============================================================================

@app.post("/api/v1/organizers/apply", response_model=OrganizerProfileResponse, tags=["Organizer"])
def apply_organizer(
    payload: OrganizerApplyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Khách hàng nộp hồ sơ xin nâng cấp tài khoản lên Ban tổ chức (Organizer)."""
    existing_profile = db.query(OrganizerProfile).filter(OrganizerProfile.user_id == current_user.id).first()
    if existing_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bạn đã nộp hồ sơ trước đó. Trạng thái hiện tại: {existing_profile.approval_status.value}"
        )

    profile = OrganizerProfile(
        user_id=current_user.id,
        organization_name=payload.organization_name,
        tax_code=payload.tax_code,
        contact_phone=payload.contact_phone,
        business_license_url=payload.business_license_url,
        approval_status=ApprovalStatus.PENDING
    )

    current_user.status = UserStatus.PENDING_APPROVAL

    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@app.get("/api/v1/organizers/my-profile", response_model=OrganizerProfileResponse, tags=["Organizer"])
def get_organizer_profile(
    current_user: User = Depends(require_roles([UserRole.ORGANIZER, UserRole.CUSTOMER])),
    db: Session = Depends(get_db)
):
    """Ban tổ chức xem lại thông tin hồ sơ doanh nghiệp của mình."""
    profile = db.query(OrganizerProfile).filter(OrganizerProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chưa tìm thấy hồ sơ ban tổ chức")
    return profile


@app.get("/api/v1/admin/organizers/pending", response_model=List[OrganizerProfileResponse], tags=["Admin"])
def get_pending_organizers(
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Admin xem danh sách các hồ sơ Ban tổ chức đang chờ duyệt."""
    return (
        db.query(OrganizerProfile)
        .filter(OrganizerProfile.approval_status == ApprovalStatus.PENDING)
        .order_by(OrganizerProfile.created_at.desc())
        .all()
    )


@app.patch("/api/v1/admin/organizers/{user_id}/approve", response_model=OrganizerProfileResponse, tags=["Admin"])
def review_organizer(
    user_id: int,
    payload: OrganizerApprovalRequest,
    current_user: User = Depends(require_roles([UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Admin duyệt (APPROVED) hoặc từ chối (REJECTED) hồ sơ Ban tổ chức."""
    profile = db.query(OrganizerProfile).filter(OrganizerProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ")

    applicant = db.query(User).filter(User.id == user_id).first()
    if not applicant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")

    profile.approval_status = payload.status
    profile.approved_by_admin_id = current_user.id
    profile.approved_at = datetime.utcnow()

    if payload.status == ApprovalStatus.APPROVED:
        applicant.role = UserRole.ORGANIZER
        applicant.status = UserStatus.ACTIVE
    else:
        applicant.status = UserStatus.ACTIVE

    db.commit()
    db.refresh(profile)
    return profile


# ==============================================================================
# 3. EVENT STAFF MANAGEMENT & ASSIGNMENT ENDPOINTS
# ==============================================================================

@app.post("/api/v1/organizers/staff", response_model=StaffUserResponse, status_code=status.HTTP_201_CREATED, tags=["Staff Management"])
def create_staff_account(
    payload: StaffCreateRequest,
    current_user: User = Depends(require_roles([UserRole.ORGANIZER, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Ban tổ chức tạo tài khoản riêng biệt cho Nhân viên (STAFF) thuộc quyền quản lý của mình."""
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email '{payload.email}' đã tồn tại trong hệ thống với vai trò '{existing_user.role.value}'."
        )

    new_staff = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role=UserRole.STAFF,
        status=UserStatus.ACTIVE,
        created_by_organizer_id=current_user.id,
        auth_provider="LOCAL"
    )
    db.add(new_staff)
    db.commit()
    db.refresh(new_staff)
    return new_staff


@app.get("/api/v1/organizers/staff", response_model=List[StaffUserResponse], tags=["Staff Management"])
def list_my_managed_staff(
    current_user: User = Depends(require_roles([UserRole.ORGANIZER, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Ban tổ chức xem danh sách nhân viên riêng do chính mình tạo và quản lý."""
    query = db.query(User).filter(User.role == UserRole.STAFF)
    if current_user.role == UserRole.ORGANIZER:
        query = query.filter(User.created_by_organizer_id == current_user.id)
    return query.order_by(User.id.desc()).all()


@app.delete("/api/v1/organizers/staff/{staff_id}", status_code=status.HTTP_200_OK, tags=["Staff Management"])
def delete_my_managed_staff(
    staff_id: int,
    current_user: User = Depends(require_roles([UserRole.ORGANIZER, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Ban tổ chức xóa nhân viên thuộc danh sách quản lý riêng của mình."""
    staff_user = db.query(User).filter(User.id == staff_id, User.role == UserRole.STAFF).first()
    if not staff_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy nhân viên")

    if current_user.role == UserRole.ORGANIZER and staff_user.created_by_organizer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn chỉ có quyền xóa nhân viên thuộc danh sách riêng của Ban tổ chức mình."
        )

    db.delete(staff_user)
    db.commit()
    return {"message": f"Đã xóa nhân viên '{staff_user.email}' khỏi danh sách của bạn."}


@app.post("/api/v1/staff/assign", response_model=StaffAssignmentResponse, tags=["Staff Management"])
def assign_event_staff(
    payload: StaffAssignRequest,
    current_user: User = Depends(require_roles([UserRole.ORGANIZER, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Ban tổ chức phân công nhân viên cho một sự kiện cụ thể kèm danh sách quyền hạn.
    - RÀNG BUỘC 1: Chỉ cho phép phân công người có role là STAFF (không gán Customer).
    - RÀNG BUỘC 2: Mỗi Ban tổ chức chỉ được phân công nhân viên nằm trong danh sách nhân viên riêng của mình.
    """
    staff_user = db.query(User).filter(User.email == payload.staff_email).first()
    if not staff_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy tài khoản nhân viên với email '{payload.staff_email}'."
        )

    if staff_user.role != UserRole.STAFF:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Tài khoản '{payload.staff_email}' đang là '{staff_user.role.value}', KHÔNG PHẢI là Nhân viên (STAFF). "
                f"Hệ thống không cho phép gán quyền sự kiện cho tài khoản Khách hàng (Customer) để tránh nhầm lẫn. "
                f"Vui lòng tạo tài khoản nhân viên trước trong mục 'Quản lý Nhân sự'."
            )
        )

    if current_user.role == UserRole.ORGANIZER and staff_user.created_by_organizer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Nhân viên '{payload.staff_email}' không thuộc danh sách nhân sự của Ban tổ chức bạn. "
                f"Mỗi Ban tổ chức chỉ được phép phân công nhân viên do chính đơn vị mình quản lý."
            )
        )

    existing_assignment = db.query(EventStaffAssignment).filter(
        EventStaffAssignment.event_id == payload.event_id,
        EventStaffAssignment.staff_user_id == staff_user.id
    ).first()

    if existing_assignment:
        existing_assignment.event_title = payload.event_title
        existing_assignment.assigned_by_organizer_id = current_user.id
        existing_assignment.staff_role_title = payload.staff_role_title
        existing_assignment.permissions = payload.permissions
        existing_assignment.is_active = True
        db.commit()
        db.refresh(existing_assignment)
        assignment = existing_assignment
    else:
        assignment = EventStaffAssignment(
            event_id=payload.event_id,
            event_title=payload.event_title,
            staff_user_id=staff_user.id,
            assigned_by_organizer_id=current_user.id,
            staff_role_title=payload.staff_role_title,
            permissions=payload.permissions,
            is_active=True
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)

    return StaffAssignmentResponse(
        id=assignment.id,
        event_id=assignment.event_id,
        event_title=assignment.event_title,
        staff_user_id=staff_user.id,
        staff_name=staff_user.full_name,
        staff_email=staff_user.email,
        staff_role_title=assignment.staff_role_title,
        permissions=assignment.permissions,
        is_active=assignment.is_active,
        created_at=assignment.created_at
    )


@app.get("/api/v1/staff/events/{event_id}", response_model=List[StaffAssignmentResponse], tags=["Staff Management"])
def list_event_staff(
    event_id: int,
    current_user: User = Depends(require_roles([UserRole.ORGANIZER, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Ban tổ chức xem danh sách nhân viên của đơn vị mình được phân công vào sự kiện.
    Đã tối ưu bằng joinedload(EventStaffAssignment.staff_user) để loại bỏ triệt để lỗi N+1 Query.
    """
    query = (
        db.query(EventStaffAssignment)
        .options(joinedload(EventStaffAssignment.staff_user))
        .filter(
            EventStaffAssignment.event_id == event_id,
            EventStaffAssignment.is_active == True
        )
    )
    if current_user.role == UserRole.ORGANIZER:
        query = query.filter(EventStaffAssignment.assigned_by_organizer_id == current_user.id)

    assignments = query.all()

    return [
        StaffAssignmentResponse(
            id=a.id,
            event_id=a.event_id,
            event_title=a.event_title,
            staff_user_id=a.staff_user_id,
            staff_name=a.staff_user.full_name if a.staff_user else "Unknown",
            staff_email=a.staff_user.email if a.staff_user else "Unknown",
            staff_role_title=a.staff_role_title or "Nhân viên Sự kiện",
            permissions=a.permissions,
            is_active=a.is_active,
            created_at=a.created_at
        )
        for a in assignments
    ]


@app.delete("/api/v1/staff/events/{event_id}/{staff_user_id}", status_code=status.HTTP_200_OK, tags=["Staff Management"])
def unassign_event_staff(
    event_id: int,
    staff_user_id: int,
    current_user: User = Depends(require_roles([UserRole.ORGANIZER, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Ban tổ chức gỡ (thu hồi phân công) một nhân viên khỏi sự kiện cụ thể,
    nhưng vẫn giữ tài khoản nhân viên đó trong danh sách nhân sự riêng của Ban tổ chức.
    """
    query = db.query(EventStaffAssignment).filter(
        EventStaffAssignment.event_id == event_id,
        EventStaffAssignment.staff_user_id == staff_user_id,
        EventStaffAssignment.is_active == True
    )
    if current_user.role == UserRole.ORGANIZER:
        query = query.filter(EventStaffAssignment.assigned_by_organizer_id == current_user.id)

    assignment = query.first()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy phân công của nhân viên này tại sự kiện."
        )

    assignment.is_active = False
    db.commit()
    return {"message": f"Đã gỡ nhân viên #{staff_user_id} khỏi Sự kiện #{event_id}."}


@app.get("/api/v1/staff/my-assignments", tags=["Staff Management"])
def get_my_staff_assignments(
    current_user: User = Depends(require_roles([UserRole.STAFF, UserRole.ORGANIZER, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Nhân viên xem danh sách các sự kiện mình được phân công trực và vai trò/quyền hạn trong từng sự kiện."""
    assignments = db.query(EventStaffAssignment).filter(
        EventStaffAssignment.staff_user_id == current_user.id,
        EventStaffAssignment.is_active == True
    ).all()

    return [
        {
            "id": a.id,
            "event_id": a.event_id,
            "event_title": a.event_title or f"Sự kiện #{a.event_id}",
            "assigned_by_organizer_id": a.assigned_by_organizer_id,
            "staff_role_title": a.staff_role_title or "Nhân viên Soát vé",
            "permissions": a.permissions,
            "is_active": a.is_active,
            "created_at": a.created_at
        }
        for a in assignments
    ]


# ==============================================================================
# 4. INTERNAL SOA INTER-SERVICE ENDPOINTS (CHO TICKET SERVICE / EVENT SERVICE)
# ==============================================================================

@app.get("/api/v1/internal/staff/verify", response_model=StaffVerifyResponse, tags=["Internal SOA"])
def verify_staff_event_permission(
    staff_user_id: int = Query(..., description="ID của nhân viên đang thao tác"),
    event_id: int = Query(..., description="ID của sự kiện cần kiểm tra quyền"),
    permission: Optional[str] = Query("CHECKIN", description="Quyền cần kiểm tra: CHECKIN hoặc VIEW_ATTENDEES"),
    db: Session = Depends(get_db)
):
    """
    Endpoint nội bộ (Service-to-Service) giúp Ticket Service / Event Service kiểm tra nhanh
    xem một nhân viên (staff_user_id) có được phép thực hiện quyền (CHECKIN / VIEW_ATTENDEES)
    tại sự kiện (event_id) hay không mà không vi phạm nguyên tắc Database-per-Service.
    """
    assignment = (
        db.query(EventStaffAssignment)
        .options(joinedload(EventStaffAssignment.staff_user))
        .filter(
            EventStaffAssignment.event_id == event_id,
            EventStaffAssignment.staff_user_id == staff_user_id,
            EventStaffAssignment.is_active == True
        )
        .first()
    )

    if not assignment or not assignment.staff_user or assignment.staff_user.status != UserStatus.ACTIVE:
        return StaffVerifyResponse(
            allowed=False,
            staff_user_id=staff_user_id,
            event_id=event_id,
            reason="Nhân viên chưa được phân công vào sự kiện này hoặc tài khoản không hoạt động."
        )

    perms = assignment.permissions or []
    if permission and permission not in perms:
        return StaffVerifyResponse(
            allowed=False,
            staff_user_id=staff_user_id,
            event_id=event_id,
            staff_role_title=assignment.staff_role_title,
            permissions=perms,
            reason=f"Nhân viên không có quyền '{permission}' tại sự kiện #{event_id}."
        )

    return StaffVerifyResponse(
        allowed=True,
        staff_user_id=staff_user_id,
        event_id=event_id,
        staff_role_title=assignment.staff_role_title,
        permissions=perms
    )
