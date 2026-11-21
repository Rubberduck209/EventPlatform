from datetime import datetime, timezone, timedelta

try:
    from zoneinfo import ZoneInfo
    VN_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
except Exception:
    VN_TIMEZONE = timezone(timedelta(hours=7))


def now_vn() -> datetime:
    return datetime.now(VN_TIMEZONE).replace(tzinfo=None)