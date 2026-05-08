from flask import Flask
from app.database import init_db


def create_app():
    app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
    )
    init_db()

    from app.routes.dashboard  import bp as dash_bp
    from app.routes.api        import bp as api_bp
    from app.routes.docker_api import bp as docker_api_bp
    from app.routes.cf         import bp as cf_bp

    app.register_blueprint(dash_bp)
    app.register_blueprint(api_bp,        url_prefix="/api")
    app.register_blueprint(docker_api_bp, url_prefix="/api/docker")
    app.register_blueprint(cf_bp,         url_prefix="/api/cf")

    from app.collector    import start_collector
    from app.cf_collector import start_cf_collector
    start_collector()
    start_cf_collector()

    return app