import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicHealthShare } from "@/components/sharing/public-health-share";
import { publicApiFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({
  publicApiFetch: vi.fn(),
}));

const token = "v".repeat(43);
const summary = {
  expires_at: "2099-10-09T14:00:00",
  patient: { preferred_name: "Carlos", blood_type: "A+" },
  markers: {
    allergies: [{ name: "Dipirona", description: "Reação cutânea" }],
    medications: [
      {
        name: "Losartana",
        description: "Uso contínuo",
        dosage: "50 mg",
        frequency: "1 vez ao dia",
      },
    ],
    conditions: [],
    diagnoses: [{ name: "Hipertensão", description: null }],
  },
};

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}


describe("PublicHealthShare", () => {
  beforeEach(() => {
    publicApiFetch.mockReset();
    window.history.replaceState(null, "", `/share#${token}`);
  });

  it("remove o fragmento, envia o token no header e mostra somente o resumo", async () => {
    publicApiFetch.mockReturnValue(respondWith(summary));

    render(<PublicHealthShare />);

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(publicApiFetch).toHaveBeenCalledWith(
      "/public/shares/summary",
      { headers: { "X-Share-Token": token } },
    );
    expect(await screen.findByRole("heading", { name: "Resumo de Carlos" })).toBeInTheDocument();
    expect(screen.getByText("A+")).toBeInTheDocument();
    expect(screen.getByText("Dipirona")).toBeInTheDocument();
    expect(screen.getByText("Losartana")).toBeInTheDocument();
    expect(screen.getByText("Hipertensão")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma condição registrada.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("CPF");
    expect(document.body.textContent).not.toContain("E-mail");
  });

  it("mostra estado uniforme quando o link está indisponível", async () => {
    publicApiFetch.mockReturnValue(
      respondWith({ detail: "Compartilhamento indisponível." }, 404),
    );

    render(<PublicHealthShare />);

    expect(
      await screen.findByRole("heading", { name: "Este acesso não está disponível" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/expirado, sido revogado ou digitado incorretamente/i)).toBeInTheDocument();
  });

  it("não consulta a API sem token no fragmento", async () => {
    window.history.replaceState(null, "", "/share");

    render(<PublicHealthShare />);

    expect(
      await screen.findByRole("heading", { name: "Este acesso não está disponível" }),
    ).toBeInTheDocument();
    expect(publicApiFetch).not.toHaveBeenCalled();
  });
});
