from flask import Flask
from app.database import init_db


def create_app():
    app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
    )
    init_db()

    from app.routes.dashboard import bp as dash_bp
    from app.routes.api import bp as api_bp

    app.register_blueprint(dash_bp)
    app.register_blueprint(api_bp, url_prefix="/api")

    return app
