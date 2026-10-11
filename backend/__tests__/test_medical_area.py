from datetime import date, datetime

from fastapi import HTTPException
import mysql.connector
import pytest

from medical.router import (
    add_medical_marker,
    delete_medical_marker,
    get_authorized_medical_patient,
    get_medical_record,
    list_medical_patients,
    update_medical_marker,
)
from models import MarkerCreateUpdate


class MedicalCursor:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, statement, parameters=()):
        normalized = " ".join(statement.split())
        self.connection.executed.append((normalized, parameters))
        if self.connection.fail_audit and normalized.startswith(
            "INSERT INTO clinical_audit_events"
        ):
            raise mysql.connector.Error("audit unavailable")

    def fetchall(self):
        if self.connection.fetchall_results:
            return self.connection.fetchall_results.pop(0)
        return self.connection.fetchall_result

    def fetchone(self):
        if self.connection.fetchone_results:
            return self.connection.fetchone_results.pop(0)
        return self.connection.fetchone_result

    def close(self):
        pass

    @property
    def lastrowid(self):
        return self.connection.lastrowid


class MedicalConnection:
    def __init__(
        self,
        *,
        fetchall_result=None,
        fetchone_result=None,
        fetchall_results=None,
        fetchone_results=None,
        fail_audit=False,
        lastrowid=21,
    ):
        self.fetchall_result = fetchall_result or []
        self.fetchone_result = fetchone_result
        self.fetchall_results = list(fetchall_results or [])
        self.fetchone_results = list(fetchone_results or [])
        self.fail_audit = fail_audit
        self.lastrowid = lastrowid
        self.executed = []
        self.commits = 0
        self.rollbacks = 0

    def cursor(self, dictionary=False):
        return MedicalCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def patient_row(**overrides):
    return {
        "patient_id": 10,
        "preferred_name": "Carlos Silva",
        "full_name": "Carlos Eduardo Silva",
        "avatar_url": None,
        "health_status": "updated",
        "blood_type": "A+",
        "birth_date": date(1985, 4, 12),
        "account_claimed_at": datetime(2026, 1, 1, 12, 0),
        "provisioned_by_doctor_id": None,
        **overrides,
    }


def marker_row(**overrides):
    timestamp = datetime(2026, 10, 8, 12, 0)
    return {
        "marker_id": 21,
        "type": "diagnosis",
        "name": "Hipertensão",
        "description": None,
        "dosage": None,
        "frequency": None,
        "status": "active",
        "created_at": timestamp,
        "updated_at": timestamp,
        "removed_at": None,
        **overrides,
    }


def test_medical_list_returns_only_sql_authorized_patient_allowlist():
    connection = MedicalConnection(fetchall_result=[patient_row()])

    result = list_medical_patients(
        query=None,
        doctor={"doctor_id": 3, "user_id": 8},
        connection=connection,
    )

    assert result == [
        {
            "patient_id": 10,
            "preferred_name": "Carlos Silva",
            "full_name": "Carlos Eduardo Silva",
            "avatar_url": None,
            "health_status": "updated",
            "age": result[0]["age"],
        }
    ]
    assert result[0]["age"] >= 40
    statement, parameters = connection.executed[0]
    assert "EXISTS" in statement
    assert "cg.status = 'active'" in statement
    assert "dcg.status = 'active'" in statement
    assert "pcg.status = 'active'" in statement
    assert "LIMIT 50" in statement
    assert "dpl.status = 'active'" in statement
    assert parameters == (3, 3)
    assert "cpf" not in result[0]


def test_medical_search_normalizes_formatted_cpf_without_returning_it():
    connection = MedicalConnection(fetchall_result=[patient_row()])

    result = list_medical_patients(
        query=" 000.111.222-22 ",
        doctor={"doctor_id": 3, "user_id": 8},
        connection=connection,
    )

    statement, parameters = connection.executed[0]
    assert "u.cpf = %s" in statement
    assert parameters == (3, 3, "00011122222")
    assert "cpf" not in result[0]


@pytest.mark.parametrize("query", ["C", "12345"])
def test_medical_search_rejects_ambiguous_short_input(query):
    with pytest.raises(HTTPException) as error:
        list_medical_patients(
            query=query,
            doctor={"doctor_id": 3, "user_id": 8},
            connection=MedicalConnection(),
        )

    assert error.value.status_code == 422


def test_direct_patient_access_returns_403_for_missing_or_unlinked_patient():
    connection = MedicalConnection(fetchone_result=None)

    with pytest.raises(HTTPException) as error:
        get_authorized_medical_patient(
            patient_id=99,
            doctor={"doctor_id": 3, "user_id": 8},
            connection=connection,
        )

    assert error.value.status_code == 403
    assert error.value.detail == "Paciente não autorizado."
    statement, parameters = connection.executed[0]
    assert "p.patient_id = %s" in statement
    assert "EXISTS" in statement
    assert parameters == (99, 3, 3)


