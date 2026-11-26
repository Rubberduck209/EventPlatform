import os
import threading
import time

import requests
from dotenv import load_dotenv

from qr_utils import build_qr_text, verify_qr_text

load_dotenv()
BASE = "http://localhost:8005"
KEY = os.getenv("INTERNAL_API_KEY", "")
EVENT = "E5"
RUN = int(time.time())  # mã đơn khác nhau mỗi lần chạy

passed = 0
failed = 0


def check(name, actual, expected):
    global passed, failed
    ok = actual == expected
    passed += ok
    failed += (not ok)
    print(("PASS" if ok else "FAIL"), "-", name, "| thực tế:", actual, "| kỳ vọng:", expected)


def issue(booking_id, items):
    r = requests.post(
        f"{BASE}/tickets/issue",
        headers={"x-internal-key": KEY},
        json={"booking_id": booking_id, "event_id": EVENT, "owner_user_id": "u1",
              "owner_name": "Nguyễn Văn A", "items": items},
    )
    assert r.status_code in (200, 201), f"Phát hành vé lỗi: {r.status_code} {r.text}"
    return [t["qr_text"] for t in r.json()["tickets"]]


def scan(qr, staff="staff1", event=EVENT):
    return requests.post(f"{BASE}/tickets/check-in", json={"qr_text": qr, "event_id": event, "staff_id": staff})


def run_parallel(n, make_request):
    results = [None] * n

    def worker(i):
        results[i] = make_request(i).status_code

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    start = time.perf_counter()
    [t.start() for t in threads]
    [t.join() for t in threads]
    return results, time.perf_counter() - start


print("--- Test 1: 30 nhân viên cùng quét 1 vé ---")
qr = issue(RUN, [{"ticket_type_id": "VIP", "seat_id": f"S{RUN}", "quantity": 1}])[0]
codes, elapsed = run_parallel(30, lambda i: scan(qr, staff=f"staff{i}"))
check("Số lượt thành công (200)", codes.count(200), 1)
check("Số lượt bị chặn (409)", codes.count(409), 29)
print(f"   Thời gian tổng: {elapsed * 1000:.0f} ms\n")

print("--- Test 2: 50 nhân viên quét 50 vé KHÁC nhau cùng lúc ---")
qrs = issue(RUN + 1, [{"ticket_type_id": "STANDING", "quantity": 50}])
codes, elapsed = run_parallel(50, lambda i: scan(qrs[i], staff=f"gate{i}"))
check("Cả 50 vé đều check-in được", codes.count(200), 50)
print(f"   Thời gian tổng: {elapsed * 1000:.0f} ms (trung bình {elapsed * 1000 / 50:.0f} ms/lượt khi chạy song song)\n")

print("--- Test 3: QR giả và QR bị sửa ---")
check("QR giả", scan("khong-phai-qr.abc").status_code, 400)
fresh = issue(RUN + 2, [{"ticket_type_id": "VIP", "seat_id": f"S{RUN}b", "quantity": 1}])[0]
check("QR bị sửa 1 ký tự", scan("X" + fresh[1:]).status_code, 400)

print("\n--- Test 4: quét sai sự kiện không làm 'cháy' vé ---")
check("Quét ở sự kiện E9", scan(fresh, event="E9").status_code, 403)
check("Quét lại đúng sự kiện E5 vẫn được", scan(fresh).status_code, 200)

print("\n--- Test 5: QR ký đúng nhưng vé không có trong hệ thống ---")
ghost = build_qr_text("TK-KHONGTONTAI", EVENT, None, "Ai Đó", 1)
check("Vé không tồn tại", scan(ghost).status_code, 404)

print("\n--- Test 6: QR phiên bản không khớp (giả lập QR cũ) ---")
info = verify_qr_text(issue(RUN + 3, [{"ticket_type_id": "VIP", "seat_id": f"S{RUN}c", "quantity": 1}])[0])
old = build_qr_text(info["c"], info["e"], info["s"], info["o"], 2)
check("QR sai phiên bản", scan(old).status_code, 410)

print(f"\nTổng: {passed} PASS, {failed} FAIL")