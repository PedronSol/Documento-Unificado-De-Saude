import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";
import { apiFetch } from "@/lib/api";


const google = vi.hoisted(() => ({ onCredential: null }));
const CLIENT_ID = "test-client.apps.googleusercontent.com";
const CREDENTIAL = "test-google-credential";
const USER = { user_id: 7, display_name: "Ana", email: "ana@example.com", roles: ["patient"] };

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

vi.mock("@/components/auth/google-sign-in-button", () => ({
  GoogleSignInButton: ({ clientId, onCredential, disabled }) => {
    google.onCredential = onCredential;
    return <button type="button" disabled={disabled} data-client-id={clientId}
      onClick={() => onCredential(CREDENTIAL)}>Continuar com Google</button>;
  },
}));

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function routeAccess({ remembered = false, authenticate = async () => response({ user: USER }) } = {}) {
  apiFetch.mockImplementation(async (path, options = {}) => {
    if (path === "/me") return response({}, 401);
    if (path === "/auth/remembered" && !options.method) {
      return remembered ? response({ first_name: "Carlos", masked_email: "c•••@email.com" }) : response(null, 204);
    }
    if (options.method === "POST") return authenticate(path, options);
    throw new Error(`Unexpected request: ${path}`);
  });
}

describe("Google no login", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    google.onCredential = null;
    routeAccess();
  });
  afterEach(() => vi.restoreAllMocks());

  it("oferece Google fora do formulário de senha e entra sem preencher os campos", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<LoginForm googleClientId={CLIENT_ID} onSuccess={onSuccess} />);
    const button = await screen.findByRole("button", { name: "Continuar com Google" });
    expect(button).toHaveAttribute("data-client-id", CLIENT_ID);
    expect(button.closest("form")).toBeNull();
    expect(screen.getByLabelText("E-mail")).toHaveValue("");
    expect(screen.getByLabelText("Senha")).toHaveValue("");

    await user.click(button);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(apiFetch).toHaveBeenCalledWith("/auth/google", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: CREDENTIAL }),
    });
    expect(apiFetch.mock.calls.filter(([path]) => path === "/login")).toHaveLength(0);
  });

  it("permite entrar com outra identidade Google diante de uma conta lembrada", async () => {
    routeAccess({ remembered: true });
    const onSuccess = vi.fn();
    render(<LoginForm googleClientId={CLIENT_ID} onSuccess={onSuccess} />);
    await screen.findByText("Olá, Carlos");
    await userEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(apiFetch.mock.calls.filter(([, options]) => options?.method)).toEqual([
      ["/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: CREDENTIAL }) }],
    ]);
  });

  it("orienta onboarding sem autenticar, cadastrar ou guardar a credencial", async () => {
    routeAccess({ authenticate: async () => response({ status: "onboarding_required" }) });
    const onSuccess = vi.fn();
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<LoginForm googleClientId={CLIENT_ID} onSuccess={onSuccess} />);
    await userEvent.click(await screen.findByRole("button", { name: "Continuar com Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cadastro/);
    expect(screen.getByRole("alert")).toHaveTextContent(/configurações/);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(CREDENTIAL);
    expect(window.location.href).not.toContain(CREDENTIAL);
    expect(apiFetch.mock.calls.filter(([path]) => path.includes("patient-registration"))).toHaveLength(0);
  });

  it("mantém o login local e explica a ausência de client ID sem montar o SDK", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await screen.findByLabelText("E-mail");
    expect(screen.getByText("O acesso com Google não está disponível neste ambiente. Use e-mail e senha.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar com Google" })).not.toBeInTheDocument();
    expect(google.onCredential).toBeNull();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it.each([
    [401, "Não foi possível autenticar com Google. Tente novamente."],
    [403, "Não foi possível acessar esta conta."],
    [404, "O acesso com Google não está disponível neste ambiente. Use e-mail e senha."],
    [409, "Não foi possível entrar com Google agora. Tente novamente."],
    [422, "Não foi possível entrar com Google agora. Tente novamente."],
    [503, "Não foi possível entrar com Google agora. Tente novamente."],
  ])("anuncia erro controlado em %i e preserva os campos locais", async (status, message) => {
    routeAccess({ authenticate: async () => response({ detail: "SQL / claims / internal details" }, status) });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<LoginForm googleClientId={CLIENT_ID} onSuccess={onSuccess} />);
    await user.type(await screen.findByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-local");
    await user.click(screen.getByRole("button", { name: "Continuar com Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("E-mail")).toHaveValue("ana@example.com");
    expect(screen.getByLabelText("Senha")).toHaveValue("senha-local");
    expect(screen.getByRole("button", { name: "Continuar com Google" })).toBeEnabled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("internal details");
  });

  it.each(["rede", "json", "contrato"])("permite repetir após falha de %s", async (failure) => {
    const authenticate = vi.fn().mockImplementationOnce(async () => {
      if (failure === "rede") throw new TypeError("Failed to fetch");
      if (failure === "json") return { ...response(null), json: async () => { throw new SyntaxError("invalid JSON"); } };
      return response({ user: {} });
    }).mockResolvedValueOnce(response({ user: USER }));
    routeAccess({ authenticate });
    const onSuccess = vi.fn();
    render(<LoginForm googleClientId={CLIENT_ID} onSuccess={onSuccess} />);
    const button = await screen.findByRole("button", { name: "Continuar com Google" });
    await userEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível entrar com Google agora. Tente novamente.");
    expect(onSuccess).not.toHaveBeenCalled();
    await userEvent.click(button);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("bloqueia callbacks repetidos e submit local durante autenticação Google", async () => {
    let finish;
    const authenticate = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    routeAccess({ remembered: true, authenticate });
    const onSuccess = vi.fn();
    render(<LoginForm googleClientId={CLIENT_ID} onSuccess={onSuccess} />);
    await screen.findByText("Olá, Carlos");

    act(() => { google.onCredential(CREDENTIAL); google.onCredential(CREDENTIAL); });
    fireEvent.submit(screen.getByLabelText("Senha").closest("form"));

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Senha")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continuar com Google" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Usar outra conta" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Entrando com Google");
    await act(async () => finish(response({ user: USER })));
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("bloqueia Google enquanto o login local está pendente", async () => {
    let finish;
    const authenticate = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    routeAccess({ authenticate });
    const user = userEvent.setup();
    render(<LoginForm googleClientId={CLIENT_ID} onSuccess={vi.fn()} />);
    await user.type(await screen.findByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-local");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await act(async () => { await google.onCredential(CREDENTIAL); });
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(authenticate).toHaveBeenCalledWith("/login", expect.anything());
    await act(async () => finish(response({ user: USER })));
  });

  it("não monta Google enquanto verifica uma sessão existente", async () => {
    let finish;
    apiFetch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const onAuthenticated = vi.fn();
    render(<LoginForm googleClientId={CLIENT_ID} onAuthenticated={onAuthenticated} />);
    expect(screen.getByRole("status")).toHaveTextContent("Verificando sua sessão");
    expect(google.onCredential).toBeNull();
    await act(async () => finish(response({ user: USER })));
    expect(onAuthenticated).toHaveBeenCalledOnce();
    expect(google.onCredential).toBeNull();
  });
});
