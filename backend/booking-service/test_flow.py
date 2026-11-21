import requests

BASE = "http://localhost:8003"
passed = 0
failed = 0


def check(name, actual, expected):
    global passed, failed
    ok = actual == expected
    passed += ok
    failed += (not ok)
    print(("PASS" if ok else "FAIL"), "-", name, "| thực tế:", actual, "| kỳ vọng:", expected)


def hold(user, items, event="E5"):
    return requests.post(f"{BASE}/bookings/hold", json={"event_id": event, "user_id": user, "items": items})


def seat(seat_id):
    return {"ticket_type_id": "VIP", "seat_id": seat_id, "quantity": 1, "unit_price": 100000}


def standing(qty):
    return {"ticket_type_id": "STANDING", "quantity": qty, "unit_price": 50000}


def available():
    r = requests.get(f"{BASE}/bookings/events/E5/standing-availability").json()
    return r[0]["available"]


print("--- Luồng 1: đặt rồi thanh toán thành công ---")
r = hold("an", [seat("C01"), standing(2)])
check("Đặt 1 ghế + 2 vé đứng", r.status_code, 201)
x = r.json()["booking_id"]
check("Vé đứng còn lại sau khi giữ", available(), 48)
check("Tổng tiền (100000 + 2*50000)", r.json()["total_amount"], 200000.0)

d = requests.get(f"{BASE}/bookings/{x}").json()
check("Xem đơn: trạng thái", d["status"], "PENDING_PAYMENT")
check("Xem đơn: số dòng vé", len(d["items"]), 2)

check("Thanh toán thành công", requests.put(f"{BASE}/bookings/{x}/status", params={"status": "CONFIRMED"}).status_code, 200)
check("Sau thanh toán, ghế C01 chuyển sang 'sold'", "C01" in requests.get(f"{BASE}/bookings/events/E5/seat-status").json()["sold"], True)
check("Sau thanh toán, vé đứng vẫn còn 48", available(), 48)
check("Gọi thanh toán lần 2 (trùng)", requests.put(f"{BASE}/bookings/{x}/status", params={"status": "CONFIRMED"}).status_code, 409)
check("Hủy đơn đã thanh toán", requests.post(f"{BASE}/bookings/{x}/cancel", params={"user_id": "an"}).status_code, 409)

print("\n--- Luồng 2: đặt rồi hủy ---")
y = hold("binh", [seat("C02"), standing(3)]).json()["booking_id"]
check("Giữ xong, vé đứng còn", available(), 45)
check("Người khác hủy đơn của Bình", requests.post(f"{BASE}/bookings/{y}/cancel", params={"user_id": "an"}).status_code, 403)
check("Bình tự hủy đơn của mình", requests.post(f"{BASE}/bookings/{y}/cancel", params={"user_id": "binh"}).status_code, 200)
check("Hủy xong, vé đứng trả lại", available(), 48)
check("Hủy lần 2", requests.post(f"{BASE}/bookings/{y}/cancel", params={"user_id": "binh"}).status_code, 409)
check("Ghế C02 đặt lại được", hold("chi", [seat("C02")]).status_code, 201)

print("\n--- Luồng 3: Payment báo thanh toán thất bại ---")
z = hold("dung", [seat("C03"), standing(1)]).json()["booking_id"]
check("Giữ xong, vé đứng còn", available(), 47)
check("Payment báo CANCELLED", requests.put(f"{BASE}/bookings/{z}/status", params={"status": "CANCELLED"}).status_code, 200)
check("Vé đứng được trả lại", available(), 48)

print("\n--- Danh sách đơn của an ---")
lst = requests.get(f"{BASE}/bookings/user/an").json()
check("An có 1 đơn", len(lst), 1)

print(f"\nTổng: {passed} PASS, {failed} FAIL")