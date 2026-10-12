"use client";

import { useState } from "react";

import {
  DEFAULT_PAGE_SIZE,
  usePaginatedResource,
} from "@/hooks/use-paginated-resource";
import { apiFetch, readApiError } from "@/lib/api";


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
        error: (await readApiError(response, GENERIC_ERROR, errors)).message,
      };
    }
    return {
      data: response.status === 204 ? null : await response.json(),
    };
  } catch {
    return { error: GENERIC_ERROR };
  }
}


export function useAdminPage(
  path,
  onUnauthenticated,
  errorMessage,
  { initialPageSize = DEFAULT_PAGE_SIZE } = {},
) {
  const [pageSize, setPageSize] = useState(initialPageSize);
  const resource = usePaginatedResource(path, {
    fallback: errorMessage,
    pageSize,
    onUnauthenticated,
  });
  return { ...resource, pageSize, setPageSize };
}
