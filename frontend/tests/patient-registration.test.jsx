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
}


describe("PatientRegistration", () => {
  beforeEach(() => {
    apiFetch.mockReset();
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
