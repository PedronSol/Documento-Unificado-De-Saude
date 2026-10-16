import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MedicalRecordView } from "@/components/medical/medical-record";
import { apiFetch } from "@/lib/api";
import { installPagedApiMock } from "./utils/paged-api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

const patient = {
  patient_id: 10,
  preferred_name: "Carlos Silva",
  full_name: "Carlos Eduardo Silva",
  avatar_url: null,
  health_status: "updated",
  age: 41,
};

const marker = {
  marker_id: 21,
  type: "medication",
  name: "Losartana",
  description: "Uso contínuo",
  dosage: "50 mg",
  frequency: "1 vez ao dia",
  status: "active",
  created_at: "2026-10-08T12:00:00",
  updated_at: "2026-10-08T12:00:00",
  removed_at: null,
};

const record = {
  patient: { ...patient, blood_type: "A+" },
  vaccines: [
    {
      vaccine_id: 1,
      name: "COVID-19 (Pfizer)",
      dose: "3ª Dose - Reforço",
      administered_on: "2024-02-10",
      status: "applied",
    },
  ],
  markers: { active: [marker], removed: [] },
};

const medicalDocuments = [
  {
    document_id: 42,
    title: "Hemograma recente",
    type: "exam",
    original_filename: "hemograma.pdf",
    media_type: "application/pdf",
    size_bytes: 2048,
    status: "uploaded",
    created_at: "2026-10-11T12:00:00",
  },
];

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}


function renderRecord(patientId = "10", onUnauthenticated = vi.fn()) {
  return render(
    <MedicalRecordView patientId={patientId} onUnauthenticated={onUnauthenticated} />,
  );
}


