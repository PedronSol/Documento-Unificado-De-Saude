"""Server-side pagination shared by every listing (spec 038)."""

from dataclasses import dataclass
from typing import Any, Callable, Generic, List, Optional, TypeVar

from fastapi import HTTPException, Query, status
from pydantic import BaseModel


PAGE_SIZES = (10, 20, 50, 100)
DEFAULT_PAGE_SIZE = 20
QUERY_MIN_LENGTH = 2
QUERY_MAX_LENGTH = 100

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: List[T]
    page: int
    page_size: int
    total: int
    has_next: bool


@dataclass(frozen=True)
class PageRequest:
    page: int
    page_size: int
    query: Optional[str]

    @property
    def limit_offset(self) -> tuple[int, int]:
        return self.page_size, (self.page - 1) * self.page_size


def page_request(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE),
    query: Optional[str] = Query(default=None, max_length=QUERY_MAX_LENGTH),
) -> PageRequest:
    if page_size not in PAGE_SIZES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Escolha 10, 20, 50 ou 100 itens por página.",
        )
    term = query.strip() if query else ""
    if term and len(term) < QUERY_MIN_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe ao menos dois caracteres para buscar.",
        )
    return PageRequest(page=page, page_size=page_size, query=term or None)


def page_params(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE),
) -> PageRequest:
    """Page only, for routes that validate their own search parameter."""
    return page_request(page=page, page_size=page_size, query=None)


def like_pattern(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def build_page(items: list, request: PageRequest, *, total: int) -> dict:
    return {
        "items": items,
        "page": request.page,
        "page_size": request.page_size,
        "total": total,
        "has_next": request.page * request.page_size < total,
    }


def search_clause(term: Optional[str], columns: list[str]) -> tuple[str, tuple]:
    """Builds `AND (col LIKE %s OR ...)` for a trimmed search term."""
    if not term:
        return "", ()
    pattern = like_pattern(term)
    conditions = " OR ".join(f"{column} LIKE %s" for column in columns)
    return f" AND ({conditions})", tuple(pattern for _ in columns)


def fetch_page(
    cursor: Any,
    *,
    columns: str,
    source: str,
    params: tuple,
    order_by: str,
    request: PageRequest,
    mapper: Callable[[Any], Any] = lambda row: row,
) -> dict:
    """Counts and fetches one page with the same FROM/WHERE conditions.

    `source` and `order_by` are trusted SQL fragments written by the caller;
    every user value travels in `params`.
    """
    cursor.execute(f"SELECT COUNT(*) AS total {source}", params)
    row = cursor.fetchone()
    total = row["total"] if isinstance(row, dict) else row[0]
    limit, offset = request.limit_offset
    if offset >= total:
        return build_page([], request, total=total)
    cursor.execute(
        f"SELECT {columns} {source} ORDER BY {order_by} LIMIT %s OFFSET %s",
        (*params, limit, offset),
    )
    return build_page([mapper(item) for item in cursor.fetchall()], request, total=total)
