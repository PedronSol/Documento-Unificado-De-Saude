"""Contract shared by every paginated listing (spec 038)."""

import pytest

from alerts.router import get_alerts
from care.router import (
    get_care_doctors,
    get_care_groups,
    get_care_invitations,
    get_care_requests,
    get_my_guardians,
    get_guardianships,
)
from documents.router import get_documents
from markers.router import get_markers
from medical.router import (
    get_patient_links,
    list_medical_documents,
    list_medical_patients,
)
from pagination import PageRequest
from vaccines.router import get_vaccines


PATIENT = {"patient_id": 10, "user_id": 1}
DOCTOR = {"doctor_id": 7, "user_id": 8, "crm_number": "123456", "crm_state": "SP"}


class PagedCursor:
    def __init__(self, connection):
        self.connection = connection
        self.last = ""

    def execute(self, statement, parameters=()):
        self.last = " ".join(statement.split())
        self.connection.executed.append((self.last, tuple(parameters or ())))

    def fetchone(self):
        if self.last.startswith("SELECT COUNT(*) AS total"):
            return {"total": self.connection.total}
        return {"patient_id": 10, "user_id": 2}

    def fetchall(self):
        return []

    def close(self):
        pass


class PagedConnection:
    def __init__(self, total=45):
        self.total = total
        self.executed = []

    def cursor(self, dictionary=False):
        return PagedCursor(self)

    def commit(self):
        pass

    def rollback(self):
        pass


CASES = [
    ("vaccines", get_vaccines, {"patient": PATIENT, "vaccine_status": "pending"}, 2, "pending", "id_vacina"),
    ("alerts", get_alerts, {"patient": PATIENT, "severity": "high"}, 2, "high", "id_alerta"),
    ("documents", get_documents, {"patient": PATIENT, "document_type": "report"}, 2, "report", "id_documento"),
    ("markers", get_markers, {"patient": PATIENT, "marker_status": "active", "marker_type": "allergy"}, 2, "allergy", "marker_id"),
    ("care-invitations", get_care_invitations, {"patient": PATIENT}, 1, None, "care_invitation_id"),
    ("care-groups", get_care_groups, {"patient": PATIENT}, 1, None, "care_group_id"),
    ("care-requests", get_care_requests, {"patient": PATIENT}, 1, None, "link_id"),
    ("care-doctors", get_care_doctors, {"patient": PATIENT}, 1, None, "link_id"),
    ("guardianships", get_guardianships, {"patient": PATIENT, "guardianship_status": "pending"}, 2, None, "guardianship_id"),
    ("guardians", get_my_guardians, {"patient": PATIENT}, 1, None, "guardianship_id"),
    ("medical-patients", list_medical_patients, {"doctor": DOCTOR}, 2, None, "patient_id"),
    ("patient-links", get_patient_links, {"doctor": DOCTOR, "link_status": "pending"}, 1, None, "link_id"),
    ("medical-documents", list_medical_documents, {"doctor": DOCTOR, "patient_id": 10, "document_type": "report"}, 2, "report", "id_documento"),
]


@pytest.mark.parametrize(
    ("name", "route", "kwargs", "search_columns", "filter_value", "tiebreak"),
    CASES,
    ids=[case[0] for case in CASES],
)
def test_listing_is_paginated_filtered_and_counted_in_sql(
    name, route, kwargs, search_columns, filter_value, tiebreak,
):
    connection = PagedConnection(total=45)

    result = route(
        page=PageRequest(page=2, page_size=20, query="hep_a"),
        connection=connection,
        **kwargs,
    )

    assert result == {
        "items": [],
        "page": 2,
        "page_size": 20,
        "total": 45,
        "has_next": True,
    }, name
    counts = [item for item in connection.executed if item[0].startswith("SELECT COUNT(*) AS total")]
    assert len(counts) == 1, name
    count_sql, count_params = counts[0]
    source = count_sql[len("SELECT COUNT(*) AS total "):]
    page_sql, page_params = next(
        item for item in connection.executed
        if item[0].endswith("LIMIT %s OFFSET %s")
    )
    assert source in page_sql, name
    assert page_params == (*count_params, 20, 20), name
    assert count_params.count("%hep\\_a%") == search_columns, name
    if filter_value is not None:
        assert filter_value in count_params, name
    order_by = page_sql.split(" ORDER BY ", 1)[1].rsplit(" LIMIT ", 1)[0]
    assert order_by.split(",")[-1].strip().split(" ")[0].endswith(tiebreak), name


def test_listing_without_search_or_filters_has_no_search_parameters():
    connection = PagedConnection(total=0)

    result = get_vaccines(
        page=PageRequest(page=1, page_size=10, query=None),
        vaccine_status=None,
        patient=PATIENT,
        connection=connection,
    )

    assert result["items"] == [] and result["total"] == 0 and result["has_next"] is False
    assert connection.executed[0][1] == (10,)
