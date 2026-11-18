import os
from typing import Dict, List
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super_secret_jwt_key_identity_service_2027_soa_tdtu")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

security = HTTPBearer()


class TokenUser:
    """Đối tượng đại diện cho người dùng được trích xuất từ JWT Token của Identity Service."""
    def __init__(self, id: int, email: str, role: str):
        self.id = id
        self.email = email
        self.role = role


def decode_access_token(token: str) -> Dict:
    """Giải mã JWT Token dùng chung khóa bí mật với Identity Service."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ hoặc đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> TokenUser:
    """Lấy thông tin định danh người dùng (`id`, `email`, `role`) từ JWT Header."""
    payload = decode_access_token(credentials.credentials)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token thiếu định danh người dùng (sub)"
        )
    return TokenUser(
        id=int(sub),
        email=payload.get("email", ""),
        role=payload.get("role", "CUSTOMER")
    )


def require_roles(allowed_roles: List[str]):
    """Kiểm tra quyền RBAC (ví dụ: ['ORGANIZER', 'ADMIN'])."""
    async def role_checker(current_user: TokenUser = Depends(get_current_user)) -> TokenUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Bạn không có quyền thực hiện hành động này. Yêu cầu quyền: {allowed_roles}"
            )
        return current_user
    return role_checker
