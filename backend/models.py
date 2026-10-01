from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class VaccineBase(BaseModel):
    nome_vacina: str = Field(max_length=100)
    dose: str = Field(max_length=50)
    data_aplicacao: Optional[date] = None
    status_vacina: Literal["pending", "applied", "overdue"]

    @field_validator("nome_vacina", "dose")
    @classmethod
    def texto_nao_vazio(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("O campo não pode ser vazio")
        return value


class Vaccine(VaccineBase):
    id_vacina: int


class VaccineCreateUpdate(VaccineBase):
    pass


class Alert(BaseModel):
    id_alerta: int
    tipo_alerta: Literal["condition", "medication", "allergy"]
    titulo_alerta: str
    descricao_alerta: str
    severidade_alerta: Literal["low", "medium", "high"]


class Document(BaseModel):
    id_documento: int
    titulo_documento: str
    tipo_documento: str
    data_criacao_documento: date
    status_documento: Literal["viewed", "new"]


class PatientProfile(BaseModel):
    cpf_paciente: str
    nome_paciente: str
    nome_completo: str
    email: str
    avatar: Optional[str] = None
    status_saude: Literal["updated", "pending", "overdue"]
    tipo_sanguineo: str
    valor_qr: Optional[str] = None
    maior_de_idade: bool
    idade: int


class LoginResponse(BaseModel):
    message: str
    patient_data: PatientProfile
    vaccines: List[Vaccine]
    alerts: List[Alert]
    documents: List[Document]
