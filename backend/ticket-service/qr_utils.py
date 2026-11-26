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

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
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


# ==============================================================================
# BỘ MÃ HÓA QR CODE CHUẨN ISO/IEC 18004 THUẦN PYTHON (KHÔNG CẦN THƯ VIỆN NGOÀI)
# Hỗ trợ quét thật 100% bằng Camera điện thoại / Webcam / BarcodeDetector / jsQR
# ==============================================================================

# Bảng cấu hình Version 1..10 (ECC Level L):
# (version, total_data_cw, ec_cw_per_block, g1_blocks, g1_data_cw, g2_blocks, g2_data_cw, align_centers)
_QR_VERSIONS_L = [
    (1, 19, 7, 1, 19, 0, 0, []),
    (2, 34, 10, 1, 34, 0, 0, [6, 18]),
    (3, 55, 15, 1, 55, 0, 0, [6, 22]),
    (4, 80, 20, 1, 80, 0, 0, [6, 26]),
    (5, 108, 26, 1, 108, 0, 0, [6, 30]),
    (6, 136, 18, 2, 68, 0, 0, [6, 34]),
    (7, 156, 20, 2, 78, 0, 0, [6, 22, 38]),
    (8, 194, 24, 2, 97, 0, 0, [6, 24, 42]),
    (9, 232, 30, 2, 116, 0, 0, [6, 26, 46]),
    (10, 274, 18, 2, 68, 2, 69, [6, 28, 50]),
]

_GF_EXP = [0] * 512
_GF_LOG = [0] * 256
_x = 1
for _i in range(255):
    _GF_EXP[_i] = _x
    _GF_LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    _GF_EXP[_i] = _GF_EXP[_i - 255]


def _gf_mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return _GF_EXP[_GF_LOG[a] + _GF_LOG[b]]


def _rs_generator_poly(degree: int) -> list[int]:
    g = [1]
    for i in range(degree):
        nxt = [0] * (len(g) + 1)
        factor = _GF_EXP[i]
        for j, coeff in enumerate(g):
            nxt[j] ^= coeff
            nxt[j + 1] ^= _gf_mul(coeff, factor)
        g = nxt
    return g


def _rs_encode(data: list[int], ec_len: int) -> list[int]:
    gen = _rs_generator_poly(ec_len)
    rem = [0] * ec_len
    for b in data:
        factor = b ^ rem[0]
        rem = rem[1:] + [0]
        if factor != 0:
            for j in range(ec_len):
                rem[j] ^= _gf_mul(gen[j + 1], factor)
    return rem


