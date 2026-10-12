from datetime import datetime

from fastapi import HTTPException
import mysql.connector
from pydantic import ValidationError
import pytest

from audit.service import serialize_health_marker_snapshot
from markers.router import (
    add_marker,
    delete_marker,
    get_markers,
    update_marker,
)
from pagination import PageRequest
from models import MarkerCreateUpdate, normalize_marker_name


NOW = datetime(2026, 10, 6, 18, 30)


def marker_row(**overrides):
    row = {
        "marker_id": 21,
        "type": "medication",
        "name": "Losartana",
        "description": "Uso contínuo",
        "dosage": "50 mg",
        "frequency": "1 vez ao dia",
        "status": "active",
        "created_at": NOW,
        "updated_at": NOW,
        "removed_at": None,
    }
    row.update(overrides)
    return row


class MarkerCursor:
    def __init__(self, connection):
        self.connection = connection
        self.lastrowid = 21
        self._result = None

    def execute(self, statement, parameters=None):
        sql = " ".join(statement.split())
        parameters = parameters or ()
        self.connection.executed.append((sql, parameters))
        if (
            self.connection.fail_duplicate
            and sql.startswith("INSERT INTO health_markers")
        ):
            raise mysql.connector.IntegrityError(
                msg="duplicate",
                errno=1062,
            )
        if self.connection.fail_audit and sql.startswith(
            "INSERT INTO clinical_audit_events"
        ):
            raise mysql.connector.Error("audit unavailable")
        if sql.startswith("SELECT COUNT(*) AS total"):
            self._result = {"total": len(self.connection.fetchall_result)}
        elif sql.startswith("SELECT marker_id") and "marker_id = %s" in sql:
            self._result = (
                self.connection.fetchone_results.pop(0)
                if self.connection.fetchone_results
                else None
            )

    def fetchone(self):
        return self._result

    def fetchall(self):
        return self.connection.fetchall_result

    def close(self):
        pass


class MarkerConnection:
    def __init__(
        self,
        *,
        fetchone_results=(),
        fetchall_result=(),
        fail_duplicate=False,
        fail_audit=False,
    ):
        self.fetchone_results = list(fetchone_results)
        self.fetchall_result = list(fetchall_result)
        self.fail_duplicate = fail_duplicate
        self.fail_audit = fail_audit
        self.executed = []
        self.commits = 0
        self.rollbacks = 0

    def cursor(self, dictionary=False):
        return MarkerCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def test_marker_schema_normalizes_name_and_optional_text():
    marker = MarkerCreateUpdate(
        type="medication",
        name="  Losartana   Potássica  ",
        description="  Uso   contínuo  ",
        dosage="  50 mg  ",
        frequency="   ",
    )

    assert marker.name == "Losartana Potássica"
    assert marker.description == "Uso contínuo"
    assert marker.dosage == "50 mg"
    assert marker.frequency is None
    assert normalize_marker_name(marker.name) == "losartana potássica"


def test_marker_schema_rejects_medication_fields_for_another_type():
    with pytest.raises(ValidationError, match="somente para medicação"):
        MarkerCreateUpdate(
            type="allergy",
            name="Dipirona",
            dosage="500 mg",
        )


def test_lists_only_requested_status_for_current_patient():
    connection = MarkerConnection(fetchall_result=[marker_row()])

    result = get_markers(
        page=PageRequest(page=1, page_size=20, query=None),
        marker_status="active",
        marker_type=None,
        patient={"patient_id": 10, "user_id": 1},
        connection=connection,
    )

    assert result["items"] == [marker_row()]
    assert result["total"] == 1
    assert connection.executed[0][1] == (10, "active")
    assert connection.executed[1][1] == (10, "active", 20, 0)
    assert "ORDER BY marker_type, name, marker_id" in connection.executed[1][0]


