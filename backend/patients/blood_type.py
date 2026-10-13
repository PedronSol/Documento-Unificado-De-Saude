from typing import Any

from fastapi import HTTPException, status

from audit.service import record_clinical_event


def update_blood_type(
    cursor: Any,
    *,
    patient_id: int,
    blood_type: str,
    source: str,
    actor_user_id: int,
) -> dict:
    cursor.execute(
        """
        SELECT tipo_sanguineo AS blood_type,
               tipo_sanguineo_origem AS blood_type_source
        FROM patients WHERE patient_id = %s FOR UPDATE
        """,
        (patient_id,),
    )
    current = cursor.fetchone()
    if current is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Perfil de paciente inconsistente.",
        )
    before = {
        "blood_type": current["blood_type"],
        "blood_type_source": current["blood_type_source"],
    }
    if source != "doctor" and before["blood_type_source"] == "doctor":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tipo sanguíneo registrado pelo médico responsável.",
        )
    after = {"blood_type": blood_type, "blood_type_source": source}
    if after == before:
        return after

    cursor.execute(
        """
        UPDATE patients SET tipo_sanguineo = %s, tipo_sanguineo_origem = %s
        WHERE patient_id = %s
        """,
        (blood_type, source, patient_id),
    )
    record_clinical_event(
        cursor,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
        action="patient.blood_type_updated",
        resource_type="patient",
        resource_id=patient_id,
        before_snapshot=before,
        after_snapshot=after,
    )
    return after
