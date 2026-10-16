import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HealthSharing } from "@/components/patient/health-sharing";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }) => <svg aria-label="QR-Code do compartilhamento" data-value={value} />,
}));

const metadata = {
  share_id: 42,
  created_at: "2026-10-09T12:00:00",
  expires_at: "2099-10-09T14:00:00",
};

const created = {
  ...metadata,
  share_url: `https://app.example/share#${"v".repeat(43)}`,
};

function respondWith(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}


describe("HealthSharing", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("gera o link em memória, mostra QR, temporizador e permite copiar", async () => {
    apiFetch
      .mockReturnValueOnce(respondWith(null))
      .mockReturnValueOnce(respondWith(created, 201));
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    render(<HealthSharing isAdult onUnauthenticated={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Gerar acesso temporário" }),
    );

    expect(apiFetch).toHaveBeenCalledWith("/me/shares", { method: "POST" });
    expect(
      await screen.findByLabelText("QR-Code do compartilhamento"),
    ).toHaveAttribute("data-value", created.share_url);
    expect(screen.getByText(/Tempo restante/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copiar link" }));
    expect(writeText).toHaveBeenCalledWith(created.share_url);
    expect(screen.getByRole("status")).toHaveTextContent("Link copiado");
  });

  it("não tenta reconstruir link ao recuperar somente os metadados", async () => {
    apiFetch.mockReturnValue(respondWith(metadata));

    render(<HealthSharing isAdult onUnauthenticated={vi.fn()} />);

    expect(await screen.findByText("Acesso temporário ativo")).toBeInTheDocument();
    expect(screen.getByText(/link não fica armazenado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copiar link" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("QR-Code do compartilhamento")).not.toBeInTheDocument();
  });

  it("revoga em diálogo acessível e remove imediatamente o estado ativo", async () => {
    apiFetch
      .mockReturnValueOnce(respondWith(metadata))
      .mockReturnValueOnce(respondWith(null, 204));
    const user = userEvent.setup();

    render(<HealthSharing isAdult onUnauthenticated={vi.fn()} />);

    const trigger = await screen.findByRole("button", { name: "Cancelar acesso" });
    await user.click(trigger);
    expect(
      screen.getByRole("alertdialog", { name: "Revogar acesso temporário" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manter acesso" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Confirmar revogação" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/shares/42", { method: "DELETE" }),
    );
    expect(
      await screen.findByRole("button", { name: "Gerar acesso temporário" }),
    ).toBeInTheDocument();
  });

  it("mantém o estado seguro e mostra erro quando a geração falha", async () => {
    apiFetch
      .mockReturnValueOnce(respondWith(null))
      .mockReturnValueOnce(respondWith({ detail: "Banco indisponível." }, 503));
    const user = userEvent.setup();

    render(<HealthSharing isAdult onUnauthenticated={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Gerar acesso temporário" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Não foi possível gerar o acesso temporário.");
    expect(screen.queryByLabelText("QR-Code do compartilhamento")).not.toBeInTheDocument();
  });

  it("não exibe mensagem técnica quando a consulta recebe corpo inválido", async () => {
    apiFetch.mockReturnValueOnce(Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
    }));

    render(<HealthSharing isAdult onUnauthenticated={vi.fn()} />);

    expect(await screen.findByText("Não foi possível consultar o acesso temporário."))
      .toBeInTheDocument();
    expect(screen.queryByText(/Unexpected end of JSON/)).not.toBeInTheDocument();
  });

  it.each([
    [() => respondWith({ detail: "Role sem acesso." }, 403),
      "Você não tem permissão para esta ação."],
    [() => Promise.reject(new TypeError("Failed to fetch")),
      "Não foi possível gerar o acesso temporário."],
  ])("padroniza falhas ao gerar acesso (%#)", async (failure, message) => {
    apiFetch.mockReturnValueOnce(respondWith(null)).mockImplementationOnce(failure);
    const user = userEvent.setup();

    render(<HealthSharing isAdult onUnauthenticated={vi.fn()} />);
    await user.click(
      await screen.findByRole("button", { name: "Gerar acesso temporário" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });

  it("não oferece compartilhamento para paciente menor", () => {
    render(<HealthSharing isAdult={false} onUnauthenticated={vi.fn()} />);

    expect(screen.getByText(/disponível apenas para pacientes adultos/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
