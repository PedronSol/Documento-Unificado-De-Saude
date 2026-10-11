import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const TOKEN = "k".repeat(43);

const pendingDoctor = {
  doctor_id: 3,
  display_name: "Dra. Ana Lima",
  masked_cpf: "***.111.222-**",
  crm_number: "123456",
  crm_state: "SP",
  verification_status: "pending",
  professional_status: "active",
  verified_at: null,
};

const activeDoctor = {
  ...pendingDoctor,
  doctor_id: 4,
  display_name: "Dr. Marcos Nunes",
  masked_cpf: "***.444.555-**",
  crm_number: "100002",
  crm_state: "RN",
  verification_status: "verified",
  verified_at: "2026-10-01T12:00:00",
};

const group = { care_group_id: 1, name: "Unidade Centro", status: "active" };

const groupDetail = {
  ...group,
  doctors: [activeDoctor],
  patients: [
    {
      user_id: 9,
      display_name: "Carlos da Silva",
      masked_cpf: "***.222.333-**",
      link_status: "active",
      starts_at: "2026-09-01T12:00:00",
    },
  ],
  pending_invitations: [
    {
      invitation_id: 5,
      user_id: 12,
      display_name: "Paula Reis",
      expires_at: "2026-10-17T12:00:00",
    },
  ],
};

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function page(items) {
  return { items, page: 1, has_next: false };
}

function mockAdmin(overrides = {}) {
  apiFetch.mockImplementation((path, options = {}) => {
    const key = `${options.method || "GET"} ${path}`;
    const responses = {
      "GET /admin/doctor-invitations": page([]),
      "GET /admin/doctors": page([pendingDoctor, activeDoctor]),
      "GET /admin/care-groups": page([group]),
      "GET /admin/care-groups/1": groupDetail,
      "GET /admin/audit-events": page([
        {
          event_id: 1,
          actor_user_id: 8,
          action: "care_group.created",
          target_type: "care_group",
          target_id: 1,
          details: null,
          occurred_at: "2026-10-10T12:00:00",
        },
      ]),
      "GET /admin/users?query=carl": page([
        {
          user_id: 9,
          display_name: "Carlos da Silva",
          profiles: ["patient"],
          masked_cpf: "***.222.333-**",
        },
      ]),
      "POST /admin/doctor-invitations": [
        {
          invitation_id: 7,
          status: "pending",
          expires_at: "2026-10-17T12:00:00",
          token: TOKEN,
        },
        201,
      ],
      ...overrides,
    };
    const response = responses[key];
    if (response === undefined) {
      return respondWith(null, options.method ? 204 : 404);
    }
    return Array.isArray(response) && typeof response[1] === "number"
      ? respondWith(response[0], response[1])
      : respondWith(response);
  });
}

function renderDashboard() {
  return render(
    <AdminDashboard
      user={{ display_name: "Alex Ferreira" }}
      onUnauthenticated={vi.fn()}
    />,
  );
}

function calledWith(method, path) {
  return apiFetch.mock.calls.find(
    ([calledPath, options = {}]) =>
      calledPath === path && (options.method || "GET") === method,
  );
}


