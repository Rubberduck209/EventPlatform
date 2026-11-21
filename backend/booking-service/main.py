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

import asyncio
from contextlib import asynccontextmanager
from datetime import timedelta
from decimal import Decimal
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from database import engine, Base, get_db, SessionLocal
from models import Booking, BookingItem, SeatReservation, TicketInventory
from utils import now_vn
from enum import Enum

Base.metadata.create_all(bind=engine)

HOLD_MINUTES = 10
AUTO_RELEASE_SECONDS = 30
# Giới hạn số vé tối đa mỗi đơn theo loại vé (đề bài: vé Student tối đa 4 vé/đơn)
MAX_PER_ORDER = {"STUDENT": 4}


# ---------- Schemas (dữ liệu client gửi lên) ----------
class HoldItem(BaseModel):
    ticket_type_id: str
    seat_id: Optional[str] = None      # có seat_id = ghế ngồi; để trống = vé đứng
    quantity: int = Field(default=1, ge=1)
    unit_price: Decimal = Field(ge=0)  # tạm thời client gửi, sau này lấy từ Event Service


class HoldRequest(BaseModel):
    event_id: str
    user_id: str                       # tạm thời client gửi, sau này lấy từ JWT
    items: list[HoldItem] = Field(min_length=1)


class SoldOut(Exception):
    """Hết vé đứng."""


# ---------- Hàm dùng chung ----------
def validate_hold_request(req: HoldRequest):
    seats = [i.seat_id for i in req.items if i.seat_id]
    if len(seats) != len(set(seats)):
        raise HTTPException(status_code=422, detail="Danh sách ghế bị trùng nhau!")

    per_type: dict[str, int] = {}
    for item in req.items:
        if item.seat_id and item.quantity != 1:
            raise HTTPException(status_code=422, detail="Mỗi ghế ngồi chỉ đặt số lượng 1!")
        per_type[item.ticket_type_id] = per_type.get(item.ticket_type_id, 0) + item.quantity

    for ticket_type, limit in MAX_PER_ORDER.items():
        if per_type.get(ticket_type, 0) > limit:
            raise HTTPException(
                status_code=422,
                detail=f"Loại vé {ticket_type} chỉ được mua tối đa {limit} vé mỗi đơn!",
            )


def release_booking_resources(db: Session, booking_id: int):
    """Trả ghế và vé đứng của một đơn về kho (dùng khi đơn hết hạn hoặc bị hủy)."""
    event_id = db.query(Booking.event_id).filter(Booking.id == booking_id).scalar()

    # Ghế ngồi: HELD -> RELEASED (cột active_seat_key tự thành NULL, ghế đặt lại được)
    db.query(SeatReservation).filter(
        SeatReservation.booking_id == booking_id,
        SeatReservation.status == "HELD",
    ).update({"status": "RELEASED"}, synchronize_session=False)

    # Vé đứng: trừ số đang giữ
    standing_items = db.query(BookingItem).filter(
        BookingItem.booking_id == booking_id,
        BookingItem.seat_id.is_(None),
    ).all()
    for item in standing_items:
        db.query(TicketInventory).filter(
            TicketInventory.event_id == event_id,
            TicketInventory.ticket_type_id == item.ticket_type_id,
            TicketInventory.held_quantity >= item.quantity,
        ).update(
            {"held_quantity": TicketInventory.held_quantity - item.quantity},
            synchronize_session=False,
        )


def expire_pending_bookings(db: Session, event_id: Optional[str] = None) -> int:
    """Hủy mọi đơn PENDING_PAYMENT đã quá hạn và trả ghế/vé về kho. Trả về số đơn đã hủy."""
    query = db.query(Booking.id).filter(
        Booking.status == "PENDING_PAYMENT",
        Booking.expires_at <= now_vn(),
    )
    if event_id:
        query = query.filter(Booking.event_id == event_id)

    count = 0
    for (booking_id,) in query.all():
        # "Giành quyền" xử lý đơn: chỉ 1 nơi thành công, tránh trả kho 2 lần
        claimed = db.query(Booking).filter(
            Booking.id == booking_id,
            Booking.status == "PENDING_PAYMENT",
        ).update({"status": "EXPIRED"}, synchronize_session=False)
        if claimed == 1:
            release_booking_resources(db, booking_id)
            count += 1
        db.commit()
    return count


def _release_job() -> int:
    db = SessionLocal()
    try:
        return expire_pending_bookings(db)
    finally:
        db.close()


