import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedHome } from "@/components/identity/authenticated-home";
import { apiFetch, setActingPatient } from "@/lib/api";


vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  setActingPatient: vi.fn(),
}));

const patientEnvelope = {
  user: {
    user_id: 42,
    display_name: "Dra. Helena Costa",
    email: "helena@example.com",
    roles: ["patient", "doctor"],
  },
  patient_profile: {
    preferred_name: "Helena",
    full_name: "Dra. Helena Costa",
    avatar_url: null,
    health_status: "updated",
    blood_type: "A-",
    is_adult: true,
    age: 38,
  },
};

const patientVaccines = [
  {
    vaccine_id: 1,
    name: "BCG reservada",
    dose: "Dose única",
    administered_on: "2025-01-15",
    status: "applied",
  },
];

const patientMarkers = [
  {
    marker_id: 21,
    type: "medication",
    name: "Losartana",
    description: "Uso contínuo",
    dosage: "50 mg",
    frequency: "1 vez ao dia",
    status: "active",
    created_at: "2026-10-06T18:30:00.123456",
    updated_at: "2026-10-06T18:30:00.123456",
    removed_at: null,
  },
];

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function mockPatientResources(overrides = {}) {
  apiFetch.mockImplementation((path) => {
    const responses = {
      "/me": patientEnvelope,
      "/me/vaccines": patientVaccines,
      "/me/alerts": [],
      "/me/documents": [],
      "/me/markers?status=active": patientMarkers,
      "/me/markers?status=removed": [],
      "/me/shares/active": null,
      ...overrides,
    };
    return respondWith(responses[path]);
  });
}


