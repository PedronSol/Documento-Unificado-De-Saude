import json
from datetime import date

from fastapi import HTTPException
import mysql.connector
import pytest

from audit.service import serialize_vaccine_snapshot
from models import VaccineCreateUpdate
from vaccines.router import add_vaccine, delete_vaccine, update_vaccine


class RecordingCursor:
    def __init__(self, connection):
        self.connection = connection
        self.lastrowid = 7
        self.rowcount = 1

    def execute(self, statement, parameters=None):
        sql = " ".join(statement.split())
        self.connection.executed.append((sql, parameters or ()))

    def close(self):
        pass


class RecordingConnection:
    def __init__(self):
        self.executed = []
        self.commits = 0
        self.rollbacks = 0

    def cursor(self, dictionary=False):
        return RecordingCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class AuditFailureCursor(RecordingCursor):
    def execute(self, statement, parameters=None):
        super().execute(statement, parameters)
        if "INSERT INTO clinical_audit_events" in statement:
            raise mysql.connector.Error("audit unavailable")


class AuditFailureConnection(RecordingConnection):
    def cursor(self, dictionary=False):
        return AuditFailureCursor(self)


class ExistingVaccineCursor(RecordingCursor):
    def __init__(self, connection):
        super().__init__(connection)
        self.result = None

    def execute(self, statement, parameters=None):
        super().execute(statement, parameters)
        sql = " ".join(statement.split())
        if sql.startswith("SELECT id_vacina AS vaccine_id"):
            self.result = dict(self.connection.existing_vaccine)
        elif sql.startswith(("UPDATE vaccines", "DELETE FROM vaccines")):
            self.rowcount = 1

    def fetchone(self):
        return self.result


class ExistingVaccineConnection(RecordingConnection):
    def __init__(self):
        super().__init__()
        self.existing_vaccine = {
            "vaccine_id": 7,
            "name": "Influenza",
            "dose": "Dose inicial",
            "administered_on": date(2025, 4, 15),
            "status": "applied",
        }

    def cursor(self, dictionary=False):
        return ExistingVaccineCursor(self)


class MutationAuditFailureCursor(ExistingVaccineCursor):
    def execute(self, statement, parameters=None):
        super().execute(statement, parameters)
        if "INSERT INTO clinical_audit_events" in statement:
            raise mysql.connector.Error("audit unavailable")


class MutationAuditFailureConnection(ExistingVaccineConnection):
    def cursor(self, dictionary=False):
        return MutationAuditFailureCursor(self)


def test_vaccine_creation_and_audit_share_one_transaction():
    connection = RecordingConnection()
    vaccine = VaccineCreateUpdate(
        name="Influenza",
        dose="Dose anual",
        administered_on=date(2026, 4, 15),
        status="applied",
    )

    response = add_vaccine(
        vaccine=vaccine,
        patient={"patient_id": 10, "user_id": 1},
        connection=connection,
    )

    assert response == {"message": "Vacina registrada com sucesso!"}
    assert len(connection.executed) == 2
    mutation, audit = connection.executed
    assert mutation[0].startswith("INSERT INTO vaccines")
    assert audit[0].startswith("INSERT INTO clinical_audit_events")
    assert "UTC_TIMESTAMP(6)" in audit[0]
    assert audit[1] == (
        "user",
        1,
        10,
        "vaccine.created",
        "vaccine",
        7,
        None,
        json.dumps(
            {
                "name": "Influenza",
                "dose": "Dose anual",
                "administered_on": "2026-04-15",
                "status": "applied",
            },
            ensure_ascii=False,
            sort_keys=True,
        ),
    )
    assert connection.commits == 1
    assert connection.rollbacks == 0


