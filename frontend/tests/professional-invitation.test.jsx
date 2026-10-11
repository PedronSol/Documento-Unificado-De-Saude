import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfessionalInvitation } from "@/components/auth/professional-invitation";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

let emitCredential;
vi.mock("@/components/auth/google-sign-in-button", () => ({
  GoogleSignInButton: ({ onCredential }) => {
    emitCredential = onCredential;
    return <button type="button">Continuar com Google</button>;
  },
}));

const TOKEN = "t".repeat(43);

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}


describe("ProfessionalInvitation", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    emitCredential = undefined;
    window.history.replaceState(null, "", `/professional-invitation#token=${TOKEN}`);
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("remove o token da URL e conclui o convite com a credencial Google", async () => {
    apiFetch.mockReturnValue(respondWith({ user: { roles: [] } }, 201));
    const onCompleted = vi.fn();
    render(
      <ProfessionalInvitation googleClientId="client-id" onCompleted={onCompleted} />,
    );

    expect(await screen.findByRole("button", { name: "Continuar com Google" }))
      .toBeInTheDocument();
    expect(window.location.hash).toBe("");

    emitCredential("google-id-token");

    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(apiFetch).toHaveBeenCalledWith("/auth/google/doctor-invitation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential: "google-id-token",
        invitation_token: TOKEN,
      }),
    });
  });

  it.each([
    [403, "Convite inválido, expirado ou destinado a outro e-mail."],
    [409, "Já existe uma conta com estes dados. Entre com ela, vincule o Google em Configurações e abra o link de convite novamente."],
    [503, "Não foi possível concluir o convite agora. Tente novamente."],
  ])("explica a resposta %s sem detalhes internos", async (status, message) => {
    apiFetch.mockReturnValue(respondWith({ detail: "interno" }, status));
    render(<ProfessionalInvitation googleClientId="client-id" onCompleted={vi.fn()} />);

    await screen.findByRole("button", { name: "Continuar com Google" });
    emitCredential("google-id-token");

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText("interno")).toBeNull();
  });

  it("orienta quando o link não contém token", async () => {
    window.history.replaceState(null, "", "/professional-invitation");
    render(<ProfessionalInvitation googleClientId="client-id" onCompleted={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Link de convite incompleto. Solicite um novo link ao administrador.",
    );
    expect(screen.queryByRole("button", { name: "Continuar com Google" })).toBeNull();
  });

  it("informa quando o Google não está configurado", async () => {
    render(<ProfessionalInvitation googleClientId="" onCompleted={vi.fn()} />);

    expect(
      await screen.findByText(
        "O acesso com Google não está disponível neste ambiente. Contate o administrador responsável.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar com Google" })).toBeNull();
  });
});
