export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let actingPatientId = null;

// Clinical patient routes honor this header only for an active guardian;
// account routes ignore it on the backend.
export function setActingPatient(patientId) {
  actingPatientId = patientId;
}

export function apiFetch(path, options = {}) {
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
