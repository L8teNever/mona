import json
import os
from datetime import datetime, timezone, timedelta

import requests as _http

from app.config import BASE_DIR

_data_dir = os.environ.get("MONA_DATA_DIR", BASE_DIR)
_CONFIG_PATH = os.path.join(_data_dir, "cloudflare.json")

_GQL  = "https://api.cloudflare.com/client/v4/graphql"
_REST = "https://api.cloudflare.com/client/v4"


def load_config() -> dict:
    token    = os.environ.get("CF_API_TOKEN", "")
    zone_str = os.environ.get("CF_ZONE_IDS", "")
    if token and zone_str:
        zones = [{"id": z.strip(), "name": z.strip()} for z in zone_str.split(",") if z.strip()]
        return {"api_token": token, "zones": zones}
    try:
        with open(_CONFIG_PATH) as f:
            return json.load(f)
    except Exception:
        return {"api_token": "", "zones": []}


def save_config(api_token: str, zones: list) -> None:
    with open(_CONFIG_PATH, "w") as f:
        json.dump({"api_token": api_token, "zones": zones}, f, indent=2)


def is_configured() -> bool:
    cfg = load_config()
    return bool(cfg.get("api_token") and cfg.get("zones"))


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_token(token: str) -> tuple:
    try:
        r = _http.get(f"{_REST}/user/tokens/verify", headers=_auth(token), timeout=10)
        d = r.json()
        if d.get("success"):
            return True, "OK"
        msgs = d.get("errors") or [{}]
        return False, msgs[0].get("message", "Unknown error")
    except Exception as e:
        return False, str(e)


def fetch_zone_name(token: str, zone_id: str) -> str:
    try:
        r = _http.get(f"{_REST}/zones/{zone_id}", headers=_auth(token), timeout=10)
        d = r.json()
        if d.get("success"):
            return d["result"]["name"]
    except Exception:
        pass
    return zone_id


def fetch_traffic(token: str, zone_id: str, since_hours: int = 25) -> list:
    """Returns list of {timestamp, requests, bytes, visitors, threats}."""
    end   = datetime.now(timezone.utc)
    start = end - timedelta(hours=since_hours)

    gql = {"query": """{
      viewer {
        zones(filter: {zoneTag: "%s"}) {
          httpRequests1hGroups(
            limit: 168,
            filter: {datetime_geq: "%s", datetime_leq: "%s"},
            orderBy: [datetime_ASC]
          ) {
            dimensions { datetime }
            sum { requests bytes threats }
            uniq { uniques }
          }
        }
      }
    }""" % (zone_id,
             start.strftime("%Y-%m-%dT%H:%M:%SZ"),
             end.strftime("%Y-%m-%dT%H:%M:%SZ"))}

    try:
        r    = _http.post(_GQL, headers=_auth(token), json=gql, timeout=20)
        rows = r.json()["data"]["viewer"]["zones"][0]["httpRequests1hGroups"]
        result = []
        for row in rows:
            dt = datetime.fromisoformat(row["dimensions"]["datetime"].replace("Z", "+00:00"))
            result.append({
                "timestamp": int(dt.timestamp()),
                "requests":  row["sum"]["requests"],
                "bytes":     row["sum"]["bytes"],
                "threats":   row["sum"]["threats"],
                "visitors":  row["uniq"]["uniques"],
            })
        return result
    except Exception:
        return []


def fetch_top_paths(token: str, zone_id: str, since_hours: int = 24, limit: int = 25) -> list:
    """Returns list of {host, path, requests}. Requires Pro+ plan; returns [] on free."""
    end   = datetime.now(timezone.utc)
    start = end - timedelta(hours=since_hours)

    gql = {"query": """{
      viewer {
        zones(filter: {zoneTag: "%s"}) {
          httpRequestsAdaptiveGroups(
            limit: %d,
            filter: {datetime_geq: "%s", datetime_lt: "%s"},
            orderBy: [count_DESC]
          ) {
            count
            dimensions { clientRequestPath clientRequestHTTPHost }
          }
        }
      }
    }""" % (zone_id, limit,
             start.strftime("%Y-%m-%dT%H:%M:%SZ"),
             end.strftime("%Y-%m-%dT%H:%M:%SZ"))}

    try:
        r    = _http.post(_GQL, headers=_auth(token), json=gql, timeout=20)
        rows = r.json()["data"]["viewer"]["zones"][0]["httpRequestsAdaptiveGroups"]
        return [
            {
                "host":     row["dimensions"].get("clientRequestHTTPHost", ""),
                "path":     row["dimensions"].get("clientRequestPath", "/"),
                "requests": row["count"],
            }
            for row in rows
        ]
    except Exception:
        return []