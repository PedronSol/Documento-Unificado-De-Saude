from typing import Any

from fastapi import HTTPException, status

from audit.service import record_clinical_event
from auth.dependencies import calculate_age
from models import GuardianData, ProvisionalPatientData, ProvisionalProfileUpdate
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


def _is_minor(birth_date) -> bool:
    return calculate_age(birth_date) < 18


def _insert_provisional_account(
    cursor: Any,
    *,
    doctor: dict,
    cpf: str,
    full_name: str,
    preferred_name: str,
    birth_date,
) -> int:
    cursor.execute(
        """
        INSERT INTO users (
            cpf, display_name, email, password_hash, active, claimed_at,
            provisioned_by_doctor_id
        ) VALUES (%s, %s, NULL, NULL, TRUE, NULL, %s)
        """,
        (cpf, full_name, doctor["doctor_id"]),
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
        (user_id, preferred_name, full_name, birth_date),
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
    return patient_id


def _resolve_guardian(cursor: Any, *, doctor: dict, guardian: GuardianData) -> dict:
    cursor.execute(
        """
        SELECT u.user_id, u.active, u.claimed_at, p.patient_id,
               EXISTS (
                   SELECT 1 FROM user_roles ur
                   WHERE ur.user_id = u.user_id AND ur.role = 'patient'
               ) AS is_patient,
               EXISTS (
                   SELECT 1 FROM user_roles ur
                   WHERE ur.user_id = u.user_id AND ur.role = 'admin'
               ) AS is_admin
        FROM users u
        LEFT JOIN patients p ON p.user_id = u.user_id
        WHERE u.cpf = %s
        """,
        (guardian.cpf,),
    )
    existing = cursor.fetchone()
    if existing is None:
        patient_id = _insert_provisional_account(
            cursor,
            doctor=doctor,
            cpf=guardian.cpf,
            full_name=guardian.full_name,
            preferred_name=guardian.full_name.split()[0][:20],
            birth_date=guardian.birth_date,
        )
        return {"patient_id": patient_id, "provisional": True}
    if (
        not existing["active"]
        or existing["claimed_at"] is None
        or not existing["is_patient"]
        or existing["is_admin"]
        or existing["patient_id"] is None
    ):
        raise _conflict("Responsável indisponível.")
    return {"patient_id": existing["patient_id"], "provisional": False}


def create_provisional_patient(
    cursor: Any,
    *,
    doctor: dict,
    cpf: str,
    data: ProvisionalPatientData,
    guardian: GuardianData | None = None,
) -> dict:
    minor = _is_minor(data.birth_date)
    if minor and guardian is None:
        raise _conflict("Paciente menor exige responsável.")
    resolved_guardian = (
        _resolve_guardian(cursor, doctor=doctor, guardian=guardian) if minor else None
    )
    patient_id = _insert_provisional_account(
        cursor,
        doctor=doctor,
        cpf=cpf,
        full_name=data.full_name,
        preferred_name=data.preferred_name,
        birth_date=data.birth_date,
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
    if not minor:
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

    cursor.execute(
        """
        INSERT INTO patient_guardianships (
            dependent_patient_id, guardian_patient_id, relationship, status,
            created_by_doctor_id
        ) VALUES (%s, %s, %s, 'pending', %s)
        """,
        (
            patient_id,
            resolved_guardian["patient_id"],
            guardian.relationship,
            doctor["doctor_id"],
        ),
    )
    guardianship_id = cursor.lastrowid
    record_clinical_event(
        cursor,
        actor_user_id=doctor["user_id"],
        patient_id=patient_id,
        action="guardianship.requested",
        resource_type="patient_guardianship",
        resource_id=guardianship_id,
        after_snapshot={"relationship": guardian.relationship},
    )
    if not resolved_guardian["provisional"]:
        return {"result": "provisional_created", "patient_id": patient_id, "claim": None}
    claim = issue_claim(
        cursor,
        patient_id=resolved_guardian["patient_id"],
        issued_by_user_id=doctor["user_id"],
        guardianship_id=guardianship_id,
    )
    return {
        "result": "provisional_created",
        "patient_id": patient_id,
        "claim": {**claim, "recipient": "guardian"},
    }


def issue_claim(
    cursor: Any,
    *,
    patient_id: int,
    issued_by_user_id: int,
    guardianship_id: int | None = None,
) -> dict:
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
            status, expires_at, guardianship_id
        ) VALUES (
            %s, %s, %s, %s, 'pending', UTC_TIMESTAMP(6) + INTERVAL %s DAY, %s
        )
        """,
        (
            "guardian" if guardianship_id else "self",
            patient_id,
            issued_by_user_id,
            hash_invitation_token(raw_token),
            CLAIM_DURATION_DAYS,
            guardianship_id,
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


def reissue_claim(cursor: Any, *, doctor: dict, patient_id: int) -> dict:
    patient = load_managed_provisional(
        cursor,
        doctor_id=doctor["doctor_id"],
        patient_id=patient_id,
    )
    if not _is_minor(patient["birth_date"]):
        claim = issue_claim(
            cursor,
            patient_id=patient_id,
            issued_by_user_id=doctor["user_id"],
        )
        return {**claim, "recipient": "patient"}
    cursor.execute(
        """
        SELECT g.guardianship_id, g.guardian_patient_id
        FROM patient_guardianships g
        JOIN patients gp ON gp.patient_id = g.guardian_patient_id
        JOIN users gu ON gu.user_id = gp.user_id
        WHERE g.dependent_patient_id = %s
          AND g.status = 'pending'
          AND gu.claimed_at IS NULL
          AND gu.provisioned_by_doctor_id = %s
        ORDER BY g.guardianship_id DESC
        LIMIT 1
        """,
        (patient_id, doctor["doctor_id"]),
    )
    guardianship = cursor.fetchone()
    if not guardianship:
        raise _conflict("O responsável aceitará a guarda no próprio login.")
    claim = issue_claim(
        cursor,
        patient_id=guardianship["guardian_patient_id"],
        issued_by_user_id=doctor["user_id"],
        guardianship_id=guardianship["guardianship_id"],
    )
    return {**claim, "recipient": "guardian"}


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


def lock_claim(
    cursor: Any,
    *,
    token: str,
    cpf: str,
    birth_date,
    dependent_birth_date=None,
) -> dict | None:
    """Returns the claim when token and identity data match; counts failures."""
    cursor.execute(
        """
        SELECT pc.patient_claim_id, pc.failed_attempts, pc.guardianship_id,
               p.patient_id, p.data_nascimento AS birth_date, u.user_id, u.cpf,
               u.claimed_at, g.dependent_patient_id,
               dependent.data_nascimento AS dependent_birth_date
        FROM patient_claims pc
        JOIN patients p ON p.patient_id = pc.account_patient_id
        JOIN users u ON u.user_id = p.user_id
        LEFT JOIN patient_guardianships g ON g.guardianship_id = pc.guardianship_id
        LEFT JOIN patients dependent ON dependent.patient_id = g.dependent_patient_id
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
    if (
        claim["cpf"] != cpf
        or claim["birth_date"] != birth_date
        or (
            claim["guardianship_id"] is not None
            and claim["dependent_birth_date"] != dependent_birth_date
        )
    ):
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
    if claim["guardianship_id"] is not None:
        cursor.execute(
            """
            UPDATE patient_guardianships
            SET status = 'active', accepted_at = UTC_TIMESTAMP(6),
                updated_at = UTC_TIMESTAMP(6)
            WHERE guardianship_id = %s AND status = 'pending'
            """,
            (claim["guardianship_id"],),
        )
        record_clinical_event(
            cursor,
            actor_user_id=claim["user_id"],
            patient_id=claim["dependent_patient_id"],
            action="guardianship.accepted",
            resource_type="patient_guardianship",
            resource_id=claim["guardianship_id"],
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
