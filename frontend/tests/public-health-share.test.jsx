import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublicHealthShare } from "@/components/sharing/public-health-share";
import { publicApiFetch } from "@/lib/api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
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

  afterEach(() => vi.useRealTimers());

  it("preserva o fragmento, envia o token no header e mostra somente o resumo", async () => {
    publicApiFetch.mockReturnValue(respondWith(summary));

    render(<PublicHealthShare />);

    await waitFor(() => expect(window.location.hash).toBe(`#${token}`));
    expect(publicApiFetch).toHaveBeenCalledWith(
      "/public/shares/summary",
      { headers: { "X-Share-Token": token } },
    );
    expect(await screen.findByRole("heading", { name: "Resumo de Carlos" })).toBeInTheDocument();
    expect(screen.getByText("A+")).toBeInTheDocument();
    expect(screen.getByText("Dipirona")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("CPF");
    expect(document.body.textContent).not.toContain("E-mail");
  });

  it("reabre o resumo com a mesma URL após desmontar e montar", async () => {
    publicApiFetch.mockReturnValue(respondWith(summary));
    const first = render(<PublicHealthShare />);
    await screen.findByRole("heading", { name: "Resumo de Carlos" });
    first.unmount();

    render(<PublicHealthShare />);

    expect(await screen.findByRole("heading", { name: "Resumo de Carlos" })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#${token}`);
    expect(publicApiFetch).toHaveBeenCalledTimes(2);
  });

  it("atualiza AB+ para O- e remove marcadores antigos usando o mesmo token", async () => {
    publicApiFetch.mockReturnValueOnce(respondWith({
      ...summary, patient: { ...summary.patient, blood_type: "AB+" },
    }));
    let finish;
    publicApiFetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<PublicHealthShare />);
    await screen.findByText("AB+");

    await user.click(screen.getByRole("button", { name: "Atualizar dados" }));

    expect(screen.queryByText("AB+")).not.toBeInTheDocument();
    expect(screen.queryByText("Dipirona")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Verificando acesso temporário");
    expect(screen.queryByRole("button", { name: "Atualizar dados" })).not.toBeInTheDocument();
    await act(async () => finish(await respondWith({
      ...summary,
      patient: { preferred_name: "Carlos atualizado", blood_type: "O-" },
      markers: { ...summary.markers, allergies: [] },
    })));

    expect(await screen.findByText("O-")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resumo de Carlos atualizado" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Alergias (0)" })).toBeInTheDocument();
    expect(screen.getByText("Nenhuma alergia registrada.")).toBeInTheDocument();
    expect(publicApiFetch).toHaveBeenNthCalledWith(2,
      "/public/shares/summary", { headers: { "X-Share-Token": token } },
    );
    expect(window.location.hash).toBe(`#${token}`);
    expect(screen.getByText("Disponível até").parentElement).toHaveTextContent("09/10/2099");
  });

  it("retira o resumo quando a atualização recebe 404", async () => {
    publicApiFetch.mockReturnValueOnce(respondWith(summary))
      .mockReturnValueOnce(respondWith({}, 404));
    const user = userEvent.setup();
    render(<PublicHealthShare />);
    await screen.findByText("A+");

    await user.click(screen.getByRole("button", { name: "Atualizar dados" }));

    expect(await screen.findByRole("heading", { name: "Este acesso não está disponível" })).toBeInTheDocument();
    expect(screen.queryByText("A+")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
  });

  it.each(["rede", "503", "json"])("permite retry após falha de %s sem reter dados antigos", async (failure) => {
    publicApiFetch.mockReturnValueOnce(respondWith(summary));
    if (failure === "rede") publicApiFetch.mockRejectedValueOnce(new Error("network"));
    if (failure === "503") publicApiFetch.mockReturnValueOnce(respondWith({}, 503));
    if (failure === "json") publicApiFetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => { throw new Error("invalid JSON"); },
    });
    publicApiFetch.mockReturnValueOnce(respondWith(summary));
    const user = userEvent.setup();
    render(<PublicHealthShare />);
    await screen.findByText("A+");

    await user.click(screen.getByRole("button", { name: "Atualizar dados" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível consultar agora");
    expect(screen.queryByText("A+")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("A+")).toBeInTheDocument();
    expect(publicApiFetch).toHaveBeenLastCalledWith(
      "/public/shares/summary", { headers: { "X-Share-Token": token } },
    );
  });

  it("retira o conteúdo ao expirar mesmo sem atualização", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    publicApiFetch.mockReturnValue(respondWith({ ...summary, expires_at: "2026-10-14T12:00:02Z" }));
    render(<PublicHealthShare />);
    await act(async () => {});
    expect(screen.getByText("A+")).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(2000));

    expect(screen.getByRole("heading", { name: "Este acesso não está disponível" })).toBeInTheDocument();
    expect(screen.queryByText("A+")).not.toBeInTheDocument();
    expect(publicApiFetch).toHaveBeenCalledTimes(1);
  });

  it("não mostra resposta cujo prazo já terminou", async () => {
    publicApiFetch.mockReturnValue(respondWith({ ...summary, expires_at: "2000-01-01T00:00:00Z" }));
    render(<PublicHealthShare />);
    expect(await screen.findByRole("heading", { name: "Este acesso não está disponível" })).toBeInTheDocument();
    expect(screen.queryByText("A+")).not.toBeInTheDocument();
  });

  it("preserva acesso em Strict Mode", async () => {
    publicApiFetch.mockReturnValue(respondWith(summary));
    const view = render(<StrictMode><PublicHealthShare /></StrictMode>);
    await screen.findByText("A+");
    expect(screen.getByText("A+")).toBeInTheDocument();
    expect(window.location.hash).toBe(`#${token}`);
    expect(publicApiFetch).toHaveBeenCalledWith(
      "/public/shares/summary", { headers: { "X-Share-Token": token } },
    );
    view.unmount();
  });

  it("ignora consulta encerrada depois de desmontar a página", async () => {
    let finish;
    publicApiFetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockReturnValueOnce(respondWith(summary));
    const old = render(<PublicHealthShare />);
    old.unmount();
    render(<PublicHealthShare />);
    await screen.findByText("A+");
    await act(async () => finish(await respondWith({}, 404)));
    expect(screen.getByText("A+")).toBeInTheDocument();
  });

  it.each(["curto", "!".repeat(43), "v".repeat(65)])("não consulta a API com token malformado %s", async (invalid) => {
    window.history.replaceState(null, "", `/share#${invalid}`);
    render(<PublicHealthShare />);
    expect(await screen.findByRole("heading", { name: "Este acesso não está disponível" })).toBeInTheDocument();
    expect(publicApiFetch).not.toHaveBeenCalled();
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

  it("separa as categorias em abas com contagem e mostra todos os itens", async () => {
    publicApiFetch.mockReturnValue(respondWith(summary));
    const user = userEvent.setup();

    render(<PublicHealthShare />);

    const tablist = await screen.findByRole("tablist", { name: "Categorias clínicas" });
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent);
    expect(tabs).toEqual([
      "Alergias (1)",
      "Medicações ativas (1)",
      "Condições (0)",
      "Diagnósticos (1)",
    ]);
    expect(screen.getByRole("tab", { name: "Alergias (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Dipirona");

    await user.click(screen.getByRole("tab", { name: "Medicações ativas (1)" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Losartana");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("50 mg");

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Condições (0)" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Nenhuma condição registrada.");

    await user.click(screen.getByRole("tab", { name: "Diagnósticos (1)" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Hipertensão");
  });
});
