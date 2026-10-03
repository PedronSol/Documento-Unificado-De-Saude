import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));


describe("LoginForm", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("oferece campos e controles com nomes acessíveis sem seletor de role", async () => {
    const user = userEvent.setup();
    render(<LoginForm onSuccess={vi.fn()} />);

    expect(screen.getByLabelText("E-mail")).toHaveAttribute("type", "email");
    const password = screen.getByLabelText("Senha");
    expect(password).toHaveAttribute("type", "password");
    expect(screen.queryByLabelText(/médico|paciente/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));

    expect(password).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Ocultar senha" }),
    ).toBeInTheDocument();
  });

  it("anuncia conta inativa sem apagar os dados digitados", async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Conta inativa." }),
    });
    const user = userEvent.setup();
    render(<LoginForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("E-mail"), "inativa@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-forte");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Conta inativa.");
    expect(screen.getByLabelText("E-mail")).toHaveValue("inativa@example.com");
    expect(screen.getByLabelText("Senha")).toHaveValue("senha-forte");
  });

  it("mostra falha de rede e devolve o formulário ao estado editável", async () => {
    apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<LoginForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-forte");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível acessar o serviço. Tente novamente.",
    );
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("notifica sucesso após autenticação", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<LoginForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-forte");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(onSuccess).toHaveBeenCalledOnce();
  });
});
