from datetime import date

from fastapi import HTTPException
import pytest

from alerts.router import get_alerts
from documents.router import get_documents
from models import (
    AlertResponse,
    DocumentSummary,
    MedicalPatientProfile,
    PatientProfileResponse,
    PublicPatientSummary,
)
from vaccines.router import delete_vaccine


class ResourceCursor:
    def __init__(self, connection, result):
        self.connection = connection
        self.result = result
        self.rowcount = 0
        self.fetchone_result = None

    def execute(self, statement, parameters=None):
        sql = " ".join(statement.split())
        parameters = parameters or ()
        self.connection.executed.append((sql, parameters))
        if sql.startswith("SELECT id_vacina AS vaccine_id"):
            vaccine_id, patient_id = parameters
            if (vaccine_id, patient_id) in self.connection.owned:
                self.fetchone_result = {
                    "vaccine_id": vaccine_id,
                    "name": "Influenza",
                    "dose": "Dose anual",
                    "administered_on": date(2026, 4, 15),
                    "status": "applied",
                }
        elif sql.startswith("DELETE FROM vaccines"):
            vaccine_id, patient_id = parameters
            self.rowcount = int((vaccine_id, patient_id) in self.connection.owned)

    def fetchall(self):
        return self.result

    def fetchone(self):
        return self.fetchone_result

    def close(self):
        pass


class ResourceConnection:
    def __init__(self, result=None, *, owned=()):
        self.result = result or []
        self.owned = set(owned)
        self.executed = []
        self.commits = 0
        self.rollbacks = 0

    def cursor(self, dictionary=False):
        return ResourceCursor(self, self.result)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def test_new_patient_contracts_allow_unknown_blood_type():
    own_profile = PatientProfileResponse(
        preferred_name="Novo",
        full_name="Novo Paciente",
        health_status="pending",
        blood_type=None,
        is_adult=True,
        age=34,
    )
    medical_profile = MedicalPatientProfile(
        patient_id=10,
        preferred_name="Novo",
        full_name="Novo Paciente",
        health_status="pending",
        age=34,
        blood_type=None,
    )
    public_profile = PublicPatientSummary(
        preferred_name="Novo",
        blood_type=None,
    )

    assert own_profile.blood_type is None
    assert medical_profile.blood_type is None
    assert public_profile.blood_type is None


def test_alerts_use_session_patient_and_normalized_contract():
    connection = ResourceConnection(
        [
            {
                "alert_id": 3,
                "type": "condition",
                "title": "Hipertensão",
                "description": "Acompanhamento regular recomendado.",
                "severity": "medium",
            }
        ]
    )

    result = get_alerts(patient={"patient_id": 10}, connection=connection)

    assert [AlertResponse.model_validate(item) for item in result]
    assert connection.executed[0][1] == (10,)
    assert "AS alert_id" in connection.executed[0][0]


def test_documents_use_session_patient_and_normalized_contract():
    connection = ResourceConnection(
        [
            {
                "document_id": 9,
                "title": "Hemograma Completo",
                "type": "exam",
                "created_on": date(2026, 3, 1),
                "status": "new",
            }
        ]
    )

    result = get_documents(patient={"patient_id": 10}, connection=connection)

    assert [DocumentSummary.model_validate(item) for item in result]
    assert connection.executed[0][1] == (10,)
    assert "AS document_id" in connection.executed[0][0]


@pytest.mark.parametrize("vaccine_id", [22, 999])
def test_foreign_and_missing_vaccine_have_the_same_not_found_response(vaccine_id):
    connection = ResourceConnection(owned={(1, 10)})

    with pytest.raises(HTTPException) as error:
        delete_vaccine(
            vaccine_id=vaccine_id,
            patient={"patient_id": 10},
            connection=connection,
        )

    assert error.value.status_code == 404
    assert error.value.detail == "Vacina não encontrada."
    assert connection.executed[0][1] == (vaccine_id, 10)
    assert not any(
        statement.startswith("INSERT INTO clinical_audit_events")
        for statement, _parameters in connection.executed
    )
    assert connection.commits == 0
    assert connection.rollbacks == 1
