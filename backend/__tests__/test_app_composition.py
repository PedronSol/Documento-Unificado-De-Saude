from pathlib import Path

from admin.router import router as admin_router
from alerts.router import router as alerts_router
from auth.router import router as auth_router
from care.router import router as care_router
from config import AppSettings
from documents.router import router as documents_router
from documents.storage import LocalDocumentStorage
from markers.router import router as markers_router
from main import create_app
from medical.router import router as medical_router
from patients.router import router as patients_router
from shares.router import router as shares_router
from vaccines.router import router as vaccines_router


EXPECTED_API_ROUTES = {
    ("POST", "/auth/patient-registration"),
    ("POST", "/auth/google"),
    ("POST", "/auth/google/patient-registration"),
    ("POST", "/me/external-identities/google"),
    ("POST", "/login"),
    ("POST", "/login/remembered"),
    ("GET", "/auth/remembered"),
    ("DELETE", "/auth/remembered"),
    ("POST", "/logout"),
    ("GET", "/me"),
    ("POST", "/me/vaccines"),
    ("GET", "/me/vaccines"),
    ("PUT", "/me/vaccines/{vaccine_id}"),
    ("DELETE", "/me/vaccines/{vaccine_id}"),
    ("GET", "/me/alerts"),
    ("GET", "/me/documents"),
    ("POST", "/me/documents"),
    ("GET", "/me/documents/{document_id}/file"),
    ("DELETE", "/me/documents/{document_id}"),
    ("GET", "/me/markers"),
    ("POST", "/me/markers"),
    ("PUT", "/me/markers/{marker_id}"),
    ("DELETE", "/me/markers/{marker_id}"),
    ("GET", "/medical/patients"),
    ("GET", "/medical/patients/{patient_id}"),
    ("GET", "/medical/patients/{patient_id}/documents"),
    ("GET", "/medical/patients/{patient_id}/documents/{document_id}/file"),
    ("POST", "/medical/patients/{patient_id}/documents"),
    ("DELETE", "/medical/patients/{patient_id}/documents/{document_id}"),
    ("POST", "/medical/patients/{patient_id}/markers"),
    ("PUT", "/medical/patients/{patient_id}/markers/{marker_id}"),
    ("DELETE", "/medical/patients/{patient_id}/markers/{marker_id}"),
    ("POST", "/me/shares"),
    ("GET", "/me/shares/active"),
    ("DELETE", "/me/shares/{share_id}"),
    ("GET", "/public/shares/summary"),
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


def test_create_app_builds_or_injects_private_document_storage(tmp_path):
    configured_root = tmp_path / "private-documents"
    settings = AppSettings.from_mapping(
        {"DOCUMENT_STORAGE_ROOT": str(configured_root)}
    )

    application = create_app(settings=settings, connection_factory=lambda: None)

    assert isinstance(application.state.document_storage, LocalDocumentStorage)
    assert application.state.document_storage.root == configured_root.resolve()
    assert configured_root.stat().st_mode & 0o777 == 0o700

    injected = object()
    injected_application = create_app(
        settings=settings,
        connection_factory=lambda: None,
        document_storage=injected,
    )
    assert injected_application.state.document_storage is injected


def test_domain_routers_own_the_current_routes():
    router_paths = {
        route.path
        for router in (
            admin_router,
            auth_router,
            care_router,
            patients_router,
            vaccines_router,
            alerts_router,
            documents_router,
            markers_router,
            medical_router,
            shares_router,
        )
        for route in router.routes
    }

    assert router_paths == {
        "/admin/doctor-invitations",
        "/admin/doctor-invitations/{invitation_id}",
        "/admin/doctors",
        "/admin/doctors/{doctor_id}",
        "/admin/doctors/{doctor_id}/status",
        "/admin/users",
        "/admin/care-groups",
        "/admin/care-groups/{group_id}",
        "/admin/care-groups/{group_id}/doctors/{doctor_id}",
        "/admin/care-groups/{group_id}/patient-invitations",
        "/admin/care-groups/{group_id}/patient-invitations/{invitation_id}",
        "/admin/care-groups/{group_id}/patients/{user_id}",
        "/admin/audit-events",
        "/me/care-invitations",
        "/me/care-invitations/{invitation_id}/accept",
        "/me/care-invitations/{invitation_id}/reject",
        "/me/care-groups",
        "/me/care-groups/{group_id}",
        "/me/care-requests",
        "/me/care-requests/{link_id}/accept",
        "/me/care-requests/{link_id}/reject",
        "/me/care-doctors",
        "/me/care-doctors/{link_id}",
        "/medical/patient-links",
        "/medical/patient-links/{link_id}",
        "/medical/patients/{patient_id}/provisional-profile",
        "/medical/patients/{patient_id}/claim-link",
        "/auth/patient-claim/local",
        "/auth/google/patient-claim",
        "/me/dependents",
        "/me/guardianships",
        "/me/guardianships/{guardianship_id}/accept",
        "/me/guardianships/{guardianship_id}/reject",
        "/me/guardianships/{guardianship_id}",
        "/me/guardianships/{guardianship_id}/confirm",
        "/me/guardians",
        "/me/guardians/{guardianship_id}",
        "/me/dependents/{patient_id}/claim-link",
        "/auth/google/doctor-invitation",
        "/auth/patient-registration",
        "/auth/google",
        "/auth/google/patient-registration",
        "/me/external-identities/google",
        "/login",
        "/login/remembered",
        "/auth/remembered",
        "/logout",
        "/me",
        "/me/profile",
        "/me/vaccines",
        "/me/vaccines/{vaccine_id}",
        "/me/alerts",
        "/me/documents",
        "/me/documents/{document_id}/file",
        "/me/documents/{document_id}",
        "/me/markers",
        "/me/markers/{marker_id}",
        "/medical/patients",
        "/medical/patients/{patient_id}",
        "/medical/patients/{patient_id}/documents",
        "/medical/patients/{patient_id}/documents/{document_id}/file",
        "/medical/patients/{patient_id}/documents/{document_id}",
        "/medical/patients/{patient_id}/markers",
        "/medical/patients/{patient_id}/markers/{marker_id}",
        "/me/shares",
        "/me/shares/active",
        "/me/shares/{share_id}",
        "/public/shares/summary",
    }


def test_cors_allows_share_token_header_only_for_configured_origins():
    application = create_app(
        settings=AppSettings.from_mapping(
            {"CORS_ORIGINS": "https://app.example"}
        ),
        connection_factory=lambda: None,
    )

    cors = application.user_middleware[0]
    assert cors.kwargs["allow_origins"] == ["https://app.example"]
    assert cors.kwargs["allow_credentials"] is True
    assert cors.kwargs["allow_headers"] == [
        "Content-Type",
        "X-Share-Token",
        "X-Acting-Patient",
    ]


def test_main_is_only_the_composition_root():
    source = Path("main.py").read_text()

    assert "cursor.execute" not in source
    assert "@app." not in source
