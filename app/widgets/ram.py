import time
import psutil

WIDGET = {
    "id":    "ram",
    "label": "RAM",
    "size":  "2x2",
    "bg":    "bg-white border border-gray-100",
}

METRICS = [
    {"type": "ram", "label": "RAM", "unit": "%", "color": "#4285f4"},
]


def collect() -> list:
    ts = int(time.time())
    value = round(psutil.virtual_memory().percent, 1)
    return [(ts, "ram", value, "%", "")]
