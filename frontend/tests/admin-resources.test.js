import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminRequest } from "@/components/admin/admin-resources";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

function respondWith(body, status) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}


describe("adminRequest", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("padroniza permissão negada", async () => {
    apiFetch.mockReturnValue(respondWith({ detail: "x" }, 403));

    expect(await adminRequest("/admin/doctors")).toEqual({
      error: "Você não tem permissão para esta ação.",
    });
  });

  it("usa o detalhe textual do backend em conflito", async () => {
    apiFetch.mockReturnValue(respondWith({ detail: "CRM já cadastrado." }, 409));

    expect(await adminRequest("/admin/doctors", { method: "POST", body: {} })).toEqual({
      error: "CRM já cadastrado.",
    });
  });

  it("mantém a mensagem de domínio informada pelo chamador", async () => {
    apiFetch.mockReturnValue(respondWith({ detail: "x" }, 409));

    expect(await adminRequest("/admin/doctors", {
      method: "POST",
      body: {},
      errors: { 409: "Médico já possui vínculo." },
    })).toEqual({ error: "Médico já possui vínculo." });
  });

  it("não expõe falhas técnicas", async () => {
    apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await adminRequest("/admin/doctors")).toEqual({
      error: "Não foi possível concluir a ação. Tente novamente.",
    });
  });
});