def _build_iso_qr_matrix(text: str) -> list[list[int]]:
    payload = text.encode("utf-8")
    n_bytes = len(payload)

    selected = None
    for cfg in _QR_VERSIONS_L:
        ver, total_data_cw = cfg[0], cfg[1]
        len_bits = 8 if ver <= 9 else 16
        avail_bytes = total_data_cw - (4 + len_bits + 4 + 7) // 8
        if n_bytes <= avail_bytes:
            selected = cfg
            break
    if selected is None:
        selected = _QR_VERSIONS_L[-1]
        payload = payload[:270]
        n_bytes = len(payload)

    ver, total_data_cw, ec_cw, g1_blk, g1_dcw, g2_blk, g2_dcw, aligns = selected
    len_bits = 8 if ver <= 9 else 16

    # 1. Đóng gói bit stream (Byte mode = 0100)
    bits = [0, 1, 0, 0]
    for i in range(len_bits - 1, -1, -1):
        bits.append((n_bytes >> i) & 1)
    for b in payload:
        for i in range(7, -1, -1):
            bits.append((b >> i) & 1)

    max_bits = total_data_cw * 8
    term = min(4, max_bits - len(bits))
    bits.extend([0] * term)
    while len(bits) % 8 != 0:
        bits.append(0)

    codewords = []
    for i in range(0, len(bits), 8):
        val = 0
        for bit in bits[i : i + 8]:
            val = (val << 1) | bit
        codewords.append(val)

    pad_bytes = [0xEC, 0x11]
    p_idx = 0
    while len(codewords) < total_data_cw:
        codewords.append(pad_bytes[p_idx % 2])
        p_idx += 1

    # 2. Chia block và tính Reed-Solomon ECC
    data_blocks = []
    ec_blocks = []
    pos = 0
    for _ in range(g1_blk):
        blk = codewords[pos : pos + g1_dcw]
        pos += g1_dcw
        data_blocks.append(blk)
        ec_blocks.append(_rs_encode(blk, ec_cw))
    for _ in range(g2_blk):
        blk = codewords[pos : pos + g2_dcw]
        pos += g2_dcw
        data_blocks.append(blk)
        ec_blocks.append(_rs_encode(blk, ec_cw))

    final_cw = []
    max_dcw = max(g1_dcw, g2_dcw)
    for i in range(max_dcw):
        for blk in data_blocks:
            if i < len(blk):
                final_cw.append(blk[i])
    for i in range(ec_cw):
        for blk in ec_blocks:
            final_cw.append(blk[i])

    final_bits = []
    for cw in final_cw:
        for i in range(7, -1, -1):
            final_bits.append((cw >> i) & 1)

    # 3. Khởi tạo ma trận kích thước size x size
    size = 17 + 4 * ver
    matrix = [[0] * size for _ in range(size)]
    is_func = [[False] * size for _ in range(size)]

    def set_func(r: int, c: int, val: int):
        if 0 <= r < size and 0 <= c < size:
            matrix[r][c] = val
            is_func[r][c] = True

    # Finder patterns + Separators
    for oy, ox in ((0, 0), (0, size - 7), (size - 7, 0)):
        for r in range(-1, 8):
            for c in range(-1, 8):
                if 0 <= r <= 6 and 0 <= c <= 6:
                    is_dark = r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4)
                    set_func(oy + r, ox + c, 1 if is_dark else 0)
                else:
                    set_func(oy + r, ox + c, 0)

    # Alignment patterns
    for ay in aligns:
        for ax in aligns:
            if (ay <= 8 and ax <= 8) or (ay <= 8 and ax >= size - 9) or (ay >= size - 9 and ax <= 8):
                continue
            for r in range(-2, 3):
                for c in range(-2, 3):
                    is_dark = max(abs(r), abs(c)) in (0, 2)
                    set_func(ay + r, ax + c, 1 if is_dark else 0)

    # Timing patterns
    for i in range(8, size - 8):
        bit = 1 if i % 2 == 0 else 0
        if not is_func[6][i]:
            set_func(6, i, bit)
        if not is_func[i][6]:
            set_func(i, 6, bit)

    # Dark module
    set_func(4 * ver + 9, 8, 1)

    # Reserve Format info areas
    for i in range(9):
        if i != 6:
            if not is_func[8][i]:
                set_func(8, i, 0)
            if not is_func[i][8]:
                set_func(i, 8, 0)
    for i in range(8):
        set_func(8, size - 1 - i, 0)
        set_func(size - 1 - i, 8, 0)

    # Version info (cho Version >= 7)
    if ver >= 7:
        rem = ver << 12
        for i in range(5, -1, -1):
            if (rem >> (i + 12)) & 1:
                rem ^= 0x1F25 << i
        v_bits = (ver << 12) | rem
        for i in range(18):
            b = (v_bits >> i) & 1
            r = i // 3
            c = size - 11 + (i % 3)
            set_func(r, c, b)
            set_func(c, r, b)

    # 4. Điền dữ liệu theo đường zíc-zắc 2 cột từ phải sang trái + Mask 0 ((r + c) % 2 == 0)
    bit_idx = 0
    upward = True
    col = size - 1
    while col > 0:
        if col == 6:
            col -= 1
        row_range = range(size - 1, -1, -1) if upward else range(size)
        for r in row_range:
            for dc in (0, -1):
                c = col + dc
                if not is_func[r][c]:
                    b = final_bits[bit_idx] if bit_idx < len(final_bits) else 0
                    bit_idx += 1
                    if (r + c) % 2 == 0:
                        b ^= 1
                    matrix[r][c] = b
        upward = not upward
        col -= 2

    # 5. Ghi Format info cho ECC Level L (01) + Mask 0 (000) -> 0x77C4 (ISO/IEC 18004 Fig. 25)
    fmt_bits = 0x77C4
    fmt_coords_tl = [
        (0, 8), (1, 8), (2, 8), (3, 8), (4, 8), (5, 8), (7, 8), (8, 8),
        (8, 7), (8, 5), (8, 4), (8, 3), (8, 2), (8, 1), (8, 0),
    ]
    fmt_coords_split = [
        (8, size - 1), (8, size - 2), (8, size - 3), (8, size - 4),
        (8, size - 5), (8, size - 6), (8, size - 7), (8, size - 8),
        (size - 7, 8), (size - 6, 8), (size - 5, 8), (size - 4, 8),
        (size - 3, 8), (size - 2, 8), (size - 1, 8),
    ]
    for i in range(15):
        b = (fmt_bits >> i) & 1
        r1, c1 = fmt_coords_tl[i]
        r2, c2 = fmt_coords_split[i]
        matrix[r1][c1] = b
        matrix[r2][c2] = b

    return matrix


def qr_png(text: str) -> bytes:
    if qrcode is not None:
        code = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=4)
        code.add_data(text)
        code.make(fit=True)
        image = code.make_image(fill_color="black", back_color="white")
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()

    matrix = _build_iso_qr_matrix(text)
    grid_n = len(matrix)
    scale = 8
    border = 4
    total = (grid_n + border * 2) * scale

    rows = []
    for y in range(total):
        row = bytearray([0])
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
