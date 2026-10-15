"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch, readApiError } from "@/lib/api";
import { useSessionStore } from "@/stores/session-store";


function expireSession() {
  useSessionStore.getState().expireSession();
}


// Read-only resource lifecycle shared by features: loading, ready or error,
// reload and local updates after a mutation. A null path keeps it idle.
export function useApiResource(path, {
  fallback,
  initialData = [],
  onUnauthenticated = expireSession,
  fetchResource = apiFetch,
}) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [resource, setResource] = useState({
    status: path ? "loading" : "idle",
    data: initialData,
    error: null,
    errorStatus: null,
  });

  useEffect(() => {
    if (!path) {
      return undefined;
    }
    let active = true;

    async function load() {
      setResource((current) => ({
        ...current,
        status: "loading",
        error: null,
        errorStatus: null,
      }));
      try {
        const response = await fetchResource(path);
        if (!active) {
          return;
        }
        if (response.status === 401 && onUnauthenticated) {
          onUnauthenticated();
          return;
        }
        if (!response.ok) {
          const { status, message } = await readApiError(response, fallback);
          if (active) {
            setResource({
              status: "error",
              data: initialData,
              error: message,
              errorStatus: status,
            });
          }
          return;
        }
        const data = await response.json();
        if (active) {
          setResource({ status: "ready", data, error: null, errorStatus: null });
        }
      } catch {
        if (active) {
          setResource({
            status: "error",
            data: initialData,
            error: fallback,
            errorStatus: null,
          });
        }
      }
    }

    load();
    return () => {
      active = false;
    };
    // initialData is a default value, not a request input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback, fetchResource, onUnauthenticated, path, requestVersion]);

  const reload = useCallback(() => setRequestVersion((value) => value + 1), []);
  const updateData = useCallback((update) => setResource((current) => ({
    status: "ready",
    error: null,
    errorStatus: null,
    data: typeof update === "function" ? update(current.data) : update,
  })), []);

  return { ...resource, reload, updateData };
}
