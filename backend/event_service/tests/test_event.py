import os
import sys
import unittest
from datetime import datetime, timedelta

# Cấu hình SQLite In-Memory cho việc chạy Unit Test độc lập
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-event-service"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from auth import TokenUser
from db import Base, SessionLocal, engine
import mail
import model  # noqa: F401
from main import (
    batch_update_zone_seats,
    create_event,
    create_event_zone,
    create_ticket_type,
    list_categories,
    seed_initial_event_data,
    update_event_status,
    validate_ticket_purchase,
)
from schemas import (
    EventCreateRequest,
    EventStatusUpdateRequest,
    PricingRuleCreateRequest,
    PurchaseValidationRequest,
    SeatBatchUpdateItem,
    SeatBatchUpdateRequest,
    TicketTypeCreateRequest,
    ZoneCreateRequest,
)


class TestEventService(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        seed_initial_event_data(self.db)
        self.organizer = TokenUser(id=2, email="organizer@gmail.com", role="ORGANIZER")

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)

    def test_01_categories_and_event_lifecycle(self):
        """TC01: Kiểm tra tạo sự kiện và chuyển trạng thái vòng đời (DRAFT -> PUBLISHED -> ON_SALE) kèm mail.py."""
        categories = list_categories(db=self.db)
        self.assertTrue(len(categories) >= 4)

        now = datetime.utcnow()
        created = create_event(
            payload=EventCreateRequest(
                category_id=categories[0].id,
                title="TDTU Tech & Music Concert 2027",
                short_description="Đêm nhạc hội công nghệ sinh viên",
                description="Chương trình biểu diễn âm nhạc kết hợp ánh sáng",
                venue_name="Sân vận động TDTU",
                venue_address="19 Nguyễn Hữu Thọ, Quận 7, TP.HCM",
                start_time=now + timedelta(days=15),
                end_time=now + timedelta(days=15, hours=4),
                refund_policy="Hoàn tiền 100% trước 7 ngày.",
            ),
            current_user=self.organizer,
            db=self.db,
        )
        self.assertEqual(created.status.value, "DRAFT")

        # Chuyển sang PUBLISHED -> kích hoạt thông báo qua mail.py
        published = update_event_status(
            event_id=created.id,
            payload=EventStatusUpdateRequest(status="PUBLISHED"),
            current_user=self.organizer,
            db=self.db,
        )
        self.assertEqual(published.status.value, "PUBLISHED")
        self.assertTrue(len(mail.get_mail_logs()) >= 1)

        # Chuyển sang ON_SALE
        on_sale = update_event_status(
            event_id=created.id,
            payload=EventStatusUpdateRequest(status="ON_SALE"),
            current_user=self.organizer,
            db=self.db,
        )
        self.assertEqual(on_sale.status.value, "ON_SALE")

    def test_02_seat_grid_map_editor_and_dynamic_pricing(self):
        """TC02: Kiểm tra Grid Map Editor (STANDING & SEATED Rows x Cols, bôi đen ghế) và Giá vé động Early Bird + @tdtu.edu.vn."""
        categories = list_categories(db=self.db)
        now = datetime.utcnow()
        event = create_event(
            payload=EventCreateRequest(
                category_id=categories[0].id,
                title="Grid Map Test Event",
                venue_name="Nhà thi đấu Quận 7",
                venue_address="Quận 7, TP.HCM",
                start_time=now + timedelta(days=20),
                end_time=now + timedelta(days=20, hours=3),
            ),
            current_user=self.organizer,
            db=self.db,
        )

        # 1. Tạo khu vực đứng (STANDING)
        standing_zone = create_event_zone(
            event_id=event.id,
            payload=ZoneCreateRequest(
                name="Khu Fanzone Đứng",
                zone_type="STANDING",
                total_capacity=500,
            ),
            current_user=self.organizer,
            db=self.db,
        )
        self.assertEqual(standing_zone.total_capacity, 500)

        # 2. Tạo khu vực ghế ngồi (SEATED: 3 hàng x 5 cột = 15 ghế A01..C05)
        seated_zone = create_event_zone(
            event_id=event.id,
            payload=ZoneCreateRequest(
                name="Khán đài VIP",
                zone_type="SEATED",
                grid_rows=3,
                grid_cols=5,
                default_seat_tier="VIP",
            ),
            current_user=self.organizer,
            db=self.db,
        )
        self.assertEqual(seated_zone.total_capacity, 15)
        self.assertEqual(len(seated_zone.seats), 15)

        # 3. Dùng Grid Map Editor bôi đen 2 ghế (A01, A02) làm lối đi -> Sức chứa tự động giảm còn 13
        updated_zone = batch_update_zone_seats(
            zone_id=seated_zone.id,
            payload=SeatBatchUpdateRequest(
                seats=[
                    SeatBatchUpdateItem(seat_code="A01", is_disabled=True),
                    SeatBatchUpdateItem(seat_code="A02", is_disabled=True),
                    SeatBatchUpdateItem(seat_code="B01", is_disabled=False, seat_tier="STUDENT"),
                ]
            ),
            current_user=self.organizer,
            db=self.db,
        )
        self.assertEqual(updated_zone.total_capacity, 13)

        # 4. Tạo loại vé Student (@tdtu.edu.vn, tối đa 4 vé/đơn) + Giá Early Bird (149.000đ) và Regular (220.000đ)
        ticket_type = create_ticket_type(
            event_id=event.id,
            payload=TicketTypeCreateRequest(
                zone_id=seated_zone.id,
                name="Vé Student VIP",
                total_quantity=13,
                max_per_order=4,
                is_student_only=True,
                student_email_domain="@tdtu.edu.vn",
                pricing_rules=[
                    PricingRuleCreateRequest(
                        rule_name="Early Bird",
                        price=149000,
                        start_time=now - timedelta(days=1),
                        end_time=now + timedelta(days=5),
                    ),
                    PricingRuleCreateRequest(
                        rule_name="Regular",
                        price=220000,
                        start_time=now + timedelta(days=5, seconds=1),
                        end_time=now + timedelta(days=20),
                    ),
                ],
            ),
            current_user=self.organizer,
            db=self.db,
        )
        self.assertEqual(float(ticket_type.current_price), 149000.0)
        self.assertEqual(ticket_type.active_rule_name, "Early Bird")

        # 5. Kiểm tra điều kiện mua vé (Validate Purchase)
        # 5a. Vượt quá 4 vé/đơn -> Bị chặn
        over_qty = validate_ticket_purchase(
            event_id=event.id,
            payload=PurchaseValidationRequest(
                ticket_type_id=ticket_type.id,
                quantity=5,
                buyer_email="sinhvien@tdtu.edu.vn",
            ),
            db=self.db,
        )
        self.assertFalse(over_qty.allowed)

        # 5b. Email không thuộc trường (@gmail.com thay vì @tdtu.edu.vn) -> Bị chặn
        wrong_email = validate_ticket_purchase(
            event_id=event.id,
            payload=PurchaseValidationRequest(
                ticket_type_id=ticket_type.id,
                quantity=2,
                buyer_email="khach@gmail.com",
            ),
            db=self.db,
        )
        self.assertFalse(wrong_email.allowed)

        # 5c. Email hợp lệ @tdtu.edu.vn + số lượng 2 vé -> Hợp lệ, tổng tiền Early Bird = 298.000đ
        valid = validate_ticket_purchase(
            event_id=event.id,
            payload=PurchaseValidationRequest(
                ticket_type_id=ticket_type.id,
                quantity=2,
                buyer_email="sinhvien@tdtu.edu.vn",
            ),
            db=self.db,
        )
        self.assertTrue(valid.allowed)
        self.assertEqual(float(valid.total_price), 298000.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
