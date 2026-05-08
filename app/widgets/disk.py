import time
import psutil

WIDGET = {
    "id":    "disk",
    "label": "Disk",
    "size":  "2x2",
    "bg":    "bg-zinc-50 border border-gray-100",
}

METRICS = [
    {"type": "disk", "label": "Disk Used", "unit": "GB", "color": "#52a852"},
]


def collect() -> list:
    ts = int(time.time())
    try:
        usage = psutil.disk_usage("/")
    except Exception:
        usage = psutil.disk_usage("C:\\")
    value = round(usage.used / 1_073_741_824, 2)
    return [(ts, "disk", value, "GB", "")]
