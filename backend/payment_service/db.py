import os
from urllib.parse import urlparse
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

# Tự động đọc các biến cấu hình từ file .env
load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:12345678@localhost:3306/payment_db?charset=utf8mb4"
)


def ensure_database_exists():
    """Tự động khởi tạo database `payment_db` trên MySQL nếu chưa tồn tại."""
    if DATABASE_URL.startswith("sqlite"):
        return
    try:
        parsed = urlparse(DATABASE_URL.split("?")[0])
        db_name = parsed.path.lstrip("/")
        if not db_name:
            return
        server_url = f"{parsed.scheme}://{parsed.netloc}/?charset=utf8mb4"
        temp_engine = create_engine(server_url, isolation_level="AUTOCOMMIT")
        with temp_engine.connect() as conn:
            conn.execute(
                text(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            )
        temp_engine.dispose()
    except Exception:
        pass


ensure_database_exists()

# Cấu hình Connection Pool tối ưu cho MySQL (Database-per-Service: payment_db) hoặc SQLite (cho Unit Test)
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_timeout=30,
        pool_pre_ping=True,
        pool_recycle=3600,
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
