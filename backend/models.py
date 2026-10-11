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
    account_status: Literal["active", "provisional"]
    manages_provisional: bool


class MedicalMarkerTimeline(BaseModel):
    active: List[MarkerResponse]
    removed: List[MarkerResponse]


class MedicalRecordResponse(BaseModel):
    patient: MedicalPatientProfile
    vaccines: List[VaccineResponse]
    markers: MedicalMarkerTimeline


class DependentProfile(BaseModel):
    patient_id: int
    guardianship_id: int
    has_own_access: bool
    preferred_name: str
    full_name: str
    avatar_url: Optional[str] = None
    health_status: Literal["updated", "pending", "overdue"]
    blood_type: Optional[str] = None
    is_adult: bool
    age: int


class CurrentUserProfileResponse(BaseModel):
    user: UserIdentity
    patient_profile: Optional[PatientProfileResponse]
    dependents: List[DependentProfile] = []


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


BRAZILIAN_STATES = frozenset(
    "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split()
)
CRM_NUMBER_PATTERN = re.compile(r"^[0-9]{4,10}$")


class DoctorInvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cpf: str
    display_name: str = Field(min_length=3, max_length=100)
    email: str = Field(max_length=254)
    crm_number: str
    crm_state: str

    @field_validator("cpf", mode="before")
    @classmethod
    def normalize_invitation_cpf(cls, value):
        if isinstance(value, str):
            return _normalize_cpf(value)
        return value

    @field_validator("cpf")
    @classmethod
    def validate_invitation_cpf(cls, value: str) -> str:
        if not _is_valid_cpf(value):
            raise ValueError("Informe um CPF válido.")
        return value

    @field_validator("display_name", mode="before")
    @classmethod
    def normalize_invitation_name(cls, value):
        if isinstance(value, str):
            return _normalize_text(value)
        return value

    @field_validator("email", mode="before")
    @classmethod
    def normalize_invitation_email(cls, value):
        if isinstance(value, str):
            return value.strip().casefold()
        return value

    @field_validator("email")
    @classmethod
    def validate_invitation_email(cls, value: str) -> str:
        if not EMAIL_PATTERN.fullmatch(value):
            raise ValueError("Informe um e-mail válido.")
        return value

    @field_validator("crm_number")
    @classmethod
    def validate_invitation_crm_number(cls, value: str) -> str:
        return _validate_crm_number(value)

    @field_validator("crm_state", mode="before")
    @classmethod
    def normalize_invitation_crm_state(cls, value):
        if isinstance(value, str):
            return value.strip().upper()
        return value

    @field_validator("crm_state")
    @classmethod
    def validate_invitation_crm_state(cls, value: str) -> str:
        return _validate_crm_state(value)


def _validate_crm_number(value: str) -> str:
    if not CRM_NUMBER_PATTERN.fullmatch(value):
        raise ValueError("Informe um CRM com 4 a 10 dígitos.")
    return value


def _validate_crm_state(value: str) -> str:
    if value not in BRAZILIAN_STATES:
        raise ValueError("Informe uma UF válida.")
    return value


class DoctorInvitationCreatedResponse(BaseModel):
    invitation_id: int
    status: Literal["pending"]
    expires_at: datetime
    token: str


class AdminAccountCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(max_length=254)
    cpf: str
    display_name: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_admin_email(cls, value):
        if isinstance(value, str):
            return value.strip().casefold()
        return value

    @field_validator("email")
    @classmethod
    def validate_admin_email(cls, value: str) -> str:
        if not EMAIL_PATTERN.fullmatch(value):
            raise ValueError("Informe um e-mail válido.")
        return value

    @field_validator("cpf", mode="before")
    @classmethod
    def normalize_admin_cpf(cls, value):
        if isinstance(value, str):
            return _normalize_cpf(value)
        return value

    @field_validator("cpf")
    @classmethod
    def validate_admin_cpf(cls, value: str) -> str:
        if not _is_valid_cpf(value):
            raise ValueError("Informe um CPF válido.")
        return value

    @field_validator("display_name", mode="before")
    @classmethod
    def normalize_admin_name(cls, value):
        if isinstance(value, str):
            return _normalize_text(value)
        return value

    @field_validator("password")
    @classmethod
    def validate_admin_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A senha não pode conter apenas espaços.")
        return value


class DoctorInvitationSummary(BaseModel):
    invitation_id: int
    display_name: str
    email: str
    crm_number: str
    crm_state: str
    status: Literal["pending", "accepted", "revoked", "expired"]
    expires_at: datetime


class DoctorInvitationPage(BaseModel):
    items: List[DoctorInvitationSummary]
    page: int
    has_next: bool


