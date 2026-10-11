import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MyGuardiansPanel } from "@/components/patient/my-guardians-panel";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const activeGuardian = {
  guardianship_id: 4,
  guardian_display_name: "Joana Prado Ribeiro",
  relationship: "parent",
  status: "active",
  awaiting_my_confirmation: false,
};

const pendingGuardian = {
  guardianship_id: 5,
  guardian_display_name: "Rui Prado",
  relationship: "legal_guardian",
  status: "pending",
  awaiting_my_confirmation: true,
};

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function mockGuardians(guardians) {
  apiFetch.mockImplementation((path, options = {}) => {
    if (path === "/me/guardians" && !options.method) {
      return respondWith(guardians);
    }
    return respondWith(null, 204);
  });
}


describe("MyGuardiansPanel", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("titular adulto desvincula responsável após confirmação", async () => {
    mockGuardians([activeGuardian]);
    const user = userEvent.setup();
    render(<MyGuardiansPanel isAdult onUnauthenticated={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Desvincular Joana Prado Ribeiro" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Desvincular responsável" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/guardians/4", { method: "DELETE" }),
    );
  });

  it("menor confirma responsável e não vê desvínculo", async () => {
    mockGuardians([activeGuardian, pendingGuardian]);
    const user = userEvent.setup();
    render(<MyGuardiansPanel isAdult={false} onUnauthenticated={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Confirmar Rui Prado como responsável" }),
    );

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/guardianships/5/confirm", { method: "POST" }),
    );
    expect(screen.queryByRole("button", { name: /Desvincular/ })).toBeNull();
    expect(
      screen.getByText("Após completar 18 anos, você pode desvincular responsáveis quando quiser."),
    ).toBeInTheDocument();
  });

  it("não renderiza nada sem responsáveis", async () => {
    mockGuardians([]);
    const { container } = render(<MyGuardiansPanel isAdult onUnauthenticated={vi.fn()} />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/me/guardians"));
    expect(container).toBeEmptyDOMElement();
  });
});
