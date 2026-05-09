import threading
import time

_CF_INTERVAL = 300  # 5 minutes


def _poll_once():
    from app import cloudflare, database
    cfg      = cloudflare.load_config()
    token    = cfg.get("api_token", "")
    zones    = cfg.get("zones", [])
    accounts = cfg.get("accounts", [])
    if not token or not zones:
        return

    for zone in zones:
        zid  = zone["id"]
        rows = cloudflare.fetch_traffic(token, zid, since_hours=25)
        if rows:
            database.store_cf_traffic(zid, rows)
        top = cloudflare.fetch_top_paths(token, zid, since_hours=24)
        if top:
            database.store_cf_top_urls(zid, top)

    for account in accounts:
        aid     = account["id"]
        tunnels = cloudflare.fetch_tunnels(token, aid)
        if tunnels:
            routes_map = {}
            for t in tunnels:
                routes = cloudflare.fetch_tunnel_config(token, aid, t["id"])
                if routes:
                    routes_map[t["id"]] = routes
            database.store_cf_tunnels(aid, tunnels, routes_map)


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