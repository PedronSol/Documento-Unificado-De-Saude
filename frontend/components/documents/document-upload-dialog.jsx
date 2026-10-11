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
import RefreshCcw from "lucide-react/dist/esm/icons/refresh-ccw";
import X from "lucide-react/dist/esm/icons/x";

import { ClinicalSelect } from "@/components/ui/clinical-select";
import { apiFetch, readApiError } from "@/lib/api";


export const DOCUMENT_TYPES = [
  { value: "exam", label: "Exame" },
  { value: "prescription", label: "Receita" },
  { value: "report", label: "Laudo" },
  { value: "other", label: "Outro" },
];
const EMPTY_FORM = { title: "", type: "exam" };
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

const UPLOAD_ERROR = "Não foi possível enviar o documento.";


// Upload by file or single-page camera scan. Camera, preview and file stay in
// memory only and are released whenever the dialog closes.
export function DocumentUploadDialog({
  isOpen,
  onOpenChange,
  onUploaded,
  onUnauthenticated,
  returnFocusRef,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
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

  useEffect(() => {
    dialogOpenRef.current = isOpen;
  }, [isOpen]);

  function handleDialogChange(open) {
    dialogOpenRef.current = open;
    onOpenChange(open);
    if (!open) resetDialog();
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
        setError((await readApiError(response, UPLOAD_ERROR, {
          413: "O arquivo excede o limite de 10 MB.",
        })).message);
        return;
      }
      const created = await response.json();
      onUploaded(created);
      handleDialogChange(false);
    } catch {
      setError(UPLOAD_ERROR);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <DialogRoot open={isOpen} onOpenChange={handleDialogChange}>
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
            returnFocusRef.current?.focus();
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
  );
}
