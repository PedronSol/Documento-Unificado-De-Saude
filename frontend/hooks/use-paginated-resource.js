"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch, readApiError } from "@/lib/api";
import { useSessionStore } from "@/stores/session-store";


export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
export const DEFAULT_PAGE_SIZE = 20;

const EMPTY = {
  status: "idle",
  items: [],
  total: 0,
  page: 0,
  hasNext: false,
  error: null,
  isLoadingMore: false,
  loadMoreError: null,
};


function expireSession() {
  useSessionStore.getState().expireSession();
}


export function buildPageUrl(path, { page, pageSize, params }) {
  const search = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      search.append(key, String(value).trim());
    }
  });
  return `${path}${path.includes("?") ? "&" : "?"}${search.toString()}`;
}


// Server-paginated listing (spec 038): first page, appended pages, filters
// and page size sent in the request, stale responses discarded.
export function usePaginatedResource(path, {
  fallback,
  params = {},
  pageSize = DEFAULT_PAGE_SIZE,
  onUnauthenticated = expireSession,
  abortStale = false,
}) {
  const paramsKey = JSON.stringify(params);
  const [state, setState] = useState(() => ({
    ...EMPTY,
    status: path ? "loading" : "idle",
  }));
  const [requestVersion, setRequestVersion] = useState(0);
  const generationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchPage = useCallback(async (page, signal) => {
    const url = buildPageUrl(path, {
      page,
      pageSize,
      params: JSON.parse(paramsKey),
    });
    const response = signal ? await apiFetch(url, { signal }) : await apiFetch(url);
    if (response.status === 401) {
      onUnauthenticated();
      return { unauthenticated: true };
    }
    if (!response.ok) {
      return { error: (await readApiError(response, fallback)).message };
    }
    return { body: await response.json() };
  }, [fallback, onUnauthenticated, pageSize, paramsKey, path]);

  useEffect(() => {
    if (!path) {
      setState(EMPTY);
      return undefined;
    }
    const generation = ++generationRef.current;
    // Optional cancellation of the superseded request (medical search, spec 030).
    const controller = abortStale ? new AbortController() : null;
    loadingMoreRef.current = false;
    setState({ ...EMPTY, status: "loading" });

    (async () => {
      try {
        const result = await fetchPage(1, controller?.signal);
        if (generation !== generationRef.current || result.unauthenticated) {
          return;
        }
        if (result.error) {
          setState({ ...EMPTY, status: "error", error: result.error });
          return;
        }
        setState({
          ...EMPTY,
          status: "ready",
          items: result.body.items,
          total: result.body.total,
          page: result.body.page,
          hasNext: result.body.has_next,
        });
      } catch {
        if (generation === generationRef.current && !controller?.signal.aborted) {
          setState({ ...EMPTY, status: "error", error: fallback });
        }
      }
    })();
    return () => controller?.abort();
  }, [abortStale, fallback, fetchPage, path, requestVersion]);

  useEffect(() => () => {
    generationRef.current += 1;
  }, []);

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (current.status !== "ready" || !current.hasNext || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    const generation = generationRef.current;
    setState((previous) => ({ ...previous, isLoadingMore: true, loadMoreError: null }));
    try {
      const result = await fetchPage(current.page + 1);
      if (generation !== generationRef.current || result.unauthenticated) {
        return;
      }
      setState((previous) => (result.error
        ? { ...previous, isLoadingMore: false, loadMoreError: result.error }
        : {
          ...previous,
          items: [...previous.items, ...result.body.items],
          total: result.body.total,
          page: result.body.page,
          hasNext: result.body.has_next,
          isLoadingMore: false,
          loadMoreError: null,
        }));
    } catch {
      if (generation === generationRef.current) {
        setState((previous) => ({ ...previous, isLoadingMore: false, loadMoreError: fallback }));
      }
    } finally {
      if (generation === generationRef.current) {
        loadingMoreRef.current = false;
      }
    }
  }, [fallback, fetchPage]);

  const reload = useCallback(() => setRequestVersion((value) => value + 1), []);

  return { ...state, loadMore, reload };
}
