import re

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


def test_directory_query_never_touches_clinical_tables():
    cursor = RecordingCursor()

    search_directory(cursor, query="Carlos", page=1, page_size=20)
    search_directory(cursor, query="529.982.247-25", page=1, page_size=20)

    for statement, _parameters in cursor.executed:
        tables = set(re.findall(r"\b(?:FROM|JOIN)\s+(\w+)", statement))
        assert tables <= {"users", "user_roles"}
        assert not any(table in tables for table in CLINICAL_TABLES)
    assert cursor.executed[0][1][0] == "Carlos%"
    assert cursor.executed[1][1][0] == "52998224725"