class DoctorInvitationClaim(GoogleCredential):
    invitation_token: str = Field(min_length=43, max_length=64)


class AdminDoctor(BaseModel):
    doctor_id: int
    display_name: str
    masked_cpf: str
    crm_number: str
    crm_state: str
    verification_status: Literal["pending", "verified", "rejected"]
    professional_status: Literal["active", "suspended", "deactivated"]
    verified_at: Optional[datetime] = None


class AdminDoctorPage(BaseModel):
    items: List[AdminDoctor]
    page: int
    has_next: bool


class DoctorCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    crm_number: str
    crm_state: str

    @field_validator("crm_number")
    @classmethod
    def validate_correction_crm_number(cls, value: str) -> str:
        return _validate_crm_number(value)

    @field_validator("crm_state", mode="before")
    @classmethod
    def normalize_correction_crm_state(cls, value):
        if isinstance(value, str):
            return value.strip().upper()
        return value

    @field_validator("crm_state")
    @classmethod
    def validate_correction_crm_state(cls, value: str) -> str:
        return _validate_crm_state(value)


class DoctorStatusChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["verify", "reject", "suspend", "reactivate", "deactivate"]


class CareGroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=3, max_length=100)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_group_name(cls, value):
        if isinstance(value, str):
            return _normalize_text(value)
        return value


class CareGroupUpdate(CareGroupCreate):
    name: Optional[str] = Field(default=None, min_length=3, max_length=100)
    status: Optional[Literal["active", "inactive"]] = None

    @model_validator(mode="after")
    def require_change(self):
        if self.name is None and self.status is None:
            raise ValueError("Informe ao menos um campo.")
        return self


class AdminCareGroup(BaseModel):
    care_group_id: int
    name: str
    status: Literal["active", "inactive"]


class AdminCareGroupPage(BaseModel):
    items: List[AdminCareGroup]
    page: int
    has_next: bool


class AdminGroupPatient(BaseModel):
    user_id: int
    display_name: str
    masked_cpf: str
    link_status: Literal["active"]
    starts_at: datetime


class AdminPendingCareInvitation(BaseModel):
    invitation_id: int
    user_id: int
    display_name: str
    expires_at: datetime


class AdminCareGroupDetail(AdminCareGroup):
    doctors: List[AdminDoctor]
    patients: List[AdminGroupPatient]
    pending_invitations: List[AdminPendingCareInvitation]


class DirectoryUser(BaseModel):
    user_id: int
    display_name: str
    profiles: List[Literal["patient", "doctor"]]
    masked_cpf: str


class DirectoryPage(BaseModel):
    items: List[DirectoryUser]
    page: int
    has_next: bool


class CareInvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: int = Field(gt=0)


class CareInvitationCreatedResponse(BaseModel):
    invitation_id: int
    status: Literal["pending"]
    expires_at: datetime


class CareTeamDoctor(BaseModel):
    display_name: str
    crm_number: str
    crm_state: str


class PatientCareInvitation(BaseModel):
    invitation_id: int
    care_group_name: str
    expires_at: datetime
    doctors: List[CareTeamDoctor]


class PatientCareGroup(BaseModel):
    care_group_id: int
    name: str
    starts_at: datetime
    doctors: List[CareTeamDoctor]


class AdministrativeAuditEvent(BaseModel):
    event_id: int
    actor_user_id: int
    action: str
    target_type: str
    target_id: int
    details: Optional[dict] = None
    occurred_at: datetime


class AdministrativeAuditPage(BaseModel):
    items: List[AdministrativeAuditEvent]
    page: int
    has_next: bool


class ProvisionalPatientData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=3, max_length=100)
    preferred_name: str = Field(min_length=1, max_length=20)
    birth_date: date

    @field_validator("full_name", "preferred_name", mode="before")
    @classmethod
    def normalize_provisional_names(cls, value):
        if isinstance(value, str):
            return _normalize_text(value)
        return value

    @field_validator("birth_date")
    @classmethod
    def validate_provisional_birth_date(cls, value: date) -> date:
        return _validate_past_birth_date(value)


def _validate_past_birth_date(value: date) -> date:
    if value > date.today():
        raise ValueError("A data de nascimento não pode estar no futuro.")
    return value