describe("AuthenticatedHome", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    setActingPatient.mockReset();
  });

  it("carrega os recursos do paciente em endpoints independentes", async () => {
    mockPatientResources();

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    expect(
      await screen.findByText("BCG reservada", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/me");
    expect(apiFetch).toHaveBeenCalledWith("/me/vaccines");
    expect(apiFetch).toHaveBeenCalledWith("/me/alerts");
    expect(apiFetch).toHaveBeenCalledWith("/me/documents");
    expect(apiFetch).toHaveBeenCalledWith("/me/markers?status=active");
    expect(apiFetch).toHaveBeenCalledWith("/me/shares/active");
    expect(await screen.findByText("Losartana")).toBeInTheDocument();
  });

  it("mantém os outros recursos quando documentos falham", async () => {
    apiFetch.mockImplementation((path) => {
      if (path === "/me/documents") {
        return respondWith({ detail: "Banco de dados indisponível." }, 503);
      }
      const responses = {
        "/me": patientEnvelope,
        "/me/vaccines": patientVaccines,
        "/me/alerts": [],
      };
      return respondWith(responses[path]);
    });

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    expect(await screen.findByText("BCG reservada")).toBeInTheDocument();
    expect(
      screen.getByRole("alert", {
        name: "Não foi possível carregar seus documentos.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recarregar documentos" }),
    ).toBeInTheDocument();
  });

  it("mostra estados vazios sem ocultar as seções do paciente", async () => {
    mockPatientResources({
      "/me/vaccines": [],
      "/me/alerts": [],
      "/me/documents": [],
    });

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    expect(await screen.findByText("Nenhuma vacina registrada.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum alerta médico.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum documento disponível.")).toBeInTheDocument();
  });

  it("gerencia foco e fechamento acessível no diálogo de vacina", async () => {
    mockPatientResources();
    const user = userEvent.setup();

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    await screen.findByText("BCG reservada");
    const trigger = screen.getByRole("button", { name: "Adicionar vacina" });
    await user.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "Registrar vacina" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nome da vacina")).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("cancela a remoção de vacina em diálogo acessível", async () => {
    mockPatientResources();
    const user = userEvent.setup();

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    await screen.findByText("BCG reservada");
    const trigger = screen.getByRole("button", {
      name: "Excluir BCG reservada",
    });
    await user.click(trigger);

    expect(
      screen.getByRole("alertdialog", { name: "Remover vacina" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancelar remoção da vacina" }),
    ).toHaveFocus();

    await user.click(
      screen.getByRole("button", { name: "Cancelar remoção da vacina" }),
    );

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/me/vaccines/1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("abre o formulário de marcador e mostra campos de medicação sob demanda", async () => {
    mockPatientResources();
    const user = userEvent.setup();

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    await screen.findByText("Losartana");
    const trigger = screen.getByRole("button", {
      name: "Adicionar marcador",
    });
    await user.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "Adicionar marcador" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do marcador")).toHaveFocus();
    expect(screen.queryByLabelText("Dosagem")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Tipo"));
    await user.click(screen.getByRole("option", { name: "Medicação" }));

    expect(screen.getByLabelText("Dosagem")).toBeInTheDocument();
    expect(screen.getByLabelText("Frequência")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("cancela a remoção do marcador sem enviar requisição", async () => {
    mockPatientResources();
    const user = userEvent.setup();

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    await screen.findByText("Losartana");
    const trigger = screen.getByRole("button", { name: "Remover Losartana" });
    await user.click(trigger);

    expect(
      screen.getByRole("alertdialog", { name: "Remover marcador" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar remoção" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/me/markers/21",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("carrega o histórico de marcadores somente quando solicitado", async () => {
    mockPatientResources({
      "/me/markers?status=removed": [
        {
          ...patientMarkers[0],
          marker_id: 20,
          status: "removed",
          removed_at: "2026-09-01T12:00:00",
        },
      ],
    });
    const user = userEvent.setup();

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    await screen.findByText("Losartana");
    expect(apiFetch).not.toHaveBeenCalledWith("/me/markers?status=removed");

    await user.click(screen.getByRole("button", { name: "Histórico" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/markers?status=removed"),
    );
    expect(await screen.findByText("Removido em 01/09/2026")).toBeInTheDocument();
  });

  it("mantém o formulário aberto e mostra conflito de marcador duplicado", async () => {
    mockPatientResources();
    const originalImplementation = apiFetch.getMockImplementation();
    apiFetch.mockImplementation((path, options) => {
      if (path === "/me/markers" && options?.method === "POST") {
        return respondWith(
          {
            detail:
              "Marcador ativo já cadastrado. Edite o registro existente.",
          },
          409,
        );
      }
      return originalImplementation(path, options);
    });
    const user = userEvent.setup();

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    await screen.findByText("Losartana");
    await user.click(screen.getByRole("button", { name: "Adicionar marcador" }));
    await user.type(screen.getByLabelText("Nome do marcador"), "Losartana");
    await user.click(screen.getByLabelText("Tipo"));
    await user.click(screen.getByRole("option", { name: "Medicação" }));
    await user.click(screen.getByRole("button", { name: "Adicionar marcador" }));

    expect(
      await screen.findByText(
        "Marcador ativo já cadastrado. Edite o registro existente.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Adicionar marcador" })).toBeInTheDocument();
  });

  it("carrega a área profissional sem renderizar o dashboard do paciente", async () => {
    apiFetch.mockImplementation((path) => {
      if (path.startsWith("/medical/")) {
        return respondWith([]);
      }
      return respondWith({
        user: {
          user_id: 7,
          display_name: "Dr. Rui Lima",
          email: "rui@example.com",
          roles: ["doctor"],
        },
        patient_profile: null,
      });
    });

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "Pacientes em acompanhamento" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Dr. Rui Lima/)).toHaveLength(2);
    expect(screen.queryByText("Histórico de Vacinação")).not.toBeInTheDocument();
    expect(screen.queryByText("BCG reservada")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(apiFetch.mock.calls.map(([path]) => path).sort()).toEqual([
        "/me",
        "/medical/patient-links?status=pending",
        "/medical/patients",
      ]),
    );
  });

  it("abre a área administrativa sem consultar conteúdo clínico", async () => {
    apiFetch.mockImplementation((path) => respondWith(
      path === "/me"
        ? {
          user: {
            user_id: 8,
            display_name: "Alex Ferreira",
            email: "admin@example.com",
            roles: ["admin"],
          },
          patient_profile: null,
        }
        : { items: [], page: 1, has_next: false },
    ));

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "Governança administrativa" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Histórico de Vacinação")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/admin/doctors"),
    );
    expect(
      apiFetch.mock.calls.every(
        ([path]) => path === "/me" || path.startsWith("/admin/"),
      ),
    ).toBe(true);
  });

  it("alterna uma conta combinada somente entre contextos autorizados", async () => {
    mockPatientResources();
    const user = userEvent.setup();
    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    expect(await screen.findByText("BCG reservada")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Área profissional" }));

    expect(
      await screen.findByRole("heading", { name: "Pacientes em acompanhamento" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("BCG reservada")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Minha saúde" }));
    expect(await screen.findByText("BCG reservada")).toBeInTheDocument();
  });

  it("alterna para o contexto do dependente com o cabeçalho de atuação", async () => {
    const envelope = {
      user: { ...patientEnvelope.user, roles: ["patient"] },
      patient_profile: patientEnvelope.patient_profile,
      dependents: [
        {
          patient_id: 9,
          guardianship_id: 4,
          preferred_name: "Lia",
          full_name: "Lia Prado Ribeiro",
          avatar_url: null,
          health_status: "pending",
          blood_type: null,
          is_adult: false,
          age: 9,
        },
      ],
    };
    mockPatientResources({ "/me": envelope });
    const user = userEvent.setup();
    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Saúde de Lia" }));

    expect(await screen.findByRole("heading", { name: "Lia" })).toBeInTheDocument();
    expect(screen.getByText("Saúde de Lia", { selector: "small" })).toBeInTheDocument();
    expect(setActingPatient).toHaveBeenLastCalledWith(9);
    await user.click(screen.getByRole("button", { name: "Minha saúde" }));
    expect(setActingPatient).toHaveBeenLastCalledWith(null);
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
        user: {
          user_id: 11,
          display_name: "Dr. Rui Lima",
          email: "rui@example.com",
          roles: [],
        },
        patient_profile: null,
      }),
    );

    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "Acesso indisponível" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Administração")).not.toBeInTheDocument();
    expect(screen.queryByText("Histórico de Vacinação")).not.toBeInTheDocument();
  });

  it("abre o menu da conta com configurações e logout", async () => {
    mockPatientResources();
    const user = userEvent.setup();
    render(<AuthenticatedHome onUnauthenticated={vi.fn()} />);

    await screen.findByText("BCG reservada");
    await user.click(screen.getByRole("button", { name: "Conta de Helena" }));

    expect(screen.getByText("helena@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Configurações" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByRole("menuitem", { name: "Sair da conta" })).toBeInTheDocument();
    expect(screen.queryByText("Presets")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Conta de Helena" });
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Sair da conta" }));
    expect(apiFetch).toHaveBeenCalledWith("/logout", { method: "POST" });
  });
});
