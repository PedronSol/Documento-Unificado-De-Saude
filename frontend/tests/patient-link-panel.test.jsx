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

function renderPanel(props = {}) {
  return render(<PatientLinkPanel onUnauthenticated={vi.fn()} {...props} />);
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

  it("cadastra paciente provisório quando o CPF não tem conta e exibe link e QR", async () => {
    const claimToken = "c".repeat(43);
    apiFetch.mockImplementation((path, options = {}) => {
      if (path === "/medical/patient-links?status=pending") {
        return respondWith([]);
      }
      if (path === "/medical/patient-links" && options.method === "POST") {
        const body = JSON.parse(options.body);
        return body.patient
          ? respondWith({
            result: "provisional_created",
            patient_id: 40,
            claim: { token: claimToken, expires_at: "2026-10-18T12:00:00", recipient: "patient" },
          }, 201)
          : respondWith({ detail: "Paciente não encontrado." }, 404);
      }
      return respondWith(null, 404);
    });
    const onPatientsChanged = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onPatientsChanged });

    await user.type(await screen.findByLabelText("CPF do paciente"), "529.982.247-25");
    await user.click(screen.getByRole("button", { name: "Solicitar acesso" }));
    expect(
      await screen.findByText("Nenhum paciente com conta para esse CPF. Cadastre um paciente provisório."),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nome completo"), "Joana Prado Ribeiro");
    await user.type(screen.getByLabelText("Nome preferido"), "Joana");
    await user.type(screen.getByLabelText("Data de nascimento"), "1979-08-15");
    await user.click(screen.getByRole("button", { name: "Cadastrar paciente provisório" }));

    const link = await screen.findByLabelText("Link para o paciente assumir a conta");
    expect(link).toHaveValue(`${window.location.origin}/patient-claim#token=${claimToken}`);
    expect(screen.getByRole("img", { name: "QR-Code para assumir a conta" })).toBeInTheDocument();
    const provisionalCall = apiFetch.mock.calls.find(
      ([path, options]) => path === "/medical/patient-links" && JSON.parse(options.body).patient,
    );
    expect(JSON.parse(provisionalCall[1].body)).toEqual({
      cpf: "529.982.247-25",
      patient: {
        full_name: "Joana Prado Ribeiro",
        preferred_name: "Joana",
        birth_date: "1979-08-15",
      },
    });
    expect(onPatientsChanged).toHaveBeenCalledOnce();
  });

  it("mostra estado vazio das solicitações", async () => {
    mockLinks({ pending: [] });
    renderPanel();

    expect(
      await screen.findByText("Nenhuma solicitação aguardando o paciente."),
    ).toBeInTheDocument();
  });
});