describe("MedicalRecordView", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    installPagedApiMock(apiFetch);
  });

  it("abre o prontuário pelo ID da rota com documentos e marcadores", async () => {
    apiFetch.mockImplementation((path) => {
      if (path === "/medical/patients/10") return respondWith(record);
      if (path === "/medical/patients/10/documents") return respondWith(medicalDocuments);
      return respondWith([]);
    });

    renderRecord();

    expect(
      await screen.findByRole("heading", { name: "Carlos Eduardo Silva" }),
    ).toBeInTheDocument();
    expect(screen.getByText("COVID-19 (Pfizer)")).toBeInTheDocument();
    expect(screen.getByText("Losartana")).toBeInTheDocument();
    expect(await screen.findByText("Hemograma recente")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar para pacientes" }))
      .toHaveAttribute("href", "/medical");
    expect(
      screen.getByRole("button", { name: "Adicionar documento" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remover Hemograma recente" }),
    ).not.toBeInTheDocument();
  });

  it("mostra a remoção somente nos documentos enviados pelo médico", async () => {
    apiFetch.mockImplementation((path) => {
      if (path === "/medical/patients/10") return respondWith(record);
      if (path === "/medical/patients/10/documents") {
        return respondWith([
          { ...medicalDocuments[0], can_remove: false, uploaded_by_doctor: null },
          {
            ...medicalDocuments[0],
            document_id: 43,
            title: "Laudo do eco",
            can_remove: true,
            uploaded_by_doctor: {
              display_name: "Dra. Helena Costa",
              crm_number: "123456",
              crm_state: "SP",
            },
          },
        ]);
      }
      return respondWith([]);
    });

    renderRecord();

    expect(await screen.findByRole("button", { name: "Remover Laudo do eco" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover Hemograma recente" }))
      .not.toBeInTheDocument();
    expect(screen.getByText("Enviado por Dra. Helena Costa · CRM 123456/SP"))
      .toBeInTheDocument();
  });

  it.each(["abc", "0", "-1", "01", "9007199254740993"])(
    "mostra paciente não encontrado para o ID %s sem consultar a API",
    async (patientId) => {
      renderRecord(patientId);

      expect(await screen.findByText("Paciente não encontrado.")).toBeInTheDocument();
      expect(apiFetch).not.toHaveBeenCalled();
    },
  );

  it("mostra paciente não encontrado após 404", async () => {
    apiFetch.mockImplementation((path) => (
      path === "/medical/patients/77"
        ? respondWith({ detail: "Paciente não encontrado." }, 404)
        : respondWith([])
    ));

    renderRecord("77");

    expect(await screen.findByRole("heading", { name: "Paciente não encontrado." }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar para pacientes" }))
      .toHaveAttribute("href", "/medical");
  });

  it("descarta o prontuário anterior ao trocar de paciente", async () => {
    const second = deferred();
    apiFetch.mockImplementation((path) => {
      if (path === "/medical/patients/10") return respondWith(record);
      if (path === "/medical/patients/11") return second.promise;
      return respondWith([]);
    });

    const { rerender } = renderRecord("10");
    expect(await screen.findByText("COVID-19 (Pfizer)")).toBeInTheDocument();

    rerender(<MedicalRecordView key="11" patientId="11" onUnauthenticated={vi.fn()} />);

    expect(screen.queryByText("COVID-19 (Pfizer)")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Montando prontuário autorizado…");
    await act(async () => second.resolve(respondWith({ detail: "x" }, 403)));
    expect(await screen.findByText("Acesso ao prontuário negado.")).toBeInTheDocument();
  });

  it("encerra a sessão quando o prontuário responde 401", async () => {
    apiFetch.mockReturnValue(respondWith({}, 401));
    const onUnauthenticated = vi.fn();

    renderRecord("10", onUnauthenticated);

    await waitFor(() => expect(onUnauthenticated).toHaveBeenCalled());
  });

  it("mantém o prontuário quando somente os documentos falham", async () => {
    const retry = deferred();
    let documentRequests = 0;
    apiFetch.mockImplementation((path) => {
      if (path === "/medical/patients/10") return respondWith(record);
      if (path === "/medical/patients/10/documents") {
        documentRequests += 1;
        if (documentRequests > 1) return retry.promise;
        return Promise.reject(new TypeError("network unavailable"));
      }
      return respondWith([patient]);
    });
    const user = userEvent.setup();
    renderRecord();

    expect(await screen.findByText("COVID-19 (Pfizer)")).toBeInTheDocument();
    expect(
      screen.getByRole("alert", {
        name: "Não foi possível carregar os documentos deste paciente.",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.getByText("Carregando documentos autorizados…")).toBeInTheDocument();
    await act(async () => retry.resolve(respondWith(medicalDocuments)));
    expect(await screen.findByText("Hemograma recente")).toBeInTheDocument();
  });

  it("cria marcador pela rota médica e mantém o diálogo acessível", async () => {
    apiFetch.mockImplementation((path, options) => {
      if (path === "/medical/patients/10") {
        return respondWith(record);
      }
      if (path === "/medical/patients/10/markers" && options?.method === "POST") {
        return respondWith(
          {
            ...marker,
            marker_id: 22,
            type: "diagnosis",
            name: "Insuficiência renal leve",
            description: null,
            dosage: null,
            frequency: null,
          },
          201,
        );
      }
      return respondWith([patient]);
    });
    const user = userEvent.setup();
    renderRecord();
    await screen.findByText("COVID-19 (Pfizer)");
    const trigger = screen.getByRole("button", { name: "Adicionar marcador" });
    await user.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "Adicionar marcador" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do marcador")).toHaveFocus();
    await user.click(screen.getByLabelText("Nome do marcador"));
    expect(screen.getAllByRole("option")).toHaveLength(6);

    await user.type(
      screen.getByLabelText("Nome do marcador"),
      "Insuficiência renal leve",
    );
    await user.click(screen.getByLabelText("Tipo"));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByLabelText("Tipo")).toHaveTextContent("Diagnóstico");
    await user.click(screen.getByRole("button", { name: "Adicionar marcador" }));

    expect(await screen.findByText("Insuficiência renal leve")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(
      "/medical/patients/10/markers",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("corrige dados e gera novo link para paciente provisório do próprio médico", async () => {
    const provisionalRecord = {
      ...record,
      patient: {
        ...record.patient,
        account_status: "provisional",
        manages_provisional: true,
      },
    };
    apiFetch.mockImplementation((path, options = {}) => {
      if (path === "/medical/patients/10" && !options.method) {
        return respondWith(provisionalRecord);
      }
      if (path === "/medical/patients/10/provisional-profile") {
        return respondWith({
          ...provisionalRecord.patient,
          full_name: "Carlos Eduardo Silva Lima",
        });
      }
      if (path === "/medical/patients/10/claim-link") {
        return respondWith({
          token: "n".repeat(43),
          expires_at: "2026-10-18T12:00:00",
          recipient: "guardian",
        }, 201);
      }
      return respondWith([patient]);
    });
    const user = userEvent.setup();
    renderRecord();
    expect(await screen.findByText("Conta provisória")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Corrigir dados" }));
    const dialog = await screen.findByRole("dialog");
    const fullName = within(dialog).getByLabelText("Nome completo");
    await user.clear(fullName);
    await user.type(fullName, "Carlos Eduardo Silva Lima");
    await user.click(within(dialog).getByRole("button", { name: "Salvar correção" }));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.find(([path]) => path === "/medical/patients/10/provisional-profile"),
      ).toBeTruthy(),
    );
    const correction = apiFetch.mock.calls.find(
      ([path]) => path === "/medical/patients/10/provisional-profile",
    );
    expect(correction[1].method).toBe("PATCH");
    expect(JSON.parse(correction[1].body)).toEqual({
      full_name: "Carlos Eduardo Silva Lima",
      preferred_name: "Carlos Silva",
    });
    expect(
      await screen.findByRole("heading", { name: "Carlos Eduardo Silva Lima" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Gerar novo link" }));
    expect(await screen.findByLabelText("Link para o responsável assumir a conta")).toHaveValue(
      `${window.location.origin}/patient-claim#token=${"n".repeat(43)}&for=guardian`,
    );
  });

  it("limpa dados clínicos e informa acesso negado após 403", async () => {
    apiFetch.mockImplementation((path) => {
      if (path === "/medical/patients/10") {
        return respondWith({ detail: "Paciente não autorizado." }, 403);
      }
      return respondWith([patient]);
    });
    const user = userEvent.setup();
    renderRecord();

    expect(await screen.findByText("Acesso ao prontuário negado.")).toBeInTheDocument();
    expect(screen.queryByText("Losartana")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar para pacientes" }),
    ).toHaveAttribute("href", "/medical");
  });
});
