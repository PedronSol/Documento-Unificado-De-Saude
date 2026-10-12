import { useSessionStore } from "@/stores/session-store";


export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Clinical patient routes honor X-Acting-Patient only for an active guardian;
// account routes ignore it on the backend.
export function apiFetch(path, options = {}) {
  const { actingPatientId } = useSessionStore.getState();
  const headers = actingPatientId === null
    ? options.headers
    : { ...options.headers, "X-Acting-Patient": String(actingPatientId) };
  return fetch(`${API_URL}${path}`, {
    ...options,
    ...(headers ? { headers } : {}),
    credentials: "include",
  });
}

export function publicApiFetch(path, options = {}) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    cache: "no-store",
    credentials: "omit",
  });
}

const FORBIDDEN_MESSAGE = "Você não tem permissão para esta ação.";
const VALIDATION_MESSAGE = "Revise os campos destacados e tente novamente.";
const DETAIL_STATUSES = new Set([404, 409, 422]);

async function readDetail(response) {
  try {
    const body = await response.json();
    return body?.detail;
  } catch {
    return undefined;
  }
}

function textDetail(detail) {
  return typeof detail === "string" && detail.trim() ? detail.trim() : null;
}

// Maps an error response to a safe message. Never throws and never exposes
// stack traces, SQL or raw payloads; 401 is left to the session flow.
// `overrides` lets a feature name a domain meaning for a specific status.
export async function readApiError(response, fallback, overrides = {}) {
  const { status } = response;
  if (status === 401) {
    return { status, message: "" };
  }
  if (overrides[status]) {
    return { status, message: overrides[status] };
  }
  if (status === 403) {
    return { status, message: FORBIDDEN_MESSAGE };
  }
  if (!DETAIL_STATUSES.has(status)) {
    return { status, message: fallback };
  }
  const detail = await readDetail(response);
  if (status === 422 && Array.isArray(detail)) {
    return { status, message: VALIDATION_MESSAGE };
  }
  return { status, message: textDetail(detail) || fallback };
}
