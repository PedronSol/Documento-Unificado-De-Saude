import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PatientRegistration } from "@/components/auth/patient-registration";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

vi.mock("@/components/auth/google-sign-in-button", () => ({
  GoogleSignInButton: ({ onCredential }) => (
    <button type="button" onClick={() => onCredential("google-id-token") }>
      Continuar com Google
    </button>
  ),
}));


async function fillLocalRegistration(user) {
  await user.type(screen.getByLabelText("E-mail"), "novo@example.com");
  await user.type(screen.getByLabelText("Nome completo"), "Novo Paciente");
  await user.type(screen.getByLabelText("Como prefere ser chamado"), "Novo");
  await user.type(screen.getByLabelText("CPF"), "529.982.247-25");
  await user.type(screen.getByLabelText("Data de nascimento"), "1992-09-20");
  await user.type(screen.getByLabelText("Crie uma senha"), "senha-local-segura");
  await user.type(screen.getByLabelText("Confirme a senha"), "senha-local-segura");
}


describe("PatientRegistration", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("sinaliza campos obrigatórios antes do envio", () => {
    const { container } = render(
      <PatientRegistration googleClientId="" onSuccess={vi.fn()} />,
    );

    expect(
      screen.getByText("Campos marcados com * são obrigatórios."),
    ).toBeInTheDocument();
    const inputs = container.querySelectorAll("form input");
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input).toBeRequired();
      const mark = input.closest(".field-group").querySelector(".required-mark");
      expect(mark).toHaveTextContent("*");
      expect(mark).toHaveAttribute("aria-hidden", "true");
    }
    expect(screen.getByRole("textbox", { name: "E-mail" })).toBeInTheDocument();
  });

  it("aplica máscara e limite ao CPF do cadastro local", async () => {
    const user = userEvent.setup();
    render(<PatientRegistration googleClientId="" onSuccess={vi.fn()} />);

    const cpf = screen.getByLabelText("CPF");
    await user.type(cpf, "52998224725999");

    expect(cpf).toHaveValue("529.982.247-25");
    expect(cpf).toHaveAttribute("maxLength", "14");
    expect(cpf).toHaveAttribute("inputMode", "numeric");
  });

  it("aplica máscara ao CPF do onboarding Google", async () => {
    apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "onboarding_required" }),
    });
    const user = userEvent.setup();
    render(
      <PatientRegistration googleClientId="client-id" onSuccess={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Conta Google" }));
    await user.click(screen.getByRole("button", { name: "Continuar com Google" }));
    const cpf = await screen.findByLabelText("CPF");
    await user.type(cpf, "52998224725");

    expect(cpf).toHaveValue("529.982.247-25");
    expect(cpf).toHaveAttribute("maxLength", "14");
    expect(cpf).toHaveAttribute("inputMode", "numeric");
  });

  it("permite visualizar a senha sem perder o valor", async () => {
    const user = userEvent.setup();
    render(<PatientRegistration googleClientId="" onSuccess={vi.fn()} />);

    const password = screen.getByLabelText("Crie uma senha");
    await user.type(password, "senha-local-segura");
    const toggle = screen.getByRole("button", { name: "Mostrar senha" });
    expect(password).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("senha-local-segura");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveFocus();
    expect(password).toHaveAttribute("minLength", "8");
    expect(password).toHaveAttribute("placeholder", "Mínimo de 8 caracteres");
    expect(screen.getByLabelText("Confirme a senha")).toHaveAttribute("minLength", "8");
    expect(
      screen.getByRole("button", { name: "Mostrar confirmação de senha" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("bloqueia o envio quando as senhas não coincidem", async () => {
    const user = userEvent.setup();
    render(<PatientRegistration googleClientId="" onSuccess={vi.fn()} />);

    await fillLocalRegistration(user);
    const confirmation = screen.getByLabelText("Confirme a senha");
    await user.clear(confirmation);
    await user.type(confirmation, "senha-diferente-123");
    await user.click(screen.getByRole("button", { name: "Criar minha conta" }));

    expect(apiFetch).not.toHaveBeenCalled();
    const message = screen.getByText("As senhas não coincidem.");
    expect(confirmation).toHaveAttribute("aria-invalid", "true");
    expect(confirmation).toHaveAttribute("aria-describedby", message.id);
    expect(confirmation).toHaveFocus();

    await user.type(confirmation, "x");

    expect(screen.queryByText("As senhas não coincidem.")).not.toBeInTheDocument();
    expect(confirmation).not.toHaveAttribute("aria-invalid");
  });

  it("cria conta local de paciente sem exigir Google", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<PatientRegistration googleClientId="" onSuccess={onSuccess} />);

    await fillLocalRegistration(user);
    await user.click(screen.getByRole("button", { name: "Criar minha conta" }));

    expect(apiFetch).toHaveBeenCalledWith("/auth/patient-registration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "novo@example.com",
        password: "senha-local-segura",
        cpf: "529.982.247-25",
        display_name: "Novo Paciente",
        preferred_name: "Novo",
        birth_date: "1992-09-20",
      }),
    });
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText(/role|crm/i)).not.toBeInTheDocument();
  });

  it("mantém a credencial Google somente em memória durante o onboarding", async () => {
    apiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "onboarding_required" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <PatientRegistration
        googleClientId="client-id.apps.googleusercontent.com"
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Conta Google" }));
    await user.click(screen.getByRole("button", { name: "Continuar com Google" }));

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "google-id-token" }),
    });
    expect(await screen.findByLabelText("CPF")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("google-id-token")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("CPF"), "529.982.247-25");
    await user.type(screen.getByLabelText("Como prefere ser chamado"), "Novo");
    await user.type(screen.getByLabelText("Data de nascimento"), "1992-09-20");
    await user.click(screen.getByRole("button", { name: "Concluir cadastro" }));

    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/auth/google/patient-registration",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: "google-id-token",
          cpf: "529.982.247-25",
          preferred_name: "Novo",
          birth_date: "1992-09-20",
        }),
      },
    );
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("informa conflito cadastral sem apagar os dados preenchidos", async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Dados cadastrais já utilizados." }),
    });
    const user = userEvent.setup();
    render(<PatientRegistration googleClientId="" onSuccess={vi.fn()} />);

    await fillLocalRegistration(user);
    await user.click(screen.getByRole("button", { name: "Criar minha conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dados cadastrais já utilizados.",
    );
    expect(screen.getByLabelText("E-mail")).toHaveValue("novo@example.com");
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
    expect(screen.getByRole("button", { name: "Criar minha conta" })).toBeEnabled();
  });
});
