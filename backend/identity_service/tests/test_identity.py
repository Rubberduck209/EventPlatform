import pytest
from fastapi.testclient import TestClient
import sys
import os

# Thêm thư mục service vào python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from auth import create_access_token

client = TestClient(app)


# ==============================================================================
# 1. TEST ĐĂNG KÝ (REGISTER)
# ==============================================================================

def test_tc01_register_customer_success():
    """TC01: Đăng ký tài khoản Customer thành công với thông tin hợp lệ."""
    email = "test_user_tc01@tdtu.edu.vn"
    response = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123@",
        "full_name": "Nguyễn Văn Test",
        "phone": "0912345678"
    })
    # Chấp nhận 201 Created (hoặc 400 nếu email đã tồn tại do chạy lại test)
    assert response.status_code in [201, 400]
    if response.status_code == 201:
        data = response.json()
        assert data["email"] == email
        assert data["role"] == "CUSTOMER"
        assert data["status"] == "ACTIVE"


def test_tc02_register_duplicate_email():
    """TC02: Đăng ký trùng email đã tồn tại -> Trả về lỗi 400."""
    email = "admin@platform.com"
    response = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123@",
        "full_name": "Trùng Email"
    })
    assert response.status_code == 400
    assert "Email này đã được sử dụng" in response.json()["detail"]


def test_tc03_register_invalid_email_format():
    """TC03: Đăng ký với định dạng email sai -> Trả về lỗi 422 Unprocessable Entity."""
    response = client.post("/api/v1/auth/register", json={
        "email": "invalid-email-format",
        "password": "Password123@",
        "full_name": "Sai Email"
    })
    assert response.status_code == 422


def test_tc04_register_short_password():
    """TC04: Đăng ký mật khẩu dưới 6 ký tự -> Trả về lỗi 422."""
    response = client.post("/api/v1/auth/register", json={
        "email": "short_pwd@test.com",
        "password": "123",
        "full_name": "Mật Khẩu Ngắn"
    })
    assert response.status_code == 422


# ==============================================================================
# 2. TEST ĐĂNG NHẬP (LOGIN)
# ==============================================================================

