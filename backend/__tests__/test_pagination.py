import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from pagination import (
    DEFAULT_PAGE_SIZE,
    PAGE_SIZES,
    PageRequest,
    build_page,
    like_pattern,
    page_request,
)


def test_page_sizes_are_the_approved_set():
    assert PAGE_SIZES == (10, 20, 50, 100)
    assert DEFAULT_PAGE_SIZE == 20


def test_limit_and_offset_follow_page_and_size():
    assert PageRequest(page=1, page_size=20, query=None).limit_offset == (20, 0)
    assert PageRequest(page=3, page_size=50, query=None).limit_offset == (50, 100)


@pytest.mark.parametrize(
    ("page", "total", "has_next"),
    [(1, 45, True), (2, 45, True), (3, 45, False), (4, 45, False), (1, 0, False), (1, 20, False)],
)
def test_build_page_reports_total_and_next(page, total, has_next):
    request = PageRequest(page=page, page_size=20, query=None)

    result = build_page(["item"], request, total=total)

    assert result == {
        "items": ["item"],
        "page": page,
        "page_size": 20,
        "total": total,
        "has_next": has_next,
    }


def test_like_pattern_escapes_wildcards_and_wraps_term():
    assert like_pattern("50%_a\\b") == "%50\\%\\_a\\\\b%"


def make_client():
    app = FastAPI()

    @app.get("/items")
    def items(request: PageRequest = Depends(page_request)):
        return {"page": request.page, "page_size": request.page_size, "query": request.query}

    return TestClient(app)


def test_dependency_defaults_and_trims_query():
    client = make_client()

    assert client.get("/items").json() == {"page": 1, "page_size": 20, "query": None}
    assert client.get("/items", params={"query": "  hepa  ", "page_size": 100, "page": 2}).json() == {
        "page": 2,
        "page_size": 100,
        "query": "hepa",
    }
    assert client.get("/items", params={"query": "   "}).json()["query"] is None


@pytest.mark.parametrize(
    "params",
    [
        {"page_size": 15},
        {"page_size": 200},
        {"page_size": 0},
        {"page": 0},
        {"page": "x"},
        {"query": "a"},
        {"query": "a" * 101},
    ],
)
def test_dependency_rejects_invalid_requests(params):
    assert make_client().get("/items", params=params).status_code == 422


class RecordingCursor:
    def __init__(self, total, rows):
        self.executed = []
        self._results = [{"total": total}, rows]

    def execute(self, statement, parameters=()):
        self.executed.append((" ".join(statement.split()), parameters))

    def fetchone(self):
        return self._results.pop(0)

    def fetchall(self):
        return self._results.pop(0)


def test_fetch_page_counts_and_pages_with_the_same_conditions():
    from pagination import fetch_page

    cursor = RecordingCursor(total=45, rows=[{"id": 21}, {"id": 22}])
    request = PageRequest(page=2, page_size=20, query=None)

    result = fetch_page(
        cursor,
        columns="v.id",
        source="FROM vaccines v WHERE v.patient_id = %s",
        params=(10,),
        order_by="v.id DESC",
        request=request,
        mapper=lambda row: row["id"],
    )

    count_sql, count_params = cursor.executed[0]
    page_sql, page_params = cursor.executed[1]
    assert count_sql == "SELECT COUNT(*) AS total FROM vaccines v WHERE v.patient_id = %s"
    assert count_params == (10,)
    assert page_sql == (
        "SELECT v.id FROM vaccines v WHERE v.patient_id = %s "
        "ORDER BY v.id DESC LIMIT %s OFFSET %s"
    )
    assert page_params == (10, 20, 20)
    assert result == {
        "items": [21, 22],
        "page": 2,
        "page_size": 20,
        "total": 45,
        "has_next": True,
    }


def test_fetch_page_skips_page_query_beyond_total():
    from pagination import fetch_page

    cursor = RecordingCursor(total=5, rows=[])
    request = PageRequest(page=3, page_size=20, query=None)

    result = fetch_page(
        cursor,
        columns="v.id",
        source="FROM vaccines v",
        params=(),
        order_by="v.id",
        request=request,
    )

    assert len(cursor.executed) == 1
    assert result["items"] == [] and result["total"] == 5 and result["has_next"] is False


def test_search_clause_matches_any_column_with_escaped_term():
    from pagination import search_clause

    assert search_clause(None, ["v.name"]) == ("", ())
    clause, params = search_clause("50%", ["v.name", "v.dose"])
    assert clause == " AND (v.name LIKE %s OR v.dose LIKE %s)"
    assert params == ("%50\\%%", "%50\\%%")


def test_page_params_dependency_ignores_search_for_routes_with_own_query():
    from pagination import page_params

    app = FastAPI()

    @app.get("/admin-items")
    def items(request: PageRequest = Depends(page_params)):
        return {"page_size": request.page_size, "query": request.query}

    client = TestClient(app)
    assert client.get("/admin-items", params={"page_size": 50, "query": "x"}).json() == {
        "page_size": 50,
        "query": None,
    }
    assert client.get("/admin-items", params={"page_size": 21}).status_code == 422