class GuardianData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cpf: str
    full_name: str = Field(min_length=3, max_length=100)
    birth_date: date
    relationship: Literal["parent", "legal_guardian"]

    @field_validator("cpf", mode="before")
    @classmethod
    def normalize_guardian_cpf(cls, value):
        if isinstance(value, str):
            return _normalize_cpf(value)
        return value

    @field_validator("cpf")
    @classmethod
    def validate_guardian_cpf(cls, value: str) -> str:
        if not _is_valid_cpf(value):
            raise ValueError("Informe um CPF válido.")
        return value

    @field_validator("full_name", mode="before")
    @classmethod
    def normalize_guardian_name(cls, value):
        if isinstance(value, str):
            return _normalize_text(value)
        return value

    @field_validator("birth_date")
    @classmethod
    def validate_guardian_birth_date(cls, value: date) -> date:
        today = date.today()
        age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
        if age < 18:
            raise ValueError("O responsável precisa ser maior de idade.")
        return value


class PatientLinkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cpf: str
    patient: Optional[ProvisionalPatientData] = None
    guardian: Optional[GuardianData] = None

    @model_validator(mode="after")
    def guardian_differs_from_patient(self):
        if self.guardian is not None and self.guardian.cpf == self.cpf:
            raise ValueError("O responsável deve ter outro CPF.")
        return self

    @field_validator("cpf", mode="before")
    @classmethod
    def normalize_link_cpf(cls, value):
        if isinstance(value, str):
            return _normalize_cpf(value)
        return value

    @field_validator("cpf")
    @classmethod
    def validate_link_cpf(cls, value: str) -> str:
        if not _is_valid_cpf(value):
            raise ValueError("Informe um CPF válido.")
        return value


class PatientLinkRequested(BaseModel):
    result: Literal["request_sent"]
    link_id: int
    claim: Optional["ProvisionalClaimIssued"] = None


class DoctorPendingLink(BaseModel):
    link_id: int
    patient_display_name: str
    masked_cpf: str
    expires_at: datetime


class PatientCareRequest(BaseModel):
    link_id: int
    doctor_display_name: str
    crm_number: str
    crm_state: str
    expires_at: datetime


class PatientCareDoctor(BaseModel):
    link_id: int
    doctor_display_name: str
    crm_number: str
    crm_state: str
    since: datetime


class ProvisionalClaimIssued(BaseModel):
    token: str
    expires_at: datetime
    recipient: Literal["patient", "guardian"]


class ProvisionalPatientCreated(BaseModel):
    result: Literal["provisional_created"]
    patient_id: int
    claim: Optional[ProvisionalClaimIssued]


class ClaimLinkIssued(ProvisionalClaimIssued):
    pass


class ProvisionalProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: Optional[str] = Field(default=None, min_length=3, max_length=100)
    preferred_name: Optional[str] = Field(default=None, min_length=1, max_length=20)
    birth_date: Optional[date] = None

    @field_validator("full_name", "preferred_name", mode="before")
    @classmethod
    def normalize_correction_names(cls, value):
        if isinstance(value, str):
            return _normalize_text(value)
        return value

    @field_validator("birth_date")
    @classmethod
    def validate_correction_birth_date(cls, value: Optional[date]) -> Optional[date]:
        return None if value is None else _validate_past_birth_date(value)

    @model_validator(mode="after")
    def require_correction(self):
        if self.full_name is None and self.preferred_name is None and self.birth_date is None:
            raise ValueError("Informe ao menos um campo.")
        return self


class PatientClaimBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=43, max_length=64)
    cpf: str
    birth_date: date
    dependent_birth_date: Optional[date] = None

    @field_validator("cpf", mode="before")
    @classmethod
    def normalize_claim_cpf(cls, value):
        if isinstance(value, str):
            return _normalize_cpf(value)
        return value


class PatientClaimLocal(PatientClaimBase):
    email: str = Field(max_length=254)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_claim_email(cls, value):
        if isinstance(value, str):
            return value.strip().casefold()
        return value

    @field_validator("email")
    @classmethod
    def validate_claim_email(cls, value: str) -> str:
        if not EMAIL_PATTERN.fullmatch(value):
            raise ValueError("Informe um e-mail válido.")
        return value

    @field_validator("password")
    @classmethod
    def validate_claim_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A senha não pode conter apenas espaços.")
        return value


class PatientClaimGoogle(PatientClaimBase):
    credential: str = Field(min_length=1, max_length=8192)


class PendingGuardianship(BaseModel):
    guardianship_id: int
    dependent_full_name: str
    dependent_preferred_name: str
    relationship: Literal["parent", "legal_guardian"]
    requested_by: Optional[str] = None


class GuardianshipAcceptance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dependent_birth_date: date


class MyGuardian(BaseModel):
    guardianship_id: int
    guardian_display_name: str
    relationship: Literal["parent", "legal_guardian"]
    status: Literal["active", "pending"]
    awaiting_my_confirmation: bool


PatientLinkRequested.model_rebuild()
