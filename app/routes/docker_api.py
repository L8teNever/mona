from flask import Blueprint, jsonify, request
from app import database
from app.config import RANGE_SECONDS
import app.widgets.containers as _containers_mod

bp = Blueprint("docker_api", __name__)


@bp.get("/current")
def docker_current():
    db_containers = {c["name"]: c for c in database.get_docker_current()}
    
    client = _containers_mod._ensure_client()
    err = ""
    if client is not None:
        try:
            result = []
            for c in client.containers.list(all=True):
                img_name = c.attrs.get('Config', {}).get('Image', '')
                if not img_name and getattr(c, "image", None):
                    img_name = c.image.tags[0] if c.image.tags else c.image.short_id
                project  = c.labels.get('com.docker.compose.project', 'Einzelne Container')
                info = {
                    "name": c.name,
                    "status": c.status,
                    "image": img_name or "unknown",
                    "project": project
                }
                if c.name in db_containers:
                    info.update(db_containers[c.name])
                # Ensure cpu and ram keys exist even if not in db
                if "cpu" not in info: info["cpu"] = None
                if "ram" not in info: info["ram"] = None
                result.append(info)
            # Sort running first, then by name
            result.sort(key=lambda x: (0 if x["status"] == "running" else 1, x["name"]))
            return jsonify({"containers": result})
        except Exception as e:
            print(f"[docker_api] error listing containers: {e}")
            err = str(e)
            
    return jsonify({"containers": list(db_containers.values()), "error": err or _containers_mod.last_error})


@bp.get("/history/<container_name>")
def docker_history(container_name: str):
    metric = request.args.get("metric", "cpu")
    if metric not in ("cpu", "ram"):
        return jsonify({"error": "metric must be cpu or ram"}), 400

    range_key = request.args.get("range", "1h")
    if range_key not in RANGE_SECONDS:
        range_key = "1h"

    rows = database.get_docker_history(container_name, f"docker_{metric}", range_key)
    return jsonify({
        "container": container_name,
        "metric": metric,
        "range": range_key,
        "data": rows,
    })


@bp.get("/containers")
def list_containers():
    return jsonify({"containers": database.get_docker_container_names()})


@bp.get("/status")
def docker_status():
    client = _containers_mod._ensure_client()
    if client is not None:
        try:
            names = [c.name for c in client.containers.list()]
            return jsonify({"available": True, "containers": names})
        except Exception as e:
            return jsonify({"available": False, "error": str(e)})
    return jsonify({"available": False, "error": _containers_mod.last_error})
