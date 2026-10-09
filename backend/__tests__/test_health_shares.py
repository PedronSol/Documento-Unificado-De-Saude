from datetime import datetime

from fastapi import HTTPException, Response
from fastapi.testclient import TestClient
import mysql.connector
import pytest

from config import AppSettings
from main import create_app
from security import hash_share_token
from shares.router import (
    create_health_share,
    get_active_health_share,
    get_public_health_summary,
    revoke_health_share,
)


CREATED_AT = datetime(2026, 10, 9, 12, 0)
EXPIRES_AT = datetime(2026, 10, 9, 14, 0)
VALID_TOKEN = "v" * 43


def share_row(**overrides):
    return {
        "share_id": 42,
        "patient_id": 10,
        "created_at": CREATED_AT,
        "expires_at": EXPIRES_AT,
        "revoked_at": None,
        "last_accessed_at": None,
        **overrides,
    }


class ShareCursor:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, statement, parameters=()):
        normalized = " ".join(statement.split())
        self.connection.executed.append((normalized, parameters))
        if self.connection.fail_audit and normalized.startswith(
            "INSERT INTO clinical_audit_events"
        ):
            raise mysql.connector.Error("audit unavailable")

    def fetchone(self):
        if self.connection.fetchone_results:
            return self.connection.fetchone_results.pop(0)
        return None

    def fetchall(self):
        if self.connection.fetchall_results:
            return self.connection.fetchall_results.pop(0)
        return []

    @property
    def lastrowid(self):
        return self.connection.lastrowid

    def close(self):
        pass


class ShareConnection:
    def __init__(
        self,
        *,
        fetchone_results=(),
        fetchall_results=(),
        fail_audit=False,
        lastrowid=42,
    ):
        self.fetchone_results = list(fetchone_results)
        self.fetchall_results = list(fetchall_results)
        self.fail_audit = fail_audit
        self.lastrowid = lastrowid
        self.executed = []
        self.commits = 0
        self.rollbacks = 0

    def cursor(self, dictionary=False):
        return ShareCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        pass


def settings():
    return AppSettings.from_mapping({"PUBLIC_APP_URL": "https://app.example/"})


def patient():
    return {"patient_id": 10, "user_id": 1}


def test_creation_returns_raw_token_once_and_persists_only_hash():
    connection = ShareConnection(
        fetchone_results=[{"patient_id": 10}, None, share_row()]
    )

    result = create_health_share(
        patient=patient(),
        settings=settings(),
        connection=connection,
    )

    assert result["share_id"] == 42
    assert result["share_url"].startswith("https://app.example/share#")
    raw_token = result["share_url"].split("#", 1)[1]
    insert = next(
        item for item in connection.executed
        if item[0].startswith("INSERT INTO health_shares")
    )
    assert raw_token not in insert[1]
    assert hash_share_token(raw_token) in insert[1]
    assert all(raw_token not in str(parameters) for _, parameters in connection.executed)
    audit = connection.executed[-1]
    assert audit[1][0:6] == (
        "user",
        1,
        10,
        "health_share.created",
        "health_share",
        42,
    )
    assert raw_token not in str(audit[1])
    assert connection.commits == 1
    assert connection.rollbacks == 0


def test_generation_revokes_previous_share_and_audits_both_atomically():
    previous = share_row(share_id=41)
    created = share_row(share_id=42)
    connection = ShareConnection(
        fetchone_results=[{"patient_id": 10}, previous, previous, created]
    )

    create_health_share(
        patient=patient(),
        settings=settings(),
        connection=connection,
    )

    statements = [statement for statement, _ in connection.executed]
    assert any(statement.startswith("UPDATE health_shares") for statement in statements)
    actions = [
        parameters[3]
        for statement, parameters in connection.executed
        if statement.startswith("INSERT INTO clinical_audit_events")
    ]
    assert actions == ["health_share.revoked", "health_share.created"]
    assert connection.commits == 1


def test_active_lookup_returns_metadata_without_token_or_link():
    connection = ShareConnection(fetchone_results=[share_row()])

    result = get_active_health_share(patient=patient(), connection=connection)

    assert result == {
        "share_id": 42,
        "created_at": CREATED_AT,
        "expires_at": EXPIRES_AT,
    }
    assert "token" not in str(result)
    assert "token_hash" not in connection.executed[0][0]
    assert get_active_health_share(
        patient=patient(),
        connection=ShareConnection(fetchone_results=[None]),
    ) is None


