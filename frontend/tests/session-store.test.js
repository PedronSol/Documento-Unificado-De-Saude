import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/stores/session-store";


vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const identity = {
  user: { user_id: 1, display_name: "Helena", email: "h@example.com", roles: ["patient"] },
  patient_profile: { preferred_name: "Helena", is_adult: true, age: 38 },
  dependents: [],
};

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

function state() {
  return useSessionStore.getState();
}


describe("session store", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    state().reset();
  });

  it("starts idle without identity or acting patient", () => {
    expect(state()).toMatchObject({
      status: "idle",
      identity: null,
      error: null,
      actingPatientId: null,
    });
  });

  it("loads /me once even when asked again", async () => {
    vi.mocked(apiFetch).mockImplementation(() => respondWith(identity));

    const first = state().loadIdentity();
    expect(state().status).toBe("loading");
    await Promise.all([first, state().loadIdentity()]);
    await state().loadIdentity();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/me");
    expect(state()).toMatchObject({ status: "ready", identity, error: null });
  });

  it("marks the session unauthenticated on 401", async () => {
    vi.mocked(apiFetch).mockImplementation(() => respondWith({}, 401));
    state().setActingPatient(15);

    await state().loadIdentity();

    expect(state()).toMatchObject({
      status: "unauthenticated",
      identity: null,
      actingPatientId: null,
    });
  });

  it("keeps a safe error and allows retrying", async () => {
    vi.mocked(apiFetch)
      .mockImplementationOnce(() => respondWith({ detail: "SQL" }, 503))
      .mockImplementationOnce(() => respondWith(identity));

    await state().loadIdentity();
    expect(state()).toMatchObject({
      status: "error",
      error: "Não foi possível carregar sua identidade.",
      identity: null,
    });

    await state().loadIdentity();
    expect(state()).toMatchObject({ status: "ready", identity, error: null });
  });

  it("treats a network failure as a safe error", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await state().loadIdentity();

    expect(state().error).toBe("Não foi possível carregar sua identidade.");
  });

  it("refreshes a ready identity without leaving the ready state", async () => {
    const updated = { ...identity, dependents: [{ patient_id: 15 }] };
    vi.mocked(apiFetch)
      .mockImplementationOnce(() => respondWith(identity))
      .mockImplementationOnce(() => respondWith(updated));
    await state().loadIdentity();

    const refresh = state().refreshIdentity();
    expect(state().status).toBe("ready");
    await refresh;

    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(state().identity).toEqual(updated);
  });

  it("keeps the current identity when a refresh fails", async () => {
    vi.mocked(apiFetch)
      .mockImplementationOnce(() => respondWith(identity))
      .mockImplementationOnce(() => respondWith({}, 503));
    await state().loadIdentity();

    await state().refreshIdentity();

    expect(state()).toMatchObject({ status: "ready", identity });
  });

  it("ends the session when a refresh gets 401", async () => {
    vi.mocked(apiFetch)
      .mockImplementationOnce(() => respondWith(identity))
      .mockImplementationOnce(() => respondWith({}, 401));
    await state().loadIdentity();

    await state().refreshIdentity();

    expect(state()).toMatchObject({ status: "unauthenticated", identity: null });
  });

  it("sets and clears the acting patient", () => {
    state().setActingPatient(15);
    expect(state().actingPatientId).toBe(15);

    state().setActingPatient(null);
    expect(state().actingPatientId).toBeNull();
  });

  it("reset discards identity and acting patient", async () => {
    vi.mocked(apiFetch).mockImplementation(() => respondWith(identity));
    await state().loadIdentity();
    state().setActingPatient(15);

    state().reset();

    expect(state()).toMatchObject({
      status: "idle",
      identity: null,
      error: null,
      actingPatientId: null,
    });
  });

  it("does not persist the session in browser storage", async () => {
    vi.mocked(apiFetch).mockImplementation(() => respondWith(identity));
    await state().loadIdentity();
    state().setActingPatient(15);

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("expires the session from any feature", async () => {
    vi.mocked(apiFetch).mockImplementation(() => respondWith(identity));
    await state().loadIdentity();
    state().setActingPatient(15);

    state().expireSession();

    expect(state()).toMatchObject({
      status: "unauthenticated",
      identity: null,
      actingPatientId: null,
    });
  });
});
