import threading
import time
import psutil

from app import database
from app.config import COLLECT_INTERVAL
from app.widgets import WIDGET_REGISTRY


def _collect_once():
    rows = []
    for widget in WIDGET_REGISTRY:
        rows.extend(widget.collect())
    database.write_metrics(rows)


def start_collector():
    def loop():
        psutil.cpu_percent(interval=None)  # prime — first call always returns 0.0
        while True:
            try:
                _collect_once()
            except Exception as e:
                print(f"[collector] error: {e}")
            time.sleep(COLLECT_INTERVAL)

    t = threading.Thread(target=loop, daemon=True, name="mona-collector")
    t.start()
