from datetime import date

import pytest
from fastapi import HTTPException

from auth.dependencies import get_current_user, require_adult


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
