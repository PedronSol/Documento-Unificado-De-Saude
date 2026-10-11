from collections.abc import Mapping
from dataclasses import dataclass

from fastapi import Request

SESSION_COOKIE = "dus_session"


@dataclass(frozen=True)
class DatabaseSettings:
    host: str
    port: int
    user: str
    password: str
    database: str

    @classmethod
    def from_mapping(cls, values: Mapping[str, str]) -> "DatabaseSettings":
        return cls(
            host=values.get("DB_HOST", "db"),
            port=int(values.get("DB_PORT", "3306")),
            user=values.get("DB_USER", "root"),
            password=values.get("DB_PASSWORD", "root"),
            database=values.get("DB_NAME", "passaporte_saude"),
        )


@dataclass(frozen=True)
class AppSettings:
    database: DatabaseSettings
    cors_origins: tuple[str, ...]
    cookie_secure: bool
    session_cookie: str
    session_duration_hours: int
    public_app_url: str
    google_auth_enabled: bool
    google_client_id: str | None

    @classmethod
    def from_mapping(cls, values: Mapping[str, str]) -> "AppSettings":
        cors_origins = tuple(
            origin.strip()
            for origin in values.get("CORS_ORIGINS", "http://localhost:3000").split(",")
            if origin.strip()
        )
        return cls(
            database=DatabaseSettings.from_mapping(values),
            cors_origins=cors_origins,
            cookie_secure=values.get("COOKIE_SECURE", "false").lower() == "true",
            session_cookie=SESSION_COOKIE,
            session_duration_hours=int(values.get("SESSION_DURATION_HOURS", "8")),
            public_app_url=values.get(
                "PUBLIC_APP_URL",
                "http://localhost:3000",
            ).rstrip("/"),
            google_auth_enabled=(
                values.get("GOOGLE_AUTH_ENABLED", "false").lower() == "true"
            ),
            google_client_id=values.get("GOOGLE_CLIENT_ID") or None,
        )


def get_settings(request: Request):
    return request.app.state.settings
