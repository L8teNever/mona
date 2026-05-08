import time
import psutil

WIDGET = {
    "id":    "temp",
    "label": "Temperatur",
    "size":  "2x2",
    "bg":    "bg-orange-50 border border-orange-100/50",
}

METRICS = [
    {"type": "temp", "label": "Temperatur", "unit": "°C", "color": "#ea580c"},
]


def collect() -> list:
    ts = int(time.time())
    return [(ts, "temp", _read_temp(), "°C", "")]


def _read_temp() -> float:
    try:
        temps = psutil.sensors_temperatures() or {}
        for key in ("coretemp", "cpu_thermal", "acpitz", "k10temp"):
            if key in temps and temps[key]:
                return round(temps[key][0].current, 1)
    except AttributeError:
        pass
    return -1.0  # Windows / no sensor
