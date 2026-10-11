"use client";

import { useRef, useState } from "react";
import Download from "lucide-react/dist/esm/icons/download";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Plus from "lucide-react/dist/esm/icons/plus";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";

import {
  DOCUMENT_TYPES,
  DocumentUploadDialog,
} from "@/components/documents/document-upload-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch, readApiError } from "@/lib/api";


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

const DOWNLOAD_ERROR = "Não foi possível baixar o documento.";
const DELETE_ERROR = "Não foi possível remover o documento.";

export function DigitalDocuments({
  basePath = "/me/documents",
  documents,
  isAdult = false,
  onDocumentsChange = () => {},
  onUnauthenticated = () => {},
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [operationError, setOperationError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const triggerRef = useRef(null);

  function openDialog(event) {
    triggerRef.current = event.currentTarget;
    setIsDialogOpen(true);
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
      if (!response.ok) {
        setOperationError((await readApiError(response, DOWNLOAD_ERROR)).message);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = documentItem.original_filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setOperationError(DOWNLOAD_ERROR);
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
      if (!response.ok) {
        setDeleteError((await readApiError(response, DELETE_ERROR)).message);
        return;
      }
      onDocumentsChange((current) =>
        current.filter((item) => item.document_id !== documentToDelete.document_id),
      );
      setDocumentToDelete(null);
    } catch {
      setDeleteError(DELETE_ERROR);
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

      <DocumentUploadDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onUploaded={(created) => onDocumentsChange((current) => [created, ...current])}
        onUnauthenticated={onUnauthenticated}
        returnFocusRef={triggerRef}
      />

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
