import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Tự động đọc các biến cấu hình từ file .env (nếu có)
load_dotenv()

# Lấy DATABASE_URL từ biến môi trường hoặc dùng mặc định kết nối MySQL local
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:password@localhost:3306/identity_db?charset=utf8mb4"
)

# Cấu hình Connection Pool tối ưu cho MySQL
engine = create_engine(
    DATABASE_URL,
    pool_size=10,             # Số kết nối duy trì sẵn trong pool
    max_overflow=20,          # Số kết nối tối đa có thể mở thêm khi tải cao
    pool_timeout=30,          # Thời gian chờ lấy kết nối từ pool (giây)
    pool_pre_ping=True,       # Kiểm tra kết nối còn sống trước khi query
    pool_recycle=3600,        # Tái tạo kết nối sau 1 giờ tránh timeout của MySQL
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency cung cấp database session cho mỗi request trong FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