async def auto_release_loop():
    """Chạy nền: cứ mỗi 30 giây quét và hủy đơn hết hạn."""
    while True:
        await asyncio.sleep(AUTO_RELEASE_SECONDS)
        try:
            released = await asyncio.to_thread(_release_job)
            if released:
                print(f"[auto-release] Đã hủy {released} đơn hết hạn")
        except Exception as e:
            print("[auto-release] Lỗi:", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(auto_release_loop())
    yield
    task.cancel()


app = FastAPI(title="Booking Service", lifespan=lifespan)

# Cho phép Frontend React (localhost:3000) gọi API mà không bị chặn CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- API ----------
# 1. Đặt vé và giữ chỗ 10 phút: nhiều ghế + vé đứng, "giữ tất cả hoặc không giữ gì"
@app.post("/bookings/hold", status_code=201)
def hold(req: HoldRequest, db: Session = Depends(get_db)):
    validate_hold_request(req)

    # Dọn các đơn đã hết hạn của sự kiện này để ghế/vé được trả về kho
    expire_pending_bookings(db, event_id=req.event_id)

    now = now_vn()
    total = sum((i.unit_price * i.quantity for i in req.items), Decimal("0"))

    # Sắp xếp ghế theo thứ tự cố định để 2 đơn không khóa chéo nhau (deadlock)
    items = sorted(req.items, key=lambda i: (i.seat_id is None, i.seat_id or "", i.ticket_type_id))

    try:
        booking = Booking(
            user_id=req.user_id,
            event_id=req.event_id,
            status="PENDING_PAYMENT",
            total_amount=total,
            created_at=now,
            expires_at=now + timedelta(minutes=HOLD_MINUTES),
        )
        db.add(booking)
        db.flush()  # lấy booking.id

        for item in items:
            db.add(BookingItem(
                booking_id=booking.id,
                ticket_type_id=item.ticket_type_id,
                seat_id=item.seat_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
            ))

            if item.seat_id:
                # Ghế ngồi: UNIQUE sẽ từ chối nếu ghế đã có người giữ/mua
                db.add(SeatReservation(
                    event_id=req.event_id,
                    seat_id=item.seat_id,
                    booking_id=booking.id,
                    status="HELD",
                ))
                db.flush()
            else:
                # Vé đứng: 1 câu UPDATE nguyên tử, chỉ cộng khi còn đủ chỗ
                updated = db.query(TicketInventory).filter(
                    TicketInventory.event_id == req.event_id,
                    TicketInventory.ticket_type_id == item.ticket_type_id,
                    (TicketInventory.total_quantity
                     - TicketInventory.held_quantity
                     - TicketInventory.sold_quantity) >= item.quantity,
                ).update(
                    {"held_quantity": TicketInventory.held_quantity + item.quantity},
                    synchronize_session=False,
                )
                if updated == 0:
                    raise SoldOut(item.ticket_type_id)

        db.commit()  # chỉ đến đây thì cả đơn mới thật sự được lưu

    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Có ghế đã được bán hoặc đang có người giữ chỗ!")
    except SoldOut as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"Loại vé {e} đã hết hoặc không đủ số lượng!")
    except OperationalError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Hệ thống đang bận, vui lòng thử lại!")

    db.refresh(booking)
    return {
        "status": "success",
        "message": f"Giữ chỗ thành công trong {HOLD_MINUTES} phút.",
        "booking_id": booking.id,
        "total_amount": float(booking.total_amount),
        "created_at": booking.created_at,
        "expires_at": booking.expires_at,
    }


# 2. Hủy đơn hết hạn thủ công (hệ thống đã tự chạy nền, API này để test/demo)
@app.post("/bookings/release-expired")
def release_expired_bookings(db: Session = Depends(get_db)):
    count = expire_pending_bookings(db)
    return {"status": "success", "released_count": count}

# 3. Xem trạng thái ghế của một sự kiện (để giao diện tô xám ghế đã có người)
@app.get("/bookings/events/{event_id}/seat-status")
def get_seat_status(event_id: str, db: Session = Depends(get_db)):
    # Dọn đơn hết hạn trước để danh sách ghế chính xác
    expire_pending_bookings(db, event_id=event_id)

    rows = db.query(SeatReservation.seat_id, SeatReservation.status).filter(
        SeatReservation.event_id == event_id,
        SeatReservation.status.in_(["HELD", "SOLD"]),
    ).all()
    return {
        "event_id": event_id,
        "held": sorted(seat for seat, status in rows if status == "HELD"),
        "sold": sorted(seat for seat, status in rows if status == "SOLD"),
    }


# 4. Xem số vé đứng còn lại của một sự kiện
@app.get("/bookings/events/{event_id}/standing-availability")
def get_standing_availability(event_id: str, db: Session = Depends(get_db)):
    expire_pending_bookings(db, event_id=event_id)

    rows = db.query(TicketInventory).filter(TicketInventory.event_id == event_id).all()
    return [
        {
            "ticket_type_id": r.ticket_type_id,
            "total": r.total_quantity,
            "available": r.total_quantity - r.held_quantity - r.sold_quantity,
        }
        for r in rows
    ]

# ---------- Lượt cuối: xác nhận thanh toán, hủy đơn, xem đơn ----------
class PaymentResult(str, Enum):
    """Chỉ cho phép Payment Service báo 2 kết quả này."""
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"


