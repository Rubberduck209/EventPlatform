import os
from typing import List, Optional
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

load_dotenv()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super_secret_jwt_key_identity_service_2027_soa_tdtu`")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

security = HTTPBearer(auto_error=False)


class TokenUser(BaseModel):
    id: int
    email: Optional[str] = None
    role: str


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> TokenUser:
    """Xác thực JWT Token được cấp bởi Identity Service."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Vui lòng đăng nhập để thực hiện giao dịch thanh toán.",
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role", "CUSTOMER")
        email = payload.get("email")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token không hợp lệ (thiếu định danh người dùng).",
            )
        return TokenUser(id=int(user_id), email=email, role=str(role))
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập đã hết hạn hoặc không hợp lệ.",
        )


def require_roles(allowed_roles: List[str]):
    """Dependency kiểm tra quyền hạn theo vai trò (Role-Based Access Control)."""
    def role_checker(current_user: TokenUser = Depends(get_current_user)) -> TokenUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Chức năng này yêu cầu quyền: {', '.join(allowed_roles)}",
            )
        return current_user

    return role_checker
