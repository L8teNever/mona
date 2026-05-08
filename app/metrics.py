import time
import psutil

_prev_net = None
_prev_time = None


def cpu_percent() -> float:
    return round(psutil.cpu_percent(interval=None), 1)


def ram_percent() -> float:
    return round(psutil.virtual_memory().percent, 1)


def disk_used_gb() -> float:
    try:
        usage = psutil.disk_usage("/")
    except Exception:
        usage = psutil.disk_usage("C:\\")
    return round(usage.used / 1_073_741_824, 2)


def cpu_temp() -> float:
    try:
        temps = psutil.sensors_temperatures() or {}
        for key in ("coretemp", "cpu_thermal", "acpitz", "k10temp"):
            if key in temps and temps[key]:
                return round(temps[key][0].current, 1)
    except AttributeError:
        pass
    return -1.0  # Windows / no sensor available


def net_speed() -> tuple:
    global _prev_net, _prev_time
    now = time.time()
    cur = psutil.net_io_counters()
    if _prev_net is None:
        _prev_net, _prev_time = cur, now
        return 0.0, 0.0
    dt = now - _prev_time or 1
    rx = (cur.bytes_recv - _prev_net.bytes_recv) / dt / 1_048_576
    tx = (cur.bytes_sent - _prev_net.bytes_sent) / dt / 1_048_576
    _prev_net, _prev_time = cur, now
    return round(max(rx, 0.0), 3), round(max(tx, 0.0), 3)
