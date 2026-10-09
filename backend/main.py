from functools import partial
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from alerts.router import router as alerts_router
from auth.router import router as auth_router
from config import AppSettings
from database import ConnectionFactory, create_connection
from documents.router import router as documents_router
from markers.router import router as markers_router
from medical.router import router as medical_router
from patients.router import router as patients_router
from vaccines.router import router as vaccines_router


def create_app(
    settings: AppSettings | None = None,
    connection_factory: ConnectionFactory | None = None,
) -> FastAPI:
    settings = settings or AppSettings.from_mapping(os.environ)
    connection_factory = connection_factory or partial(
        create_connection,
        settings.database,
    )

    application = FastAPI(title="Documento Unificado de Saúde")
    application.state.settings = settings
    application.state.connection_factory = connection_factory
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
    application.include_router(auth_router)
    application.include_router(patients_router)
    application.include_router(vaccines_router)
    application.include_router(alerts_router)
    application.include_router(documents_router)
    application.include_router(markers_router)
    application.include_router(medical_router)
    return application


app = create_app()
