import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PatientLinkPanel } from "@/components/medical/patient-link-panel";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const pendingLink = {
  link_id: 7,
  patient_display_name: "Carlos da Silva",
  masked_cpf: "***.222.333-**",
  expires_at: "2026-10-18T12:00:00",
};

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function mockLinks({ pending = [pendingLink], create = [{ result: "request_sent", link_id: 8 }, 202] } = {}) {
  apiFetch.mockImplementation((path, options = {}) => {
    if (path === "/medical/patient-links?status=pending") {
      return respondWith(pending);
    }
    if (path === "/medical/patient-links" && options.method === "POST") {
      return respondWith(create[0], create[1]);
    }
    if (options.method === "DELETE") {
      return respondWith(null, 204);
    }
    return respondWith(null, 404);
  });
}

function renderPanel() {
  return render(<PatientLinkPanel onUnauthenticated={vi.fn()} />);
}


describe("PatientLinkPanel", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("solicita acesso pelo CPF e informa que depende do aceite", async () => {
    mockLinks();
    const user = userEvent.setup();
    renderPanel();

    await user.type(await screen.findByLabelText("CPF do paciente"), "529.982.247-25");
    await user.click(screen.getByRole("button", { name: "Solicitar acesso" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/medical/patient-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: "529.982.247-25" }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Solicitação enviada. O acesso começa após o aceite do paciente.",
    );
    expect(screen.getByLabelText("CPF do paciente")).toHaveValue("");
  });

  it.each([
    [404, { detail: "Paciente não encontrado." }, "Nenhum paciente com conta foi encontrado para esse CPF."],
    [409, { detail: "Paciente menor exige responsável." }, "Pacientes menores exigem um responsável legal."],
    [409, { detail: "CPF indisponível para vínculo." }, "Já existe solicitação ou vínculo com esse paciente, ou o CPF não está disponível."],
    [422, { detail: [] }, "Informe um CPF válido."],
  ])("explica a resposta %s", async (status, body, message) => {
    mockLinks({ create: [body, status] });
    const user = userEvent.setup();
    renderPanel();

    await user.type(await screen.findByLabelText("CPF do paciente"), "529.982.247-25");
    await user.click(screen.getByRole("button", { name: "Solicitar acesso" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("lista solicitações pendentes sem dados clínicos e cancela após confirmação", async () => {
    mockLinks();
    const user = userEvent.setup();
    renderPanel();

    const item = (await screen.findByText("Carlos da Silva")).closest("article");
    expect(within(item).getByText("***.222.333-**")).toBeInTheDocument();
    await user.click(
      within(item).getByRole("button", {
        name: "Cancelar solicitação para Carlos da Silva",
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/medical/patient-links/7",
      expect.anything(),
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancelar solicitação" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/medical/patient-links/7", {
        method: "DELETE",
      }),
    );
  });

  it("mostra estado vazio das solicitações", async () => {
    mockLinks({ pending: [] });
    renderPanel();

    expect(
      await screen.findByText("Nenhuma solicitação aguardando o paciente."),
    ).toBeInTheDocument();
  });
});
