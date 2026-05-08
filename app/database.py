import sqlite3
import threading
import time
from app.config import DB_PATH, RANGE_SECONDS

_local = threading.local()


def _conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn"):
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
    return _local.conn


def init_db():
    conn = _conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS metrics (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   INTEGER NOT NULL,
            metric_type TEXT    NOT NULL,
            value       REAL    NOT NULL,
            unit        TEXT    NOT NULL DEFAULT '',
            label       TEXT    NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_metrics_type_time
            ON metrics (metric_type, timestamp DESC);
    """)
    conn.commit()


def write_metrics(rows: list):
    """rows: list of (timestamp, metric_type, value, unit, label)"""
    conn = _conn()
    conn.executemany(
        "INSERT INTO metrics (timestamp, metric_type, value, unit, label) VALUES (?,?,?,?,?)",
        rows,
    )
    conn.commit()


def get_current() -> dict:
    conn = _conn()
    rows = conn.execute("""
        SELECT metric_type, value, unit
        FROM metrics
        WHERE id IN (
            SELECT MAX(id) FROM metrics GROUP BY metric_type
        )
    """).fetchall()
    return {r["metric_type"]: {"value": r["value"], "unit": r["unit"]} for r in rows}


def get_history(metric_type: str, range_key: str) -> list:
    seconds = RANGE_SECONDS.get(range_key, RANGE_SECONDS["1h"])
    since = int(time.time()) - seconds
    conn = _conn()
    rows = conn.execute(
        "SELECT timestamp, value FROM metrics WHERE metric_type=? AND timestamp>=? ORDER BY timestamp",
        (metric_type, since),
    ).fetchall()
    return [{"timestamp": r["timestamp"], "value": r["value"]} for r in rows]


def get_history_range(metric_type: str, from_ts: int, to_ts: int) -> list:
    conn = _conn()
    rows = conn.execute(
        "SELECT timestamp, value FROM metrics WHERE metric_type=? AND timestamp>=? AND timestamp<=? ORDER BY timestamp",
        (metric_type, from_ts, to_ts),
    ).fetchall()
    return [{"timestamp": r["timestamp"], "value": r["value"]} for r in rows]
