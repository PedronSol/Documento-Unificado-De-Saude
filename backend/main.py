from datetime import date, datetime, timedelta, timezone
import logging
import os
from typing import List, Optional

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
import mysql.connector

from models import LoginResponse, Vaccine, VaccineCreateUpdate
from security import create_session_token, hash_session_token, verify_password


logger = logging.getLogger(__name__)

SESSION_COOKIE = "dus_session"
SESSION_DURATION_HOURS = int(os.getenv("SESSION_DURATION_HOURS", "8"))
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

app = FastAPI(title="Documento Unificado de Saúde")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def get_db_connection():
    try:
        return mysql.connector.connect(
            host=os.getenv("DB_HOST", "db"),
            port=int(os.getenv("DB_PORT", "3306")),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", "root"),
            database=os.getenv("DB_NAME", "passaporte_saude"),
            charset="utf8mb4",
        )
    except mysql.connector.Error as error:
        logger.exception("Falha ao conectar ao banco de dados")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Banco de dados indisponível.",
        ) from error


def calculate_age(birth_date: date) -> int:
    today = date.today()
    return today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )


def serialize_patient(patient: dict) -> dict:
    patient = dict(patient)
    age = calculate_age(patient.pop("data_nascimento"))
    patient.pop("senha_hash", None)
    patient.pop("criado_em", None)
    patient["idade"] = age
    patient["maior_de_idade"] = age >= 18
    return patient


def fetch_dashboard(cpf_paciente: str, message: str) -> dict:
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM pacientes WHERE cpf_paciente = %s", (cpf_paciente,)
        )
        patient = cursor.fetchone()
        if not patient:
            raise HTTPException(status_code=404, detail="Paciente não encontrado.")

        cursor.execute(
            """
            SELECT id_vacina, nome_vacina, dose, data_aplicacao, status_vacina
            FROM vacinas WHERE paciente_id = %s
            """,
            (cpf_paciente,),
        )
        vaccines = cursor.fetchall()

        cursor.execute(
            """
            SELECT id_alerta, tipo_alerta, titulo_alerta, descricao_alerta,
                   severidade_alerta
            FROM alertas WHERE paciente_id = %s
            """,
            (cpf_paciente,),
        )
        alerts = cursor.fetchall()

        cursor.execute(
            """
            SELECT id_documento, titulo_documento, tipo_documento,
                   data_criacao_documento, status_documento
            FROM documentos WHERE paciente_id = %s
            """,
            (cpf_paciente,),
        )
        documents = cursor.fetchall()

        return {
            "message": message,
            "patient_data": serialize_patient(patient),
            "vaccines": vaccines,
            "alerts": alerts,
            "documents": documents,
        }
    finally:
        cursor.close()
        connection.close()


def get_current_patient(
    session_token: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict:
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária.",
        )

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT p.*
            FROM sessoes s
            JOIN pacientes p ON p.cpf_paciente = s.paciente_id
            WHERE s.token_hash = %s AND s.expira_em > UTC_TIMESTAMP()
            """,
            (hash_session_token(session_token),),
        )
        patient = cursor.fetchone()
    finally:
        cursor.close()
        connection.close()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada.",
        )
    return patient


def require_adult(patient: dict = Depends(get_current_patient)) -> dict:
    if calculate_age(patient["data_nascimento"]) < 18:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Menores de idade não podem alterar o prontuário.",
        )
    return patient


@app.post("/login", response_model=LoginResponse)
def login(response: Response, form_data: OAuth2PasswordRequestForm = Depends()):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM pacientes WHERE email = %s", (form_data.username,))
        patient = cursor.fetchone()

        if not patient or not verify_password(form_data.password, patient["senha_hash"]):
            raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

        session_token = create_session_token()
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
            hours=SESSION_DURATION_HOURS
        )
        cursor.execute("DELETE FROM sessoes WHERE expira_em <= UTC_TIMESTAMP()")
        cursor.execute(
            "INSERT INTO sessoes (token_hash, paciente_id, expira_em) VALUES (%s, %s, %s)",
            (hash_session_token(session_token), patient["cpf_paciente"], expires_at),
        )
        connection.commit()
    finally:
        cursor.close()
        connection.close()

    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_token,
        max_age=SESSION_DURATION_HOURS * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    return fetch_dashboard(patient["cpf_paciente"], "Login efetuado com sucesso!")


@app.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    session_token: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE),
):
    if session_token:
        connection = get_db_connection()
        cursor = connection.cursor()
        try:
            cursor.execute(
                "DELETE FROM sessoes WHERE token_hash = %s",
                (hash_session_token(session_token),),
            )
            connection.commit()
        finally:
            cursor.close()
            connection.close()

    response.delete_cookie(SESSION_COOKIE, path="/")


@app.get("/me", response_model=LoginResponse)
def get_me(patient: dict = Depends(get_current_patient)):
    return fetch_dashboard(patient["cpf_paciente"], "Sessão válida.")


@app.post("/me/vaccines", status_code=status.HTTP_201_CREATED)
def add_vaccine(
    vaccine: VaccineCreateUpdate, patient: dict = Depends(require_adult)
):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO vacinas
                (paciente_id, nome_vacina, dose, data_aplicacao, status_vacina)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                patient["cpf_paciente"],
                vaccine.nome_vacina,
                vaccine.dose,
                vaccine.data_aplicacao,
                vaccine.status_vacina,
            ),
        )
        connection.commit()
        return {"message": "Vacina registrada com sucesso!"}
    except mysql.connector.Error as error:
        connection.rollback()
        logger.exception("Falha ao registrar vacina")
        raise HTTPException(
            status_code=400, detail="Não foi possível registrar a vacina."
        ) from error
    finally:
        cursor.close()
        connection.close()


@app.get("/me/vaccines", response_model=List[Vaccine])
def get_vaccines(patient: dict = Depends(get_current_patient)):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id_vacina, nome_vacina, dose, data_aplicacao, status_vacina
            FROM vacinas WHERE paciente_id = %s
            """,
            (patient["cpf_paciente"],),
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        connection.close()


@app.put("/me/vaccines/{id_vacina}")
def update_vaccine(
    id_vacina: int,
    vaccine: VaccineCreateUpdate,
    patient: dict = Depends(require_adult),
):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            UPDATE vacinas
            SET nome_vacina = %s, dose = %s, data_aplicacao = %s,
                status_vacina = %s
            WHERE id_vacina = %s AND paciente_id = %s
            """,
            (
                vaccine.nome_vacina,
                vaccine.dose,
                vaccine.data_aplicacao,
                vaccine.status_vacina,
                id_vacina,
                patient["cpf_paciente"],
            ),
        )
        connection.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vacina não encontrada.")
        return {"message": "Vacina atualizada com sucesso!"}
    finally:
        cursor.close()
        connection.close()


@app.delete("/me/vaccines/{id_vacina}")
def delete_vaccine(id_vacina: int, patient: dict = Depends(require_adult)):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "DELETE FROM vacinas WHERE id_vacina = %s AND paciente_id = %s",
            (id_vacina, patient["cpf_paciente"]),
        )
        connection.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vacina não encontrada.")
        return {"message": "Vacina removida com sucesso!"}
    finally:
        cursor.close()
        connection.close()
