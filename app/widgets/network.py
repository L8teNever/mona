import time
import psutil

WIDGET = {
    "id":    "net_rx",
    "label": "Netzwerk",
    "size":  "4x2",
    "bg":    "bg-indigo-50",
}

METRICS = [
    {"type": "net_rx", "label": "Download", "unit": "MB/s", "color": "#6750a4"},
    {"type": "net_tx", "label": "Upload",   "unit": "MB/s", "color": "#7965af"},
]

_prev = None
_prev_time = None


def collect() -> list:
    global _prev, _prev_time
    ts = int(time.time())
    now = time.time()
    cur = psutil.net_io_counters()
    if _prev is None:
        _prev, _prev_time = cur, now
        return [
            (ts, "net_rx", 0.0, "MB/s", ""),
            (ts, "net_tx", 0.0, "MB/s", ""),
        ]
    dt = now - _prev_time or 1
    rx = round(max((cur.bytes_recv - _prev.bytes_recv) / dt / 1_048_576, 0.0), 3)
    tx = round(max((cur.bytes_sent - _prev.bytes_sent) / dt / 1_048_576, 0.0), 3)
    _prev, _prev_time = cur, now
    return [
        (ts, "net_rx", rx, "MB/s", ""),
        (ts, "net_tx", tx, "MB/s", ""),
    ]