def test_tc05_login_admin_success():
    """TC05: Đăng nhập tài khoản Admin mặc định thành công -> Nhận JWT Token."""
    response = client.post("/api/v1/auth/login", json={
        "email": "admin@platform.com",
        "password": "Admin@2027"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["role"] == "ADMIN"


def test_tc06_login_wrong_password():
    """TC06: Đăng nhập sai mật khẩu -> Trả về lỗi 401 Unauthorized."""
    response = client.post("/api/v1/auth/login", json={
        "email": "admin@platform.com",
        "password": "SaiMatKhau@"
    })
    assert response.status_code == 401
    assert "Email hoặc mật khẩu không chính xác" in response.json()["detail"]


def test_tc07_login_nonexistent_email():
    """TC07: Đăng nhập với email không tồn tại trong hệ thống -> Trả về lỗi 401."""
    response = client.post("/api/v1/auth/login", json={
        "email": "ghost_account_9999@notfound.com",
        "password": "Password123@"
    })
    assert response.status_code == 401


# ==============================================================================
# 3. TEST GOOGLE OAUTH 2.0 LOGIN
# ==============================================================================

def test_tc08_google_login_mock_success():
    """TC08: Đăng nhập Google một chạm (Mock Token) -> Tự sinh tài khoản Customer."""
    mock_email = "google_user_tc08@gmail.com"
    response = client.post("/api/v1/auth/google", json={
        "id_token": f"mock_google_{mock_email}_Nguyen_Van_Google"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == mock_email
    assert data["user"]["auth_provider"] == "GOOGLE"


def test_tc09_google_login_invalid_token():
    """TC09: Gửi Google token rác không hợp lệ -> Trả về lỗi 400 Bad Request."""
    response = client.post("/api/v1/auth/google", json={
        "id_token": "fake_random_invalid_token_12345"
    })
    # Google API từ chối token
    assert response.status_code in [400, 503]


# ==============================================================================
# 4. TEST XÁC THỰC PROFILE (/api/v1/auth/me)
# ==============================================================================

def test_tc10_get_me_without_token():
    """TC10: Gọi endpoint /auth/me mà không truyền Header Authorization -> Lỗi 403/401."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code in [401, 403]


def test_tc11_get_me_with_valid_token():
    """TC11: Gọi endpoint /auth/me với Bearer Token hợp lệ -> Trả về đúng thông tin user."""
    # Lấy token Admin
    login_res = client.post("/api/v1/auth/login", json={
        "email": "admin@platform.com",
        "password": "Admin@2027"
    })
    token = login_res.json()["access_token"]

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == "admin@platform.com"


# ==============================================================================
# 5. TEST HỒ SƠ BAN TỔ CHỨC (ORGANIZER APPLICATION & APPROVAL)
# ==============================================================================

def test_tc12_apply_organizer_by_customer():
    """TC12: Customer nộp hồ sơ xin làm Ban tổ chức -> Chuyển trạng thái sang PENDING_APPROVAL."""
    # Tạo Customer mới
    c_email = "applicant_tc12@tdtu.edu.vn"
    client.post("/api/v1/auth/register", json={
        "email": c_email,
        "password": "Password123@",
        "full_name": "Người Nộp Hồ Sơ"
    })
    login_res = client.post("/api/v1/auth/login", json={"email": c_email, "password": "Password123@"})
    token = login_res.json()["access_token"]

    response = client.post("/api/v1/organizers/apply", headers={"Authorization": f"Bearer {token}"}, json={
        "organization_name": "Công ty Âm Nhạc TDTU",
        "tax_code": "0319988776",
        "contact_phone": "0912999888"
    })
    assert response.status_code in [200, 400]
    if response.status_code == 200:
        assert response.json()["approval_status"] == "PENDING"


def test_tc13_admin_get_pending_organizers():
    """TC13: Admin tra cứu danh sách hồ sơ Organizer đang chờ xét duyệt."""
    login_res = client.post("/api/v1/auth/login", json={"email": "admin@platform.com", "password": "Admin@2027"})
    admin_token = login_res.json()["access_token"]

    response = client.get("/api/v1/admin/organizers/pending", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_tc14_customer_forbidden_from_admin_endpoint():
    """TC14: Customer cố tình gọi API của Admin -> Nhận lỗi 403 Forbidden."""
    # Tạo hoặc login tài khoản Customer
    c_email = "customer_regular@test.com"
    client.post("/api/v1/auth/register", json={
        "email": c_email,
        "password": "Password123@",
        "full_name": "Khách Thường"
    })
    login_res = client.post("/api/v1/auth/login", json={"email": c_email, "password": "Password123@"})
    token = login_res.json()["access_token"]

    response = client.get("/api/v1/admin/organizers/pending", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert "Bạn không có quyền thực hiện hành động này" in response.json()["detail"]


# ==============================================================================
# 6. TEST QUẢN LÝ & PHÂN CÔNG NHÂN VIÊN (STAFF SEPARATION & ASSIGNMENT)
# ==============================================================================

def test_tc15_create_dedicated_staff_account():
    """TC15: Ban tổ chức tạo tài khoản riêng biệt cho Nhân viên (STAFF)."""
    login_res = client.post("/api/v1/auth/login", json={"email": "admin@platform.com", "password": "Admin@2027"})
    admin_token = login_res.json()["access_token"]

    staff_email = "real_staff_tc15@tdtu.edu.vn"
    response = client.post("/api/v1/organizers/staff", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "email": staff_email,
        "password": "StaffPassword123@",
        "full_name": "Lê Văn Nhân Viên",
        "phone": "0987654321"
    })
    assert response.status_code in [201, 400]
    if response.status_code == 201:
        data = response.json()
        assert data["email"] == staff_email
        assert data["role"] == "STAFF"


def test_tc16_reject_assigning_customer_as_staff():
    """TC16: Ngăn chặn phân quyền nhầm: Cố tình gán tài khoản Customer làm Staff -> Bị từ chối lỗi 400."""
    login_res = client.post("/api/v1/auth/login", json={"email": "admin@platform.com", "password": "Admin@2027"})
    admin_token = login_res.json()["access_token"]

    # Đăng ký 1 Customer thông thường
    cust_email = "pure_customer_tc16@gmail.com"
    client.post("/api/v1/auth/register", json={
        "email": cust_email,
        "password": "Password123@",
        "full_name": "Khách Hàng Thuần Túy"
    })

    # Cố tình gán quyền soát vé cho tài khoản Customer này
    response = client.post("/api/v1/staff/assign", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "event_id": 99,
        "staff_email": cust_email,
        "permissions": ["CHECKIN"]
    })
    # Phải bị từ chối 400 Bad Request
    assert response.status_code == 400
    assert "KHÔNG PHẢI là Nhân viên (STAFF)" in response.json()["detail"]


def test_tc17_assign_valid_staff_to_event():
    """TC17: Phân công nhân sự hợp lệ (có role STAFF) vào sự kiện thành công."""
    login_res = client.post("/api/v1/auth/login", json={"email": "admin@platform.com", "password": "Admin@2027"})
    admin_token = login_res.json()["access_token"]

    staff_email = "legit_staff_tc17@tdtu.edu.vn"
    client.post("/api/v1/organizers/staff", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "email": staff_email,
        "password": "StaffPassword123@",
        "full_name": "Trần Soát Vé Hợp Lệ"
    })

    response = client.post("/api/v1/staff/assign", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "event_id": 1,
        "staff_email": staff_email,
        "permissions": ["CHECKIN", "VIEW_ATTENDEES"]
    })
    assert response.status_code == 200
    data = response.json()
    assert data["event_id"] == 1
    assert "CHECKIN" in data["permissions"]
    assert data["staff_email"] == staff_email
