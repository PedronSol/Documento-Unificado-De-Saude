from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from fastapi import Request

SESSION_COOKIE = "dus_session"
REMEMBERED_LOGIN_COOKIE = "dus_remembered"


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
    session_idle_hours: int
    session_max_hours: int
    public_app_url: str
    google_auth_enabled: bool
    google_client_id: str | None
    document_storage_root: Path
    document_max_bytes: int

    @classmethod
    def from_mapping(cls, values: Mapping[str, str]) -> "AppSettings":
        cors_origins = tuple(
            origin.strip()
            for origin in values.get("CORS_ORIGINS", "http://localhost:3000").split(",")
            if origin.strip()
        )
        try:
            document_max_bytes = int(
                values.get("DOCUMENT_MAX_BYTES", "10485760")
            )
        except ValueError as error:
            raise ValueError(
                "DOCUMENT_MAX_BYTES deve ser um inteiro positivo."
            ) from error
        if not 0 < document_max_bytes <= 10 * 1024 * 1024:
            raise ValueError(
                "DOCUMENT_MAX_BYTES deve estar entre 1 e 10485760 bytes."
            )
        session_idle_hours = _positive_hours(values, "SESSION_IDLE_HOURS", "24")
        session_max_hours = _positive_hours(values, "SESSION_MAX_HOURS", "168")
        if session_idle_hours > session_max_hours:
            raise ValueError(
                "SESSION_IDLE_HOURS não pode exceder SESSION_MAX_HOURS."
            )
        return cls(
            database=DatabaseSettings.from_mapping(values),
            cors_origins=cors_origins,
            cookie_secure=values.get("COOKIE_SECURE", "false").lower() == "true",
            session_cookie=SESSION_COOKIE,
            session_idle_hours=session_idle_hours,
            session_max_hours=session_max_hours,
            public_app_url=values.get(
                "PUBLIC_APP_URL",
                "http://localhost:3000",
            ).rstrip("/"),
            google_auth_enabled=(
                values.get("GOOGLE_AUTH_ENABLED", "false").lower() == "true"
            ),
            google_client_id=values.get("GOOGLE_CLIENT_ID") or None,
            document_storage_root=Path(
                values.get("DOCUMENT_STORAGE_ROOT", ".data/documents")
            ),
            document_max_bytes=document_max_bytes,
        )


def _positive_hours(values: Mapping[str, str], name: str, default: str) -> int:
    try:
        hours = int(values.get(name, default))
    except ValueError as error:
        raise ValueError(f"{name} deve ser um inteiro positivo.") from error
    if hours <= 0:
        raise ValueError(f"{name} deve ser um inteiro positivo.")
    return hours


def get_settings(request: Request):
    return request.app.state.settings
