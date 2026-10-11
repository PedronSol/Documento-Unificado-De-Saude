"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";


const DEFAULT_ERRORS = {
  404: "Recurso não encontrado ou fora da sua gestão.",
  409: "A operação conflita com o estado atual. Atualize e tente novamente.",
  422: "Revise os dados informados.",
};
const GENERIC_ERROR = "Não foi possível concluir a ação. Tente novamente.";


export function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value),
  );
}


export async function adminRequest(path, { method, body, errors = {} } = {}) {
  try {
    const response = method
      ? await apiFetch(path, {
        method,
        ...(body === undefined
          ? {}
          : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
      })
      : await apiFetch(path);
    if (response.status === 401) {
      return { unauthenticated: true };
    }
    if (!response.ok) {
      return {
        error: errors[response.status] || DEFAULT_ERRORS[response.status] || GENERIC_ERROR,
      };
    }
    return {
      data: response.status === 204 ? null : await response.json(),
    };
  } catch {
    return { error: GENERIC_ERROR };
  }
}


export function useAdminPage(path, onUnauthenticated, errorMessage) {
  const [resource, setResource] = useState({
    status: "loading",
    items: [],
    page: 1,
    hasNext: false,
  });

  const load = useCallback(async (page = 1) => {
    setResource((current) => ({ ...current, status: "loading" }));
    const separator = path.includes("?") ? "&" : "?";
    const result = await adminRequest(
      page === 1 ? path : `${path}${separator}page=${page}`,
    );
    if (result.unauthenticated) {
      onUnauthenticated();
      return;
    }
    if (result.error) {
      setResource((current) => ({ ...current, status: "error", error: errorMessage }));
      return;
    }
    setResource((current) => ({
      status: "ready",
      items: page === 1 ? result.data.items : [...current.items, ...result.data.items],
      page,
      hasNext: result.data.has_next,
    }));
  }, [errorMessage, onUnauthenticated, path]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    ...resource,
    reload: () => load(1),
    loadMore: () => load(resource.page + 1),
    replaceItem: (key, item) => setResource((current) => ({
      ...current,
      items: current.items.map((existing) => (
        existing[key] === item[key] ? item : existing
      )),
    })),
  };
}
