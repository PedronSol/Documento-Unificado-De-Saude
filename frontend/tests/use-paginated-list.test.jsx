import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ListEmptyState } from "@/components/ui/list-empty-state";
import { usePaginatedList } from "@/hooks/use-paginated-list";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

function emptyPage() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ items: [], page: 1, page_size: 20, total: 0, has_next: false }),
  });
}


describe("usePaginatedList", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(emptyPage);
  });

  it("combina busca, filtros e tamanho na requisição e limpa tudo", async () => {
    const { result } = renderHook(() => usePaginatedList("/me/documents", {
      fallback: "x",
      initialFilters: { type: "" },
    }));
    await waitFor(() => expect(result.current.resource.status).toBe("ready"));
    expect(result.current.isFiltered).toBe(false);

    act(() => {
      result.current.setQuery("eco");
      result.current.setFilter("type", "report");
      result.current.setPageSize(50);
    });

    await waitFor(() => expect(apiFetch).toHaveBeenLastCalledWith(
      "/me/documents?page=1&page_size=50&query=eco&type=report",
    ));
    expect(result.current.isFiltered).toBe(true);

    act(() => result.current.clear());
    await waitFor(() => expect(apiFetch).toHaveBeenLastCalledWith(
      "/me/documents?page=1&page_size=50",
    ));
    expect(result.current.isFiltered).toBe(false);
  });
});


describe("ListEmptyState", () => {
  it("mostra o vazio original sem filtros", () => {
    render(<ListEmptyState isFiltered={false} query="" emptyText="Nenhuma vacina registrada." onClear={vi.fn()} />);

    expect(screen.getByText("Nenhuma vacina registrada.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("distingue busca sem resultado e oferece limpar", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(<ListEmptyState isFiltered query="hepa" emptyText="Nenhuma vacina registrada." onClear={onClear} />);

    expect(screen.getByText('Nenhum resultado para "hepa".')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpar busca e filtros" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("explica filtros sem termo de busca", () => {
    render(<ListEmptyState isFiltered query="" emptyText="x" onClear={vi.fn()} />);

    expect(screen.getByText("Nenhum resultado para os filtros selecionados.")).toBeInTheDocument();
  });
});
