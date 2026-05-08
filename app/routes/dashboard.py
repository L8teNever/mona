from flask import Blueprint, render_template, redirect
from app.widgets import METRIC_META

bp = Blueprint("dashboard", __name__)


@bp.get("/")
def index():
    return render_template("dashboard.html", metrics=METRIC_META)


@bp.get("/view/dashboard")
def view_dashboard():
    return render_template("views/dashboard.html")


@bp.get("/view/detail/<metric_type>")
def view_detail(metric_type: str):
    if metric_type not in METRIC_META:
        return "", 404
    return render_template(f"views/{metric_type}.html")


@bp.get("/view/docker")
def view_docker():
    return render_template("views/docker.html")


@bp.get("/view/docker-container/<container_name>")
def view_docker_container(container_name: str):
    return render_template("views/docker_container.html")


@bp.get("/docker")
def docker_page():
    return render_template("dashboard.html", metrics=METRIC_META)


@bp.get("/docker/<container_name>")
def docker_container_page(container_name: str):
    return render_template("dashboard.html", metrics=METRIC_META)


@bp.get("/<metric_type>")
def metric_page(metric_type: str):
    if metric_type in METRIC_META:
        return render_template("dashboard.html", metrics=METRIC_META)
    return redirect("/")
