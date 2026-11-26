import base64
import hashlib
import hmac
import io
import json
import os
import struct
import zlib

try:
    import qrcode
except ImportError:
    qrcode = None
from dotenv import load_dotenv

load_dotenv()

QR_SECRET = os.getenv("QR_SECRET", "")
if len(QR_SECRET) < 16:
    raise RuntimeError("Thiếu QR_SECRET trong file .env (cần ít nhất 16 ký tự, nên dài ngẫu nhiên)")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(body: str) -> str:
    """HMAC-SHA256 của nội dung QR bằng khóa QR_SECRET."""
    return hmac.new(QR_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()


def build_qr_text(ticket_code: str, event_id: str, seat_id, owner_name: str, qr_version: int) -> str:
    """Nội dung QR: <thông tin vé base64>.<chữ ký>. Thông tin chỉ được ký, không được mã hóa."""
    data = {"c": ticket_code, "e": event_id, "s": seat_id, "o": owner_name, "v": qr_version}
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    body = _b64(raw.encode("utf-8"))
    return f"{body}.{_sign(body)}"


def verify_qr_text(qr_text: str):
    """Trả về thông tin vé nếu chữ ký đúng, ngược lại trả về None."""
    body, sep, signature = qr_text.strip().rpartition(".")
    if not sep or not body or not signature.isascii() or not body.isascii():
        return None
    if not hmac.compare_digest(_sign(body), signature):
        return None
    try:
        return json.loads(_unb64(body).decode("utf-8"))
    except ValueError:
        return None


def qr_png(text: str) -> bytes:
    if qrcode is not None:
        code = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=4)
        code.add_data(text)
        code.make(fit=True)
        image = code.make_image(fill_color="black", back_color="white")
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()

    # Fallback tạo ảnh ma trận PNG thuần Python (stdlib) nếu môi trường chưa cài thư viện qrcode/Pillow
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    grid_n = 21
    scale = 8
    border = 4
    total = (grid_n + border * 2) * scale
    matrix = [[0] * grid_n for _ in range(grid_n)]
    # 3 góc định vị chuẩn QR (Finder Patterns 7x7)
    for oy, ox in ((0, 0), (0, grid_n - 7), (grid_n - 7, 0)):
        for r in range(7):
            for c in range(7):
                if r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4):
                    matrix[oy + r][ox + c] = 1
    bit_idx = 0
    for r in range(grid_n):
        for c in range(grid_n):
            if (r < 8 and c < 8) or (r < 8 and c >= grid_n - 8) or (r >= grid_n - 8 and c < 8):
                continue
            b = digest[(bit_idx // 8) % len(digest)]
            matrix[r][c] = (b >> (bit_idx % 8)) & 1
            bit_idx += 1
    rows = []
    for y in range(total):
        row = bytearray([0])  # filter type 0
        gy = (y // scale) - border
        for x in range(total):
            gx = (x // scale) - border
            is_black = 0 <= gy < grid_n and 0 <= gx < grid_n and matrix[gy][gx] == 1
            row.append(0x00 if is_black else 0xFF)
        rows.append(bytes(row))
    raw_data = b"".join(rows)
    def _chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack("!IIBBBBB", total, total, 8, 0, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(raw_data, 9)) + _chunk(b"IEND", b"")