def test_audit_failure_rolls_back_vaccine_creation_and_returns_503():
    connection = AuditFailureConnection()
    vaccine = VaccineCreateUpdate(
        name="Influenza",
        dose="Dose anual",
        administered_on=date(2026, 4, 15),
        status="applied",
    )

    with pytest.raises(HTTPException) as error:
        add_vaccine(
            vaccine=vaccine,
            patient={"patient_id": 10, "user_id": 1},
            connection=connection,
        )

    assert error.value.status_code == 503
    assert error.value.detail == "Banco de dados indisponível."
    assert connection.commits == 0
    assert connection.rollbacks == 1


def test_vaccine_update_audits_sanitized_before_and_after_snapshots():
    connection = ExistingVaccineConnection()
    vaccine = VaccineCreateUpdate(
        name="Influenza tetravalente",
        dose="Dose anual",
        administered_on=date(2026, 4, 15),
        status="applied",
    )

    response = update_vaccine(
        vaccine_id=7,
        vaccine=vaccine,
        patient={"patient_id": 10, "user_id": 1},
        connection=connection,
    )

    assert response == {"message": "Vacina atualizada com sucesso!"}
    assert len(connection.executed) == 3
    select, mutation, audit = connection.executed
    assert select[0].startswith("SELECT id_vacina AS vaccine_id")
    assert "FOR UPDATE" in select[0]
    assert select[1] == (7, 10)
    assert mutation[0].startswith("UPDATE vaccines")
    assert audit[0].startswith("INSERT INTO clinical_audit_events")
    assert audit[1][:6] == (
        "user",
        1,
        10,
        "vaccine.updated",
        "vaccine",
        7,
    )
    assert json.loads(audit[1][6]) == {
        "name": "Influenza",
        "dose": "Dose inicial",
        "administered_on": "2025-04-15",
        "status": "applied",
    }
    assert json.loads(audit[1][7]) == {
        "name": "Influenza tetravalente",
        "dose": "Dose anual",
        "administered_on": "2026-04-15",
        "status": "applied",
    }
    assert connection.commits == 1


def test_vaccine_delete_audits_only_the_previous_snapshot():
    connection = ExistingVaccineConnection()

    response = delete_vaccine(
        vaccine_id=7,
        patient={"patient_id": 10, "user_id": 1},
        connection=connection,
    )

    assert response == {"message": "Vacina removida com sucesso!"}
    assert len(connection.executed) == 3
    select, mutation, audit = connection.executed
    assert "FOR UPDATE" in select[0]
    assert select[1] == (7, 10)
    assert mutation[0].startswith("DELETE FROM vaccines")
    assert audit[1][:6] == (
        "user",
        1,
        10,
        "vaccine.deleted",
        "vaccine",
        7,
    )
    assert json.loads(audit[1][6]) == {
        "name": "Influenza",
        "dose": "Dose inicial",
        "administered_on": "2025-04-15",
        "status": "applied",
    }
    assert audit[1][7] is None
    assert connection.commits == 1


def test_vaccine_snapshot_uses_an_explicit_allowlist():
    snapshot = serialize_vaccine_snapshot(
        {
            "vaccine_id": 7,
            "name": "Influenza",
            "dose": "Dose anual",
            "administered_on": date(2026, 4, 15),
            "status": "applied",
            "cpf": "12345678901",
            "email": "patient@example.com",
            "password_hash": "secret",
            "token": "raw-token",
            "document_content": "clinical content",
        }
    )

    assert snapshot == {
        "name": "Influenza",
        "dose": "Dose anual",
        "administered_on": "2026-04-15",
        "status": "applied",
    }


def test_audit_failure_rolls_back_vaccine_update():
    connection = MutationAuditFailureConnection()
    vaccine = VaccineCreateUpdate(
        name="Influenza tetravalente",
        dose="Dose anual",
        administered_on=date(2026, 4, 15),
        status="applied",
    )

    with pytest.raises(HTTPException) as error:
        update_vaccine(
            vaccine_id=7,
            vaccine=vaccine,
            patient={"patient_id": 10, "user_id": 1},
            connection=connection,
        )

    assert error.value.status_code == 503
    assert connection.commits == 0
    assert connection.rollbacks == 1
