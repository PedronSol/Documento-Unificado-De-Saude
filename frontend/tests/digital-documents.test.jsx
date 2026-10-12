import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DigitalDocuments } from "@/components/documents/digital-documents";
import { apiFetch } from "@/lib/api";
import { staticList } from "./utils/paged-api";


vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: vi.fn(),
}));

function streamWithTrack() {
  const track = { stop: vi.fn() };
  return {
    stream: { getTracks: () => [track] },
    track,
  };
}

describe("DigitalDocuments", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    URL.createObjectURL = vi.fn(() => "blob:document-preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("mantém o primeiro upload visível no estado vazio somente para adulto", async () => {
    const { rerender } = render(
      <DigitalDocuments
        list={staticList([])}
        isAdult
      />,
    );

    expect(screen.getByText("Nenhum documento disponível.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar documento" }),
    ).toBeInTheDocument();

    rerender(
      <DigitalDocuments
        list={staticList([])}
        isAdult={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Adicionar documento" }),
    ).not.toBeInTheDocument();
  });

  it("pede câmera somente após gesto, sem áudio, e encerra o stream ao fechar", async () => {
    const user = userEvent.setup();
    const { stream, track } = streamWithTrack();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    render(
      <DigitalDocuments
        list={staticList([])}
        isAdult
      />,
    );

    await user.click(screen.getByRole("button", { name: "Adicionar documento" }));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Título do documento")).toHaveFocus();

    await user.click(
      screen.getByRole("button", { name: "Digitalizar com a câmera" }),
    );
    await waitFor(() =>
      expect(getUserMedia).toHaveBeenCalledWith({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      }),
    );
    expect(await screen.findByLabelText("Prévia ao vivo do documento")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fechar envio de documento" }));
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("captura JPEG, encerra câmera e envia pelo mesmo FormData", async () => {
    const user = userEvent.setup();
    const { stream, track } = streamWithTrack();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["jpeg-frame"], { type: "image/jpeg" }));
    });
    apiFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        document_id: 42,
        title: "Receita",
        type: "prescription",
        original_filename: "documento-digitalizado.jpg",
        media_type: "image/jpeg",
        size_bytes: 10,
        status: "uploaded",
        created_at: "2026-10-11T12:00:00",
      }),
    });
    const onDocumentsChange = vi.fn();

    render(
      <DigitalDocuments
        list={staticList([], { reload: onDocumentsChange })}
        isAdult
      />,
    );
    await user.click(screen.getByRole("button", { name: "Adicionar documento" }));
    await user.type(screen.getByLabelText("Título do documento"), "Receita");
    await user.click(screen.getByLabelText("Tipo do documento"));
    await user.click(screen.getByRole("option", { name: "Receita" }));
    await user.click(screen.getByRole("button", { name: "Digitalizar com a câmera" }));

    const video = await screen.findByLabelText("Prévia ao vivo do documento");
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1200 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 1600 });
    await user.click(screen.getByRole("button", { name: "Capturar página" }));

    expect(await screen.findByAltText("Página digitalizada para revisão")).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Enviar documento" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());
    const [path, options] = apiFetch.mock.calls[0];
    expect(path).toBe("/me/documents");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("title")).toBe("Receita");
    expect(options.body.get("type")).toBe("prescription");
    expect(options.body.get("file")).toBeInstanceOf(File);
    expect(options.body.has("source")).toBe(false);
    expect(onDocumentsChange).toHaveBeenCalled();
  });

  it("mantém o seletor de arquivo após recusa da câmera", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("denied")) },
    });

    render(
      <DigitalDocuments
        list={staticList([])}
        isAdult
      />,
    );
    await user.click(screen.getByRole("button", { name: "Adicionar documento" }));
    const fallbackFile = new File(["%PDF-1.4\n%%EOF"], "fallback.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Escolher arquivo"), {
      target: { files: [fallbackFile] },
    });
    await user.click(screen.getByRole("button", { name: "Digitalizar com a câmera" }));

    expect(
      await screen.findByRole("alert", {
        name: "Não foi possível acessar a câmera. Você ainda pode escolher um arquivo.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Escolher arquivo")).toBeInTheDocument();
    expect(screen.getByText(/fallback\.pdf/)).toBeInTheDocument();
  });

  it("descarta uma captura assíncrona concluída depois de fechar o diálogo", async () => {
    const user = userEvent.setup();
    const { stream } = streamWithTrack();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    let finishCapture;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      finishCapture = callback;
    });

    render(
      <DigitalDocuments list={staticList([])} isAdult />,
    );
    await user.click(screen.getByRole("button", { name: "Adicionar documento" }));
    await user.click(screen.getByRole("button", { name: "Digitalizar com a câmera" }));
    const video = await screen.findByLabelText("Prévia ao vivo do documento");
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1200 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 1600 });
    await user.click(screen.getByRole("button", { name: "Capturar página" }));
    await user.click(screen.getByRole("button", { name: "Fechar envio de documento" }));

    finishCapture(new Blob(["late-frame"], { type: "image/jpeg" }));

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByAltText("Página digitalizada para revisão")).not.toBeInTheDocument();
  });

  it("mostra falha de download fora do diálogo sem remover a lista", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({ ok: false, status: 503 });
    render(
      <DigitalDocuments
        list={staticList([{
          document_id: 42,
          title: "Hemograma",
          type: "exam",
          original_filename: "hemograma.pdf",
          media_type: "application/pdf",
          size_bytes: 1024,
          status: "uploaded",
          created_at: "2026-10-11T12:00:00",
        }])}
        isAdult
      />,
    );

    await user.click(screen.getByRole("button", { name: "Baixar Hemograma" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível baixar o documento.",
    );
    expect(screen.getByText("Hemograma")).toBeInTheDocument();
  });

  const hemograma = {
    document_id: 42,
    title: "Hemograma",
    type: "exam",
    original_filename: "hemograma.pdf",
    media_type: "application/pdf",
    size_bytes: 1024,
    status: "uploaded",
    created_at: "2026-10-11T12:00:00",
  };

  it("não exibe mensagem técnica quando a rede falha no download", async () => {
    const user = userEvent.setup();
    apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<DigitalDocuments list={staticList([hemograma])} isAdult />);

    await user.click(screen.getByRole("button", { name: "Baixar Hemograma" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível baixar o documento.",
    );
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });

  it("padroniza permissão negada na remoção", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: "Role." }),
    });
    render(
      <DigitalDocuments
        list={staticList([hemograma])}
        isAdult
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remover Hemograma" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remover documento" }));

    expect(await within(dialog).findByText("Você não tem permissão para esta ação."))
      .toBeInTheDocument();
  });

  const doctorDocument = {
    ...hemograma,
    document_id: 43,
    title: "Laudo do eco",
    uploaded_by_doctor: { display_name: "Dra. Ana Lima", crm_number: "123456", crm_state: "SP" },
  };

  it("identifica documentos enviados por médico", () => {
    render(<DigitalDocuments list={staticList([doctorDocument, hemograma])} isAdult />);

    expect(screen.getByText("Enviado por Dra. Ana Lima · CRM 123456/SP")).toBeInTheDocument();
    expect(screen.getAllByText(/Enviado por/)).toHaveLength(1);
  });

  it("exige confirmação marcada para o paciente remover documento médico", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({ ok: true, status: 204 });
    const onDocumentsChange = vi.fn();
    render(
      <DigitalDocuments
        list={staticList([doctorDocument], { reload: onDocumentsChange })}
        isAdult
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remover Laudo do eco" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Remover documento enviado por médico",
    });
    expect(dialog).toHaveTextContent("Dra. Ana Lima · CRM 123456/SP");
    expect(dialog).toHaveTextContent(/equipes que acompanham/);
    const confirm = within(dialog).getByRole("button", { name: "Remover documento" });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByRole("checkbox", {
      name: "Entendo que este documento foi enviado por Dra. Ana Lima",
    }));
    await user.click(confirm);

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/me/documents/43", { method: "DELETE" }),
    );
  });

  it("mantém a confirmação simples para documento enviado pelo paciente", async () => {
    const user = userEvent.setup();
    render(<DigitalDocuments list={staticList([hemograma])} isAdult />);

    await user.click(screen.getByRole("button", { name: "Remover Hemograma" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remover documento" });
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Remover documento" })).toBeEnabled();
  });

  it("permite ao médico enviar e remover somente os próprios documentos", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({ ok: true, status: 204 });
    render(
      <DigitalDocuments
        basePath="/medical/patients/10/documents"
        viewer="doctor"
        list={staticList([
          { ...doctorDocument, can_remove: true },
          { ...hemograma, can_remove: false },
        ])}
        onUnauthenticated={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Adicionar documento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover Hemograma" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remover Laudo do eco" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remover documento" });
    expect(dialog).toHaveTextContent(/prontuário do paciente/);
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remover documento" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/medical/patients/10/documents/43",
        { method: "DELETE" },
      ),
    );
  });

  it("envia pelo caminho médico", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ ...doctorDocument, can_remove: true }),
    });
    const onDocumentsChange = vi.fn();
    render(
      <DigitalDocuments
        basePath="/medical/patients/10/documents"
        viewer="doctor"
        list={staticList([], { reload: onDocumentsChange })}
        onUnauthenticated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Adicionar documento" }));
    await user.type(screen.getByLabelText("Título do documento"), "Laudo do eco");
    await user.upload(
      screen.getByLabelText("Escolher arquivo"),
      new File(["%PDF-1.4"], "laudo.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Enviar documento" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());
    expect(apiFetch.mock.calls[0][0]).toBe("/medical/patients/10/documents");
    expect(onDocumentsChange).toHaveBeenCalled();
  });

  it("oferece busca e filtro de tipo em listas longas", async () => {
    const user = userEvent.setup();
    const setFilter = vi.fn();
    render(
      <DigitalDocuments
        list={staticList([hemograma], { total: 25, setFilter, filters: { type: "" } })}
        isAdult
      />,
    );

    expect(screen.getByRole("searchbox", { name: "Buscar documentos" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Tipo"));
    await user.click(screen.getByRole("option", { name: "Laudo" }));
    expect(setFilter).toHaveBeenCalledWith("type", "report");
  });
});
