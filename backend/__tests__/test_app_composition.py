from pathlib import Path

from alerts.router import router as alerts_router
from auth.router import router as auth_router
from config import AppSettings
from documents.router import router as documents_router
from markers.router import router as markers_router
from main import create_app
from medical.router import router as medical_router
from patients.router import router as patients_router
from vaccines.router import router as vaccines_router


EXPECTED_API_ROUTES = {
    ("POST", "/login"),
    ("POST", "/logout"),
    ("GET", "/me"),
    ("POST", "/me/vaccines"),
    ("GET", "/me/vaccines"),
    ("PUT", "/me/vaccines/{vaccine_id}"),
    ("DELETE", "/me/vaccines/{vaccine_id}"),
    ("GET", "/me/alerts"),
    ("GET", "/me/documents"),
    ("GET", "/me/markers"),
    ("POST", "/me/markers"),
    ("PUT", "/me/markers/{marker_id}"),
    ("DELETE", "/me/markers/{marker_id}"),
    ("GET", "/medical/patients"),
    ("GET", "/medical/patients/{patient_id}"),
    ("POST", "/medical/patients/{patient_id}/markers"),
    ("PUT", "/medical/patients/{patient_id}/markers/{marker_id}"),
    ("DELETE", "/medical/patients/{patient_id}/markers/{marker_id}"),
}


def test_create_app_registers_the_current_api_contract():
    settings = AppSettings.from_mapping({})
    connection_factory = lambda: None

    application = create_app(
        settings=settings,
        connection_factory=connection_factory,
    )
    registered_routes = {
        (method, route.path)
        for route in application.routes
        for method in getattr(route, "methods", set())
    }

    assert EXPECTED_API_ROUTES <= registered_routes
    assert application.state.settings is settings
    assert application.state.connection_factory is connection_factory
    assert create_app() is not create_app()


def test_domain_routers_own_the_current_routes():
    router_paths = {
        route.path
        for router in (
            auth_router,
            patients_router,
            vaccines_router,
            alerts_router,
            documents_router,
            markers_router,
            medical_router,
        )
        for route in router.routes
    }

    assert router_paths == {
        "/login",
        "/logout",
        "/me",
        "/me/profile",
        "/me/vaccines",
        "/me/vaccines/{vaccine_id}",
        "/me/alerts",
        "/me/documents",
        "/me/markers",
        "/me/markers/{marker_id}",
        "/medical/patients",
        "/medical/patients/{patient_id}",
        "/medical/patients/{patient_id}/markers",
        "/medical/patients/{patient_id}/markers/{marker_id}",
    }


def test_main_is_only_the_composition_root():
    source = Path("main.py").read_text()

    assert "cursor.execute" not in source
    assert "@app." not in source
