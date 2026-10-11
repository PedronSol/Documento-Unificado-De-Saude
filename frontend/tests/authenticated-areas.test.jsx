import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminArea } from "@/components/admin/admin-area";
import { MedicalArea } from "@/components/medical/medical-area";
import { MedicalRecordArea } from "@/components/medical/medical-record-area";
import { DependentArea } from "@/components/patient/dependent-area";
import { DependentsList } from "@/components/patient/dependents-list";
import { PatientArea } from "@/components/patient/patient-area";
import { AuthenticatedShell } from "@/components/shell/authenticated-shell";
import { HomeRedirect } from "@/components/shell/home-redirect";
import { apiFetch } from "@/lib/api";
import { useSessionStore } from "@/stores/session-store";
import { asResponse, installPagedApiMock, pageOf, stripPaging } from "./utils/paged-api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

const navigation = vi.hoisted(() => ({
  pathname: "/patient",
  params: {},
  replace: () => {},
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useParams: () => navigation.params,
  useRouter: () => ({ replace: navigation.replace, push: vi.fn() }),
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
  apiFetch.mockImplementation((requestPath) => {
    const path = stripPaging(requestPath);
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
    return asResponse(requestPath, responses[path]);
  });
}


function renderArea(area, {
  pathname = "/patient",
  params = {},
  onUnauthenticated = vi.fn(),
} = {}) {
  navigation.pathname = pathname;
  navigation.params = params;
  return render(
    <AuthenticatedShell onUnauthenticated={onUnauthenticated}>
      {area}
    </AuthenticatedShell>,
  );
}

function requestedPaths() {
  return apiFetch.mock.calls.map(([path]) => path);
}


describe("área do paciente", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    navigation.replace = vi.fn();
    useSessionStore.getState().reset();
  });

  it("carrega os recursos do paciente em endpoints independentes", async () => {
    mockPatientResources();

    renderArea(<PatientArea />);

    expect(
      await screen.findByText("BCG reservada", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/me");
    expect(apiFetch).toHaveBeenCalledWith("/me/vaccines?page=1&page_size=20");
    expect(apiFetch).toHaveBeenCalledWith("/me/alerts");
    expect(apiFetch).toHaveBeenCalledWith("/me/documents?page=1&page_size=20");
    expect(apiFetch).toHaveBeenCalledWith("/me/markers?status=active");
    expect(apiFetch).toHaveBeenCalledWith("/me/shares/active");
    expect(await screen.findByText("Losartana")).toBeInTheDocument();
  });

  it("mantém os outros recursos quando documentos falham", async () => {
    apiFetch.mockImplementation((requestPath) => {
      const path = stripPaging(requestPath);
      if (path === "/me/documents") {
        return respondWith({ detail: "Banco de dados indisponível." }, 503);
      }
      const responses = {
        "/me": patientEnvelope,
        "/me/vaccines": patientVaccines,
        "/me/alerts": [],
      };
      return asResponse(requestPath, responses[path]);
    });

    renderArea(<PatientArea />);

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

    renderArea(<PatientArea />);

    expect(await screen.findByText("Nenhuma vacina registrada.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum alerta médico.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum documento disponível.")).toBeInTheDocument();
  });

  it("gerencia foco e fechamento acessível no diálogo de vacina", async () => {
    mockPatientResources();
    const user = userEvent.setup();

    renderArea(<PatientArea />);

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

    renderArea(<PatientArea />);

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

    renderArea(<PatientArea />);

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

    renderArea(<PatientArea />);

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

    renderArea(<PatientArea />);

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

    renderArea(<PatientArea />);

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

  it("não exibe mensagem técnica quando a rede falha ao carregar vacinas", async () => {
    mockPatientResources();
    const originalImplementation = apiFetch.getMockImplementation();
    apiFetch.mockImplementation((path, options) => (
      stripPaging(path) === "/me/vaccines"
        ? Promise.reject(new TypeError("Failed to fetch"))
        : originalImplementation(path, options)
    ));

    renderArea(<PatientArea />);

    expect(
      await screen.findByRole("alert", { name: "Não foi possível carregar suas vacinas." }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });

  it.each([
    [403, { detail: "Role sem acesso." }, "Você não tem permissão para esta ação."],
    [422, { detail: [{ loc: ["body", "dose"], msg: "Field required" }] },
      "Revise os campos destacados e tente novamente."],
    [503, { detail: "Traceback" }, "Não foi possível salvar a vacina."],
  ])("padroniza o erro %i ao salvar vacina", async (status, body, message) => {
    mockPatientResources();
    const originalImplementation = apiFetch.getMockImplementation();
    apiFetch.mockImplementation((path, options) => (
      path === "/me/vaccines" && options?.method === "POST"
        ? respondWith(body, status)
        : originalImplementation(path, options)
    ));
    const user = userEvent.setup();
    renderArea(<PatientArea />);

    await screen.findByText("BCG reservada");
    await user.click(screen.getByRole("button", { name: "Adicionar vacina" }));
    await user.type(screen.getByLabelText("Nome da vacina"), "Hepatite B");
    await user.type(screen.getByLabelText("Dose"), "1ª dose");
    await user.type(screen.getByLabelText("Data de aplicação"), "2026-10-01");
    await user.click(screen.getByRole("button", { name: "Registrar vacina" }));

    const dialog = screen.getByRole("dialog", { name: "Registrar vacina" });
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });

  it("encerra a sessão quando a remoção de vacina responde 401", async () => {
    mockPatientResources();
    const originalImplementation = apiFetch.getMockImplementation();
    apiFetch.mockImplementation((path, options) => (
      options?.method === "DELETE"
        ? respondWith({}, 401)
        : originalImplementation(path, options)
    ));
    const onUnauthenticated = vi.fn();
    const user = userEvent.setup();
    renderArea(<PatientArea />, { onUnauthenticated });

    await screen.findByText("BCG reservada");
    await user.click(screen.getByRole("button", { name: "Excluir BCG reservada" }));
    await user.click(screen.getByRole("button", { name: "Remover vacina" }));

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledOnce());
  });

  it.each([
    [() => respondWith({ detail: "Role sem acesso." }, 403),
      "Você não tem permissão para esta ação."],
    [() => Promise.reject(new TypeError("Failed to fetch")),
      "Não foi possível salvar o marcador."],
  ])("padroniza falhas ao salvar marcador (%#)", async (failure, message) => {
    mockPatientResources();
    const originalImplementation = apiFetch.getMockImplementation();
    apiFetch.mockImplementation((path, options) => (
      path === "/me/markers" && options?.method === "POST"
        ? failure()
        : originalImplementation(path, options)
    ));
    const user = userEvent.setup();
    renderArea(<PatientArea />);

    await screen.findByText("Losartana");
    await user.click(screen.getByRole("button", { name: "Adicionar marcador" }));
    await user.type(screen.getByLabelText("Nome do marcador"), "Dipirona");
    await user.click(screen.getByRole("button", { name: "Adicionar marcador" }));

    const dialog = screen.getByRole("dialog", { name: "Adicionar marcador" });
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });

  it("não exibe mensagem técnica quando a rede falha ao carregar marcadores", async () => {
    mockPatientResources();
    const originalImplementation = apiFetch.getMockImplementation();
    apiFetch.mockImplementation((path, options) => (
      path === "/me/markers?status=active"
        ? Promise.reject(new TypeError("Failed to fetch"))
        : originalImplementation(path, options)
    ));

    renderArea(<PatientArea />);

    expect(await screen.findByText("Não foi possível carregar seus marcadores."))
      .toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });

  it("mostra o carregamento de cada seção sem bloquear as demais", async () => {
    apiFetch.mockImplementation((path) => (
      path === "/me" ? respondWith(patientEnvelope) : new Promise(() => {})
    ));

    renderArea(<PatientArea />);

    expect(await screen.findByText("Carregando vacinas…")).toBeInTheDocument();
    expect(screen.getByText("Carregando alertas…")).toBeInTheDocument();
    expect(screen.getByText("Carregando documentos…")).toBeInTheDocument();
    expect(screen.getByText("Carregando marcadores…")).toBeInTheDocument();
    expect(screen.getByText("Carregando equipes de cuidado…")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Helena" })).toBeInTheDocument();
  });

  it("pagina, busca e filtra vacinas no servidor", async () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      vaccine_id: index + 1,
      name: `Vacina ${index + 1}`,
      dose: "Dose única",
      administered_on: "2025-01-15",
      status: "applied",
    }));
    mockPatientResources();
    const originalImplementation = apiFetch.getMockImplementation();
    apiFetch.mockImplementation((requestPath, options) => {
      if (stripPaging(requestPath).startsWith("/me/vaccines")) {
        const query = new URLSearchParams(requestPath.split("?")[1]);
        if (query.get("query") === "hepa") {
          return respondWith(pageOf([{ ...many[0], name: "Hepatite B" }], { total: 1 }));
        }
        return respondWith(pageOf(many, { total: 45, hasNext: true }));
      }
      return originalImplementation(requestPath, options);
    });
    const user = userEvent.setup();
    renderArea(<PatientArea />);

    expect(await screen.findByText("Vacina 1")).toBeInTheDocument();
    expect(requestedPaths()).toContain("/me/vaccines?page=1&page_size=20");
    expect(screen.getByText("20 de 45 vacinas carregadas")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Buscar vacinas" }), "hepa");
    expect(await screen.findByText("Hepatite B", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(requestedPaths()).toContain("/me/vaccines?page=1&page_size=20&query=hepa");
  });

  it("carrega /me uma única vez para o shell e a área", async () => {
    mockPatientResources();

    renderArea(<PatientArea />);

    expect(await screen.findByText("BCG reservada")).toBeInTheDocument();
    expect(requestedPaths().filter((path) => path === "/me")).toHaveLength(1);
  });

  it("mostra os responsáveis do próprio paciente", async () => {
    mockPatientResources({
      "/me/guardians": [
        {
          guardianship_id: 4,
          guardian_display_name: "Joana Prado Ribeiro",
          relationship: "parent",
          status: "active",
          awaiting_my_confirmation: false,
        },
      ],
    });
    renderArea(<PatientArea />);

    expect(
      await screen.findByRole("heading", { name: "Meus responsáveis" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Joana Prado Ribeiro")).toBeInTheDocument();
  });

  it("encerra a sessão quando um recurso da área responde 401", async () => {
    mockPatientResources();
    const originalImplementation = apiFetch.getMockImplementation();
    apiFetch.mockImplementation((path, options) => (
      stripPaging(path) === "/me/vaccines"
        ? respondWith({ detail: "Autenticação necessária." }, 401)
        : originalImplementation(path, options)
    ));
    const onUnauthenticated = vi.fn();

    renderArea(<PatientArea />, { onUnauthenticated });

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledOnce());
    expect(useSessionStore.getState().status).toBe("unauthenticated");
  });
});


const doctorIdentity = {
  user: {
    user_id: 7,
    display_name: "Dr. Rui Lima",
    email: "rui@example.com",
    roles: ["doctor"],
  },
  patient_profile: null,
  dependents: [],
};

const adminIdentity = {
  user: {
    user_id: 8,
    display_name: "Alex Ferreira",
    email: "admin@example.com",
    roles: ["admin"],
  },
  patient_profile: null,
  dependents: [],
};

const minorDependent = {
  patient_id: 9,
  guardianship_id: 4,
  has_own_access: false,
  preferred_name: "Lia",
  full_name: "Lia Prado Ribeiro",
  avatar_url: null,
  health_status: "pending",
  blood_type: null,
  is_adult: false,
  age: 9,
};

const adultDependent = {
  ...minorDependent,
  patient_id: 10,
  guardianship_id: 5,
  preferred_name: "Caio",
  full_name: "Caio Prado Ribeiro",
  is_adult: true,
  age: 19,
};

const guardianIdentity = {
  user: { ...patientEnvelope.user, roles: ["patient"] },
  patient_profile: patientEnvelope.patient_profile,
  dependents: [minorDependent, adultDependent],
};


describe("shell autenticado", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    navigation.replace = vi.fn();
    useSessionStore.getState().reset();
  });

  it("redireciona uma sessão ausente sem manter conteúdo protegido", async () => {
    apiFetch.mockReturnValue(
      respondWith({ detail: "Autenticação necessária." }, 401),
    );
    const onUnauthenticated = vi.fn();

    renderArea(<PatientArea />, { onUnauthenticated });

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledOnce());
    expect(screen.queryByText("BCG reservada")).not.toBeInTheDocument();
    expect(requestedPaths()).toEqual(["/me"]);
  });

  it("mostra erro seguro e tenta carregar a identidade novamente", async () => {
    apiFetch
      .mockReturnValueOnce(respondWith({ detail: "SQL" }, 503))
      .mockImplementation(() => respondWith(doctorIdentity));
    const user = userEvent.setup();

    renderArea(<HomeRedirect />, { pathname: "/home" });

    expect(
      await screen.findByText("Não foi possível carregar sua identidade."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/medical"));
  });

  it("exibe o seletor como links somente com contextos liberados", async () => {
    mockPatientResources();

    renderArea(<PatientArea />);

    await screen.findByText("BCG reservada");
    const switcher = screen.getByRole("navigation", { name: "Contexto de acesso" });
    const links = within(switcher).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Minha saúde", "/patient"],
      ["Área profissional", "/medical"],
    ]);
    expect(within(switcher).getByRole("link", { name: "Minha saúde" }))
      .toHaveAttribute("aria-current", "page");
    expect(within(switcher).getByRole("link", { name: "Área profissional" }))
      .not.toHaveAttribute("aria-current");
    expect(within(switcher).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Administração")).not.toBeInTheDocument();
  });

  it("não reserva o dock para conta de um único contexto", async () => {
    apiFetch.mockImplementation((path) => respondWith(
      path === "/me" ? doctorIdentity : [],
    ));

    const { container } = renderArea(<MedicalArea />, { pathname: "/medical" });

    expect(
      await screen.findByRole("heading", { name: "Pacientes em acompanhamento" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Contexto de acesso" }))
      .not.toBeInTheDocument();
    expect(container.querySelector(".authenticated-shell"))
      .not.toHaveClass("has-context-dock");
    expect(screen.getByText("Área profissional", { selector: ".single-context" }))
      .toBeInTheDocument();
  });

  it("abre o menu da conta com configurações e logout", async () => {
    mockPatientResources();
    const onUnauthenticated = vi.fn();
    const user = userEvent.setup();
    renderArea(<PatientArea />, { onUnauthenticated });

    await screen.findByText("BCG reservada");
    await user.click(screen.getByRole("button", { name: "Conta de Helena" }));

    expect(screen.getByText("helena@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Configurações" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.queryByText("Presets")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Conta de Helena" });
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Sair da conta" }));
    expect(apiFetch).toHaveBeenCalledWith("/logout", { method: "POST" });
    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalledOnce());
    expect(useSessionStore.getState().identity).toBeNull();
  });
});


describe("redirecionamento por papel", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    installPagedApiMock(apiFetch);
    navigation.replace = vi.fn();
    useSessionStore.getState().reset();
  });

  it.each([
    ["paciente", patientEnvelope, "/patient"],
    ["médico", doctorIdentity, "/medical"],
    ["administrador", adminIdentity, "/admin"],
  ])("leva o %s de /home para a área padrão", async (_, identity, area) => {
    apiFetch.mockImplementation(() => respondWith(identity));

    renderArea(<HomeRedirect />, { pathname: "/home" });

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(area));
    expect(requestedPaths()).toEqual(["/me"]);
  });

  it("mantém conta sem contexto no perfil institucional de /home", async () => {
    apiFetch.mockReturnValue(respondWith({
      user: { ...doctorIdentity.user, user_id: 11, roles: [] },
      patient_profile: null,
      dependents: [],
    }));

    renderArea(<HomeRedirect />, { pathname: "/home" });

    expect(
      await screen.findByRole("heading", { name: "Acesso indisponível" }),
    ).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("Administração")).not.toBeInTheDocument();
  });

  it("redireciona área sem permissão para a área padrão sem consultá-la", async () => {
    apiFetch.mockImplementation((path) => respondWith(
      path === "/me" ? { ...guardianIdentity, dependents: [] } : [],
    ));

    renderArea(<MedicalArea />, { pathname: "/medical" });

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/patient"));
    expect(
      screen.queryByRole("heading", { name: "Pacientes em acompanhamento" }),
    ).not.toBeInTheDocument();
    expect(requestedPaths()).toEqual(["/me"]);
  });

  it("redireciona médico que tenta abrir a área administrativa", async () => {
    apiFetch.mockImplementation(() => respondWith(doctorIdentity));

    renderArea(<AdminArea />, { pathname: "/admin" });

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/medical"));
    expect(requestedPaths()).toEqual(["/me"]);
  });

  it("abre a área administrativa sem consultar conteúdo clínico", async () => {
    apiFetch.mockImplementation((path) => respondWith(
      path === "/me" ? adminIdentity : { items: [], page: 1, has_next: false },
    ));

    renderArea(<AdminArea />, { pathname: "/admin" });

    expect(
      await screen.findByRole("heading", { name: "Governança administrativa" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/admin/doctors"));
    expect(
      requestedPaths().every((path) => path === "/me" || path.startsWith("/admin/")),
    ).toBe(true);
  });

  it("abre o prontuário pela rota médica sem paciente atuante", async () => {
    apiFetch.mockImplementation((path) => {
      if (path === "/me") return respondWith(doctorIdentity);
      if (path === "/medical/patients/42") {
        return respondWith({
          patient: {
            patient_id: 42,
            preferred_name: "Carlos",
            full_name: "Carlos Eduardo Silva",
            avatar_url: null,
            health_status: "updated",
            age: 41,
            blood_type: "A+",
          },
          vaccines: [],
          markers: { active: [], removed: [] },
        });
      }
      return respondWith([]);
    });

    renderArea(<MedicalRecordArea />, {
      pathname: "/medical/patients/42",
      params: { patientId: "42" },
    });

    expect(await screen.findByRole("heading", { name: "Carlos Eduardo Silva" }))
      .toBeInTheDocument();
    expect(useSessionStore.getState().actingPatientId).toBeNull();
    const switcherLabel = screen.getByText("Área profissional", { selector: ".single-context" });
    expect(switcherLabel).toBeInTheDocument();
  });

  it("redireciona paciente que abre um prontuário médico pela URL", async () => {
    apiFetch.mockImplementation(() => respondWith({ ...guardianIdentity, dependents: [] }));

    renderArea(<MedicalRecordArea />, {
      pathname: "/medical/patients/42",
      params: { patientId: "42" },
    });

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/patient"));
    expect(requestedPaths()).toEqual(["/me"]);
  });

  it("carrega a área profissional sem o dashboard do paciente", async () => {
    apiFetch.mockImplementation((path) => respondWith(
      path === "/me" ? doctorIdentity : [],
    ));

    renderArea(<MedicalArea />, { pathname: "/medical" });

    expect(
      await screen.findByRole("heading", { name: "Pacientes em acompanhamento" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Dr. Rui Lima/)).toHaveLength(2);
    expect(screen.queryByText("Histórico de Vacinação")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(requestedPaths().sort()).toEqual([
        "/me",
        "/medical/patient-links?status=pending",
        "/medical/patients",
      ]),
    );
  });
});


describe("dependentes", () => {
  let actingByPath;

  beforeEach(() => {
    apiFetch.mockReset();
    navigation.replace = vi.fn();
    useSessionStore.getState().reset();
    actingByPath = [];
  });

  function mockGuardianResources(identity = guardianIdentity) {
    mockPatientResources({ "/me": identity });
    const originalImplementation = apiFetch.getMockImplementation();
    apiFetch.mockImplementation((path, options) => {
      actingByPath.push([path, useSessionStore.getState().actingPatientId]);
      return originalImplementation(path, options);
    });
  }

  it("mostra o link para os dependentes somente quando existem", async () => {
    mockGuardianResources();
    renderArea(<PatientArea />);

    expect(await screen.findByRole("link", { name: "Meus dependentes" }))
      .toHaveAttribute("href", "/patient/dependents");
    expect(screen.getByRole("link", { name: "Ver saúde de Lia" }))
      .toHaveAttribute("href", "/patient/dependents/9");
  });

  it("omite o link de dependentes para quem não tem guarda", async () => {
    mockPatientResources();
    renderArea(<PatientArea />);

    await screen.findByText("BCG reservada");
    expect(screen.queryByRole("link", { name: "Meus dependentes" }))
      .not.toBeInTheDocument();
  });

  it("lista os dependentes e destaca somente o menor", async () => {
    mockGuardianResources();

    renderArea(<DependentsList />, { pathname: "/patient/dependents" });

    const list = await screen.findByRole("list", { name: "Meus dependentes" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Lia Prado Ribeiro")).toBeInTheDocument();
    expect(within(items[0]).getByText("9 anos")).toBeInTheDocument();
    expect(within(items[0]).getByText("Menor de idade")).toBeInTheDocument();
    expect(items[0]).toHaveAttribute("data-patient-tone", "minor");
    expect(within(items[0]).getByRole("link", { name: "Ver saúde de Lia" }))
      .toHaveAttribute("href", "/patient/dependents/9");
    expect(within(items[1]).queryByText("Menor de idade")).not.toBeInTheDocument();
    expect(items[1]).toHaveAttribute("data-patient-tone", "default");
    expect(requestedPaths()).toEqual(["/me"]);
  });

  it("redireciona a lista vazia para a área padrão", async () => {
    mockPatientResources();

    renderArea(<DependentsList />, { pathname: "/patient/dependents" });

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/patient"));
    expect(screen.queryByRole("list", { name: "Meus dependentes" }))
      .not.toBeInTheDocument();
  });

  it("abre a saúde do menor no mesmo dashboard com tom de menor", async () => {
    mockGuardianResources();

    const { container } = renderArea(<DependentArea />, {
      pathname: "/patient/dependents/9",
      params: { patientId: "9" },
    });

    expect(await screen.findByRole("heading", { name: "Lia" })).toBeInTheDocument();
    const banner = screen.getByRole("region", { name: "Você está vendo a saúde de Lia" });
    expect(within(banner).getByText("Menor de idade")).toBeInTheDocument();
    expect(within(banner).getByRole("link", { name: "Voltar aos meus dependentes" }))
      .toHaveAttribute("href", "/patient/dependents");
    expect(container.querySelector("[data-patient-tone='minor']")).toBeInTheDocument();
    expect(screen.getByText("Saúde de Lia", { selector: "small" })).toBeInTheDocument();
    const switcher = screen.getByRole("navigation", { name: "Contexto de acesso" });
    const active = within(switcher).getByRole("link", { name: "Saúde de Lia" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveAttribute("data-tone", "minor");

    await waitFor(() => expect(requestedPaths()).toContain("/me/vaccines?page=1&page_size=20"));
    const clinical = actingByPath.filter(([path]) => path !== "/me");
    expect(clinical.length).toBeGreaterThan(0);
    expect(clinical.every(([, acting]) => acting === 9)).toBe(true);
  });

  it("não aplica o tom de menor ao dependente adulto", async () => {
    mockGuardianResources();

    const { container } = renderArea(<DependentArea />, {
      pathname: "/patient/dependents/10",
      params: { patientId: "10" },
    });

    expect(await screen.findByRole("heading", { name: "Caio" })).toBeInTheDocument();
    const banner = screen.getByRole("region", { name: "Você está vendo a saúde de Caio" });
    expect(within(banner).queryByText("Menor de idade")).not.toBeInTheDocument();
    expect(container.querySelector("[data-patient-tone='minor']")).not.toBeInTheDocument();
  });

  it("limpa o paciente atuante ao sair da área do dependente", async () => {
    mockGuardianResources();

    const { unmount } = renderArea(<DependentArea />, {
      pathname: "/patient/dependents/9",
      params: { patientId: "9" },
    });

    await screen.findByRole("heading", { name: "Lia" });
    expect(useSessionStore.getState().actingPatientId).toBe(9);
    unmount();
    expect(useSessionStore.getState().actingPatientId).toBeNull();
  });

  it("garante a própria área sem cabeçalho de atuação", async () => {
    mockGuardianResources();
    useSessionStore.getState().setActingPatient(9);

    renderArea(<PatientArea />);

    expect(await screen.findByText("BCG reservada")).toBeInTheDocument();
    const clinical = actingByPath.filter(([path]) => path !== "/me");
    expect(clinical.every(([, acting]) => acting === null)).toBe(true);
  });

  it.each(["99", "abc", "0"])(
    "redireciona dependente %s que não pertence à conta",
    async (patientId) => {
      mockGuardianResources();

      renderArea(<DependentArea />, {
        pathname: `/patient/dependents/${patientId}`,
        params: { patientId },
      });

      await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/patient"));
      expect(requestedPaths()).toEqual(["/me"]);
      expect(useSessionStore.getState().actingPatientId).toBeNull();
    },
  );
});
