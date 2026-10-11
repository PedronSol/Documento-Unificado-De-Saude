from collections.abc import Callable, Mapping
import re
from typing import Any

from fastapi import Request


GoogleIdentityVerifier = Callable[[str], Mapping[str, Any]]
GOOGLE_ISSUER = "https://accounts.google.com"
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def build_google_identity_verifier(client_id: str) -> GoogleIdentityVerifier:
    from google.auth.exceptions import GoogleAuthError
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import id_token

    google_request = GoogleRequest()

    def verify(credential: str) -> Mapping[str, Any]:
        try:
            return id_token.verify_oauth2_token(
                credential,
                google_request,
                client_id,
            )
        except (GoogleAuthError, ValueError) as error:
            raise ValueError("Credencial Google inválida.") from error

    return verify


def get_google_identity_verifier(request: Request) -> GoogleIdentityVerifier:
    return request.app.state.google_identity_verifier


def verified_google_identity(
    credential: str,
    verifier: GoogleIdentityVerifier,
) -> dict[str, str]:
    claims = verifier(credential)
    subject = claims.get("sub")
    email = claims.get("email")
    display_name = claims.get("name")
    normalized_email = email.strip().casefold() if isinstance(email, str) else ""
    normalized_name = (
        " ".join(display_name.split()) if isinstance(display_name, str) else ""
    )
    if (
        not isinstance(subject, str)
        or not subject
        or len(subject) > 255
        or not EMAIL_PATTERN.fullmatch(normalized_email)
        or len(normalized_email) > 254
        or not normalized_name
        or len(normalized_name) > 100
        or claims.get("email_verified") is not True
    ):
        raise ValueError("Claims obrigatórias ausentes.")
    return {
        "issuer": GOOGLE_ISSUER,
        "subject": subject,
        "email": normalized_email,
        "display_name": normalized_name,
    }
