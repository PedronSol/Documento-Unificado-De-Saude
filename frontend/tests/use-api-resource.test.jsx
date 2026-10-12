import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useApiResource } from "@/hooks/use-api-resource";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/stores/session-store";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

const FALLBACK = "Não foi possível carregar suas vacinas.";

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}


describe("useApiResource", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    useSessionStore.getState().reset();
  });

  it("carrega o recurso e expõe os dados", async () => {
    vi.mocked(apiFetch).mockReturnValue(respondWith([{ id: 1 }]));

    const { result } = renderHook(() => useApiResource("/me/vaccines", { fallback: FALLBACK }));

    expect(result.current).toMatchObject({ status: "loading", data: [] });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(apiFetch).toHaveBeenCalledWith("/me/vaccines");
  });

  it("usa a mensagem padronizada em erro", async () => {
    vi.mocked(apiFetch).mockReturnValue(respondWith({ detail: "SQL" }, 503));

    const { result } = renderHook(() => useApiResource("/me/vaccines", { fallback: FALLBACK }));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toMatchObject({ error: FALLBACK, data: [] });
  });

  it("não vaza a mensagem técnica de falha de rede ou JSON", async () => {
    vi.mocked(apiFetch).mockReturnValue(Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
    }));

    const { result } = renderHook(() => useApiResource("/me/vaccines", { fallback: FALLBACK }));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe(FALLBACK);
  });

  it("encerra a sessão pelo store em 401", async () => {
    vi.mocked(apiFetch).mockReturnValue(respondWith({}, 401));

    renderHook(() => useApiResource("/me/vaccines", { fallback: FALLBACK }));

    await waitFor(() => expect(useSessionStore.getState().status).toBe("unauthenticated"));
  });

  it("aceita um tratamento de sessão injetado", async () => {
    vi.mocked(apiFetch).mockReturnValue(respondWith({}, 401));
    const onUnauthenticated = vi.fn();

    renderHook(() => useApiResource("/me/vaccines", { fallback: FALLBACK, onUnauthenticated }));

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledOnce());
    expect(useSessionStore.getState().status).toBe("idle");
  });

  it("recarrega e atualiza localmente", async () => {
    vi.mocked(apiFetch)
      .mockReturnValueOnce(respondWith({ detail: "x" }, 503))
      .mockReturnValueOnce(respondWith([{ id: 2 }]));
    const { result } = renderHook(() => useApiResource("/me/vaccines", { fallback: FALLBACK }));
    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual([{ id: 2 }]);

    act(() => result.current.updateData((items) => [...items, { id: 3 }]));
    expect(result.current.data).toEqual([{ id: 2 }, { id: 3 }]);
  });

  it("fica ocioso sem caminho e usa o valor inicial informado", () => {
    const { result } = renderHook(() => useApiResource(null, {
      fallback: FALLBACK,
      initialData: null,
    }));

    expect(result.current).toMatchObject({ status: "idle", data: null });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("ignora resposta que chega depois de desmontar", async () => {
    let resolve;
    vi.mocked(apiFetch).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result, unmount } = renderHook(() => useApiResource("/me/vaccines", { fallback: FALLBACK }));

    unmount();
    await act(async () => {
      resolve({ ok: true, status: 200, json: () => Promise.resolve([{ id: 9 }]) });
    });

    expect(result.current.status).toBe("loading");
  });

  it("expõe o status do erro para estados específicos da feature", async () => {
    vi.mocked(apiFetch).mockReturnValue(respondWith({ detail: "Paciente não autorizado." }, 403));

    const { result } = renderHook(() => useApiResource("/medical/patients/10", {
      fallback: FALLBACK,
      initialData: null,
    }));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toMatchObject({
      errorStatus: 403,
      error: "Você não tem permissão para esta ação.",
      data: null,
    });
  });

  it("não informa status quando a falha é de rede", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useApiResource("/me/vaccines", { fallback: FALLBACK }));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.errorStatus).toBeNull();
  });
});
