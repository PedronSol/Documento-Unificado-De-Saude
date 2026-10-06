import json
from collections.abc import Mapping
from typing import Any

from models import VaccineBase


def serialize_vaccine_snapshot(vaccine: VaccineBase | Mapping[str, Any]) -> dict:
    if isinstance(vaccine, VaccineBase):
        validated = vaccine
    else:
        validated = VaccineBase.model_validate(vaccine)
    return validated.model_dump(mode="json")


def record_clinical_event(
    cursor: Any,
    *,
    actor_user_id: int,
    patient_id: int,
    action: str,
    resource_type: str,
    resource_id: int,
    before_snapshot: dict | None = None,
    after_snapshot: dict | None = None,
) -> None:
    cursor.execute(
        """
        INSERT INTO clinical_audit_events (
            actor_type, actor_user_id, patient_id, action, resource_type,
            resource_id, before_snapshot, after_snapshot, occurred_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, UTC_TIMESTAMP(6))
        """,
        (
            "user",
            actor_user_id,
            patient_id,
            action,
            resource_type,
            resource_id,
            _serialize_snapshot(before_snapshot),
            _serialize_snapshot(after_snapshot),
        ),
    )


def _serialize_snapshot(snapshot: dict | None) -> str | None:
    if snapshot is None:
        return None
    return json.dumps(snapshot, ensure_ascii=False, sort_keys=True)
