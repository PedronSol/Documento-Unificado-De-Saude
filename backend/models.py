from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


def _normalize_text(value: str) -> str:
    return " ".join(value.split())


def normalize_marker_name(value: str) -> str:
    return _normalize_text(value).casefold()


class VaccineBase(BaseModel):
    name: str = Field(max_length=100)
    dose: str = Field(max_length=50)
    administered_on: Optional[date] = None
    status: Literal["pending", "applied", "overdue"]

    @field_validator("name", "dose")
    @classmethod
    def texto_nao_vazio(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("O campo não pode ser vazio")
        return value


class VaccineCreateUpdate(VaccineBase):
    pass


class VaccineResponse(VaccineBase):
    vaccine_id: int


class MarkerBase(BaseModel):
    type: Literal["medication", "diagnosis", "condition", "allergy"]
    name: str = Field(max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    dosage: Optional[str] = Field(default=None, max_length=100)
    frequency: Optional[str] = Field(default=None, max_length=100)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_required_name(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        normalized = _normalize_text(value)
        if not normalized:
            raise ValueError("O campo não pode ser vazio")
        return normalized

    @field_validator("description", "dosage", "frequency", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not isinstance(value, str):
            return value
        return _normalize_text(value) or None

    @model_validator(mode="after")
    def validate_medication_fields(self):
        if self.type != "medication" and (
            self.dosage is not None or self.frequency is not None
        ):
            raise ValueError(
                "Dosagem e frequência são permitidas somente para medicação."
            )
        return self


class MarkerCreateUpdate(MarkerBase):
    pass


class MarkerAuditSnapshot(MarkerBase):
    status: Literal["active", "removed"]


class MarkerResponse(MarkerBase):
    marker_id: int
    status: Literal["active", "removed"]
    created_at: datetime
    updated_at: datetime
    removed_at: Optional[datetime] = None


class AlertResponse(BaseModel):
    alert_id: int
    type: Literal["condition", "medication", "allergy"]
    title: str
    description: str
    severity: Literal["low", "medium", "high"]


class DocumentSummary(BaseModel):
    document_id: int
    title: str
    type: str
    created_on: date
    status: Literal["viewed", "new"]


class UserIdentity(BaseModel):
    user_id: int
    display_name: str
    email: str
    roles: List[Literal["patient", "doctor", "admin"]]


class AuthenticationResponse(BaseModel):
    user: UserIdentity


class PatientProfileResponse(BaseModel):
    preferred_name: str
    full_name: str
    avatar_url: Optional[str] = None
    health_status: Literal["updated", "pending", "overdue"]
    blood_type: str
    is_adult: bool
    age: int


class CurrentUserProfileResponse(BaseModel):
    user: UserIdentity
    patient_profile: Optional[PatientProfileResponse]