def test_medical_record_returns_allowlisted_timeline_and_audits_view():
    removed = marker_row(
        marker_id=22,
        name="Losartana",
        type="medication",
        status="removed",
        removed_at=datetime(2026, 10, 7, 9, 30),
    )
    connection = MedicalConnection(
        fetchone_results=[patient_row(user_id=7)],
        fetchall_results=[
            [
                {
                    "vaccine_id": 4,
                    "name": "Influenza",
                    "dose": "Dose anual",
                    "administered_on": date(2026, 4, 10),
                    "status": "applied",
                }
            ],
            [marker_row()],
            [removed],
        ],
    )

    result = get_medical_record(
        patient_id=10,
        doctor={"doctor_id": 3, "user_id": 8},
        connection=connection,
    )

    assert result["patient"]["blood_type"] == "A+"
    assert result["vaccines"][0]["name"] == "Influenza"
    assert result["markers"] == {
        "active": [marker_row()],
        "removed": [removed],
    }
    assert "user_id" not in result["patient"]
    audit = connection.executed[-1]
    assert audit[0].startswith("INSERT INTO clinical_audit_events")
    assert audit[1][0:6] == (
        "user",
        8,
        10,
        "medical_record.viewed",
        "patient",
        10,
    )
    assert connection.commits == 1


def test_medical_record_audit_failure_returns_503_without_commit():
    connection = MedicalConnection(
        fetchone_results=[patient_row(user_id=7)],
        fetchall_results=[[], [], []],
        fail_audit=True,
    )

    with pytest.raises(HTTPException) as error:
        get_medical_record(
            patient_id=10,
            doctor={"doctor_id": 3, "user_id": 8},
            connection=connection,
        )

    assert error.value.status_code == 503
    assert connection.commits == 0
    assert connection.rollbacks == 1


def test_medical_marker_creation_uses_doctor_as_author():
    created = marker_row(name="Insuficiência renal leve")
    connection = MedicalConnection(
        fetchone_results=[patient_row(user_id=7), created],
    )

    result = add_medical_marker(
        patient_id=10,
        marker=MarkerCreateUpdate(
            type="diagnosis",
            name="Insuficiência renal leve",
        ),
        doctor={"doctor_id": 3, "user_id": 8},
        connection=connection,
    )

    assert result == created
    mutation = connection.executed[1]
    assert mutation[0].startswith("INSERT INTO health_markers")
    assert mutation[1][-2:] == (8, 8)
    audit = connection.executed[-1]
    assert audit[0].startswith("INSERT INTO clinical_audit_events")
    assert audit[1][0:4] == ("user", 8, 10, "health_marker.created")
    assert connection.commits == 1


def test_medical_marker_update_and_suspension_preserve_doctor_authorship():
    previous = marker_row(type="medication", name="Captopril", dosage="25 mg")
    updated = marker_row(type="medication", name="Captopril", dosage="50 mg")
    update_connection = MedicalConnection(
        fetchone_results=[patient_row(user_id=7), previous, updated],
    )

    result = update_medical_marker(
        patient_id=10,
        marker_id=21,
        marker=MarkerCreateUpdate(
            type="medication",
            name="Captopril",
            dosage="50 mg",
        ),
        doctor={"doctor_id": 3, "user_id": 8},
        connection=update_connection,
    )

    assert result == updated
    update_statement = update_connection.executed[2]
    assert update_statement[0].startswith("UPDATE health_markers")
    assert 8 in update_statement[1]
    assert update_connection.executed[-1][1][0:4] == (
        "user",
        8,
        10,
        "health_marker.updated",
    )

    removed = marker_row(
        type="medication",
        name="Captopril",
        dosage="50 mg",
        status="removed",
        removed_at=datetime(2026, 10, 8, 13, 0),
    )
    delete_connection = MedicalConnection(
        fetchone_results=[patient_row(user_id=7), updated, removed],
    )

    message = delete_medical_marker(
        patient_id=10,
        marker_id=21,
        doctor={"doctor_id": 3, "user_id": 8},
        connection=delete_connection,
    )

    assert message == {"message": "Marcador removido com sucesso!"}
    assert delete_connection.executed[-1][1][0:4] == (
        "user",
        8,
        10,
        "health_marker.removed",
    )


def test_medical_marker_mutation_allows_authorized_minor_record():
    connection = MedicalConnection(
        fetchone_results=[
            patient_row(user_id=7, birth_date=date(2020, 1, 1)),
            marker_row(name="Asma"),
        ],
    )

    result = add_medical_marker(
        patient_id=10,
        marker=MarkerCreateUpdate(type="condition", name="Asma"),
        doctor={"doctor_id": 3, "user_id": 8},
        connection=connection,
    )

    assert result["name"] == "Asma"
    assert any(
        statement.startswith("INSERT INTO health_markers")
        for statement, _ in connection.executed
    )
