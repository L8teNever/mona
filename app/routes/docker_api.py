from flask import Blueprint, jsonify, request
from app import database
from app.config import RANGE_SECONDS
import app.widgets.containers as _containers_mod

bp = Blueprint("docker_api", __name__)


@bp.get("/current")
def docker_current():
    return jsonify({"containers": database.get_docker_current()})


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
