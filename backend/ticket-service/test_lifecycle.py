import os
import threading
import time

import requests
from dotenv import load_dotenv

load_dotenv()
BASE = "http://localhost:8005"
KEY = os.getenv("INTERNAL_API_KEY", "")
EVENT = "E5"
RUN = int(time.time())

passed = 0
failed = 0


def check(name, actual, expected):
    global passed, failed
    ok = actual == expected
    passed += ok
    failed += (not ok)
    print(("PASS" if ok else "FAIL"), "-", name, "| thực tế:", actual, "| kỳ vọng:", expected)


def issue_one(booking_id, owner_id="u1", owner_name="An"):
    r = requests.post(
        f"{BASE}/tickets/issue",
        headers={"x-internal-key": KEY},
        json={"booking_id": booking_id, "event_id": EVENT, "owner_user_id": owner_id, "owner_name": owner_name,
              "items": [{"ticket_type_id": "VIP", "seat_id": f"L{booking_id}", "quantity": 1}]},
    )
    assert r.status_code in (200, 201), f"Phát hành vé lỗi: {r.status_code} {r.text}"
    t = r.json()["tickets"][0]
    return t["ticket_code"], t["qr_text"]


def scan(qr, staff="staff1"):
    return requests.post(f"{BASE}/tickets/check-in", json={"qr_text": qr, "event_id": EVENT, "staff_id": staff})


def cancel(code):
    return requests.post(f"{BASE}/tickets/{code}/cancel", headers={"x-internal-key": KEY})


def transfer(code, from_user, to_user, name="Người nhận"):
    return requests.post(f"{BASE}/tickets/{code}/transfer",
                         json={"from_user_id": from_user, "to_user_id": to_user, "to_owner_name": name})


def run_parallel(n, fn):
    results = [None] * n

    def worker(i):
        results[i] = fn(i)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    return results


print("--- A: Hủy vé ---")
code, qr = issue_one(RUN)
r = cancel(code)
check("Hủy vé lần 1", (r.status_code, r.json()["already_cancelled"]), (200, False))
r = cancel(code)
check("Hủy vé lần 2 (gọi lặp vẫn an toàn)", (r.status_code, r.json()["already_cancelled"]), (200, True))
check("Quét vé đã hủy", scan(qr).status_code, 410)

print("\n--- B: Chuyển nhượng ---")
code, old_qr = issue_one(RUN + 1, owner_id="u1", owner_name="An")
r = transfer(code, "u1", "u2", "Bình")
check("Chuyển vé từ u1 sang u2", r.status_code, 200)
new_qr = r.json()["ticket"]["qr_text"]
check("QR cũ không còn dùng được", scan(old_qr).status_code, 410)
check("Người không còn là chủ vé cố chuyển tiếp", transfer(code, "u1", "u3").status_code, 403)
check("Chuyển vé cho chính mình", transfer(code, "u2", "u2").status_code, 422)
check("QR mới quét được", scan(new_qr).status_code, 200)
check("Chuyển vé sau khi đã check-in", transfer(code, "u2", "u3").status_code, 409)
check("Hủy vé sau khi đã check-in", cancel(code).status_code, 409)
mine = requests.get(f"{BASE}/users/u2/tickets").json()
check("u2 thấy vé trong danh sách của mình", code in [t["ticket_code"] for t in mine], True)

print("\n--- C: Check-in và hủy vé cùng lúc trên 1 vé (20 request) ---")
code, qr = issue_one(RUN + 2)
def mixed(i):
    if i % 2 == 0:
        return ("scan", scan(qr, staff=f"s{i}").status_code, None)
    r = cancel(code)
    return ("cancel", r.status_code, r.json().get("already_cancelled") if r.status_code == 200 else None)
res = run_parallel(20, mixed)
scan_ok = sum(1 for kind, status, _ in res if kind == "scan" and status == 200)
cancel_new = sum(1 for kind, status, flag in res if kind == "cancel" and status == 200 and flag is False)
print(f"   Check-in thành công: {scan_ok} | Hủy mới thành công: {cancel_new}")
check("Chỉ MỘT trong hai thắng (không bao giờ vừa vào cổng vừa bị hủy)", scan_ok + cancel_new, 1)

print("\n--- D: 10 người cùng nhận chuyển 1 vé từ u1 ---")
code, _ = issue_one(RUN + 3, owner_id="u1")
res = run_parallel(10, lambda i: transfer(code, "u1", f"nguoi{i}", f"Người {i}").status_code)
check("Chỉ 1 lần chuyển thành công", res.count(200), 1)
check("9 lần còn lại bị từ chối (403)", res.count(403), 9)

print(f"\nTổng: {passed} PASS, {failed} FAIL")