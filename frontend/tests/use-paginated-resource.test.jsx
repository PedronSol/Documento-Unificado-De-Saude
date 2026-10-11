import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePaginatedResource } from "@/hooks/use-paginated-resource";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/stores/session-store";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

const FALLBACK = "Não foi possível carregar suas vacinas.";

function page(items, { page = 1, pageSize = 20, total = items.length, hasNext = false } = {}) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      items, page, page_size: pageSize, total, has_next: hasNext,
    }),
  });
}

function failure(status = 503) {
  return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ detail: "x" }) });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}


describe("usePaginatedResource", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    useSessionStore.getState().reset();
  });

  it("carrega a primeira página com tamanho padrão e total", async () => {
    vi.mocked(apiFetch).mockReturnValue(page([{ id: 1 }], { total: 45, hasNext: true }));

    const { result } = renderHook(() => usePaginatedResource("/me/vaccines", { fallback: FALLBACK }));

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(apiFetch).toHaveBeenCalledWith("/me/vaccines?page=1&page_size=20");
    expect(result.current).toMatchObject({ items: [{ id: 1 }], total: 45, hasNext: true });
  });

  it("envia busca, filtros e tamanho na requisição e ignora vazios", async () => {
    vi.mocked(apiFetch).mockReturnValue(page([]));

    renderHook(() => usePaginatedResource("/me/markers?status=removed", {
      fallback: FALLBACK,
      pageSize: 50,
      params: { query: "hepa", type: "allergy", severity: "" },
    }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/me/markers?status=removed&page=1&page_size=50&query=hepa&type=allergy",
    ));
  });

  it("acrescenta a próxima página sem cargas simultâneas", async () => {
    const second = deferred();
    vi.mocked(apiFetch)
      .mockReturnValueOnce(page([{ id: 1 }], { total: 2, hasNext: true }))
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => usePaginatedResource("/me/vaccines", { fallback: FALLBACK }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    expect(result.current.isLoadingMore).toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch).toHaveBeenLastCalledWith("/me/vaccines?page=2&page_size=20");

    await act(async () => second.resolve(await page([{ id: 2 }], { page: 2, total: 2 })));

    expect(result.current.items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.current.hasNext).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it("mantém os itens quando carregar mais falha e permite tentar de novo", async () => {
    vi.mocked(apiFetch)
      .mockReturnValueOnce(page([{ id: 1 }], { total: 2, hasNext: true }))
      .mockReturnValueOnce(failure())
      .mockReturnValueOnce(page([{ id: 2 }], { page: 2, total: 2 }));
    const { result } = renderHook(() => usePaginatedResource("/me/vaccines", { fallback: FALLBACK }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => { await result.current.loadMore(); });
    expect(result.current.items).toEqual([{ id: 1 }]);
    expect(result.current.loadMoreError).toBe(FALLBACK);
    expect(result.current.status).toBe("ready");

    await act(async () => { await result.current.loadMore(); });
    expect(result.current.items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.current.loadMoreError).toBeNull();
  });

  it("reinicia na página 1 quando os parâmetros mudam e descarta respostas antigas", async () => {
    const stale = deferred();
    vi.mocked(apiFetch)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(page([{ id: 9 }], { total: 1 }));
    const { result, rerender } = renderHook(
      ({ query }) => usePaginatedResource("/me/vaccines", { fallback: FALLBACK, params: { query } }),
      { initialProps: { query: "" } },
    );

    rerender({ query: "hepa" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => stale.resolve(await page([{ id: 1 }], { total: 1 })));

    expect(result.current.items).toEqual([{ id: 9 }]);
    expect(apiFetch).toHaveBeenLastCalledWith("/me/vaccines?page=1&page_size=20&query=hepa");
  });

  it("reload volta à primeira página", async () => {
    vi.mocked(apiFetch)
      .mockReturnValueOnce(page([{ id: 1 }], { total: 2, hasNext: true }))
      .mockReturnValueOnce(page([{ id: 2 }], { page: 2, total: 2 }))
      .mockReturnValueOnce(page([{ id: 3 }], { total: 1 }));
    const { result } = renderHook(() => usePaginatedResource("/me/vaccines", { fallback: FALLBACK }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => { await result.current.loadMore(); });

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.items).toEqual([{ id: 3 }]));
    expect(apiFetch).toHaveBeenLastCalledWith("/me/vaccines?page=1&page_size=20");
  });

  it("mostra erro padronizado na primeira página e encerra sessão em 401", async () => {
    vi.mocked(apiFetch).mockReturnValueOnce(failure(503));
    const { result } = renderHook(() => usePaginatedResource("/me/vaccines", { fallback: FALLBACK }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe(FALLBACK);

    vi.mocked(apiFetch).mockReturnValueOnce(failure(401));
    act(() => result.current.reload());
    await waitFor(() => expect(useSessionStore.getState().status).toBe("unauthenticated"));
  });

  it("fica ocioso sem caminho", () => {
    const { result } = renderHook(() => usePaginatedResource(null, { fallback: FALLBACK }));

    expect(result.current.status).toBe("idle");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("cancela a requisição anterior quando pedido", async () => {
    const stale = deferred();
    vi.mocked(apiFetch)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(page([{ id: 2 }]));
    const { result, rerender } = renderHook(
      ({ query }) => usePaginatedResource("/medical/patients", {
        fallback: FALLBACK,
        params: { query },
        abortStale: true,
      }),
      { initialProps: { query: "Carlos" } },
    );

    rerender({ query: "Helena" });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const [, firstOptions] = vi.mocked(apiFetch).mock.calls[0];
    expect(firstOptions.signal.aborted).toBe(true);
    expect(vi.mocked(apiFetch).mock.calls[1][1].signal.aborted).toBe(false);
    expect(result.current.items).toEqual([{ id: 2 }]);
  });
});
