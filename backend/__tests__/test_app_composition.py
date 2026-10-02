from pathlib import Path

from auth.router import router as auth_router
from config import AppSettings
from main import create_app
from patients.router import router as patients_router
from vaccines.router import router as vaccines_router


EXPECTED_API_ROUTES = {
    ("POST", "/login"),
    ("POST", "/logout"),
    ("GET", "/me"),
    ("POST", "/me/vaccines"),
    ("GET", "/me/vaccines"),
    ("PUT", "/me/vaccines/{id_vacina}"),
    ("DELETE", "/me/vaccines/{id_vacina}"),
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
        for router in (auth_router, patients_router, vaccines_router)
        for route in router.routes
    }

    assert router_paths == {
        "/login",
        "/logout",
        "/me",
        "/me/vaccines",
        "/me/vaccines/{id_vacina}",
    }


def test_main_is_only_the_composition_root():
    source = Path("main.py").read_text()

    assert "cursor.execute" not in source
    assert "@app." not in source
