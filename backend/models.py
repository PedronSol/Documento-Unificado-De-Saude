from datetime import date, datetime
import re
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _normalize_text(value: str) -> str:
    return " ".join(value.split())


def normalize_marker_name(value: str) -> str:
    return _normalize_text(value).casefold()


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _is_valid_cpf(value: str) -> bool:
    if len(value) != 11 or len(set(value)) == 1:
        return False

    def check_digit(partial: str, weight: int) -> int:
        factors = range(weight, 1, -1)
        total = sum(
            int(digit) * factor
            for digit, factor in zip(partial, factors)
        )
        remainder = total % 11
        return 0 if remainder < 2 else 11 - remainder

    first = check_digit(value[:9], 10)
    second = check_digit(f"{value[:9]}{first}", 11)
    return value[-2:] == f"{first}{second}"


def _normalize_cpf(value: str) -> str:
    return "".join(character for character in value if character in "0123456789")


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


class HealthShareMetadataResponse(BaseModel):
    share_id: int
    created_at: datetime
    expires_at: datetime


class HealthShareCreatedResponse(HealthShareMetadataResponse):
    share_url: str


class PublicPatientSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preferred_name: str
    blood_type: Optional[str] = None


class PublicMarkerSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: Optional[str] = None


class PublicMedicationSummary(PublicMarkerSummary):
    dosage: Optional[str] = None
    frequency: Optional[str] = None


class PublicMarkerGroups(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allergies: List[PublicMarkerSummary]
    medications: List[PublicMedicationSummary]
    conditions: List[PublicMarkerSummary]
    diagnoses: List[PublicMarkerSummary]


class PublicHealthSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expires_at: datetime
    patient: PublicPatientSummary
    markers: PublicMarkerGroups


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


class GoogleCredential(BaseModel):
    model_config = ConfigDict(extra="forbid")

    credential: str = Field(min_length=1, max_length=8192)


class GoogleOnboardingResponse(BaseModel):
    status: Literal["onboarding_required"]


class GooglePatientRegistration(GoogleCredential):
    cpf: str
    preferred_name: str = Field(max_length=20)
    birth_date: date

    @field_validator("cpf", mode="before")
    @classmethod
    def normalize_google_cpf(cls, value):
        if isinstance(value, str):
            return _normalize_cpf(value)
        return value

    @field_validator("cpf")
    @classmethod
    def validate_google_cpf(cls, value: str) -> str:
        if not _is_valid_cpf(value):
            raise ValueError("Informe um CPF válido.")
        return value

    @field_validator("preferred_name", mode="before")
    @classmethod
    def normalize_google_preferred_name(cls, value):
        if isinstance(value, str):
            return _normalize_text(value)
        return value

    @field_validator("preferred_name")
    @classmethod
    def validate_google_preferred_name(cls, value: str) -> str:
        if not value:
            raise ValueError("O nome não pode ser vazio.")
        return value

    @field_validator("birth_date")
    @classmethod
    def validate_google_birth_date(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("A data de nascimento não pode estar no futuro.")
        return value


class PatientRegistration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(max_length=254)
    password: str = Field(min_length=12, max_length=128)
    cpf: str
    display_name: str = Field(max_length=100)
    preferred_name: str = Field(max_length=20)
    birth_date: date

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        if isinstance(value, str):
            return value.strip().casefold()
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if not EMAIL_PATTERN.fullmatch(value):
            raise ValueError("Informe um e-mail válido.")
        return value

    @field_validator("cpf", mode="before")
    @classmethod
    def normalize_cpf(cls, value):
        if isinstance(value, str):
            return _normalize_cpf(value)
        return value

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, value: str) -> str:
        if not _is_valid_cpf(value):
            raise ValueError("Informe um CPF válido.")
        return value

    @field_validator("display_name", "preferred_name", mode="before")
    @classmethod
    def normalize_registration_name(cls, value):
        if isinstance(value, str):
            return _normalize_text(value)
        return value

    @field_validator("display_name", "preferred_name")
    @classmethod
    def validate_registration_name(cls, value: str) -> str:
        if not value:
            raise ValueError("O nome não pode ser vazio.")
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A senha não pode conter apenas espaços.")
        return value

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("A data de nascimento não pode estar no futuro.")
        return value


class PatientProfileResponse(BaseModel):
    preferred_name: str
    full_name: str
    avatar_url: Optional[str] = None
    health_status: Literal["updated", "pending", "overdue"]
    blood_type: Optional[str] = None
    is_adult: bool
    age: int


class MedicalPatientSummary(BaseModel):
    patient_id: int
    preferred_name: str
    full_name: str
    avatar_url: Optional[str] = None
    health_status: Literal["updated", "pending", "overdue"]
    age: int


class MedicalPatientProfile(MedicalPatientSummary):
    blood_type: Optional[str] = None


class MedicalMarkerTimeline(BaseModel):
    active: List[MarkerResponse]
    removed: List[MarkerResponse]


class MedicalRecordResponse(BaseModel):
    patient: MedicalPatientProfile
    vaccines: List[VaccineResponse]
    markers: MedicalMarkerTimeline


class CurrentUserProfileResponse(BaseModel):
    user: UserIdentity
    patient_profile: Optional[PatientProfileResponse]


class OwnProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: Optional[str] = Field(default=None, max_length=100)
    preferred_name: Optional[str] = Field(default=None, max_length=20)

    @field_validator("display_name", "preferred_name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("display_name", "preferred_name")
    @classmethod
    def reject_empty_name(cls, value):
        if value is not None and not value:
            raise ValueError("O nome não pode ser vazio.")
        return value

    @model_validator(mode="after")
    def validate_requested_fields(self):
        if not self.model_fields_set:
            raise ValueError("Informe ao menos um campo para atualizar.")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("O nome não pode ser nulo.")
        return self
