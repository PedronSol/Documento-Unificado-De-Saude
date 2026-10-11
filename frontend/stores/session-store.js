import { create } from "zustand";

import { apiFetch } from "@/lib/api";


const IDENTITY_ERROR = "Não foi possível carregar sua identidade.";

const initialState = {
  status: "idle",
  identity: null,
  error: null,
  actingPatientId: null,
};

const unauthenticatedState = {
  ...initialState,
  status: "unauthenticated",
};


// Session state shared across routes. Memory only: no persist middleware,
// and clinical resources never live here.
export const useSessionStore = create((set, get) => {
  async function requestIdentity() {
    const response = await apiFetch("/me");
    if (response.status === 401) {
      return { unauthenticated: true };
    }
    if (!response.ok) {
      throw new Error(IDENTITY_ERROR);
    }
    return { identity: await response.json() };
  }

  return {
    ...initialState,

    async loadIdentity() {
      const { status } = get();
      if (status === "loading" || status === "ready") {
        return;
      }
      set({ status: "loading", error: null });
      try {
        const result = await requestIdentity();
        set(result.unauthenticated
          ? unauthenticatedState
          : { status: "ready", identity: result.identity, error: null });
      } catch {
        set({ status: "error", identity: null, error: IDENTITY_ERROR });
      }
    },

    async refreshIdentity() {
      try {
        const result = await requestIdentity();
        set(result.unauthenticated
          ? unauthenticatedState
          : { identity: result.identity });
      } catch {
        // A failed refresh keeps the identity already authorized on screen.
      }
    },

    setActingPatient(patientId) {
      set({ actingPatientId: patientId });
    },

    // Features call this on 401; the shell reacts by leaving the area.
    expireSession() {
      set(unauthenticatedState);
    },

    reset() {
      set(initialState);
    },
  };
});
