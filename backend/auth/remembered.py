from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import Response

from config import REMEMBERED_LOGIN_COOKIE, AppSettings
from security import create_remembered_login_token, hash_remembered_login_token


REMEMBERED_LOGIN_DAYS = 30


def mask_email(email: str) -> str:
    local_part, domain = email.rsplit("@", 1)
    prefix = local_part[0] if len(local_part) > 1 else ""
    return f"{prefix}•••@{domain}"


def first_name(display_name: str) -> str:
    return display_name.split()[0]


def find_remembered_user(cursor: Any, raw_token: str) -> Optional[dict]:
    cursor.execute(
        """
        SELECT u.*
        FROM remembered_logins r
        JOIN users u ON u.user_id = r.user_id
        WHERE r.token_hash = %s
          AND r.expires_at > UTC_TIMESTAMP()
          AND u.claimed_at IS NOT NULL
          AND u.password_hash IS NOT NULL
        """,
        (hash_remembered_login_token(raw_token),),
    )
    return cursor.fetchone()


def remember_login(
    cursor: Any,
    *,
    user_id: int,
    previous_token: Optional[str],
) -> str:
    raw_token = create_remembered_login_token()
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
        days=REMEMBERED_LOGIN_DAYS
    )
    cursor.execute("DELETE FROM remembered_logins WHERE expires_at <= UTC_TIMESTAMP()")
    if previous_token:
        forget_login(cursor, previous_token)
    cursor.execute(
        "INSERT INTO remembered_logins (token_hash, user_id, expires_at) "
        "VALUES (%s, %s, %s)",
        (hash_remembered_login_token(raw_token), user_id, expires_at),
    )
    return raw_token


def forget_login(cursor: Any, raw_token: str) -> None:
    cursor.execute(
        "DELETE FROM remembered_logins WHERE token_hash = %s",
        (hash_remembered_login_token(raw_token),),
    )


def set_remembered_cookie(
    response: Response,
    *,
    raw_token: str,
    settings: AppSettings,
) -> None:
    response.set_cookie(
        key=REMEMBERED_LOGIN_COOKIE,
        value=raw_token,
        max_age=REMEMBERED_LOGIN_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_remembered_cookie(response: Response, settings: AppSettings) -> None:
    response.delete_cookie(
        REMEMBERED_LOGIN_COOKIE,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )
