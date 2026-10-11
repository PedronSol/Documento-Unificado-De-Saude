import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DigitalDocuments } from "@/components/health-passport/digital-documents";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({
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
        documents={[]}
        isAdult
        onDocumentsChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Nenhum documento disponível.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar documento" }),
    ).toBeInTheDocument();

    rerender(
      <DigitalDocuments
        documents={[]}
        isAdult={false}
        onDocumentsChange={vi.fn()}
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
        documents={[]}
        isAdult
        onDocumentsChange={vi.fn()}
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
        documents={[]}
        isAdult
        onDocumentsChange={onDocumentsChange}
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
        documents={[]}
        isAdult
        onDocumentsChange={vi.fn()}
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
      <DigitalDocuments documents={[]} isAdult onDocumentsChange={vi.fn()} />,
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
        documents={[{
          document_id: 42,
          title: "Hemograma",
          type: "exam",
          original_filename: "hemograma.pdf",
          media_type: "application/pdf",
          size_bytes: 1024,
          status: "uploaded",
          created_at: "2026-10-11T12:00:00",
        }]}
        isAdult
      />,
    );

    await user.click(screen.getByRole("button", { name: "Baixar Hemograma" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível baixar o documento.",
    );
    expect(screen.getByText("Hemograma")).toBeInTheDocument();
  });
});
