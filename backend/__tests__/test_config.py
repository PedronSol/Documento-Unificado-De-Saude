from config import AppSettings


def test_app_settings_are_built_from_an_injected_mapping():
    settings = AppSettings.from_mapping(
        {
            "CORS_ORIGINS": "https://app.example, https://admin.example",
            "COOKIE_SECURE": "true",
            "SESSION_DURATION_HOURS": "12",
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
