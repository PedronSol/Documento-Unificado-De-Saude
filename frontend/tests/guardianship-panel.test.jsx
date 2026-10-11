import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GuardianshipPanel } from "@/components/patient/guardianship-panel";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const pending = {
  guardianship_id: 3,
  dependent_full_name: "Lia Prado Ribeiro",
  dependent_preferred_name: "Lia",
  relationship: "parent",
  requested_by: "Dr. Marcos Nunes",
};

const dependent = {
  patient_id: 9,
  guardianship_id: 4,
  has_own_access: true,
  preferred_name: "Davi",
  full_name: "Davi Prado Ribeiro",
  avatar_url: null,
  health_status: "pending",
  blood_type: null,
  is_adult: false,
  age: 7,
};

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function mockGuardianships({ accept = 204 } = {}) {
  apiFetch.mockImplementation((path, options = {}) => {
    if (path === "/me/guardianships?status=pending") {
      return respondWith([pending]);
    }
    if (path === "/me/guardianships/3/accept") {
      return respondWith(null, accept);
    }
    if (options.method) {
      return respondWith(null, 204);
    }
    return respondWith(null, 404);
  });
}


describe("GuardianshipPanel", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("aceita guarda confirmando a data de nascimento do dependente", async () => {
    mockGuardianships();
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(
      <GuardianshipPanel dependents={[]} onChanged={onChanged} onUnauthenticated={vi.fn()} />,
    );

    const card = (await screen.findByText("Lia Prado Ribeiro")).closest("article");
    expect(within(card).getByText("Solicitado por Dr. Marcos Nunes")).toBeInTheDocument();
    await user.type(
      within(card).getByLabelText("Data de nascimento de Lia"),
      "2016-05-02",
    );
    await user.click(within(card).getByRole("button", { name: "Aceitar guarda de Lia" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/guardianships/3/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependent_birth_date: "2016-05-02" }),
      }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("explica data divergente sem aceitar", async () => {
    mockGuardianships({ accept: 403 });
    const user = userEvent.setup();
    render(
      <GuardianshipPanel dependents={[]} onChanged={vi.fn()} onUnauthenticated={vi.fn()} />,
    );

    await user.type(await screen.findByLabelText("Data de nascimento de Lia"), "2016-01-01");
    await user.click(screen.getByRole("button", { name: "Aceitar guarda de Lia" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A data de nascimento não confere com o cadastro do dependente.",
    );
  });

  it("recusa guarda e renuncia a dependente após confirmação", async () => {
    mockGuardianships();
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(
      <GuardianshipPanel
        dependents={[dependent]}
        onChanged={onChanged}
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Recusar guarda de Lia" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/guardianships/3/reject", { method: "POST" }),
    );

    await user.click(screen.getByRole("button", { name: "Renunciar à guarda de Davi" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Renunciar à guarda" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/guardianships/4", { method: "DELETE" }),
    );
  });

  it("gera acesso próprio para dependente adulto sem conta", async () => {
    apiFetch.mockImplementation((path, options = {}) => {
      if (path === "/me/guardianships?status=pending") {
        return respondWith([]);
      }
      if (path === "/me/dependents/12/claim-link") {
        return respondWith({
          token: "t".repeat(43),
          expires_at: "2026-10-18T12:00:00",
          recipient: "patient",
        }, 201);
      }
      return respondWith(null, 404);
    });
    const user = userEvent.setup();
    render(
      <GuardianshipPanel
        dependents={[
          { ...dependent, patient_id: 12, preferred_name: "Ana", full_name: "Ana Prado", age: 18, is_adult: true, has_own_access: false },
          dependent,
        ]}
        onChanged={vi.fn()}
        onUnauthenticated={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Gerar acesso para Davi" })).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Gerar acesso para Ana" }));

    expect(await screen.findByLabelText("Link para o paciente assumir a conta")).toHaveValue(
      `${window.location.origin}/patient-claim#token=${"t".repeat(43)}`,
    );
    expect(apiFetch).toHaveBeenCalledWith("/me/dependents/12/claim-link", { method: "POST" });
  });
});
