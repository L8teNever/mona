import threading
from flask import Blueprint, jsonify, request
from app import cloudflare, database
from app.config import RANGE_SECONDS

bp = Blueprint("cf", __name__)


@bp.get("/config")
def get_config():
    cfg   = cloudflare.load_config()
    token = cfg.get("api_token", "")
    masked = (token[:4] + "..." + token[-4:]) if len(token) > 8 else ("*" * len(token))
    return jsonify({
        "configured":    bool(token and cfg.get("zones")),
        "token_masked":  masked,
        "zones":         cfg.get("zones", []),
    })


@bp.post("/config")
def save_config():
    data  = request.json or {}
    token = data.get("api_token", "").strip()

    if not token:
        return jsonify({"ok": False, "error": "API Token fehlt"}), 400

    zones = cloudflare.fetch_all_zones(token)
    if not zones:
        return jsonify({"ok": False, "error": "Keine Zonen gefunden – Token ungültig oder fehlende Berechtigung (Zone → Analytics → Read)"}), 400

    accounts = cloudflare.fetch_account_ids(token)
    cloudflare.save_config(token, zones, accounts)
    from app import cf_collector
    threading.Thread(target=cf_collector._poll_once, daemon=True).start()
    return jsonify({"ok": True, "zones": zones})


@bp.get("/summary")
def summary():
    cfg = cloudflare.load_config()
    if not cfg.get("api_token") or not cfg.get("zones"):
        return jsonify({"configured": False, "zones": []})
    result = []
    for zone in cfg["zones"]:
        s = database.get_cf_summary(zone["id"])
        s.update({"zone_id": zone["id"], "zone_name": zone["name"]})
        result.append(s)
    return jsonify({"configured": True, "zones": result})


@bp.get("/traffic")
def traffic():
    zone_id   = request.args.get("zone_id", "")
    range_key = request.args.get("range", "24h")
    if range_key not in RANGE_SECONDS:
        range_key = "24h"
    rows = database.get_cf_traffic(zone_id, range_key)
    return jsonify({"zone_id": zone_id, "range": range_key, "data": rows})


@bp.get("/top-urls")
def top_urls():
    zone_id = request.args.get("zone_id", "")
    rows    = database.get_cf_top_urls(zone_id)
    return jsonify({"zone_id": zone_id, "data": rows})

@bp.get("/tunnels")
def tunnels():
    rows = database.get_cf_tunnels()
    return jsonify({"tunnels": rows})