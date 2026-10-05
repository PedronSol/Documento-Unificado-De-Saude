from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


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
