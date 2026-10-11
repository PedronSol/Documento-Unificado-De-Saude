import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import { useSessionStore } from "@/stores/session-store";


const { API_URL, apiFetch } = api;


describe("apiFetch", () => {
  afterEach(() => {
    useSessionStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it("envia o contexto do dependente somente enquanto ele estiver ativo no store", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    useSessionStore.getState().setActingPatient(9);
    await apiFetch("/me/vaccines", { headers: { "Content-Type": "application/json" } });
    useSessionStore.getState().setActingPatient(null);
    await apiFetch("/me/vaccines");

    expect(fetchMock.mock.calls[0]).toEqual([
      `${API_URL}/me/vaccines`,
      {
        headers: { "Content-Type": "application/json", "X-Acting-Patient": "9" },
        credentials: "include",
      },
    ]);
    expect(fetchMock.mock.calls[1]).toEqual([
      `${API_URL}/me/vaccines`,
      { credentials: "include" },
    ]);
  });

  it("não mantém um paciente atuante paralelo ao store", () => {
    expect(api.setActingPatient).toBeUndefined();
  });
});
