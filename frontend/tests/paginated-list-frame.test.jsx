import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PaginatedList } from "@/components/ui/paginated-list";


function list(overrides = {}) {
  return {
    resource: {
      status: "ready",
      items: [{ id: 1, name: "BCG" }],
      total: 1,
      hasNext: false,
      isLoadingMore: false,
      loadMoreError: null,
      error: null,
      loadMore: vi.fn(),
      reload: vi.fn(),
      ...overrides.resource,
    },
    query: "",
    setQuery: vi.fn(),
    filters: {},
    setFilter: vi.fn(),
    pageSize: 20,
    setPageSize: vi.fn(),
    clear: vi.fn(),
    isFiltered: false,
    ...overrides.list,
  };
}

function renderList(state, props = {}) {
  return render(
    <PaginatedList
      list={state}
      searchLabel="Buscar vacinas"
      itemLabel="vacinas"
      loadingText="Carregando vacinas…"
      emptyText="Nenhuma vacina registrada."
      retryLabel="Recarregar vacinas"
      renderItems={(items) => (
        <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
      )}
      {...props}
    />,
  );
}


describe("PaginatedList", () => {
  it("esconde a barra em listas curtas sem filtro", () => {
    renderList(list());

    expect(screen.getByText("BCG")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("mostra a barra quando há mais de 10 itens", () => {
    renderList(list({ resource: { total: 11, hasNext: false } }));

    expect(screen.getByRole("searchbox", { name: "Buscar vacinas" })).toBeInTheDocument();
    expect(screen.getByText("11 resultados")).toBeInTheDocument();
  });

  it("mantém a barra durante busca ativa mesmo com poucos resultados", () => {
    renderList(list({ list: { isFiltered: true, query: "bc" }, resource: { total: 1 } }));

    expect(screen.getByRole("searchbox", { name: "Buscar vacinas" })).toBeInTheDocument();
  });

  it("mostra carregamento, erro com nova tentativa e vazio filtrado", async () => {
    const user = userEvent.setup();
    const { rerender } = renderList(list({ resource: { status: "loading", items: [] } }));
    expect(screen.getByRole("status")).toHaveTextContent("Carregando vacinas…");

    const failed = list({ resource: { status: "error", items: [], error: "Falhou." } });
    rerender(
      <PaginatedList
        list={failed}
        searchLabel="Buscar vacinas"
        itemLabel="vacinas"
        loadingText="Carregando vacinas…"
        emptyText="Nenhuma vacina registrada."
        retryLabel="Recarregar vacinas"
        renderItems={() => null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Recarregar vacinas" }));
    expect(failed.resource.reload).toHaveBeenCalledOnce();

    const empty = list({ resource: { items: [], total: 0 }, list: { isFiltered: true, query: "xyz" } });
    rerender(
      <PaginatedList
        list={empty}
        searchLabel="Buscar vacinas"
        itemLabel="vacinas"
        loadingText="Carregando vacinas…"
        emptyText="Nenhuma vacina registrada."
        retryLabel="Recarregar vacinas"
        renderItems={() => null}
      />,
    );
    expect(screen.getByText('Nenhum resultado para "xyz".')).toBeInTheDocument();
  });

  it("omite a busca quando a lista não pesquisa", () => {
    renderList(list({ resource: { total: 30, hasNext: true } }), { searchLabel: null });

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Itens por página")).toBeInTheDocument();
  });

  it("usa o vazio personalizado da feature quando não há filtro", () => {
    renderList(list({ resource: { items: [], total: 0 } }), {
      renderEmpty: () => <strong>Nenhum documento disponível.</strong>,
    });

    expect(screen.getByText("Nenhum documento disponível.").tagName).toBe("STRONG");
  });
});
