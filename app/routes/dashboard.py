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


@bp.get("/<metric_type>")
def metric_page(metric_type: str):
    if metric_type in METRIC_META:
        return render_template("dashboard.html", metrics=METRIC_META)
    return redirect("/")
