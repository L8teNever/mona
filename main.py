from app import create_app
from app.collector import start_collector

app = create_app()
start_collector()

if __name__ == "__main__":
    # use_reloader=False prevents the collector thread from starting twice
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)
