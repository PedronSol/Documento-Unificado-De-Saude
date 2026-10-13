import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MedicalBloodType } from "@/components/medical/medical-blood-type";
import { BloodTypeFact } from "@/components/patient/blood-type-fact";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));


function profile(overrides = {}) {
  return {
    preferred_name: "Ana",
    is_adult: true,
    blood_type: null,
    blood_type_source: null,
    ...overrides,
  };
}


function renderFact(props) {
  return render(
    <dl>
      <BloodTypeFact
        onSaved={vi.fn()}
        onUnauthenticated={vi.fn()}
        {...props}
      />
    </dl>,
  );
}


async function openInfo(user) {
  await user.click(screen.getByRole("button", { name: "Sobre o tipo sanguíneo" }));
  return screen.findByRole("tooltip");
}


async function chooseBloodType(user, value) {
  await user.click(screen.getByLabelText("Tipo sanguíneo"));
  await user.click(screen.getByRole("option", { name: value }));
}


describe("BloodTypeFact", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("explica o dado ausente e oferece informar ao adulto", async () => {
    const user = userEvent.setup();
    renderFact({ profile: profile() });

    expect(screen.getByText("Não informado")).toBeInTheDocument();
    expect(await openInfo(user)).toHaveTextContent(
      "Ainda não informado. Você pode informar o seu tipo sanguíneo ou o "
      + "médico responsável pode registrá-lo a partir de um exame.",
    );
    expect(
      screen.getByRole("button", { name: "Informar tipo sanguíneo" }),
    ).toBeInTheDocument();
  });

  it("não oferece edição ao menor no próprio login", async () => {
    const user = userEvent.setup();
    renderFact({ profile: profile({ is_adult: false }) });

    expect(await openInfo(user)).toHaveTextContent(
      "Ainda não informado. Seu responsável legal pode informá-lo ou o "
      + "médico responsável pode registrá-lo.",
    );
    expect(
      screen.queryByRole("button", { name: "Informar tipo sanguíneo" }),
    ).not.toBeInTheDocument();
  });

  it("bloqueia a edição de registro médico", async () => {
    const user = userEvent.setup();
    renderFact({ profile: profile({ blood_type: "A+", blood_type_source: "doctor" }) });

    expect(screen.getByText("A+")).toBeInTheDocument();
    expect(await openInfo(user)).toHaveTextContent(
      "Registrado pelo médico responsável. Para corrigir, fale com ele.",
    );
    expect(screen.queryByRole("button", { name: "Alterar" })).not.toBeInTheDocument();
  });

  it("explica o valor autodeclarado e permite alterar", async () => {
    const user = userEvent.setup();
    renderFact({ profile: profile({ blood_type: "O+", blood_type_source: "patient" }) });

    expect(await openInfo(user)).toHaveTextContent(
      "Informado por você. O médico responsável pode confirmá-lo ou corrigi-lo.",
    );
    expect(screen.getByRole("button", { name: "Alterar" })).toBeInTheDocument();
  });

  it("fala em terceira pessoa no contexto do dependente", async () => {
    const user = userEvent.setup();
    renderFact({
      profile: profile({ preferred_name: "Lia", is_adult: false }),
      context: "dependent",
    });

    expect(await openInfo(user)).toHaveTextContent(
      "Ainda não informado. Você pode informar o tipo sanguíneo de Lia ou o "
      + "médico responsável pode registrá-lo a partir de um exame.",
    );
    expect(
      screen.getByRole("button", { name: "Informar tipo sanguíneo" }),
    ).toBeInTheDocument();
  });

  it("explica valor informado pelo responsável", async () => {
    const user = userEvent.setup();
    renderFact({
      profile: profile({ blood_type: "B+", blood_type_source: "guardian" }),
      context: "dependent",
    });

    expect(await openInfo(user)).toHaveTextContent(
      "Informado pelo responsável legal. O médico responsável pode confirmá-lo ou corrigi-lo.",
    );
  });

  it("informa o tipo sanguíneo e avisa quem exibe o perfil", async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ blood_type: "O+", blood_type_source: "patient" }),
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    renderFact({ profile: profile(), onSaved });

    await user.click(screen.getByRole("button", { name: "Informar tipo sanguíneo" }));
    expect(
      screen.getByText(/deve vir de um exame ou documento confiável/),
    ).toBeInTheDocument();
    await chooseBloodType(user, "O+");
    await user.click(screen.getByRole("button", { name: "Salvar tipo sanguíneo" }));

    expect(apiFetch).toHaveBeenCalledWith("/me/blood-type", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blood_type: "O+" }),
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
      blood_type: "O+",
      blood_type_source: "patient",
    }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pede confirmação explícita para alterar um valor existente", async () => {
    const user = userEvent.setup();
    renderFact({ profile: profile({ blood_type: "O+", blood_type_source: "patient" }) });

    await user.click(screen.getByRole("button", { name: "Alterar" }));

    expect(screen.getByText("Valor atual: O+")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirmar alteração" });
    expect(confirm).toBeDisabled();
    await chooseBloodType(user, "O-");
    expect(confirm).toBeEnabled();
  });

  it("mantém o diálogo aberto e a seleção em caso de erro", async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: "Tipo sanguíneo registrado pelo médico responsável." }),
    });
    const user = userEvent.setup();
    renderFact({ profile: profile() });

    await user.click(screen.getByRole("button", { name: "Informar tipo sanguíneo" }));
    await chooseBloodType(user, "AB-");
    await user.click(screen.getByRole("button", { name: "Salvar tipo sanguíneo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tipo sanguíneo registrado pelo médico responsável.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo sanguíneo")).toHaveTextContent("AB-");
  });
});


describe("MedicalBloodType", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("mostra a origem e corrige pelo prontuário", async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ blood_type: "O-", blood_type_source: "doctor" }),
    });
    const onPatientUpdated = vi.fn();
    const patient = {
      patient_id: 10,
      blood_type: "O+",
      blood_type_source: "patient",
    };
    const user = userEvent.setup();
    render(
      <dl>
        <MedicalBloodType
          patient={patient}
          onPatientUpdated={onPatientUpdated}
          onUnauthenticated={vi.fn()}
        />
      </dl>,
    );

    expect(screen.getByText("autodeclarado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Corrigir" }));
    await chooseBloodType(user, "O-");
    await user.click(screen.getByRole("button", { name: "Confirmar alteração" }));

    expect(apiFetch).toHaveBeenCalledWith("/medical/patients/10/blood-type", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blood_type: "O-" }),
    });
    await waitFor(() => expect(onPatientUpdated).toHaveBeenCalledWith({
      ...patient,
      blood_type: "O-",
      blood_type_source: "doctor",
    }));
  });

  it("oferece registrar quando não há valor", () => {
    render(
      <dl>
        <MedicalBloodType
          patient={{ patient_id: 10, blood_type: null, blood_type_source: null }}
          onPatientUpdated={vi.fn()}
          onUnauthenticated={vi.fn()}
        />
      </dl>,
    );

    expect(screen.getByText("Não informado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar" })).toBeInTheDocument();
  });
});
