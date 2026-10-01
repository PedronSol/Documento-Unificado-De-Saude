export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function apiFetch(path, options = {}) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
  });
}
