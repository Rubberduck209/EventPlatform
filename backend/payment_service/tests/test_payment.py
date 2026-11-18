import os
import sys
import unittest
from decimal import Decimal

# Cấu hình SQLite In-Memory cho việc chạy Unit Test độc lập
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-payment-service"
os.environ["VNPAY_TMN_CODE"] = "TEST_TMN_2027"
os.environ["VNPAY_HASH_SECRET"] = "TEST_HASH_SECRET_KEY_HMAC_SHA512_VNPAY"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import HTTPException

from auth import TokenUser
from db import Base, SessionLocal, engine
import mail
import model  # noqa: F401
from main import (
    create_payment_session,
    process_vnpay_ipn_params,
    refund_payment,
    seed_initial_payment_data,
)
from schemas import PaymentCreateRequest, RefundCreateRequest
from vnpay import build_signed_vnpay_ipn_params


class DummyRequest:
    class Client:
        host = "127.0.0.1"

    client = Client()


class TestPaymentService(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        seed_initial_payment_data(self.db)
        self.customer = TokenUser(id=3, email="customer1@gmail.com", role="CUSTOMER")

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)

    def test_01_create_vnpay_payment_and_idempotency(self):
        """TC01: Tạo phiên thanh toán VNPay Sandbox và kiểm tra chống tạo trùng bằng Idempotency Key."""
        req_payload = PaymentCreateRequest(
            booking_id=205,
            amount=Decimal("350000.00"),
            payment_method="VNPAY_SANDBOX",
            idempotency_key="idem-booking-205-key-01",
            order_desc="Thanh toan 2 ve VIP",
            bank_code="NCB",
        )

        # Lần gọi thứ 1: Tạo mới giao dịch
        res1 = create_payment_session(
            payload=req_payload,
            request=DummyRequest(),
            current_user=self.customer,
            db=self.db,
        )
        self.assertEqual(res1.status.value, "PENDING")
        self.assertFalse(res1.is_idempotent_replay)
        self.assertIn("sandbox.vnpayment.vn/paymentv2/vpcpay.html", res1.payment_url)
        self.assertIn("vnp_SecureHash=", res1.payment_url)

        # Lần gọi thứ 2 (cùng idempotency_key & cùng số tiền): Trả về đúng giao dịch cũ, không tạo dòng mới
        res2 = create_payment_session(
            payload=req_payload,
            request=DummyRequest(),
            current_user=self.customer,
            db=self.db,
        )
        self.assertEqual(res1.id, res2.id)
        self.assertEqual(res1.payment_code, res2.payment_code)
        self.assertTrue(res2.is_idempotent_replay)

        # Lần gọi thứ 3 (cùng idempotency_key nhưng cố tình đổi số tiền): Phải báo lỗi 409 Conflict
        modified_payload = PaymentCreateRequest(
            booking_id=205,
            amount=Decimal("999000.00"),
            payment_method="VNPAY_SANDBOX",
            idempotency_key="idem-booking-205-key-01",
        )
        with self.assertRaises(HTTPException) as ctx:
            create_payment_session(
                payload=modified_payload,
                request=DummyRequest(),
                current_user=self.customer,
                db=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 409)

    def test_02_vnpay_ipn_webhook_signature_and_refund(self):
        """TC02: Kiểm tra luồng VNPay IPN (Chữ ký HMAC-SHA512, Sai tiền, Gọi lặp IPN) và Hoàn tiền (Refund)."""
        payment = create_payment_session(
            payload=PaymentCreateRequest(
                booking_id=301,
                amount=Decimal("500000.00"),
                payment_method="VNPAY_SANDBOX",
                idempotency_key="idem-booking-301",
            ),
            request=DummyRequest(),
            current_user=self.customer,
            db=self.db,
        )

        # 1. Giả mạo chữ ký vnp_SecureHash -> Phải trả về RspCode = "97" (Invalid Signature)
        tampered_params = build_signed_vnpay_ipn_params(
            payment_code=payment.payment_code,
            amount_vnd=500000,
            response_code="00",
        )
        tampered_params["vnp_SecureHash"] = "00000000000000000000000000000000"
        ipn_tampered = process_vnpay_ipn_params(tampered_params, self.db)
        self.assertEqual(ipn_tampered.RspCode, "97")

        # 2. Giả mạo số tiền lệch với đơn gốc -> Phải trả về RspCode = "04" (Invalid amount)
        wrong_amount_params = build_signed_vnpay_ipn_params(
            payment_code=payment.payment_code,
            amount_vnd=100000,
            response_code="00",
        )
        ipn_wrong_amt = process_vnpay_ipn_params(wrong_amount_params, self.db)
        self.assertEqual(ipn_wrong_amt.RspCode, "04")

        # 3. IPN hợp lệ lần 1 -> Trả về RspCode = "00" (Confirm Success) và phát mail thông báo
        valid_params = build_signed_vnpay_ipn_params(
            payment_code=payment.payment_code,
            amount_vnd=500000,
            response_code="00",
            transaction_no="14998877",
        )
        ipn_ok = process_vnpay_ipn_params(valid_params, self.db)
        self.assertEqual(ipn_ok.RspCode, "00")
        self.assertTrue(len(mail.get_mail_logs()) >= 1)

        # 4. VNPay gửi lặp lại IPN lần 2 -> Phải chặn trùng và trả về RspCode = "02" (Order already confirmed)
        ipn_duplicate = process_vnpay_ipn_params(valid_params, self.db)
        self.assertEqual(ipn_duplicate.RspCode, "02")

        # 5. Thực hiện Hoàn tiền (Refund) một phần (200.000đ) và hoàn tiếp phần còn lại (300.000đ)
        refund1 = refund_payment(
            payment_id=payment.id,
            payload=RefundCreateRequest(
                refund_amount=Decimal("200000.00"),
                reason="Hoàn tiền 1 vé theo yêu cầu khách hàng",
            ),
            current_user=self.customer,
            db=self.db,
        )
        self.assertEqual(refund1.status.value, "SUCCESS")
        self.assertEqual(refund1.refund_amount, 200000.0)

        # Thử hoàn vượt quá số dư còn lại (400.000đ > 300.000đ còn lại) -> Phải chặn 400 Bad Request
        with self.assertRaises(HTTPException) as refund_ctx:
            refund_payment(
                payment_id=payment.id,
                payload=RefundCreateRequest(
                    refund_amount=Decimal("400000.00"),
                    reason="Hoàn vượt mức",
                ),
                current_user=self.customer,
                db=self.db,
            )
        self.assertEqual(refund_ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main(verbosity=2)
