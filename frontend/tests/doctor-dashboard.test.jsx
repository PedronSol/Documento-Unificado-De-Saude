import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DoctorDashboard } from "@/components/medical/doctor-dashboard";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({
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

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}


describe("DoctorDashboard", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("lista, pesquisa e abre somente o prontuário selecionado", async () => {
    apiFetch.mockImplementation((path) => {
      if (path === "/medical/patients/10") {
        return respondWith(record);
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
    expect(apiFetch).toHaveBeenCalledWith("/medical/patients");
    expect(screen.queryByText("00011122222")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Buscar paciente"), "Carlos");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/medical/patients?query=Carlos",
      ),
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
    expect(apiFetch).toHaveBeenCalledWith("/medical/patients/10");
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
