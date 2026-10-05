import pytest
from pydantic import ValidationError
from models import AlertResponse, VaccineResponse
from datetime import date

def test_criar_vacina_valida():
    dados = {
        "vaccine_id": 10,
        "name": "Tríplice Viral",
        "dose": "Reforço",
        "administered_on": date(2026, 5, 31),
        "status": "applied"
    }
    vacina = VaccineResponse(**dados)
    assert vacina.name == "Tríplice Viral"
    assert vacina.status == "applied"

def test_erro_nome_vacina_vazio():
    with pytest.raises(ValidationError):
        VaccineResponse(
            vaccine_id=11,
            name="   ",
            dose="1ª Dose",
            status="pending"
        )

def test_erro_id_vacina_invalido():
    with pytest.raises(ValidationError):
        VaccineResponse(
            vaccine_id="texto_invalido",
            name="BCG",
            dose="Dose Única",
            status="applied"
        )

def test_criar_alerta_valido():
    alerta = AlertResponse(
        alert_id=1,
        type="allergy",
        title="Alergia a Sulfa",
        description="Erupções cutâneas graves.",
        severity="high"
    )
    assert alerta.title == "Alergia a Sulfa"
