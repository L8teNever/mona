import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_data_dir = os.environ.get("MONA_DATA_DIR", BASE_DIR)
DB_PATH = os.path.join(_data_dir, "mona.db")

COLLECT_INTERVAL = 5  # seconds between metric snapshots

RANGE_SECONDS = {
    "1h":  3600,
    "24h": 86400,
    "7d":  604800,
    "30d": 2592000,
}
