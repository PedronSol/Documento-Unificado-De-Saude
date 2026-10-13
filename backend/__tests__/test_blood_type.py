import json

from fastapi import HTTPException
import mysql.connector
from pydantic import ValidationError
import pytest

from models import BloodTypeUpdate
from patients.router import update_own_blood_type


class BloodTypeCursor:
    def __init__(self, connection):
        self.connection = connection
        self._result = None

    def execute(self, statement, parameters=None):
        sql = " ".join(statement.split())
        self.connection.executed.append((sql, parameters or ()))
        if self.connection.fail_audit and sql.startswith(
            "INSERT INTO clinical_audit_events"
        ):
            raise mysql.connector.Error("audit unavailable")
        if sql.startswith("SELECT tipo_sanguineo"):
            self._result = self.connection.current

    def fetchone(self):
        return self._result

    def close(self):
        pass


class BloodTypeConnection:
    def __init__(self, *, blood_type=None, source=None, fail_audit=False):
        self.current = {
            "blood_type": blood_type,
            "blood_type_source": source,
        }
        self.fail_audit = fail_audit
        self.executed = []
        self.commits = 0
        self.rollbacks = 0

    def cursor(self, dictionary=False):
        return BloodTypeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


ADULT = {"patient_id": 10, "user_id": 1}
GUARDIAN_ACTING = {"patient_id": 20, "user_id": 2, "acting_guardian": True}


def statements(connection):
    return [sql for sql, _ in connection.executed]


def audit_event(connection):
    [audit] = [
        parameters
        for sql, parameters in connection.executed
        if sql.startswith("INSERT INTO clinical_audit_events")
    ]
    return audit


def test_blood_type_accepts_only_known_groups():
    assert BloodTypeUpdate(blood_type="AB-").blood_type == "AB-"
    for invalid in ("C+", "", None, "o+"):
        with pytest.raises(ValidationError):
            BloodTypeUpdate(blood_type=invalid)
    with pytest.raises(ValidationError):
        BloodTypeUpdate(blood_type="O+", blood_type_source="doctor")


def test_adult_patient_informs_unknown_blood_type_with_audit():
    connection = BloodTypeConnection()

    result = update_own_blood_type(
        update=BloodTypeUpdate(blood_type="O+"),
        patient=ADULT,
        connection=connection,
    )

    assert result == {"blood_type": "O+", "blood_type_source": "patient"}
    lock, update, _ = statements(connection)
    assert lock.endswith("FOR UPDATE")
    assert update.startswith("UPDATE patients SET tipo_sanguineo = %s")
    assert connection.executed[1][1] == ("O+", "patient", 10)
    audit = audit_event(connection)
    assert audit[:6] == (
        "user", 1, 10, "patient.blood_type_updated", "patient", 10,
    )
    assert json.loads(audit[6]) == {"blood_type": None, "blood_type_source": None}
    assert json.loads(audit[7]) == {"blood_type": "O+", "blood_type_source": "patient"}
    assert connection.commits == 1


def test_adult_patient_changes_self_declared_blood_type():
    connection = BloodTypeConnection(blood_type="O+", source="patient")

    result = update_own_blood_type(
        update=BloodTypeUpdate(blood_type="O-"),
        patient=ADULT,
        connection=connection,
    )

    assert result == {"blood_type": "O-", "blood_type_source": "patient"}


def test_guardian_informs_dependent_blood_type_as_guardian():
    connection = BloodTypeConnection()

    result = update_own_blood_type(
        update=BloodTypeUpdate(blood_type="B+"),
        patient=GUARDIAN_ACTING,
        connection=connection,
    )

    assert result == {"blood_type": "B+", "blood_type_source": "guardian"}
    assert audit_event(connection)[1:3] == (2, 20)


@pytest.mark.parametrize(
    ("patient", "source"),
    [(ADULT, "patient"), (GUARDIAN_ACTING, "guardian")],
)
def test_patient_side_can_change_doctor_registered_blood_type(patient, source):
    connection = BloodTypeConnection(blood_type="A+", source="doctor")

    result = update_own_blood_type(
        update=BloodTypeUpdate(blood_type="B+"),
        patient=patient,
        connection=connection,
    )

    assert result == {"blood_type": "B+", "blood_type_source": source}
    assert json.loads(audit_event(connection)[6]) == {
        "blood_type": "A+",
        "blood_type_source": "doctor",
    }
    assert connection.commits == 1


def test_repeating_same_value_and_source_changes_nothing():
    connection = BloodTypeConnection(blood_type="O+", source="patient")

    result = update_own_blood_type(
        update=BloodTypeUpdate(blood_type="O+"),
        patient=ADULT,
        connection=connection,
    )

    assert result == {"blood_type": "O+", "blood_type_source": "patient"}
    assert len(statements(connection)) == 1


def test_audit_failure_rolls_back_blood_type_update():
    connection = BloodTypeConnection(fail_audit=True)

    with pytest.raises(HTTPException) as error:
        update_own_blood_type(
            update=BloodTypeUpdate(blood_type="O+"),
            patient=ADULT,
            connection=connection,
        )

    assert error.value.status_code == 503
    assert connection.commits == 0
    assert connection.rollbacks == 1
