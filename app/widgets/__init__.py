"""
Widget registry — auto-discovers every module in this package.

Each widget module must expose:
  WIDGET  : dict  — dashboard card config (id, label, size, bg)
  METRICS : list  — [{type, label, unit, color}, ...]
  collect()       — returns list of (timestamp, type, value, unit, label)

To add a new widget: create a new .py file here. Nothing else changes.
"""
import importlib
import pkgutil
import os

WIDGET_REGISTRY: list = []   # ordered list of widget modules
METRIC_META: dict = {}        # metric_type -> {label, unit, color}


def _load_widgets():
    pkg_dir = os.path.dirname(__file__)
    for _, name, _ in pkgutil.iter_modules([pkg_dir]):
        mod = importlib.import_module(f"app.widgets.{name}")
        WIDGET_REGISTRY.append(mod)
        for m in mod.METRICS:
            METRIC_META[m["type"]] = {
                "label": m["label"],
                "unit":  m["unit"],
                "color": m["color"],
            }


_load_widgets()
