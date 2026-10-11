"use client";

import { useCallback, useState } from "react";

import {
  DEFAULT_PAGE_SIZE,
  usePaginatedResource,
} from "@/hooks/use-paginated-resource";


// List state shared by every paginated screen: search term, filters and page
// size live here and are sent to the server on each request.
export function usePaginatedList(path, {
  fallback,
  initialFilters = {},
  onUnauthenticated,
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const resource = usePaginatedResource(path, {
    fallback,
    pageSize,
    params: { query, ...filters },
    ...(onUnauthenticated ? { onUnauthenticated } : {}),
  });

  const setFilter = useCallback((key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const clear = useCallback(() => {
    setQuery("");
    setFilters(initialFilters);
    // initialFilters is a default value, not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    resource,
    query,
    setQuery,
    filters,
    setFilter,
    pageSize,
    setPageSize,
    clear,
    isFiltered: Boolean(query) || Object.values(filters).some(Boolean),
  };
}
