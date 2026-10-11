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
