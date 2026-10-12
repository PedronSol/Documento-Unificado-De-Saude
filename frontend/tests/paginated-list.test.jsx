import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InfiniteListFooter } from "@/components/ui/infinite-list-footer";
import { ListToolbar } from "@/components/ui/list-toolbar";


let observers = [];

class FakeIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.elements = [];
    observers.push(this);
  }

  observe(element) {
    this.elements.push(element);
  }

  disconnect() {
    this.elements = [];
  }

  trigger(isIntersecting = true) {
    this.callback(this.elements.map((target) => ({ target, isIntersecting })));
  }
}


function resource(overrides = {}) {
  return {
    status: "ready",
    items: Array.from({ length: 20 }, (_, index) => ({ id: index })),
    total: 45,
    hasNext: true,
    isLoadingMore: false,
    loadMoreError: null,
    loadMore: vi.fn(),
    ...overrides,
  };
}


describe("InfiniteListFooter", () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carrega mais quando o sentinela entra na tela", () => {
    const list = resource();
    render(<InfiniteListFooter resource={list} itemLabel="vacinas" />);

    act(() => observers.at(-1).trigger(true));

    expect(list.loadMore).toHaveBeenCalledOnce();
  });

  it("não carrega automaticamente após falha e oferece tentar novamente", async () => {
    const list = resource({ loadMoreError: "Não foi possível carregar suas vacinas." });
    const user = userEvent.setup();
    render(<InfiniteListFooter resource={list} itemLabel="vacinas" />);

    act(() => observers.at(-1)?.trigger(true));
    expect(list.loadMore).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar suas vacinas.");

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(list.loadMore).toHaveBeenCalledOnce();
  });

  it("mantém o botão acessível e anuncia o progresso", async () => {
    const list = resource();
    const user = userEvent.setup();
    render(<InfiniteListFooter resource={list} itemLabel="vacinas" />);

    expect(screen.getByRole("status")).toHaveTextContent("20 de 45 vacinas carregadas");
    const button = screen.getByRole("button", { name: "Carregar mais" });
    button.focus();
    await user.keyboard("{Enter}");
    expect(list.loadMore).toHaveBeenCalledOnce();
    expect(button).toHaveFocus();
  });

  it("mostra estado de carregamento e some ao fim da lista", () => {
    const { rerender } = render(
      <InfiniteListFooter resource={resource({ isLoadingMore: true })} itemLabel="vacinas" />,
    );
    expect(screen.getByRole("button", { name: "Carregando…" })).toBeDisabled();

    rerender(
      <InfiniteListFooter
        resource={resource({ hasNext: false, page: 3, total: 45, items: new Array(45).fill(0).map((_, id) => ({ id })) })}
        itemLabel="vacinas"
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("45 de 45 vacinas carregadas");
  });

  it("não anuncia progresso em lista curta de uma página", () => {
    render(
      <InfiniteListFooter
        resource={resource({ hasNext: false, page: 1, items: [{ id: 1 }], total: 1 })}
        itemLabel="vacinas"
      />,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("funciona sem IntersectionObserver usando o botão", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const list = resource();
    const user = userEvent.setup();
    render(<InfiniteListFooter resource={list} itemLabel="vacinas" />);

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(list.loadMore).toHaveBeenCalledOnce();
  });
});


describe("ListToolbar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aplica a busca após 300 ms e somente a partir de 2 caracteres", () => {
    const onQueryChange = vi.fn();
    render(
      <ListToolbar
        searchLabel="Buscar vacinas"
        query=""
        onQueryChange={onQueryChange}
        pageSize={20}
        onPageSizeChange={vi.fn()}
        total={45}
      />,
    );

    const input = screen.getByRole("searchbox", { name: "Buscar vacinas" });
    fireEvent.change(input, { target: { value: "h" } });
    act(() => vi.advanceTimersByTime(300));
    expect(onQueryChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "hepa" } });
    act(() => vi.advanceTimersByTime(299));
    expect(onQueryChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onQueryChange).toHaveBeenCalledWith("hepa");
  });

  it("limpa a busca imediatamente", async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ListToolbar
        searchLabel="Buscar vacinas"
        query="hepa"
        onQueryChange={onQueryChange}
        pageSize={20}
        onPageSizeChange={vi.fn()}
        total={1}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(onQueryChange).toHaveBeenCalledWith("");
  });

  it("mostra total, filtros e itens por página", async () => {
    const onPageSizeChange = vi.fn();
    const onFilterChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ListToolbar
        searchLabel="Buscar vacinas"
        query=""
        onQueryChange={vi.fn()}
        filters={[{
          id: "vaccine-status-filter",
          label: "Status",
          value: "",
          onChange: onFilterChange,
          options: [
            { value: "applied", label: "Aplicada" },
            { value: "pending", label: "Pendente" },
          ],
        }]}
        pageSize={20}
        onPageSizeChange={onPageSizeChange}
        total={45}
      />,
    );

    expect(screen.getByText("45 resultados")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Status"));
    await user.click(screen.getByRole("option", { name: "Pendente" }));
    expect(onFilterChange).toHaveBeenCalledWith("pending");

    await user.click(screen.getByLabelText("Itens por página"));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "10", "20", "50", "100",
    ]);
    await user.click(screen.getByRole("option", { name: "50" }));
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("usa o singular para um resultado", () => {
    render(
      <ListToolbar
        searchLabel="Buscar vacinas"
        query=""
        onQueryChange={vi.fn()}
        pageSize={20}
        onPageSizeChange={vi.fn()}
        total={1}
      />,
    );

    expect(screen.getByText("1 resultado")).toBeInTheDocument();
  });

  it("volta o filtro para todos", async () => {
    const onFilterChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ListToolbar
        searchLabel="Buscar vacinas"
        query=""
        onQueryChange={vi.fn()}
        filters={[{
          id: "vaccine-status-filter",
          label: "Status",
          value: "pending",
          onChange: onFilterChange,
          options: [{ value: "pending", label: "Pendente" }],
        }]}
        pageSize={20}
        onPageSizeChange={vi.fn()}
        total={2}
      />,
    );

    await user.click(screen.getByLabelText("Status"));
    await user.click(screen.getByRole("option", { name: "Todos" }));
    expect(onFilterChange).toHaveBeenCalledWith("");
  });
});
