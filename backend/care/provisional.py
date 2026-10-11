from typing import Any

from fastapi import HTTPException, status

from audit.service import record_clinical_event
from auth.dependencies import calculate_age
from models import ProvisionalPatientData, ProvisionalProfileUpdate
from security import create_invitation_token, hash_invitation_token, hash_password


CLAIM_DURATION_DAYS = 7
MAX_CLAIM_ATTEMPTS = 5


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Recurso não encontrado.",
    )


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def require_adult_provisional(birth_date) -> None:
    if calculate_age(birth_date) < 18:
        raise _conflict("Paciente menor exige responsável.")


def create_provisional_patient(
    cursor: Any,
    *,
    doctor: dict,
    cpf: str,
    data: ProvisionalPatientData,
) -> dict:
    require_adult_provisional(data.birth_date)
    cursor.execute(
        """
        INSERT INTO users (
            cpf, display_name, email, password_hash, active, claimed_at,
            provisioned_by_doctor_id
        ) VALUES (%s, %s, NULL, NULL, TRUE, NULL, %s)
        """,
        (cpf, data.full_name, doctor["doctor_id"]),
    )
    user_id = cursor.lastrowid
    cursor.execute(
        "INSERT INTO user_roles (user_id, role) VALUES (%s, 'patient')",
        (user_id,),
    )
    cursor.execute(
        """
        INSERT INTO patients (
            user_id, nome_paciente, nome_completo, status_saude, data_nascimento
        ) VALUES (%s, %s, %s, 'pending', %s)
        """,
        (user_id, data.preferred_name, data.full_name, data.birth_date),
    )
    patient_id = cursor.lastrowid
    record_clinical_event(
        cursor,
        actor_user_id=doctor["user_id"],
        patient_id=patient_id,
        action="patient.provisioned",
        resource_type="patient",
        resource_id=patient_id,
    )
    cursor.execute(
        """
        INSERT INTO doctor_patient_links (
            doctor_id, patient_id, origin, status, decided_at
        ) VALUES (%s, %s, 'provisional', 'active', UTC_TIMESTAMP(6))
        """,
        (doctor["doctor_id"], patient_id),
    )
    record_clinical_event(
        cursor,
        actor_user_id=doctor["user_id"],
        patient_id=patient_id,
        action="care_link.direct_provisioned",
        resource_type="doctor_patient_link",
        resource_id=cursor.lastrowid,
    )
    claim = issue_claim(
        cursor,
        patient_id=patient_id,
        issued_by_user_id=doctor["user_id"],
    )
    return {
        "result": "provisional_created",
        "patient_id": patient_id,
        "claim": {**claim, "recipient": "patient"},
    }


def issue_claim(cursor: Any, *, patient_id: int, issued_by_user_id: int) -> dict:
    cursor.execute(
        """
        UPDATE patient_claims SET status = 'revoked'
        WHERE account_patient_id = %s AND status = 'pending'
        """,
        (patient_id,),
    )
    raw_token = create_invitation_token()
    cursor.execute(
        """
        INSERT INTO patient_claims (
            claim_type, account_patient_id, issued_by_user_id, token_hash,
            status, expires_at
        ) VALUES (
            'self', %s, %s, %s, 'pending', UTC_TIMESTAMP(6) + INTERVAL %s DAY
        )
        """,
        (
            patient_id,
            issued_by_user_id,
            hash_invitation_token(raw_token),
            CLAIM_DURATION_DAYS,
        ),
    )
    claim_id = cursor.lastrowid
    record_clinical_event(
        cursor,
        actor_user_id=issued_by_user_id,
        patient_id=patient_id,
        action="patient_claim.issued",
        resource_type="patient_claim",
        resource_id=claim_id,
    )
    cursor.execute(
        "SELECT expires_at FROM patient_claims WHERE patient_claim_id = %s",
        (claim_id,),
    )
    return {"token": raw_token, "expires_at": cursor.fetchone()["expires_at"]}


def load_managed_provisional(cursor: Any, *, doctor_id: int, patient_id: int) -> dict:
    cursor.execute(
        """
        SELECT p.patient_id, p.data_nascimento AS birth_date, u.user_id
        FROM patients p
        JOIN users u ON u.user_id = p.user_id
        WHERE p.patient_id = %s
          AND u.provisioned_by_doctor_id = %s
          AND u.claimed_at IS NULL
        FOR UPDATE
        """,
        (patient_id, doctor_id),
    )
    patient = cursor.fetchone()
    if not patient:
        raise _not_found()
    return patient


