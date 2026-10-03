import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedHome } from "@/components/identity/authenticated-home";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const patientEnvelope = {
  message: "Sessão válida.",
  user: {
    user_id: 42,
    display_name: "Dra. Helena Costa",
    email: "helena@example.com",
    roles: ["patient", "doctor"],
  },
  patient_data: {
    nome_paciente: "Helena",
    nome_completo: "Dra. Helena Costa",
    avatar: null,
    status_saude: "updated",
    tipo_sanguineo: "A-",
    valor_qr: null,
    maior_de_idade: true,
    idade: 38,
  },
  vaccines: [
    {
      id_vacina: 1,
      nome_vacina: "BCG reservada",
      dose: "Dose única",
      data_aplicacao: "2025-01-15",
      status_vacina: "applied",
    },
  ],
  alerts: [],
  documents: [],
};

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}


describe("AuthenticatedHome", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("mostra credencial profissional sem renderizar conteúdo clínico", async () => {
    apiFetch.mockReturnValue(
      respondWith({
        message: "Sessão válida.",
        user: {
          user_id: 7,
          display_name: "Dr. Rui Lima",
          email: "rui@example.com",
          roles: ["doctor"],
        },
        patient_data: null,
        vaccines: [],
        alerts: [],
        documents: [],
      }),
    );

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "Área profissional" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dr. Rui Lima")).toBeInTheDocument();
    expect(screen.queryByText("Histórico de Vacinação")).not.toBeInTheDocument();
    expect(screen.queryByText("BCG reservada")).not.toBeInTheDocument();
  });

  it("mostra estado institucional para administração sem consultar conteúdo clínico", async () => {
    apiFetch.mockReturnValue(
      respondWith({
        message: "Sessão válida.",
        user: {
          user_id: 8,
          display_name: "Alex Ferreira",
          email: "admin@example.com",
          roles: ["admin"],
        },
        patient_data: null,
        vaccines: [],
        alerts: [],
        documents: [],
      }),
    );

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "Administração" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Alex Ferreira")).toBeInTheDocument();
    expect(screen.queryByText("Histórico de Vacinação")).not.toBeInTheDocument();
  });

  it("alterna uma conta combinada somente entre contextos autorizados", async () => {
    apiFetch.mockReturnValue(respondWith(patientEnvelope));
    const user = userEvent.setup();
    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    expect(await screen.findByText("BCG reservada")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Área profissional" }));

    expect(
      screen.getByRole("heading", { name: "Área profissional" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("BCG reservada")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Minha saúde" }));
    expect(await screen.findByText("BCG reservada")).toBeInTheDocument();
  });

  it("redireciona uma sessão ausente sem manter conteúdo protegido", async () => {
    apiFetch.mockReturnValue(
      respondWith({ detail: "Autenticação necessária." }, 401),
    );
    const onUnauthenticated = vi.fn();

    render(<AuthenticatedHome onUnauthenticated={onUnauthenticated} />);

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledOnce());
    expect(screen.queryByText("BCG reservada")).not.toBeInTheDocument();
  });

  it("não infere contexto administrativo quando a identidade não tem roles autorizadas", async () => {
    apiFetch.mockReturnValue(
      respondWith({
        message: "Sessão válida.",
        user: {
          user_id: 11,
          display_name: "Dr. Rui Lima",
          email: "rui@example.com",
          roles: [],
        },
        patient_data: null,
        vaccines: [],
        alerts: [],
        documents: [],
      }),
    );

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "Acesso indisponível" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Administração")).not.toBeInTheDocument();
    expect(screen.queryByText("Histórico de Vacinação")).not.toBeInTheDocument();
  });
});
