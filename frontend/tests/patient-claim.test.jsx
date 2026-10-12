import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PatientClaim } from "@/components/auth/patient-claim";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

let emitCredential;
vi.mock("@/components/auth/google-sign-in-button", () => ({
  GoogleSignInButton: ({ onCredential, disabled }) => {
    emitCredential = onCredential;
    return <button type="button" disabled={disabled}>Continuar com Google</button>;
  },
}));

const TOKEN = "p".repeat(43);

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

async function fillIdentity(user) {
  await user.type(await screen.findByLabelText("CPF"), "529.982.247-25");
  await user.type(screen.getByLabelText("Data de nascimento"), "1979-08-15");
}


describe("PatientClaim", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    emitCredential = undefined;
    window.history.replaceState(null, "", `/patient-claim#token=${TOKEN}`);
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("remove o token da URL e assume a conta com e-mail e senha", async () => {
    apiFetch.mockReturnValue(respondWith({ user: { roles: ["patient"] } }, 201));
    const onCompleted = vi.fn();
    const user = userEvent.setup();
    render(<PatientClaim googleClientId="client-id" onCompleted={onCompleted} />);

    await fillIdentity(user);
    expect(window.location.hash).toBe("");
    await user.type(screen.getByLabelText("E-mail"), "joana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-paciente-segura");
    await user.click(screen.getByRole("button", { name: "Assumir minha conta" }));

    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(apiFetch).toHaveBeenCalledWith("/auth/patient-claim/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: TOKEN,
        cpf: "529.982.247-25",
        birth_date: "1979-08-15",
        email: "joana@example.com",
        password: "senha-paciente-segura",
      }),
    });
  });

  it("assume a conta com Google depois de confirmar CPF e nascimento", async () => {
    apiFetch.mockReturnValue(respondWith({ user: { roles: ["patient"] } }, 201));
    const onCompleted = vi.fn();
    const user = userEvent.setup();
    render(<PatientClaim googleClientId="client-id" onCompleted={onCompleted} />);

    await user.click(await screen.findByRole("button", { name: "Conta Google" }));
    expect(screen.getByRole("button", { name: "Continuar com Google" })).toBeDisabled();
    await fillIdentity(user);
    expect(screen.getByRole("button", { name: "Continuar com Google" })).toBeEnabled();
    emitCredential("google-id-token");

    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(apiFetch).toHaveBeenCalledWith("/auth/google/patient-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: TOKEN,
        cpf: "529.982.247-25",
        birth_date: "1979-08-15",
        credential: "google-id-token",
      }),
    });
  });

  it.each([
    [403, "Link inválido, expirado ou dados que não conferem. Após 5 tentativas o link é bloqueado."],
    [409, "Esse e-mail ou conta Google já está em uso."],
    [422, "Revise os dados informados. A senha precisa ter ao menos 12 caracteres."],
  ])("explica a resposta %s sem detalhes internos", async (status, message) => {
    apiFetch.mockReturnValue(respondWith({ detail: "interno" }, status));
    const user = userEvent.setup();
    render(<PatientClaim googleClientId="client-id" onCompleted={vi.fn()} />);

    await fillIdentity(user);
    await user.type(screen.getByLabelText("E-mail"), "joana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-paciente-segura");
    await user.click(screen.getByRole("button", { name: "Assumir minha conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("pede a data de nascimento do dependente em link de responsável", async () => {
    window.history.replaceState(null, "", `/patient-claim#token=${TOKEN}&for=guardian`);
    apiFetch.mockReturnValue(respondWith({ user: { roles: ["patient"] } }, 201));
    const onCompleted = vi.fn();
    const user = userEvent.setup();
    render(<PatientClaim googleClientId="client-id" onCompleted={onCompleted} />);

    await fillIdentity(user);
    await user.type(screen.getByLabelText("Data de nascimento do dependente"), "2016-05-02");
    await user.type(screen.getByLabelText("E-mail"), "joana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-paciente-segura");
    await user.click(screen.getByRole("button", { name: "Assumir minha conta" }));

    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({
      token: TOKEN,
      cpf: "529.982.247-25",
      birth_date: "1979-08-15",
      dependent_birth_date: "2016-05-02",
      email: "joana@example.com",
      password: "senha-paciente-segura",
    });
  });

  it("orienta quando o link não contém token", async () => {
    window.history.replaceState(null, "", "/patient-claim");
    render(<PatientClaim googleClientId="client-id" onCompleted={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Link incompleto. Peça ao seu médico um novo link para assumir a conta.",
    );
  });
});
