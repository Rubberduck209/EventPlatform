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

import os
import secrets
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from models import CheckinLog, Ticket, TicketTransfer
from qr_utils import build_qr_text, qr_png, verify_qr_text
from utils import now_vn

load_dotenv()
Base.metadata.create_all(bind=engine)

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

app = FastAPI(title="Ticket Service")

# Cho phép Frontend React (localhost:3000) gọi API trực tiếp không bị chặn CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_internal_key(x_internal_key: str = Header(default="")):
    if not INTERNAL_API_KEY or not secrets.compare_digest(
        x_internal_key.encode("utf-8"), INTERNAL_API_KEY.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Thiếu hoặc sai khóa nội bộ!")


class IssueItem(BaseModel):
    ticket_type_id: str
    seat_id: Optional[str] = None  # để trống nếu là vé đứng
    quantity: int = Field(default=1, ge=1)


class IssueRequest(BaseModel):
    booking_id: int
    event_id: str
    owner_user_id: str
    owner_name: str = Field(min_length=1, max_length=100)
    items: list[IssueItem] = Field(min_length=1)


def new_ticket_code() -> str:
    return "TK-" + secrets.token_hex(8).upper()


def ticket_to_dict(t: Ticket) -> dict:
    return {
        "ticket_code": t.ticket_code,
        "booking_id": t.booking_id,
        "event_id": t.event_id,
        "ticket_type_id": t.ticket_type_id,
        "seat_id": t.seat_id,
        "owner_user_id": t.owner_user_id,
        "owner_name": t.owner_name,
        "status": t.status,
        "qr_version": t.qr_version,
        "issued_at": t.issued_at,
        "checked_in_at": t.checked_in_at,
        "checked_in_by": t.checked_in_by,
        "qr_text": build_qr_text(
            t.ticket_code, t.event_id, t.seat_id, t.owner_name, t.qr_version
        ),
    }


def tickets_of_booking(db: Session, booking_id: int):
    return (
        db.query(Ticket)
        .filter(Ticket.booking_id == booking_id)
        .order_by(Ticket.ticket_index)
        .all()
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "ticket-service"}


@app.post(
    "/tickets/issue", status_code=201, dependencies=[Depends(require_internal_key)]
)
def issue_tickets(req: IssueRequest, response: Response, db: Session = Depends(get_db)):
    # Gọi lặp lại trả về đúng các vé đã phát hành, không tạo thêm
    existing = tickets_of_booking(db, req.booking_id)
    if existing:
        response.status_code = 200
        return {
            "status": "success",
            "already_issued": True,
            "tickets": [ticket_to_dict(t) for t in existing],
        }

    # Sắp xếp cố định để ticket_index không đổi giữa các lần gọi
    slots = []
    for item in sorted(
        req.items, key=lambda i: (i.seat_id is None, i.seat_id or "", i.ticket_type_id)
    ):
        if item.seat_id and item.quantity != 1:
            raise HTTPException(
                status_code=422, detail="Mỗi ghế ngồi chỉ có số lượng 1!"
            )
        slots.extend([item] * item.quantity)

    try:
        tickets = []
        for index, item in enumerate(slots, start=1):
            ticket = Ticket(
                ticket_code=new_ticket_code(),
                booking_id=req.booking_id,
                ticket_index=index,
                event_id=req.event_id,
                ticket_type_id=item.ticket_type_id,
                seat_id=item.seat_id,
                owner_user_id=req.owner_user_id,
                owner_name=req.owner_name,
                status="ISSUED",
                qr_version=1,
                issued_at=now_vn(),
            )
            db.add(ticket)
            tickets.append(ticket)
        db.commit()
    except IntegrityError:
        # Hai request cùng phát hành một đơn: UNIQUE(booking_id, ticket_index) chỉ cho một bên thành công
        db.rollback()
        existing = tickets_of_booking(db, req.booking_id)
        if existing:
            response.status_code = 200
            return {
                "status": "success",
                "already_issued": True,
                "tickets": [ticket_to_dict(t) for t in existing],
            }
        raise HTTPException(
            status_code=409, detail="Không phát hành được vé, vui lòng thử lại!"
        )

    for t in tickets:
        db.refresh(t)
    return {
        "status": "success",
        "already_issued": False,
        "tickets": [ticket_to_dict(t) for t in tickets],
    }


@app.get("/tickets/{ticket_code}")
def get_ticket(ticket_code: str, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.ticket_code == ticket_code).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Không tìm thấy vé!")
    return ticket_to_dict(ticket)


@app.get("/tickets/{ticket_code}/qr")
def get_ticket_qr(ticket_code: str, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.ticket_code == ticket_code).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Không tìm thấy vé!")
    text = build_qr_text(
        ticket.ticket_code,
        ticket.event_id,
        ticket.seat_id,
        ticket.owner_name,
        ticket.qr_version,
    )
    return Response(content=qr_png(text), media_type="image/png")


class CheckinRequest(BaseModel):
    qr_text: str = Field(min_length=1, max_length=2000)
    event_id: str  # sự kiện nhân viên đang soát vé
    staff_id: str  # TODO: lấy từ JWT


def log_scan(
    db: Session,
    result: str,
    staff_id: str,
    event_id=None,
    ticket=None,
    ticket_code=None,
):
    """Ghi nhật ký một lượt quét rồi commit, kể cả thay đổi đang chờ trong session."""
    db.add(
        CheckinLog(
            ticket_id=ticket.id if ticket else None,
            ticket_code=ticket.ticket_code if ticket else ticket_code,
            event_id=ticket.event_id if ticket else event_id,
            staff_id=staff_id,
            result=result,
            scanned_at=now_vn(),
        )
    )
    db.commit()


def scan_error(
    db: Session,
    status_code: int,
    result: str,
    message: str,
    staff_id: str,
    event_id=None,
    ticket=None,
    ticket_code=None,
    **extra,
):
    """Ghi nhật ký lượt quét thất bại rồi raise HTTPException."""
    log_scan(
        db, result, staff_id, event_id=event_id, ticket=ticket, ticket_code=ticket_code
    )
    raise HTTPException(
        status_code=status_code, detail={"result": result, "message": message, **extra}
    )


@app.post("/tickets/check-in")
def check_in(req: CheckinRequest, db: Session = Depends(get_db)):
    # Kiểm tra chữ ký trước, QR giả bị chặn mà không cần truy vấn database
    data = verify_qr_text(req.qr_text)
    code = data.get("c") if data else None
    qr_event = data.get("e") if data else None
    version = data.get("v") if data else None
    if (
        not isinstance(code, str)
        or not isinstance(qr_event, str)
        or not isinstance(version, int)
    ):
        scan_error(
            db,
            400,
            "INVALID_SIGNATURE",
            "QR không hợp lệ hoặc đã bị chỉnh sửa!",
            req.staff_id,
            event_id=req.event_id,
        )

    if qr_event != req.event_id:
        scan_error(
            db,
            403,
            "WRONG_EVENT",
            "Vé thuộc sự kiện khác!",
            req.staff_id,
            event_id=qr_event,
            ticket_code=code,
        )

    # UPDATE có điều kiện là nơi phân xử: chỉ một request đổi được vé từ ISSUED sang CHECKED_IN
    now = now_vn()
    claimed = (
        db.query(Ticket)
        .filter(
            Ticket.ticket_code == code,
            Ticket.event_id == qr_event,
            Ticket.qr_version == version,
            Ticket.status == "ISSUED",
        )
        .update(
            {
                "status": "CHECKED_IN",
                "checked_in_at": now,
                "checked_in_by": req.staff_id,
            },
            synchronize_session=False,
        )
    )

    if claimed == 1:
        ticket = db.query(Ticket).filter(Ticket.ticket_code == code).first()
        seat_id, owner_name, ticket_type_id = (
            ticket.seat_id,
            ticket.owner_name,
            ticket.ticket_type_id,
        )
        # log_scan commit cả việc đổi trạng thái lẫn nhật ký
        log_scan(db, "SUCCESS", req.staff_id, ticket=ticket)
        return {
            "result": "SUCCESS",
            "message": "Check-in thành công!",
            "ticket_code": code,
            "ticket_type_id": ticket_type_id,
            "seat_id": seat_id,
            "owner_name": owner_name,
            "checked_in_at": now,
        }

    # Không đổi được dòng nào: đọc lại vé để biết lý do
    db.rollback()
    ticket = db.query(Ticket).filter(Ticket.ticket_code == code).first()
    if not ticket:
        scan_error(
            db,
            404,
            "NOT_FOUND",
            "Không tìm thấy vé này trong hệ thống!",
            req.staff_id,
            event_id=qr_event,
            ticket_code=code,
        )
    if ticket.qr_version != version or ticket.event_id != qr_event:
        scan_error(
            db,
            410,
            "OLD_QR",
            "QR này đã hết hiệu lực (vé đã được cấp QR mới)!",
            req.staff_id,
            ticket=ticket,
        )
    if ticket.status == "CANCELLED":
        scan_error(
            db, 410, "CANCELLED", "Vé này đã bị hủy!", req.staff_id, ticket=ticket
        )
    if ticket.status == "CHECKED_IN":
        scan_error(
            db,
            409,
            "ALREADY_CHECKED_IN",
            "Vé này đã check-in rồi!",
            req.staff_id,
            ticket=ticket,
            checked_in_at=(
                ticket.checked_in_at.isoformat() if ticket.checked_in_at else None
            ),
            checked_in_by=ticket.checked_in_by,
        )
    scan_error(
        db,
        409,
        "NOT_VALID",
        f"Vé không thể check-in (trạng thái: {ticket.status})!",
        req.staff_id,
        ticket=ticket,
    )


class TransferRequest(BaseModel):
    from_user_id: str  # TODO: lấy từ JWT
    to_user_id: str
    to_owner_name: str = Field(min_length=1, max_length=100)


@app.post("/tickets/{ticket_code}/cancel", dependencies=[Depends(require_internal_key)])
def cancel_ticket(ticket_code: str, db: Session = Depends(get_db)):
    # Cùng điều kiện status="ISSUED" với check-in nên hai việc này không thể cùng thắng
    claimed = (
        db.query(Ticket)
        .filter(
            Ticket.ticket_code == ticket_code,
            Ticket.status == "ISSUED",
        )
        .update({"status": "CANCELLED"}, synchronize_session=False)
    )
    db.commit()

    if claimed == 1:
        return {
            "status": "success",
            "message": "Đã hủy vé.",
            "already_cancelled": False,
        }

    ticket = db.query(Ticket).filter(Ticket.ticket_code == ticket_code).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Không tìm thấy vé!")
    if ticket.status == "CANCELLED":
        # Gọi lặp lại vẫn thành công (idempotent)
        return {
            "status": "success",
            "message": "Vé đã được hủy trước đó.",
            "already_cancelled": True,
        }
    raise HTTPException(status_code=409, detail="Vé đã check-in nên không thể hủy!")


@app.post("/tickets/{ticket_code}/transfer")
def transfer_ticket(
    ticket_code: str, req: TransferRequest, db: Session = Depends(get_db)
):
    if req.from_user_id == req.to_user_id:
        raise HTTPException(
            status_code=422, detail="Không thể chuyển vé cho chính mình!"
        )

    # Tăng qr_version để QR cũ không còn khớp, hết hiệu lực
    claimed = (
        db.query(Ticket)
        .filter(
            Ticket.ticket_code == ticket_code,
            Ticket.status == "ISSUED",
            Ticket.owner_user_id == req.from_user_id,
        )
        .update(
            {
                "owner_user_id": req.to_user_id,
                "owner_name": req.to_owner_name,
                "qr_version": Ticket.qr_version + 1,
            },
            synchronize_session=False,
        )
    )

    if claimed == 1:
        ticket = db.query(Ticket).filter(Ticket.ticket_code == ticket_code).first()
        db.add(
            TicketTransfer(
                ticket_id=ticket.id,
                from_user_id=req.from_user_id,
                to_user_id=req.to_user_id,
                to_owner_name=req.to_owner_name,
                transferred_at=now_vn(),
            )
        )
        db.commit()
        db.refresh(ticket)
        return {
            "status": "success",
            "message": "Đã chuyển vé, QR cũ không còn dùng được.",
            "ticket": ticket_to_dict(ticket),
        }

    db.rollback()
    ticket = db.query(Ticket).filter(Ticket.ticket_code == ticket_code).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Không tìm thấy vé!")
    if ticket.owner_user_id != req.from_user_id:
        raise HTTPException(status_code=403, detail="Bạn không phải chủ của vé này!")
    raise HTTPException(
        status_code=409, detail=f"Vé không thể chuyển (trạng thái: {ticket.status})!"
    )


@app.get("/users/{user_id}/tickets")
def list_user_tickets(user_id: str, db: Session = Depends(get_db)):
    tickets = (
        db.query(Ticket)
        .filter(Ticket.owner_user_id == user_id)
        .order_by(Ticket.id.desc())
        .all()
    )
    return [ticket_to_dict(t) for t in tickets]


@app.get("/bookings/{booking_id}/tickets")
def list_booking_tickets(booking_id: int, db: Session = Depends(get_db)):
    return [ticket_to_dict(t) for t in tickets_of_booking(db, booking_id)]


@app.get("/events/{event_id}/tickets")
def list_event_tickets(event_id: str, db: Session = Depends(get_db)):
    tickets = (
        db.query(Ticket)
        .filter(Ticket.event_id == event_id)
        .order_by(Ticket.id.desc())
        .all()
    )
    return [ticket_to_dict(t) for t in tickets]

