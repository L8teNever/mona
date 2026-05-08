import threading
import time

_CF_INTERVAL = 300  # 5 minutes


def _poll_once():
    from app import cloudflare, database
    cfg   = cloudflare.load_config()
    token = cfg.get("api_token", "")
    zones = cfg.get("zones", [])
    if not token or not zones:
        return

    for zone in zones:
        zid = zone["id"]
        rows = cloudflare.fetch_traffic(token, zid, since_hours=25)
        if rows:
            database.store_cf_traffic(zid, rows)

        top = cloudflare.fetch_top_paths(token, zid, since_hours=24)
        if top:
            database.store_cf_top_urls(zid, top)


def start_cf_collector():
    def loop():
        try:
            _poll_once()
        except Exception as e:
            print(f"[cf_collector] initial fetch error: {e}")
        while True:
            time.sleep(_CF_INTERVAL)
            try:
                _poll_once()
            except Exception as e:
                print(f"[cf_collector] error: {e}")

    t = threading.Thread(target=loop, daemon=True, name="mona-cf-collector")
    t.start()