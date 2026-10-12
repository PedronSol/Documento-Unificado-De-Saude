import { describe, expect, it } from "vitest";

import { readApiError } from "@/lib/api";


const FALLBACK = "Não foi possível carregar suas vacinas.";

function response(status, body) {
  return {
    ok: false,
    status,
    json: () => (body instanceof Error ? Promise.reject(body) : Promise.resolve(body)),
  };
}


describe("readApiError", () => {
  it("não exibe mensagem para sessão expirada", async () => {
    expect(await readApiError(response(401, { detail: "Autenticação necessária." }), FALLBACK))
      .toEqual({ status: 401, message: "" });
  });

  it("padroniza permissão negada", async () => {
    expect(await readApiError(response(403, { detail: "Role sem acesso." }), FALLBACK))
      .toEqual({ status: 403, message: "Você não tem permissão para esta ação." });
  });

  it.each([404, 409])("usa o detail textual do backend em %i", async (status) => {
    expect(await readApiError(response(status, { detail: "Marcador não encontrado." }), FALLBACK))
      .toEqual({ status, message: "Marcador não encontrado." });
  });

  it.each([404, 409])("cai no fallback quando %i não traz detail textual", async (status) => {
    expect(await readApiError(response(status, { detail: { code: "x" } }), FALLBACK))
      .toEqual({ status, message: FALLBACK });
  });

  it("usa o detail textual de 422", async () => {
    expect(await readApiError(response(422, { detail: "Envie um arquivo PDF, JPG ou PNG válido." }), FALLBACK))
      .toEqual({ status: 422, message: "Envie um arquivo PDF, JPG ou PNG válido." });
  });

  it("resume a lista de validação do FastAPI", async () => {
    const body = { detail: [{ loc: ["body", "name"], msg: "Field required", type: "missing" }] };
    expect(await readApiError(response(422, body), FALLBACK))
      .toEqual({ status: 422, message: "Revise os campos destacados e tente novamente." });
  });

  it.each([500, 503])("nunca repassa detalhes técnicos de %i", async (status) => {
    expect(await readApiError(response(status, { detail: "Traceback: SQL error" }), FALLBACK))
      .toEqual({ status, message: FALLBACK });
  });

  it("tolera corpo vazio ou não JSON", async () => {
    const empty = new SyntaxError("Unexpected end of JSON input");
    expect(await readApiError(response(409, empty), FALLBACK))
      .toEqual({ status: 409, message: FALLBACK });
    expect(await readApiError(response(503, null), FALLBACK))
      .toEqual({ status: 503, message: FALLBACK });
  });

  it("ignora detail textual vazio", async () => {
    expect(await readApiError(response(409, { detail: "   " }), FALLBACK))
      .toEqual({ status: 409, message: FALLBACK });
  });

  it("prioriza a mensagem de domínio informada para o status", async () => {
    const overrides = { 403: "A data de nascimento não confere com o cadastro do dependente." };

    expect(await readApiError(response(403, { detail: "x" }), FALLBACK, overrides))
      .toEqual({ status: 403, message: overrides[403] });
    expect(await readApiError(response(409, { detail: "Conflito." }), FALLBACK, overrides))
      .toEqual({ status: 409, message: "Conflito." });
  });

  it("não aplica mensagem de domínio à sessão expirada", async () => {
    expect(await readApiError(response(401, {}), FALLBACK, { 401: "x" }))
      .toEqual({ status: 401, message: "" });
  });
});