def test_revoke_uses_patient_ownership_and_audits_before_commit():
    before = share_row()
    after = share_row(revoked_at=datetime(2026, 10, 9, 12, 30))
    connection = ShareConnection(fetchone_results=[before, after])

    response = revoke_health_share(
        share_id=42,
        patient=patient(),
        connection=connection,
    )

    assert response.status_code == 204
    lock = connection.executed[0]
    assert "patient_id = %s" in lock[0]
    assert lock[1] == (42, 10)
    assert connection.executed[-1][1][3:6] == (
        "health_share.revoked",
        "health_share",
        42,
    )
    assert connection.commits == 1


def test_missing_foreign_or_revoked_share_returns_uniform_404():
    connection = ShareConnection(fetchone_results=[None])

    with pytest.raises(HTTPException) as error:
        revoke_health_share(
            share_id=99,
            patient=patient(),
            connection=connection,
        )

    assert error.value.status_code == 404
    assert error.value.detail == "Compartilhamento não encontrado."
    assert connection.commits == 0
    assert connection.rollbacks == 1


def test_public_summary_uses_hash_allowlist_no_store_and_public_audit():
    connection = ShareConnection(
        fetchone_results=[
            {
                **share_row(),
                "preferred_name": "Carlos",
                "blood_type": "A+",
            }
        ],
        fetchall_results=[
            [
                {
                    "type": "allergy",
                    "name": "Dipirona",
                    "description": "Reação cutânea",
                    "dosage": None,
                    "frequency": None,
                },
                {
                    "type": "medication",
                    "name": "Losartana",
                    "description": "Uso contínuo",
                    "dosage": "50 mg",
                    "frequency": "1 vez ao dia",
                },
            ]
        ],
    )
    response = Response()

    result = get_public_health_summary(
        response=response,
        share_token=VALID_TOKEN,
        connection=connection,
    )

    assert result == {
        "expires_at": EXPIRES_AT,
        "patient": {"preferred_name": "Carlos", "blood_type": "A+"},
        "markers": {
            "allergies": [
                {"name": "Dipirona", "description": "Reação cutânea"}
            ],
            "medications": [
                {
                    "name": "Losartana",
                    "description": "Uso contínuo",
                    "dosage": "50 mg",
                    "frequency": "1 vez ao dia",
                }
            ],
            "conditions": [],
            "diagnoses": [],
        },
    }
    lookup = connection.executed[0]
    assert "token_hash = %s" in lookup[0]
    assert "FOR UPDATE" in lookup[0]
    assert lookup[1] == (hash_share_token(VALID_TOKEN),)
    assert "status = 'active'" in connection.executed[1][0]
    assert response.headers["cache-control"] == "no-store, max-age=0"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-robots-tag"] == "noindex, nofollow"
    audit = connection.executed[-1]
    assert audit[1][0:6] == (
        "public_share",
        None,
        10,
        "health_share.accessed",
        "health_share",
        42,
    )
    assert connection.commits == 1


@pytest.mark.parametrize("token", [None, "", "short", "u" * 43])
def test_invalid_public_token_has_uniform_404_without_audit(token):
    connection = ShareConnection(fetchone_results=[None])
    response = Response()

    with pytest.raises(HTTPException) as error:
        get_public_health_summary(
            response=response,
            share_token=token,
            connection=connection,
        )

    assert error.value.status_code == 404
    assert error.value.detail == "Compartilhamento indisponível."
    assert not any(
        statement.startswith("INSERT INTO clinical_audit_events")
        for statement, _ in connection.executed
    )
    assert response.headers["cache-control"] == "no-store, max-age=0"


def test_public_http_errors_also_disable_cache():
    client = TestClient(
        create_app(
            settings=settings(),
            connection_factory=ShareConnection,
        )
    )

    response = client.get(
        "/public/shares/summary",
        headers={"X-Share-Token": "short"},
    )

    assert response.status_code == 404
    assert response.headers["cache-control"] == "no-store, max-age=0"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-robots-tag"] == "noindex, nofollow"


def test_public_audit_failure_rolls_back_and_returns_no_summary():
    connection = ShareConnection(
        fetchone_results=[
            {
                **share_row(),
                "preferred_name": "Carlos",
                "blood_type": "A+",
            }
        ],
        fetchall_results=[[]],
        fail_audit=True,
    )

    with pytest.raises(HTTPException) as error:
        get_public_health_summary(
            response=Response(),
            share_token=VALID_TOKEN,
            connection=connection,
        )

    assert error.value.status_code == 503
    assert connection.commits == 0
    assert connection.rollbacks == 1
