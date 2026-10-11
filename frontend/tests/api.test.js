import { afterEach, describe, expect, it, vi } from "vitest";

import { API_URL, apiFetch, setActingPatient } from "@/lib/api";


describe("apiFetch", () => {
  afterEach(() => {
    setActingPatient(null);
    vi.unstubAllGlobals();
  });

  it("envia o contexto do dependente somente enquanto ele estiver ativo", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    setActingPatient(9);
    await apiFetch("/me/vaccines", { headers: { "Content-Type": "application/json" } });
    setActingPatient(null);
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
});
