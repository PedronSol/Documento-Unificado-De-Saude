import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));


describe("LoginForm", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("oferece campos e controles com nomes acessíveis sem seletor de role", async () => {
    const user = userEvent.setup();
    render(<LoginForm onSuccess={vi.fn()} />);

    expect(await screen.findByLabelText("E-mail")).toHaveAttribute("type", "email");
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

    await user.type(await screen.findByLabelText("E-mail"), "inativa@example.com");
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

    await user.type(await screen.findByLabelText("E-mail"), "ana@example.com");
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

    await user.type(await screen.findByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-forte");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(onSuccess).toHaveBeenCalledOnce();
  });

  describe("sessão persistente e conta lembrada", () => {
    function routeApi(routes) {
      apiFetch.mockImplementation(async (path, options = {}) => {
        const handler = routes[`${options.method || "GET"} ${path}`];
        if (!handler) {
          throw new Error(`Rota inesperada: ${options.method || "GET"} ${path}`);
        }
        return handler(options);
      });
    }

    const noSession = () => ({ ok: false, status: 401, json: async () => ({}) });
    const rememberedAccount = () => ({
      ok: true,
      status: 200,
      json: async () => ({ first_name: "Carlos", masked_email: "c•••@email.com" }),
    });

    it("leva a /home sem exibir o formulário quando a sessão é válida", async () => {
      routeApi({ "GET /me": () => ({ ok: true, status: 200, json: async () => ({}) }) });
      const onAuthenticated = vi.fn();
      render(<LoginForm onSuccess={vi.fn()} onAuthenticated={onAuthenticated} />);

      expect(screen.getByRole("status")).toHaveTextContent("Verificando sua sessão");
      expect(screen.queryByLabelText("E-mail")).not.toBeInTheDocument();
      await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce());
      expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
    });

    it("mostra o formulário completo sem sessão nem conta lembrada", async () => {
      routeApi({
        "GET /me": noSession,
        "GET /auth/remembered": () => ({ ok: true, status: 204 }),
      });
      render(<LoginForm onSuccess={vi.fn()} onAuthenticated={vi.fn()} />);

      expect(await screen.findByLabelText("E-mail")).toBeInTheDocument();
      expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    });

    it("mostra o formulário completo quando a verificação falha na rede", async () => {
      apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
      render(<LoginForm onSuccess={vi.fn()} onAuthenticated={vi.fn()} />);

      expect(await screen.findByLabelText("E-mail")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("pede somente a senha da conta lembrada", async () => {
      let submitted;
      routeApi({
        "GET /me": noSession,
        "GET /auth/remembered": rememberedAccount,
        "POST /login/remembered": (options) => {
          submitted = options.body;
          return { ok: true, status: 200, json: async () => ({}) };
        },
      });
      const onSuccess = vi.fn();
      const user = userEvent.setup();
      render(<LoginForm onSuccess={onSuccess} onAuthenticated={vi.fn()} />);

      expect(await screen.findByText("Olá, Carlos")).toBeInTheDocument();
      expect(screen.getByText("c•••@email.com")).toBeInTheDocument();
      expect(screen.queryByLabelText("E-mail")).not.toBeInTheDocument();

      await user.type(screen.getByLabelText("Senha"), "senha-forte");
      await user.click(screen.getByRole("button", { name: "Entrar" }));

      expect(onSuccess).toHaveBeenCalledOnce();
      expect([...submitted.keys()]).toEqual(["password"]);
      expect(submitted.get("password")).toBe("senha-forte");
    });

    it("mantém a conta lembrada após senha incorreta", async () => {
      routeApi({
        "GET /me": noSession,
        "GET /auth/remembered": rememberedAccount,
        "POST /login/remembered": () => ({
          ok: false,
          status: 401,
          json: async () => ({ detail: "E-mail ou senha incorretos." }),
        }),
      });
      const user = userEvent.setup();
      render(<LoginForm onSuccess={vi.fn()} onAuthenticated={vi.fn()} />);

      await user.type(await screen.findByLabelText("Senha"), "errada");
      await user.click(screen.getByRole("button", { name: "Entrar" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "E-mail ou senha incorretos.",
      );
      expect(screen.getByText("Olá, Carlos")).toBeInTheDocument();
      expect(screen.queryByLabelText("E-mail")).not.toBeInTheDocument();
    });

    it("esquece a conta lembrada ao usar outra conta", async () => {
      const forget = vi.fn(() => ({ ok: true, status: 204 }));
      routeApi({
        "GET /me": noSession,
        "GET /auth/remembered": rememberedAccount,
        "DELETE /auth/remembered": forget,
      });
      const user = userEvent.setup();
      render(<LoginForm onSuccess={vi.fn()} onAuthenticated={vi.fn()} />);

      await user.click(await screen.findByRole("button", { name: "Usar outra conta" }));

      expect(forget).toHaveBeenCalledOnce();
      expect(await screen.findByLabelText("E-mail")).toHaveFocus();
      expect(screen.queryByText("Olá, Carlos")).not.toBeInTheDocument();
    });

    it("não grava identidade em Web Storage", async () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      routeApi({
        "GET /me": noSession,
        "GET /auth/remembered": rememberedAccount,
      });
      render(<LoginForm onSuccess={vi.fn()} onAuthenticated={vi.fn()} />);

      await screen.findByText("Olá, Carlos");

      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();
    });
  });
});
