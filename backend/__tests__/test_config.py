from pathlib import Path

from config import AppSettings


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_app_settings_are_built_from_an_injected_mapping():
    settings = AppSettings.from_mapping(
        {
            "CORS_ORIGINS": "https://app.example, https://admin.example",
            "COOKIE_SECURE": "true",
            "SESSION_DURATION_HOURS": "12",
            "PUBLIC_APP_URL": "https://app.example/",
            "DB_HOST": "mysql.internal",
            "DB_PORT": "3307",
            "DB_USER": "app",
            "DB_PASSWORD": "secret",
            "DB_NAME": "health",
        }
    )

    assert settings.cors_origins == (
        "https://app.example",
        "https://admin.example",
    )
    assert settings.cookie_secure is True
    assert settings.session_duration_hours == 12
    assert settings.public_app_url == "https://app.example"
    assert settings.database.host == "mysql.internal"
    assert settings.database.port == 3307
    assert settings.database.user == "app"
    assert settings.database.password == "secret"
    assert settings.database.database == "health"


def test_app_settings_preserve_current_defaults():
    settings = AppSettings.from_mapping({})

    assert settings.cors_origins == ("http://localhost:3000",)
    assert settings.cookie_secure is False
    assert settings.session_cookie == "dus_session"
    assert settings.session_duration_hours == 8
    assert settings.public_app_url == "http://localhost:3000"


def test_public_app_url_is_documented_and_injected_into_backend_compose():
    example = (PROJECT_ROOT / ".env.example").read_text(encoding="utf-8")
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "PUBLIC_APP_URL=http://localhost:3000" in example
    assert "PUBLIC_APP_URL: ${PUBLIC_APP_URL:-http://localhost:3000}" in compose
