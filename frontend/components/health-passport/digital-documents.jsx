"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Close as DialogClose,
  Content as DialogContent,
  Description as DialogDescription,
  Overlay as DialogOverlay,
  Portal as DialogPortal,
  Root as DialogRoot,
  Title as DialogTitle,
} from "@radix-ui/react-dialog";
import Camera from "lucide-react/dist/esm/icons/camera";
import Download from "lucide-react/dist/esm/icons/download";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Plus from "lucide-react/dist/esm/icons/plus";
import RefreshCcw from "lucide-react/dist/esm/icons/refresh-ccw";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import X from "lucide-react/dist/esm/icons/x";

import { ClinicalSelect } from "@/components/ui/clinical-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api";


const DOCUMENT_TYPES = [
  { value: "exam", label: "Exame" },
  { value: "prescription", label: "Receita" },
  { value: "report", label: "Laudo" },
  { value: "other", label: "Outro" },
];
const TYPE_LABELS = Object.fromEntries(
  DOCUMENT_TYPES.map(({ value, label }) => [value, label]),
);
const STATUS_LABELS = {
  uploaded: "Enviado",
  processing: "Processando",
  needs_review: "Revisão necessária",
  confirmed: "Confirmado",
  failed: "Falha no processamento",
};
const EMPTY_FORM = { title: "", type: "exam" };
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function formatDate(value) {
  if (!value) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function formatSize(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function DigitalDocuments({
  basePath = "/me/documents",
  documents,
  isAdult = false,
  onDocumentsChange = () => {},
  onUnauthenticated = () => {},
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const triggerRef = useRef(null);
  const titleRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const previewUrlRef = useRef("");
  const dialogOpenRef = useRef(false);
  const captureRequestRef = useRef(0);

  const stopCamera = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
    setPreviewUrl("");
  }, []);

  const resetDialog = useCallback(() => {
    captureRequestRef.current += 1;
    stopCamera();
    clearPreview();
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setCameraStatus("idle");
    setError("");
    setIsSending(false);
  }, [clearPreview, stopCamera]);

  useEffect(() => {
    if (cameraStatus === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraStatus]);

  useEffect(() => () => {
    stopMediaStream(streamRef.current);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  function handleDialogChange(open) {
    dialogOpenRef.current = open;
    setIsDialogOpen(open);
    if (!open) resetDialog();
  }

  function openDialog(event) {
    triggerRef.current = event.currentTarget;
    dialogOpenRef.current = true;
    setIsDialogOpen(true);
  }

  async function startCamera() {
    captureRequestRef.current += 1;
    setError("");
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus(previewUrlRef.current ? "captured" : "error");
      setError(
        "Não foi possível acessar a câmera. Você ainda pode escolher um arquivo.",
      );
      return;
    }
    setCameraStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      if (!dialogOpenRef.current) {
        stopMediaStream(stream);
        return;
      }
      clearPreview();
      setSelectedFile(null);
      streamRef.current = stream;
      setCameraStatus("live");
    } catch {
      setCameraStatus(previewUrlRef.current ? "captured" : "error");
      setError(
        "Não foi possível acessar a câmera. Você ainda pode escolher um arquivo.",
      );
    }
  }

  function capturePage() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) {
      setError("A câmera ainda está preparando a imagem. Tente novamente.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCamera();
    setCameraStatus("capturing");
    const captureRequest = ++captureRequestRef.current;
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (
        captureRequest !== captureRequestRef.current
        || !dialogOpenRef.current
      ) {
        return;
      }
      if (!blob) {
        setCameraStatus("error");
        setError("Não foi possível capturar a página. Tente novamente.");
        return;
      }
      if (blob.size > MAX_FILE_BYTES) {
        setCameraStatus("error");
        setError("A foto excede o limite de 10 MB. Faça uma nova captura.");
        return;
      }
      const file = new File([blob], "documento-digitalizado.jpg", {
        type: "image/jpeg",
      });
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setSelectedFile(file);
      setCameraStatus("captured");
      setError("");
    }, "image/jpeg", 0.9);
  }

  function selectFile(event) {
    captureRequestRef.current += 1;
    stopCamera();
    clearPreview();
    setCameraStatus("idle");
    setError("");
    const file = event.target.files?.[0] || null;
    if (file?.size > MAX_FILE_BYTES) {
      setSelectedFile(null);
      setError("O arquivo excede o limite de 10 MB.");
      return;
    }
    setSelectedFile(file);
  }

  async function submitDocument(event) {
    event.preventDefault();
    if (!selectedFile) {
      setError("Escolha um arquivo ou digitalize uma página antes de enviar.");
      return;
    }
    setIsSending(true);
    setError("");
    const body = new FormData();
    body.append("title", form.title);
    body.append("type", form.type);
    body.append("file", selectedFile);
    try {
      const response = await apiFetch("/me/documents", { method: "POST", body });
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          typeof payload?.detail === "string"
            ? payload.detail
            : "Não foi possível enviar o documento.",
        );
      }
      const created = await response.json();
      onDocumentsChange((current) => [created, ...current]);
      handleDialogChange(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSending(false);
    }
  }

  async function downloadDocument(documentItem) {
    setOperationError("");
    setDownloadingId(documentItem.document_id);
    try {
      const response = await apiFetch(
        `${basePath}/${documentItem.document_id}/file`,
      );
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) throw new Error("Não foi possível baixar o documento.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = documentItem.original_filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setOperationError(requestError.message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function deleteDocument() {
    if (!documentToDelete) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      const response = await apiFetch(
        `/me/documents/${documentToDelete.document_id}`,
        { method: "DELETE" },
      );
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) throw new Error("Não foi possível remover o documento.");
      onDocumentsChange((current) =>
        current.filter((item) => item.document_id !== documentToDelete.document_id),
      );
      setDocumentToDelete(null);
    } catch (requestError) {
      setDeleteError(requestError.message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="clinical-section document-section" aria-labelledby="documents-title">
      <header>
        <div>
          <p className="eyebrow">Arquivo clínico</p>
          <h2 id="documents-title">Documentos digitais</h2>
        </div>
        {isAdult ? (
          <button className="compact-action" type="button" onClick={openDialog}>
            <Plus aria-hidden="true" size={16} />
            Adicionar documento
          </button>
        ) : null}
      </header>

      {documents.length === 0 ? (
        <div className="document-empty">
          <FileText aria-hidden="true" size={22} />
          <div>
            <strong>Nenhum documento disponível.</strong>
            <p>{isAdult ? "Envie um arquivo ou digitalize sua primeira página." : "Os documentos aparecerão aqui."}</p>
          </div>
        </div>
      ) : (
        <ul className="document-list">
          {documents.map((documentItem) => (
            <li key={documentItem.document_id}>
              <div className="document-icon"><FileText aria-hidden="true" size={20} /></div>
              <div className="document-copy">
                <strong>{documentItem.title}</strong>
                <span>{TYPE_LABELS[documentItem.type] || "Documento"} · {formatSize(documentItem.size_bytes)}</span>
                <small>{documentItem.original_filename} · {formatDate(documentItem.created_at)}</small>
              </div>
              <span className="document-status">{STATUS_LABELS[documentItem.status] || documentItem.status}</span>
              <div className="document-actions">
                <button
                  type="button"
                  aria-label={`Baixar ${documentItem.title}`}
                  disabled={downloadingId === documentItem.document_id}
                  onClick={() => downloadDocument(documentItem)}
                >
                  <Download aria-hidden="true" size={17} />
                </button>
                {isAdult ? (
                  <button
                    type="button"
                    aria-label={`Remover ${documentItem.title}`}
                    onClick={() => setDocumentToDelete(documentItem)}
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {operationError ? (
        <p className="form-error document-operation-error" role="alert">
          {operationError}
        </p>
      ) : null}

      <DialogRoot open={isDialogOpen} onOpenChange={handleDialogChange}>
        <DialogPortal>
          <DialogOverlay className="modal-backdrop" />
          <DialogContent
            className="clinical-dialog document-dialog"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              titleRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              triggerRef.current?.focus();
            }}
          >
            <header className="clinical-dialog-heading">
              <div>
                <p className="dialog-kicker">Prontuário · Documento privado</p>
                <DialogTitle asChild><h2>Adicionar documento</h2></DialogTitle>
                <DialogDescription asChild>
                  <p className="dialog-description">PDF, JPG ou PNG de até 10 MB. A câmera só será acessada após sua confirmação.</p>
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <button className="dialog-close" type="button" aria-label="Fechar envio de documento">
                  <X aria-hidden="true" size={18} />
                </button>
              </DialogClose>
            </header>

            <form onSubmit={submitDocument}>
              <div className="dialog-field">
                <label htmlFor="document-title">Título do documento</label>
                <input
                  ref={titleRef}
                  id="document-title"
                  maxLength={120}
                  required
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                />
              </div>
              <div className="dialog-field">
                <label htmlFor="document-type">Tipo do documento</label>
                <ClinicalSelect
                  id="document-type"
                  name="document-type"
                  options={DOCUMENT_TYPES}
                  value={form.type}
                  onValueChange={(value) => setForm((current) => ({ ...current, type: value }))}
                />
              </div>

              <div className="document-source-panel">
                <label htmlFor="document-file">Escolher arquivo</label>
                <input
                  id="document-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={selectFile}
                />
                <span aria-hidden="true">ou</span>
                <button
                  className="document-camera-action"
                  type="button"
                  disabled={cameraStatus === "requesting"}
                  onClick={startCamera}
                >
                  <Camera aria-hidden="true" size={18} />
                  {cameraStatus === "requesting" ? "Solicitando câmera…" : "Digitalizar com a câmera"}
                </button>
              </div>

              {cameraStatus === "live" ? (
                <div className="document-camera-stage">
                  <video ref={videoRef} aria-label="Prévia ao vivo do documento" autoPlay muted playsInline />
                  <button type="button" onClick={capturePage}>Capturar página</button>
                </div>
              ) : null}

              {cameraStatus === "captured" ? (
                <div className="document-camera-stage">
                  <img src={previewUrl} alt="Página digitalizada para revisão" />
                  <button type="button" onClick={startCamera}>
                    <RefreshCcw aria-hidden="true" size={17} />
                    Refazer foto
                  </button>
                </div>
              ) : null}

              {selectedFile ? <p className="document-selected-file">Arquivo preparado: <strong>{selectedFile.name}</strong></p> : null}
              {error ? <p className="form-error dialog-error" role="alert" aria-label={error}>{error}</p> : null}

              <div className="dialog-actions">
                <DialogClose asChild><button className="dialog-secondary" type="button" disabled={isSending}>Cancelar</button></DialogClose>
                <button className="dialog-primary" type="submit" disabled={isSending}>
                  {isSending ? "Enviando…" : "Enviar documento"}
                </button>
              </div>
            </form>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>

      <ConfirmDialog
        isOpen={Boolean(documentToDelete)}
        onOpenChange={(open) => {
          if (!open) setDocumentToDelete(null);
        }}
        kicker="Arquivo clínico"
        title="Remover documento"
        description="O documento deixará de ficar disponível imediatamente. Esta ação não pode ser desfeita."
        confirmLabel="Remover documento"
        error={deleteError}
        isSaving={isDeleting}
        onConfirm={deleteDocument}
      />
    </section>
  );
}
