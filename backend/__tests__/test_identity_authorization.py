from copy import deepcopy

import pytest
from fastapi import HTTPException

from auth.dependencies import get_current_doctor, get_current_user, require_roles
from config import AppSettings
from security import hash_session_token


SETTINGS = AppSettings.from_mapping({})


class ScriptedCursor:
    def __init__(self, database):
        self.database = database
        self.result = None

    def execute(self, statement, parameters=None):
        sql = " ".join(statement.split())
        self.database.executed.append((sql, parameters or ()))
        self.result = deepcopy(self.database.results.pop(0)) if self.database.results else None

    def fetchone(self):
        return self.result

    def fetchall(self):
        return self.result

    def close(self):
        pass


class ScriptedConnection:
    def __init__(self, *results):
        self.results = list(results)
        self.executed = []

    def cursor(self, dictionary=False):
        return ScriptedCursor(self)

    def commit(self):
        pass

    def rollback(self):
        pass


def test_get_current_user_resolve_sessao_e_roles_do_servidor():
    connection = ScriptedConnection(
        {
            "user_id": 42,
            "display_name": "Dra. Helena Costa",
            "email": "helena@example.com",
        },
        [{"role": "patient"}, {"role": "doctor"}],
        {"verification_status": "verified", "professional_status": "active"},
    )

    user = get_current_user("raw-session", connection, SETTINGS)

    assert user == {
        "user_id": 42,
        "display_name": "Dra. Helena Costa",
        "email": "helena@example.com",
        "roles": ["patient", "doctor"],
    }
    assert connection.executed[0][1] == (hash_session_token("raw-session"),)
    assert all("cpf" not in statement.lower() for statement, _ in connection.executed)


def test_doctor_pendente_nao_recebe_role_profissional():
    connection = ScriptedConnection(
        {
            "user_id": 7,
            "display_name": "Dra. Paula Reis",
            "email": "paula@example.com",
        },
        [{"role": "patient"}, {"role": "doctor"}],
        {"verification_status": "pending", "professional_status": "active"},
    )

    user = get_current_user("raw-session", connection, SETTINGS)

    assert user["roles"] == ["patient"]


def test_role_incorreta_retorna_403():
    require_patient = require_roles("patient")
    doctor = {
        "user_id": 9,
        "display_name": "Dr. Marcos Nunes",
        "email": "marcos@example.com",
        "roles": ["doctor"],
    }

    with pytest.raises(HTTPException) as error:
        require_patient(doctor)

    assert error.value.status_code == 403
    assert error.value.detail == "Acesso não permitido para este perfil."


def test_role_permitida_preserva_identidade():
    require_patient = require_roles("patient")
    user = {
        "user_id": 42,
        "display_name": "Dra. Helena Costa",
        "email": "helena@example.com",
        "roles": ["patient", "doctor"],
    }

    assert require_patient(user) is user


def test_get_current_doctor_resolve_perfil_verificado_do_usuario():
    connection = ScriptedConnection(
        {
            "doctor_id": 5,
            "user_id": 42,
            "crm_number": "100001",
            "crm_state": "RN",
        }
    )

    doctor = get_current_doctor(
        user={"user_id": 42, "roles": ["doctor"]},
        connection=connection,
    )

    assert doctor["doctor_id"] == 5
    assert doctor["crm_number"] == "100001"
    assert "verification_status = 'verified'" in connection.executed[0][0]
    assert "professional_status = 'active'" in connection.executed[0][0]


def test_get_current_doctor_rejects_inconsistent_verified_profile():
    connection = ScriptedConnection(None)

    with pytest.raises(HTTPException) as error:
        get_current_doctor(
            user={"user_id": 42, "roles": ["doctor"]},
            connection=connection,
        )

    assert error.value.status_code == 409


def test_identidade_com_admin_nunca_recebe_role_clinica_efetiva():
    connection = ScriptedConnection(
        {
            "user_id": 9,
            "display_name": "Conta Inconsistente",
            "email": "inconsistente@example.com",
        },
        [{"role": "patient"}, {"role": "doctor"}, {"role": "admin"}],
    )

    user = get_current_user("raw-session", connection, SETTINGS)

    assert user["roles"] == ["admin"]
    assert len(connection.executed) == 3
    assert connection.executed[2][0].startswith("UPDATE sessions SET expires_at")


def test_doctor_suspenso_nao_recebe_role_profissional():
    connection = ScriptedConnection(
        {
            "user_id": 7,
            "display_name": "Dra. Paula Reis",
            "email": "paula@example.com",
        },
        [{"role": "doctor"}],
        {"verification_status": "verified", "professional_status": "suspended"},
    )

    user = get_current_user("raw-session", connection, SETTINGS)

    assert user["roles"] == []
