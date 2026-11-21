import threading
import requests

BASE = "http://localhost:8003"


def hold(event_id, user_id, items):
    return requests.post(f"{BASE}/bookings/hold", json={
        "event_id": event_id, "user_id": user_id, "items": items,
    })


def seat(seat_id, price=100000):
    return {"ticket_type_id": "VIP", "seat_id": seat_id, "quantity": 1, "unit_price": price}


def standing(qty=1, price=50000):
    return {"ticket_type_id": "STANDING", "quantity": qty, "unit_price": price}


def run_parallel(n, make_request):
    results = []
    def worker(i):
        results.append(make_request(i).status_code)
    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    return results


print("=== Test 1: 30 người cùng giành 1 ghế A01 ===")
r = run_parallel(30, lambda i: hold("E1", f"user{i}", [seat("A01")]))
print("201:", r.count(201), "| 409:", r.count(409), "| khác:", [c for c in r if c not in (201, 409)])
print("Kỳ vọng: 201 = 1, 409 = 29\n")

print("=== Test 2: 120 người cùng mua 1 vé đứng, sức chứa 100 ===")
r = run_parallel(120, lambda i: hold("E1", f"u{i}", [standing(1)]))
print("201:", r.count(201), "| 409:", r.count(409), "| khác:", [c for c in r if c not in (201, 409)])
print("Kỳ vọng: 201 = 100, 409 = 20\n")

print("=== Test 3: giữ tất cả hoặc không gì cả ===")
a = hold("E2", "u1", [seat("B02")])
print("Giữ B02:", a.status_code, "(kỳ vọng 201)")
b = hold("E2", "u2", [seat("B01"), seat("B02")])
print("Đặt B01+B02 (B02 đã bị giữ):", b.status_code, "(kỳ vọng 409)")
c = hold("E2", "u3", [seat("B01")])
print("Đặt riêng B01:", c.status_code, "(kỳ vọng 201, vì đơn trước bị hủy toàn bộ, B01 không bị giữ nhầm)\n")

print("=== Test 4: giới hạn vé Student tối đa 4 ===")
d = hold("E3", "u1", [{"ticket_type_id": "STUDENT", "quantity": 5, "unit_price": 30000}])
print("Mua 5 vé Student:", d.status_code, "(kỳ vọng 422)")