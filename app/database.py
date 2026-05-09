import sqlite3
import threading
import time
from datetime import datetime, timezone
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

        CREATE TABLE IF NOT EXISTS cf_traffic (
            zone_id   TEXT    NOT NULL,
            timestamp INTEGER NOT NULL,
            requests  INTEGER NOT NULL DEFAULT 0,
            bytes     INTEGER NOT NULL DEFAULT 0,
            visitors  INTEGER NOT NULL DEFAULT 0,
            threats   INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (zone_id, timestamp)
        );

        CREATE TABLE IF NOT EXISTS cf_top_urls (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            zone_id  TEXT    NOT NULL,
            fetched  INTEGER NOT NULL,
            host     TEXT    NOT NULL DEFAULT '',
            path     TEXT    NOT NULL,
            requests INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_cf_top_urls_zone_fetched
            ON cf_top_urls (zone_id, fetched DESC);

        CREATE TABLE IF NOT EXISTS cf_tunnels (
            tunnel_id   TEXT PRIMARY KEY,
            account_id  TEXT NOT NULL,
            name        TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'inactive',
            connections INTEGER NOT NULL DEFAULT 0,
            fetched     INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cf_tunnel_routes (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            tunnel_id TEXT NOT NULL,
            hostname  TEXT NOT NULL,
            service   TEXT NOT NULL DEFAULT '',
            fetched   INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cf_tunnel_routes
            ON cf_tunnel_routes (tunnel_id, fetched DESC);
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


def _get_bucket_size(seconds: int) -> int:
    if seconds <= 3600:
        return 1
    elif seconds <= 86400:
        return 300  # 5 minutes
    elif seconds <= 604800:
        return 3600 # 1 hour
    else:
        return 21600 # 6 hours

def get_history(metric_type: str, range_key: str) -> list:
    seconds = RANGE_SECONDS.get(range_key, RANGE_SECONDS["1h"])
    since = int(time.time()) - seconds
    bucket = _get_bucket_size(seconds)
    conn = _conn()
    if bucket > 1:
        rows = conn.execute(
            """SELECT (timestamp / ?) * ? as ts, AVG(value) as val
               FROM metrics 
               WHERE metric_type=? AND timestamp>=? 
               GROUP BY ts ORDER BY ts""",
            (bucket, bucket, metric_type, since),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT timestamp as ts, value as val FROM metrics WHERE metric_type=? AND timestamp>=? ORDER BY timestamp",
            (metric_type, since),
        ).fetchall()
    return [{"timestamp": r["ts"], "value": r["val"]} for r in rows]


def get_history_range(metric_type: str, from_ts: int, to_ts: int) -> list:
    seconds = to_ts - from_ts
    bucket = _get_bucket_size(seconds)
    conn = _conn()
    if bucket > 1:
        rows = conn.execute(
            """SELECT (timestamp / ?) * ? as ts, AVG(value) as val
               FROM metrics 
               WHERE metric_type=? AND timestamp>=? AND timestamp<=? 
               GROUP BY ts ORDER BY ts""",
            (bucket, bucket, metric_type, from_ts, to_ts),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT timestamp as ts, value as val FROM metrics WHERE metric_type=? AND timestamp>=? AND timestamp<=? ORDER BY timestamp",
            (metric_type, from_ts, to_ts),
        ).fetchall()
    return [{"timestamp": r["ts"], "value": r["val"]} for r in rows]


# ── Docker ────────────────────────────────────────────────────────────────────

def get_docker_current() -> list:
    conn = _conn()
    rows = conn.execute("""
        SELECT metric_type, label, value, unit
        FROM metrics
        WHERE metric_type IN ('docker_cpu', 'docker_ram')
          AND id IN (
              SELECT MAX(id) FROM metrics
              WHERE metric_type IN ('docker_cpu', 'docker_ram')
              GROUP BY metric_type, label
          )
    """).fetchall()
    containers: dict = {}
    for r in rows:
        name = r["label"]
        if name not in containers:
            containers[name] = {"name": name}
        key = "cpu" if r["metric_type"] == "docker_cpu" else "ram"
        containers[name][key] = {"value": r["value"], "unit": r["unit"]}
    return list(containers.values())


def get_docker_history(container_name: str, metric_type: str, range_key: str) -> list:
    seconds = RANGE_SECONDS.get(range_key, RANGE_SECONDS["1h"])
    since = int(time.time()) - seconds
    bucket = _get_bucket_size(seconds)
    conn = _conn()
    if bucket > 1:
        rows = conn.execute(
            """SELECT (timestamp / ?) * ? as ts, AVG(value) as val
               FROM metrics 
               WHERE metric_type=? AND label=? AND timestamp>=? 
               GROUP BY ts ORDER BY ts""",
            (bucket, bucket, metric_type, container_name, since),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT timestamp as ts, value as val FROM metrics WHERE metric_type=? AND label=? AND timestamp>=? ORDER BY timestamp",
            (metric_type, container_name, since),
        ).fetchall()
    return [{"timestamp": r["ts"], "value": r["val"]} for r in rows]


def get_docker_container_names() -> list:
    since = int(time.time()) - 3600
    conn = _conn()
    rows = conn.execute(
        "SELECT DISTINCT label FROM metrics WHERE metric_type='docker_cpu' AND timestamp>=? ORDER BY label",
        (since,),
    ).fetchall()
    return [r["label"] for r in rows]


# ── Cloudflare ────────────────────────────────────────────────────────────────

def store_cf_traffic(zone_id: str, rows: list) -> None:
    conn = _conn()
    conn.executemany(
        """INSERT OR REPLACE INTO cf_traffic
           (zone_id, timestamp, requests, bytes, visitors, threats)
           VALUES (?, ?, ?, ?, ?, ?)""",
        [(zone_id, r["timestamp"], r["requests"], r["bytes"],
          r.get("visitors", 0), r.get("threats", 0)) for r in rows],
    )
    conn.commit()


def store_cf_top_urls(zone_id: str, rows: list) -> None:
    conn = _conn()
    fetched = int(time.time())
    conn.execute(
        "DELETE FROM cf_top_urls WHERE zone_id=? AND fetched < ?",
        (zone_id, fetched - 7200),
    )
    conn.executemany(
        "INSERT INTO cf_top_urls (zone_id, fetched, host, path, requests) VALUES (?,?,?,?,?)",
        [(zone_id, fetched, r.get("host", ""), r.get("path", "/"), r.get("requests", 0))
         for r in rows],
    )
    conn.commit()


def get_cf_summary(zone_id: str) -> dict:
    today_start = int(datetime.now(timezone.utc)
                      .replace(hour=0, minute=0, second=0, microsecond=0)
                      .timestamp())
    conn = _conn()
    if zone_id == "all":
        row = conn.execute(
            """SELECT SUM(requests) as r, SUM(bytes) as b,
                      SUM(visitors) as v, SUM(threats) as t
               FROM cf_traffic WHERE timestamp>=?""",
            (today_start,),
        ).fetchone()
    else:
        row = conn.execute(
            """SELECT SUM(requests) as r, SUM(bytes) as b,
                      SUM(visitors) as v, SUM(threats) as t
               FROM cf_traffic WHERE zone_id=? AND timestamp>=?""",
            (zone_id, today_start),
        ).fetchone()
    return {
        "requests": int(row["r"] or 0),
        "bytes":    int(row["b"] or 0),
        "visitors": int(row["v"] or 0),
        "threats":  int(row["t"] or 0),
    }


def get_cf_traffic(zone_id: str, range_key: str) -> list:
    seconds = RANGE_SECONDS.get(range_key, 86400)
    since   = int(time.time()) - seconds
    conn    = _conn()
    if zone_id == "all":
        rows = conn.execute(
            """SELECT timestamp, SUM(requests) as requests, SUM(bytes) as bytes, SUM(visitors) as visitors, SUM(threats) as threats
               FROM cf_traffic WHERE timestamp>=?
               GROUP BY timestamp ORDER BY timestamp""",
            (since,),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT timestamp, requests, bytes, visitors, threats
               FROM cf_traffic WHERE zone_id=? AND timestamp>=?
               ORDER BY timestamp""",
            (zone_id, since),
        ).fetchall()
    return [{"timestamp": r["timestamp"], "requests": r["requests"],
             "bytes": r["bytes"], "visitors": r["visitors"], "threats": r["threats"]}
            for r in rows]


def get_cf_top_urls(zone_id: str) -> list:
    conn = _conn()
    if zone_id == "all":
        row  = conn.execute(
            "SELECT MAX(fetched) as f FROM cf_top_urls"
        ).fetchone()
        if not row or not row["f"]:
            return []
        rows = conn.execute(
            """SELECT host, path, SUM(requests) as requests FROM cf_top_urls
               WHERE fetched=? GROUP BY host, path ORDER BY requests DESC LIMIT 15""",
            (row["f"],),
        ).fetchall()
    else:
        row  = conn.execute(
            "SELECT MAX(fetched) as f FROM cf_top_urls WHERE zone_id=?", (zone_id,)
        ).fetchone()
        if not row or not row["f"]:
            return []
        rows = conn.execute(
            """SELECT host, path, requests FROM cf_top_urls
               WHERE zone_id=? AND fetched=? ORDER BY requests DESC LIMIT 15""",
            (zone_id, row["f"]),
        ).fetchall()
    return [{"host": r["host"], "path": r["path"], "requests": r["requests"]} for r in rows]

def store_cf_tunnels(account_id: str, tunnels: list, routes_map: dict) -> None:
    conn    = _conn()
    fetched = int(time.time())
    for t in tunnels:
        conn.execute(
            """INSERT OR REPLACE INTO cf_tunnels
               (tunnel_id, account_id, name, status, connections, fetched)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (t["id"], account_id, t["name"], t["status"], t["connections"], fetched),
        )
        routes = routes_map.get(t["id"], [])
        if routes:
            conn.execute("DELETE FROM cf_tunnel_routes WHERE tunnel_id=?", (t["id"],))
            conn.executemany(
                "INSERT INTO cf_tunnel_routes (tunnel_id, hostname, service, fetched) VALUES (?,?,?,?)",
                [(t["id"], r["hostname"], r.get("service", ""), fetched) for r in routes],
            )
    conn.commit()


def get_cf_tunnels() -> list:
    conn    = _conn()
    tunnels = conn.execute(
        "SELECT tunnel_id, account_id, name, status, connections, fetched FROM cf_tunnels ORDER BY name"
    ).fetchall()
    result = []
    for t in tunnels:
        routes = conn.execute(
            "SELECT hostname, service FROM cf_tunnel_routes WHERE tunnel_id=? ORDER BY hostname",
            (t["tunnel_id"],),
        ).fetchall()
        result.append({
            "id":          t["tunnel_id"],
            "account_id":  t["account_id"],
            "name":        t["name"],
            "status":      t["status"],
            "connections": t["connections"],
            "fetched":     t["fetched"],
            "routes":      [{"hostname": r["hostname"], "service": r["service"]} for r in routes],
        })
    return result