def correct_provisional_profile(
    cursor: Any,
    *,
    doctor: dict,
    patient_id: int,
    correction: ProvisionalProfileUpdate,
) -> None:
    patient = load_managed_provisional(
        cursor,
        doctor_id=doctor["doctor_id"],
        patient_id=patient_id,
    )
    if correction.birth_date is not None and (
        (calculate_age(correction.birth_date) < 18)
        != (calculate_age(patient["birth_date"]) < 18)
    ):
        raise _conflict("A correção não pode mudar a faixa etária do paciente.")
    cursor.execute(
        """
        UPDATE patients
        SET nome_completo = COALESCE(%s, nome_completo),
            nome_paciente = COALESCE(%s, nome_paciente),
            data_nascimento = COALESCE(%s, data_nascimento)
        WHERE patient_id = %s
        """,
        (
            correction.full_name,
            correction.preferred_name,
            correction.birth_date,
            patient_id,
        ),
    )
    if correction.full_name is not None:
        cursor.execute(
            "UPDATE users SET display_name = %s WHERE user_id = %s",
            (correction.full_name, patient["user_id"]),
        )
    record_clinical_event(
        cursor,
        actor_user_id=doctor["user_id"],
        patient_id=patient_id,
        action="patient.provisional_corrected",
        resource_type="patient",
        resource_id=patient_id,
        after_snapshot=correction.model_dump(mode="json", exclude_none=True),
    )


def lock_claim(cursor: Any, *, token: str, cpf: str, birth_date) -> dict | None:
    """Returns the claim when token and identity data match; counts failures."""
    cursor.execute(
        """
        SELECT pc.patient_claim_id, pc.failed_attempts, p.patient_id,
               p.data_nascimento AS birth_date, u.user_id, u.cpf, u.claimed_at
        FROM patient_claims pc
        JOIN patients p ON p.patient_id = pc.account_patient_id
        JOIN users u ON u.user_id = p.user_id
        WHERE pc.token_hash = %s
          AND pc.status = 'pending'
          AND pc.expires_at > UTC_TIMESTAMP(6)
        FOR UPDATE
        """,
        (hash_invitation_token(token),),
    )
    claim = cursor.fetchone()
    if not claim or claim["claimed_at"] is not None:
        return None
    if claim["cpf"] != cpf or claim["birth_date"] != birth_date:
        cursor.execute(
            """
            UPDATE patient_claims
            SET status = IF(failed_attempts + 1 >= %s, 'revoked', status),
                failed_attempts = failed_attempts + 1
            WHERE patient_claim_id = %s
            """,
            (MAX_CLAIM_ATTEMPTS, claim["patient_claim_id"]),
        )
        return None
    return claim


def complete_local_claim(cursor: Any, *, claim: dict, email: str, password: str) -> None:
    cursor.execute("SELECT 1 FROM users WHERE email = %s", (email,))
    if cursor.fetchone():
        raise _conflict("E-mail ou conta Google já utilizados.")
    cursor.execute(
        """
        UPDATE users
        SET email = %s, password_hash = %s, claimed_at = UTC_TIMESTAMP(6)
        WHERE user_id = %s
        """,
        (email, hash_password(password), claim["user_id"]),
    )
    _finish_claim(cursor, claim=claim, method="local")


def complete_google_claim(cursor: Any, *, claim: dict, external_identity: dict) -> None:
    cursor.execute(
        """
        SELECT 1 FROM external_identities WHERE issuer = %s AND subject = %s
        UNION ALL
        SELECT 1 FROM users WHERE email = %s
        """,
        (
            external_identity["issuer"],
            external_identity["subject"],
            external_identity["email"],
        ),
    )
    if cursor.fetchall():
        raise _conflict("E-mail ou conta Google já utilizados.")
    cursor.execute(
        "UPDATE users SET email = %s, claimed_at = UTC_TIMESTAMP(6) WHERE user_id = %s",
        (external_identity["email"], claim["user_id"]),
    )
    cursor.execute(
        """
        INSERT INTO external_identities (user_id, provider, issuer, subject)
        VALUES (%s, 'google', %s, %s)
        """,
        (claim["user_id"], external_identity["issuer"], external_identity["subject"]),
    )
    _finish_claim(cursor, claim=claim, method="google")


def _finish_claim(cursor: Any, *, claim: dict, method: str) -> None:
    cursor.execute(
        """
        UPDATE patient_claims
        SET status = 'claimed', claimed_at = UTC_TIMESTAMP(6)
        WHERE patient_claim_id = %s
        """,
        (claim["patient_claim_id"],),
    )
    record_clinical_event(
        cursor,
        actor_user_id=claim["user_id"],
        patient_id=claim["patient_id"],
        action="patient.account_claimed",
        resource_type="patient",
        resource_id=claim["patient_id"],
        after_snapshot={"authentication_method": method},
    )
