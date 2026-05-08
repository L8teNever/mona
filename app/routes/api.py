import time
from flask import Blueprint, jsonify, request
from app import database
from app.config import RANGE_SECONDS
from app.widgets import METRIC_META

bp = Blueprint("api", __name__)


@bp.get("/current")
def current():
    data = database.get_current()
    return jsonify({"timestamp": int(time.time()), "metrics": data})


@bp.get("/history/<metric_type>")
def history(metric_type: str):
    if metric_type not in METRIC_META:
        return jsonify({"error": "unknown metric"}), 404

    from_ts = request.args.get("from")
    to_ts   = request.args.get("to")
    if from_ts and to_ts:
        try:
            rows = database.get_history_range(metric_type, int(from_ts), int(to_ts))
        except (ValueError, TypeError):
            return jsonify({"error": "invalid timestamps"}), 400
        return jsonify({
            "metric_type": metric_type,
            "unit": METRIC_META[metric_type]["unit"],
            "range": "custom",
            "data": rows,
        })

    range_key = request.args.get("range", "1h")
    if range_key not in RANGE_SECONDS:
        range_key = "1h"
    rows = database.get_history(metric_type, range_key)
    return jsonify({
        "metric_type": metric_type,
        "unit": METRIC_META[metric_type]["unit"],
        "range": range_key,
        "data": rows,
    })


@bp.get("/metrics")
def metrics_list():
    return jsonify(METRIC_META)


@bp.get("/system")
def system_info():
    import psutil
    vm = psutil.virtual_memory()
    du = psutil.disk_usage("/")
    return jsonify({
        "ram_total_gb":  round(vm.total  / 1_073_741_824, 1),
        "disk_total_gb": round(du.total  / 1_073_741_824, 1),
        "cpu_cores":     psutil.cpu_count(logical=True),
    })
