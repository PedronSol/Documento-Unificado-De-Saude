import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CareInvitations } from "@/components/patient/care-invitations";
import { apiFetch } from "@/lib/api";
import { installPagedApiMock } from "./utils/paged-api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

const invitation = {
  invitation_id: 4,
  care_group_name: "Cardiologia Centro",
  expires_at: "2026-10-17T12:00:00",
  doctors: [
    { display_name: "Dra. Ana Lima", crm_number: "123456", crm_state: "SP" },
  ],
};

const group = {
  care_group_id: 9,
  name: "Unidade Norte",
  starts_at: "2026-09-01T12:00:00",
  doctors: [
    { display_name: "Dr. Marcos Nunes", crm_number: "100002", crm_state: "RN" },
  ],
};

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const careRequest = {
  link_id: 11,
  doctor_display_name: "Dr. Rui Lima",
  crm_number: "998877",
  crm_state: "RJ",
  expires_at: "2026-10-18T12:00:00",
};

const careDoctor = {
  link_id: 12,
  doctor_display_name: "Dra. Beatriz Souza",
  crm_number: "554433",
  crm_state: "MG",
  since: "2026-09-01T12:00:00",
};

function mockCare({
  invitations = [invitation],
  groups = [group],
  requests = [],
  doctors = [],
  mutation = 204,
} = {}) {
  apiFetch.mockImplementation((path, options = {}) => {
    if (options.method) {
      return respondWith(null, mutation);
    }
    if (path === "/me/care-invitations") {
      return respondWith(invitations);
    }
    if (path === "/me/care-groups") {
      return respondWith(groups);
    }
    if (path === "/me/care-requests") {
      return respondWith(requests);
    }
    if (path === "/me/care-doctors") {
      return respondWith(doctors);
    }
    return respondWith(null, 404);
  });
}


describe("CareInvitations", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    installPagedApiMock(apiFetch);
  });

  it("mostra convite com equipe médica e aceita com recarga dos vínculos", async () => {
    mockCare();
    const user = userEvent.setup();
    render(<CareInvitations isAdult onUnauthenticated={vi.fn()} />);

    const card = (await screen.findByText("Cardiologia Centro")).closest("article");
    expect(within(card).getByText("Dra. Ana Lima")).toBeInTheDocument();
    expect(within(card).getByText("CRM 123456/SP")).toBeInTheDocument();
    expect(screen.getByText("Unidade Norte")).toBeInTheDocument();

    await user.click(
      within(card).getByRole("button", { name: "Aceitar convite de Cardiologia Centro" }),
    );

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/me/care-invitations/4/accept",
        { method: "POST" },
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Convite aceito. A equipe passa a acessar seu prontuário.",
    );
    expect(
      apiFetch.mock.calls.filter(([path]) => path === "/me/care-groups?page=1&page_size=20"),
    ).toHaveLength(2);
  });

  it("recusa convite sem conceder acesso", async () => {
    mockCare();
    const user = userEvent.setup();
    render(<CareInvitations isAdult onUnauthenticated={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Recusar convite de Cardiologia Centro" }),
    );

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/me/care-invitations/4/reject",
        { method: "POST" },
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Convite recusado.");
  });

  it("revoga vínculo somente após confirmação", async () => {
    mockCare({ invitations: [] });
    const user = userEvent.setup();
    render(<CareInvitations isAdult onUnauthenticated={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Revogar acesso de Unidade Norte" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "Manter acesso" })).toHaveFocus();
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/me/care-groups/9",
      expect.anything(),
    );

    await user.click(within(dialog).getByRole("button", { name: "Revogar acesso" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/care-groups/9", { method: "DELETE" }),
    );
  });

  it("paciente menor vê convites sem ações de decisão", async () => {
    mockCare();
    render(<CareInvitations isAdult={false} onUnauthenticated={vi.fn()} />);

    expect(await screen.findByText("Cardiologia Centro")).toBeInTheDocument();
    expect(
      screen.getByText("Aceitar, recusar ou revogar equipes exige maioridade."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aceitar convite/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Revogar acesso/ })).toBeNull();
  });

  it("mostra estado vazio e erro recuperável", async () => {
    mockCare({ invitations: [], groups: [] });
    const { unmount } = render(
      <CareInvitations isAdult onUnauthenticated={vi.fn()} />,
    );
    expect(
      await screen.findByText("Nenhuma equipe acompanha seu prontuário."),
    ).toBeInTheDocument();
    unmount();

    apiFetch.mockImplementation(() => respondWith({}, 503));
    const user = userEvent.setup();
    render(<CareInvitations isAdult onUnauthenticated={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar suas equipes de cuidado.",
    );
    mockCare({ invitations: [], groups: [] });
    await user.click(screen.getByRole("button", { name: "Recarregar equipes" }));
    expect(
      await screen.findByText("Nenhuma equipe acompanha seu prontuário."),
    ).toBeInTheDocument();
  });

  it("aceita solicitação direta de médico e revoga médico com acesso", async () => {
    mockCare({
      invitations: [],
      groups: [],
      requests: [careRequest],
      doctors: [careDoctor],
    });
    const user = userEvent.setup();
    render(<CareInvitations isAdult onUnauthenticated={vi.fn()} />);

    const request = (await screen.findByText("Dr. Rui Lima")).closest("article");
    expect(within(request).getByText("CRM 998877/RJ")).toBeInTheDocument();
    await user.click(
      within(request).getByRole("button", { name: "Aceitar solicitação de Dr. Rui Lima" }),
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/care-requests/11/accept", {
        method: "POST",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Solicitação aceita. O médico passa a acessar seu prontuário.",
    );

    await user.click(
      screen.getByRole("button", { name: "Revogar acesso de Dra. Beatriz Souza" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Revogar acesso" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/care-doctors/12", {
        method: "DELETE",
      }),
    );
  });

  it("recusa solicitação direta de médico", async () => {
    mockCare({ invitations: [], groups: [], requests: [careRequest] });
    const user = userEvent.setup();
    render(<CareInvitations isAdult onUnauthenticated={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Recusar solicitação de Dr. Rui Lima" }),
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/care-requests/11/reject", {
        method: "POST",
      }),
    );
  });

  it.each([
    [403, "Você não tem permissão para esta ação."],
    [409, "Convite expirado."],
  ])("padroniza a falha %i ao aceitar convite", async (status, message) => {
    mockCare();
    const original = apiFetch.getMockImplementation();
    apiFetch.mockImplementation((path, options = {}) => (
      options.method
        ? respondWith({ detail: status === 409 ? "Convite expirado." : "Role." }, status)
        : original(path, options)
    ));
    const user = userEvent.setup();
    render(<CareInvitations isAdult onUnauthenticated={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Aceitar convite de Cardiologia Centro" }),
    );

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("encaminha sessão expirada", async () => {
    apiFetch.mockImplementation(() => respondWith({}, 401));
    const onUnauthenticated = vi.fn();
    render(<CareInvitations isAdult onUnauthenticated={onUnauthenticated} />);

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalled());
  });
});
