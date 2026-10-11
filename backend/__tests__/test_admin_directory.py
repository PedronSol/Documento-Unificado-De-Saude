import re

import pytest

from admin.service import search_directory


CLINICAL_TABLES = (
    "patients",
    "doctors",
    "vaccines",
    "alerts",
    "documents",
    "health_markers",
    "health_shares",
    "clinical_audit_events",
    "patient_care_groups",
)


class RecordingCursor:
    def __init__(self):
        self.executed = []

    def execute(self, statement, parameters=()):
        self.executed.append((" ".join(statement.split()), parameters))

    def fetchall(self):
        return []

    def fetchone(self):
        return {"total": 1}


def test_directory_query_never_touches_clinical_tables():
    from pagination import PageRequest

    cursor = RecordingCursor()
    request = PageRequest(page=1, page_size=20, query=None)

    search_directory(cursor, query="Carlos", request=request)
    search_directory(cursor, query="529.982.247-25", request=request)

    for statement, _parameters in cursor.executed:
        tables = set(re.findall(r"\b(?:FROM|JOIN)\s+(\w+)", statement))
        assert tables <= {"users", "user_roles"}
        assert not any(table in tables for table in CLINICAL_TABLES)
    assert cursor.executed[0][1][0] == "Carlos%"
    assert cursor.executed[2][1][0] == "52998224725"


class CountingCursor(RecordingCursor):
    def fetchone(self):
        return {"total": 3}


@pytest.mark.parametrize(
    "lister",
    ["list_doctor_invitations", "list_admin_doctors", "list_care_groups", "list_audit_events"],
)
def test_admin_listings_report_total_and_page_size(lister):
    import admin.service as service
    from pagination import PageRequest

    cursor = CountingCursor()

    result = getattr(service, lister)(
        cursor,
        admin_user_id=5,
        request=PageRequest(page=1, page_size=10, query=None),
    )

    assert result == {"items": [], "page": 1, "page_size": 10, "total": 3, "has_next": False}
    assert cursor.executed[0][0].startswith("SELECT COUNT(*) AS total")
    assert cursor.executed[1][1][-2:] == (10, 0)


def test_directory_counts_grouped_users_once_each():
    from pagination import PageRequest

    cursor = CountingCursor()

    result = search_directory(
        cursor,
        query="Carlos",
        request=PageRequest(page=1, page_size=50, query=None),
    )

    count_sql = cursor.executed[0][0]
    assert count_sql.startswith("SELECT COUNT(*) AS total FROM (")
    assert "GROUP BY" in count_sql
    assert result["total"] == 3 and result["page_size"] == 50