describe("AdminDashboard", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("carrega somente recursos administrativos", async () => {
    mockAdmin();
    renderDashboard();

    expect(await screen.findByText("Dra. Ana Lima")).toBeInTheDocument();
    expect(screen.getByText("***.111.222-**")).toBeInTheDocument();
    expect(
      apiFetch.mock.calls.every(([path]) => path.startsWith("/admin/")),
    ).toBe(true);
  });

  it("emite convite e exibe o link com token uma única vez", async () => {
    mockAdmin();
    const user = userEvent.setup();
    renderDashboard();

    await user.type(await screen.findByLabelText("CPF"), "529.982.247-25");
    await user.type(screen.getByLabelText("Nome completo"), "Dra. Ana Lima");
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("CRM"), "123456");
    await user.click(screen.getByRole("combobox", { name: "UF do CRM" }));
    await user.click(await screen.findByRole("option", { name: "SP" }));
    await user.click(screen.getByRole("button", { name: "Emitir convite" }));

    const link = await screen.findByLabelText("Link do convite");
    expect(link).toHaveValue(
      `${window.location.origin}/professional-invitation#token=${TOKEN}`,
    );
    expect(screen.getByText(/exibido uma única vez/)).toBeInTheDocument();
    expect(JSON.parse(calledWith("POST", "/admin/doctor-invitations")[1].body)).toEqual({
      cpf: "529.982.247-25",
      display_name: "Dra. Ana Lima",
      email: "ana@example.com",
      crm_number: "123456",
      crm_state: "SP",
    });

    await user.click(screen.getByRole("button", { name: "Grupos" }));
    await user.click(screen.getByRole("button", { name: "Médicos" }));
    expect(screen.queryByLabelText("Link do convite")).toBeNull();
  });

  it("verifica CRM direto e suspende somente após confirmação", async () => {
    mockAdmin({
      "POST /admin/doctors/3/status": { ...pendingDoctor, verification_status: "verified" },
      "POST /admin/doctors/4/status": { ...activeDoctor, professional_status: "suspended" },
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      await screen.findByRole("button", { name: "Verificar CRM de Dra. Ana Lima" }),
    );
    await waitFor(() => expect(calledWith("POST", "/admin/doctors/3/status")).toBeTruthy());
    expect(JSON.parse(calledWith("POST", "/admin/doctors/3/status")[1].body)).toEqual({
      action: "verify",
    });

    await user.click(screen.getByRole("button", { name: "Suspender Dr. Marcos Nunes" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(calledWith("POST", "/admin/doctors/4/status")).toBeUndefined();
    await user.click(within(dialog).getByRole("button", { name: "Suspender médico" }));
    await waitFor(() => expect(calledWith("POST", "/admin/doctors/4/status")).toBeTruthy());
    expect(JSON.parse(calledWith("POST", "/admin/doctors/4/status")[1].body)).toEqual({
      action: "suspend",
    });
  });

  it("busca no diretório e convida paciente para um grupo", async () => {
    mockAdmin({
      "POST /admin/care-groups/1/patient-invitations": [
        { invitation_id: 8, status: "pending", expires_at: "2026-10-17T12:00:00" },
        201,
      ],
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Diretório" }));
    await user.click(screen.getByRole("combobox", { name: "Grupo para convite" }));
    await user.click(await screen.findByRole("option", { name: "Unidade Centro" }));
    await user.type(screen.getByLabelText("Buscar usuário"), "carl");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    const result = (await screen.findByText("Carlos da Silva")).closest("article");
    expect(within(result).getByText("***.222.333-**")).toBeInTheDocument();
    await user.click(
      within(result).getByRole("button", { name: "Convidar Carlos da Silva" }),
    );

    await waitFor(() =>
      expect(calledWith("POST", "/admin/care-groups/1/patient-invitations")).toBeTruthy(),
    );
    expect(
      JSON.parse(calledWith("POST", "/admin/care-groups/1/patient-invitations")[1].body),
    ).toEqual({ user_id: 9 });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Convite enviado. O acesso só começa após o aceite do paciente.",
    );
  });

  it("gerencia grupo com confirmação para revogar e cancelar", async () => {
    mockAdmin();
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Grupos" }));
    await user.click(await screen.findByRole("button", { name: "Abrir Unidade Centro" }));

    await user.click(
      await screen.findByRole("button", { name: "Revogar vínculo de Carlos da Silva" }),
    );
    let dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Revogar vínculo" }));
    await waitFor(() =>
      expect(calledWith("DELETE", "/admin/care-groups/1/patients/9")).toBeTruthy(),
    );

    await user.click(
      screen.getByRole("button", { name: "Cancelar convite de Paula Reis" }),
    );
    dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar convite" }));
    await waitFor(() =>
      expect(
        calledWith("DELETE", "/admin/care-groups/1/patient-invitations/5"),
      ).toBeTruthy(),
    );
  });

  it("lista auditoria administrativa com rótulos legíveis", async () => {
    mockAdmin();
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Auditoria" }));

    expect(await screen.findByText("Grupo criado")).toBeInTheDocument();
  });
});