def confirm_booking_resources(db: Session, booking_id: int):
    """Đơn đã thanh toán: ghế HELD -> SOLD, vé đứng chuyển từ 'đang giữ' sang 'đã bán'."""
    event_id = db.query(Booking.event_id).filter(Booking.id == booking_id).scalar()

    db.query(SeatReservation).filter(
        SeatReservation.booking_id == booking_id,
        SeatReservation.status == "HELD",
    ).update({"status": "SOLD"}, synchronize_session=False)

    standing_items = db.query(BookingItem).filter(
        BookingItem.booking_id == booking_id,
        BookingItem.seat_id.is_(None),
    ).all()
    for item in standing_items:
        db.query(TicketInventory).filter(
            TicketInventory.event_id == event_id,
            TicketInventory.ticket_type_id == item.ticket_type_id,
            TicketInventory.held_quantity >= item.quantity,
        ).update(
            {
                "held_quantity": TicketInventory.held_quantity - item.quantity,
                "sold_quantity": TicketInventory.sold_quantity + item.quantity,
            },
            synchronize_session=False,
        )


def booking_to_dict(b: Booking) -> dict:
    return {
        "booking_id": b.id,
        "event_id": b.event_id,
        "user_id": b.user_id,
        "status": b.status,
        "total_amount": float(b.total_amount),
        "created_at": b.created_at,
        "expires_at": b.expires_at,
        "items": [
            {
                "ticket_type_id": i.ticket_type_id,
                "seat_id": i.seat_id,
                "quantity": i.quantity,
                "unit_price": float(i.unit_price),
            }
            for i in b.items
        ],
    }


# 5. Nhận kết quả thanh toán từ Payment Service
@app.put("/bookings/{booking_id}/status")
@app.put("/api/v1/bookings/{booking_id}/status")
def update_booking_status(booking_id: int, status: PaymentResult, db: Session = Depends(get_db)):
    now = now_vn()

    # "Giành quyền" xử lý đơn bằng 1 câu UPDATE có điều kiện (nguyên tử).
    # CONFIRMED: đơn phải đang chờ thanh toán VÀ chưa hết hạn.
    conditions = [Booking.id == booking_id, Booking.status == "PENDING_PAYMENT"]
    if status == PaymentResult.CONFIRMED:
        conditions.append(Booking.expires_at > now)

    claimed = db.query(Booking).filter(*conditions).update(
        {"status": status.value}, synchronize_session=False
    )

    if claimed == 1:
        # Cùng 1 transaction: đổi trạng thái đơn + cập nhật ghế/vé đứng, xong mới commit
        if status == PaymentResult.CONFIRMED:
            confirm_booking_resources(db, booking_id)
        else:
            release_booking_resources(db, booking_id)
        db.commit()
        return {"status": "success", "message": f"Đã cập nhật trạng thái đơn hàng thành {status.value}"}

    db.rollback()

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")

    # Thanh toán đến trễ: đơn đã hết hạn -> trả ghế/vé về kho, báo cần hoàn tiền
    if status == PaymentResult.CONFIRMED and booking.status in ("PENDING_PAYMENT", "EXPIRED"):
        if booking.status == "PENDING_PAYMENT":
            expire_pending_bookings(db, event_id=booking.event_id)
        raise HTTPException(
            status_code=409,
            detail="Đơn đã hết hạn giữ chỗ, không thể xác nhận. Cần hoàn tiền cho khách!",
        )

    raise HTTPException(status_code=409, detail=f"Đơn hàng đã được xử lý trước đó (trạng thái: {booking.status})!")


# 6. Khách tự hủy đơn khi CHƯA thanh toán -> trả ghế/vé về kho ngay
@app.post("/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: int, user_id: str, db: Session = Depends(get_db)):
    claimed = db.query(Booking).filter(
        Booking.id == booking_id,
        Booking.user_id == user_id,
        Booking.status == "PENDING_PAYMENT",
    ).update({"status": "CANCELLED"}, synchronize_session=False)

    if claimed == 1:
        release_booking_resources(db, booking_id)
        db.commit()
        return {"status": "success", "message": "Đã hủy đơn, ghế và vé được trả lại."}

    db.rollback()

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")
    if booking.user_id != user_id:
        raise HTTPException(status_code=403, detail="Bạn không phải chủ của đơn này!")
    if booking.status == "CONFIRMED":
        raise HTTPException(
            status_code=409,
            detail="Đơn đã thanh toán, cần hủy theo quy trình hoàn tiền (làm ở bước nối với Payment).",
        )

    messages = {
        "CANCELLED": "Đơn này đã được hủy trước đó.",
        "EXPIRED": "Đơn này đã hết hạn giữ chỗ nên không thể hủy.",
    }
    raise HTTPException(
        status_code=409,
        detail=messages.get(booking.status, f"Đơn không thể hủy (trạng thái: {booking.status})!"),
    )


# 7. Xem chi tiết một đơn
@app.get("/bookings/{booking_id}")
def get_booking(booking_id: int, db: Session = Depends(get_db)):
    expire_pending_bookings(db)
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")
    return booking_to_dict(booking)


# 8. Xem danh sách đơn của một người dùng (mới nhất trước)
@app.get("/bookings/user/{user_id}")
def list_user_bookings(user_id: str, db: Session = Depends(get_db)):
    expire_pending_bookings(db)
    bookings = (
        db.query(Booking)
        .filter(Booking.user_id == user_id)
        .order_by(Booking.id.desc())
        .all()
    )
    return [booking_to_dict(b) for b in bookings]