def test_creates_marker_and_audit_in_one_transaction():
    connection = MarkerConnection(fetchone_results=[marker_row()])
    marker = MarkerCreateUpdate(
        type="medication",
        name="Losartana",
        description="Uso contínuo",
        dosage="50 mg",
        frequency="1 vez ao dia",
    )

    result = add_marker(
        marker=marker,
        patient={"patient_id": 10, "user_id": 1},
        connection=connection,
    )

    assert result == marker_row()
    assert [statement.split()[0] for statement, _ in connection.executed] == [
        "INSERT",
        "SELECT",
        "INSERT",
    ]
    mutation, _, audit = connection.executed
    assert mutation[1][:4] == (10, "medication", "Losartana", "losartana")
    assert audit[1][:6] == (
        "user",
        1,
        10,
        "health_marker.created",
        "health_marker",
        21,
    )
    assert connection.commits == 1
    assert connection.rollbacks == 0


def test_duplicate_marker_returns_409_without_audit():
    connection = MarkerConnection(fail_duplicate=True)

    with pytest.raises(HTTPException) as error:
        add_marker(
            marker=MarkerCreateUpdate(type="condition", name="Hipertensão"),
            patient={"patient_id": 10, "user_id": 1},
            connection=connection,
        )

    assert error.value.status_code == 409
    assert error.value.detail == (
        "Marcador ativo já cadastrado. Edite o registro existente."
    )
    assert not any(
        statement.startswith("INSERT INTO clinical_audit_events")
        for statement, _ in connection.executed
    )
    assert connection.commits == 0
    assert connection.rollbacks == 1


def test_updates_owned_active_marker_with_before_and_after_audit():
    before = marker_row()
    after = marker_row(dosage="100 mg")
    connection = MarkerConnection(fetchone_results=[before, after])

    result = update_marker(
        marker_id=21,
        marker=MarkerCreateUpdate(
            type="medication",
            name="Losartana",
            description="Uso contínuo",
            dosage="100 mg",
            frequency="1 vez ao dia",
        ),
        patient={"patient_id": 10, "user_id": 1},
        connection=connection,
    )

    assert result == after
    assert "FOR UPDATE" in connection.executed[0][0]
    assert connection.executed[0][1] == (21, 10, "active")
    assert connection.executed[-1][1][3:6] == (
        "health_marker.updated",
        "health_marker",
        21,
    )
    assert connection.commits == 1


def test_logically_removes_marker_and_audits_transition():
    before = marker_row()
    after = marker_row(
        status="removed",
        removed_at=NOW,
    )
    connection = MarkerConnection(fetchone_results=[before, after])

    result = delete_marker(
        marker_id=21,
        patient={"patient_id": 10, "user_id": 1},
        connection=connection,
    )

    assert result == {"message": "Marcador removido com sucesso!"}
    assert connection.executed[1][0].startswith("UPDATE health_markers")
    assert "status = 'removed'" in connection.executed[1][0]
    assert connection.executed[-1][1][3:6] == (
        "health_marker.removed",
        "health_marker",
        21,
    )
    assert connection.commits == 1


def test_missing_or_foreign_marker_returns_404_without_audit():
    connection = MarkerConnection()

    with pytest.raises(HTTPException) as error:
        delete_marker(
            marker_id=99,
            patient={"patient_id": 10, "user_id": 1},
            connection=connection,
        )

    assert error.value.status_code == 404
    assert error.value.detail == "Marcador não encontrado."
    assert len(connection.executed) == 1
    assert connection.commits == 0
    assert connection.rollbacks == 1


def test_audit_failure_rolls_back_marker_creation():
    connection = MarkerConnection(
        fetchone_results=[marker_row()],
        fail_audit=True,
    )

    with pytest.raises(HTTPException) as error:
        add_marker(
            marker=MarkerCreateUpdate(type="condition", name="Hipertensão"),
            patient={"patient_id": 10, "user_id": 1},
            connection=connection,
        )

    assert error.value.status_code == 503
    assert connection.commits == 0
    assert connection.rollbacks == 1


def test_marker_snapshot_uses_explicit_allowlist():
    snapshot = serialize_health_marker_snapshot(
        {
            **marker_row(),
            "patient_id": 10,
            "created_by_user_id": 1,
            "cpf": "12345678901",
            "email": "patient@example.com",
            "token": "raw-token",
            "document_content": "clinical content",
        }
    )

    assert snapshot == {
        "type": "medication",
        "name": "Losartana",
        "description": "Uso contínuo",
        "dosage": "50 mg",
        "frequency": "1 vez ao dia",
        "status": "active",
    }
