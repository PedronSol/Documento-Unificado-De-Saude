from pathlib import Path

import pytest

from config import AppSettings


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_app_settings_are_built_from_an_injected_mapping():
    settings = AppSettings.from_mapping(
        {
            "CORS_ORIGINS": "https://app.example, https://admin.example",
            "COOKIE_SECURE": "true",
            "SESSION_DURATION_HOURS": "12",
            "PUBLIC_APP_URL": "https://app.example/",
            "GOOGLE_AUTH_ENABLED": "true",
            "GOOGLE_CLIENT_ID": "client-id.apps.googleusercontent.com",
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
    assert settings.google_auth_enabled is True
    assert settings.google_client_id == "client-id.apps.googleusercontent.com"
    assert settings.document_storage_root == Path(".data/documents")
    assert settings.document_max_bytes == 10485760
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
    assert settings.google_auth_enabled is False
    assert settings.google_client_id is None


def test_public_app_url_is_documented_and_injected_into_backend_compose():
    example = (PROJECT_ROOT / ".env.example").read_text(encoding="utf-8")
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "PUBLIC_APP_URL=http://localhost:3000" in example
    assert "PUBLIC_APP_URL: ${PUBLIC_APP_URL:-http://localhost:3000}" in compose


def test_google_auth_configuration_is_documented_for_backend_and_frontend():
    example = (PROJECT_ROOT / ".env.example").read_text(encoding="utf-8")
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "GOOGLE_AUTH_ENABLED=false" in example
    assert "GOOGLE_CLIENT_ID=" in example
    assert "NEXT_PUBLIC_GOOGLE_CLIENT_ID=" in example
    assert "GOOGLE_AUTH_ENABLED: ${GOOGLE_AUTH_ENABLED:-false}" in compose
    assert "GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}" in compose
    assert (
        "NEXT_PUBLIC_GOOGLE_CLIENT_ID: ${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}" in compose
    )


def test_document_storage_configuration_is_validated_and_documented():
    configured = AppSettings.from_mapping(
        {
            "DOCUMENT_STORAGE_ROOT": "/private/documents",
            "DOCUMENT_MAX_BYTES": "2048",
        }
    )
    assert configured.document_storage_root == Path("/private/documents")
    assert configured.document_max_bytes == 2048

    for invalid in ("0", "10485761", "not-a-number"):
        with pytest.raises(ValueError, match="DOCUMENT_MAX_BYTES"):
            AppSettings.from_mapping({"DOCUMENT_MAX_BYTES": invalid})

    example = (PROJECT_ROOT / ".env.example").read_text(encoding="utf-8")
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert "DOCUMENT_STORAGE_ROOT=.data/documents" in example
    assert "DOCUMENT_MAX_BYTES=10485760" in example
    assert "DOCUMENT_STORAGE_ROOT: /var/lib/dus/documents" in compose
    assert "DOCUMENT_MAX_BYTES: ${DOCUMENT_MAX_BYTES:-10485760}" in compose
    assert "document_data:/var/lib/dus/documents" in compose
