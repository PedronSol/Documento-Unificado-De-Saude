from datetime import date

import pytest
from fastapi import HTTPException
import mysql.connector

from auth.dependencies import get_current_user, require_adult
from models import VaccineCreateUpdate
from vaccines.router import add_vaccine


class FailingCursor:
    def execute(self, _statement, _parameters=None):
        raise mysql.connector.Error("database unavailable")

    def close(self):
        pass


class FailingConnection:
    def cursor(self, dictionary=False):
        return FailingCursor()

    def commit(self):
        pass

    def rollback(self):
        pass


def test_missing_session_is_rejected_before_database_access():
    with pytest.raises(HTTPException) as error:
        get_current_user(None)

    assert error.value.status_code == 401


def test_minor_cannot_change_health_record():
    today = date.today()
    patient = {"data_nascimento": date(today.year - 10, 1, 1)}

    with pytest.raises(HTTPException) as error:
        require_adult(patient)

    assert error.value.status_code == 403


def test_adult_can_change_health_record():
    today = date.today()
    patient = {"data_nascimento": date(today.year - 30, 1, 1)}

    assert require_adult(patient) == patient


def test_database_failure_is_not_reported_as_bad_request():
    vaccine = VaccineCreateUpdate(
        name="Influenza",
        dose="Dose anual",
        administered_on=date(2026, 4, 15),
        status="applied",
    )

    with pytest.raises(HTTPException) as error:
        add_vaccine(
            vaccine=vaccine,
            patient={"patient_id": 10},
            connection=FailingConnection(),
        )

    assert error.value.status_code == 503
    assert error.value.detail == "Banco de dados indisponível."
