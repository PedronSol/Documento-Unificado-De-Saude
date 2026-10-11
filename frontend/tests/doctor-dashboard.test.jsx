import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DoctorDashboard } from "@/components/medical/doctor-dashboard";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

vi.mock("@/components/medical/patient-link-panel", () => ({
  PatientLinkPanel: () => <section aria-label="Adicionar paciente" />,
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


describe("DoctorDashboard", () => {
  it("oferece o painel de adicionar paciente na área profissional", async () => {
    apiFetch.mockImplementation(() => respondWith([patient]));
    render(
      <DoctorDashboard
        user={{ display_name: "Dra. Helena Costa" }}
        onUnauthenticated={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("region", { name: "Adicionar paciente" }),
    ).toBeInTheDocument();
  });

  beforeEach(() => {
    vi.useRealTimers();
    apiFetch.mockReset();
  });

  it("busca automaticamente após 300 ms sem consultar prefixos curtos", async () => {
    apiFetch.mockImplementation(() => respondWith([patient]));
    render(
      <DoctorDashboard
        user={{ display_name: "Dra. Helena Costa" }}
        onUnauthenticated={vi.fn()}
      />,
    );
    await screen.findByText("Carlos Eduardo Silva");
    const input = screen.getByLabelText("Buscar paciente");

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "C" } });
    expect(screen.getByRole("status")).toHaveTextContent(/dois caracteres/i);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(apiFetch).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "Ca" } });
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: "Carlos" } });
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(apiFetch.mock.calls[1][0]).toBe("/medical/patients?query=Carlos");
    vi.useRealTimers();
  });

  it("aguarda CPF completo e recarrega a carteira ao limpar a busca", async () => {
    apiFetch.mockImplementation(() => respondWith([patient]));
    render(
      <DoctorDashboard
        user={{ display_name: "Dra. Helena Costa" }}
        onUnauthenticated={vi.fn()}
      />,
    );
    await screen.findByText("Carlos Eduardo Silva");
    const input = screen.getByLabelText("Buscar paciente");

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "000.111.222-2" } });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(/cpf completo/i);

    fireEvent.change(input, { target: { value: "000.111.222-22" } });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(apiFetch.mock.calls[1][0]).toBe(
      "/medical/patients?query=000.111.222-22",
    );

    fireEvent.change(input, { target: { value: "" } });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(apiFetch.mock.calls[2][0]).toBe("/medical/patients");
    vi.useRealTimers();
  });

  it("submete imediatamente sem repetir a busca após o debounce", async () => {
    apiFetch.mockImplementation(() => respondWith([patient]));
    render(
      <DoctorDashboard
        user={{ display_name: "Dra. Helena Costa" }}
        onUnauthenticated={vi.fn()}
      />,
    );
    await screen.findByText("Carlos Eduardo Silva");

    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Buscar paciente"), {
      target: { value: "Carlos" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch.mock.calls[1][0]).toBe("/medical/patients?query=Carlos");
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(apiFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("ignora respostas antigas e cancela a consulta anterior", async () => {
    const olderRequest = deferred();
    const newerRequest = deferred();
    apiFetch.mockImplementation((path) => {
      if (path === "/medical/patients") {
        return respondWith([patient]);
      }
      return path.endsWith("Carlos") ? olderRequest.promise : newerRequest.promise;
    });
    render(
      <DoctorDashboard
        user={{ display_name: "Dra. Helena Costa" }}
        onUnauthenticated={vi.fn()}
      />,
    );
    await screen.findByText("Carlos Eduardo Silva");
    const input = screen.getByLabelText("Buscar paciente");

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "Carlos" } });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    fireEvent.change(input, { target: { value: "Helena" } });
    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(apiFetch.mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => {
      newerRequest.resolve(respondWith([{ ...patient, full_name: "Helena Costa" }]));
      await newerRequest.promise;
    });
    await act(async () => {
      olderRequest.resolve(respondWith([patient]));
      await olderRequest.promise;
    });

    expect(screen.getByText("Helena Costa")).toBeInTheDocument();
    expect(screen.queryByText("Carlos Eduardo Silva")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("lista, pesquisa e abre somente o prontuário selecionado", async () => {
    apiFetch.mockImplementation((path) => {
      if (path === "/medical/patients/10") {
        return respondWith(record);
      }
      if (path === "/medical/patients/10/documents") {
        return respondWith(medicalDocuments);
      }
      return respondWith([patient]);
    });
    const user = userEvent.setup();

    render(
      <DoctorDashboard
        user={{ display_name: "Dra. Helena Costa" }}
        onUnauthenticated={vi.fn()}
      />,
    );

    expect(await screen.findByText("Carlos Eduardo Silva")).toBeInTheDocument();
    expect(apiFetch.mock.calls[0][0]).toBe("/medical/patients");
    expect(screen.queryByText("00011122222")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Buscar paciente"), "Carlos");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() =>
      expect(apiFetch.mock.calls.some(([path]) =>
        path === "/medical/patients?query=Carlos",
      )).toBe(true),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Abrir prontuário de Carlos Silva",
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Carlos Eduardo Silva" }),
    ).toBeInTheDocument();
    expect(screen.getByText("COVID-19 (Pfizer)")).toBeInTheDocument();
    expect(screen.getByText("Losartana")).toBeInTheDocument();
    expect(screen.getByText("Hemograma recente")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/medical/patients/10");
    expect(apiFetch).toHaveBeenCalledWith("/medical/patients/10/documents");
    expect(
      screen.queryByRole("button", { name: "Adicionar documento" }),
    ).not.toBeInTheDocument();
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

    render(
      <DoctorDashboard
        user={{ display_name: "Dra. Helena Costa" }}
        onUnauthenticated={vi.fn()}
      />,
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Abrir prontuário de Carlos Silva",
      }),
    );

    expect(await screen.findByText("COVID-19 (Pfizer)")).toBeInTheDocument();
    expect(
      screen.getByRole("alert", {
        name: "Não foi possível carregar os documentos deste paciente.",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.getByRole("status", { name: "Carregando documentos" })).toBeInTheDocument();
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

    render(
      <DoctorDashboard
        user={{ display_name: "Dra. Helena Costa" }}
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Abrir prontuário de Carlos Silva",
      }),
    );
    await screen.findByText("COVID-19 (Pfizer)");
    const trigger = screen.getByRole("button", { name: "Adicionar marcador" });
    await user.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "Adicionar marcador" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do marcador")).toHaveFocus();

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
    render(
      <DoctorDashboard
        user={{ display_name: "Dr. Marcos Nunes" }}
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Abrir prontuário de Carlos Silva" }),
    );
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

    render(
      <DoctorDashboard
        user={{ display_name: "Dra. Helena Costa" }}
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Abrir prontuário de Carlos Silva",
      }),
    );

    expect(await screen.findByText("Acesso ao prontuário negado.")).toBeInTheDocument();
    expect(screen.queryByText("Losartana")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Voltar para pacientes" }),
    ).toBeInTheDocument();
  });
});
