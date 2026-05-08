import time
import psutil

WIDGET = {
    "id":    "cpu",
    "label": "CPU",
    "size":  "2x2",
    "bg":    "bg-white border border-gray-100",
}

METRICS = [
    {"type": "cpu", "label": "CPU", "unit": "%", "color": "#6750a4"},
]


def collect() -> list:
    ts = int(time.time())
    value = round(psutil.cpu_percent(interval=None), 1)
    return [(ts, "cpu", value, "%", "")]
