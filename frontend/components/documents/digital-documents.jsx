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
import { PaginatedList } from "@/components/ui/paginated-list";
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

function doctorLabel(doctor) {
  return `${doctor.display_name} · CRM ${doctor.crm_number}/${doctor.crm_state}`;
}

// Copy for the removal confirmation. A patient removing a doctor's document
// must explicitly acknowledge who sent it before the action is enabled.
function removalCopy(documentItem, viewer) {
  const doctor = documentItem?.uploaded_by_doctor;
  if (viewer === "doctor") {
    return {
      title: "Remover documento",
      description: "O documento sairá do prontuário do paciente e deixará de ficar disponível para ele e para as equipes. Esta ação é registrada e não pode ser desfeita.",
      acknowledgement: "",
    };
  }
  if (doctor) {
    return {
      title: "Remover documento enviado por médico",
      description: `Este documento foi enviado por ${doctorLabel(doctor)}. Ao removê-lo, ele deixará de ficar disponível para você e para as equipes que acompanham seu prontuário. Esta ação é registrada e não pode ser desfeita.`,
      acknowledgement: `Entendo que este documento foi enviado por ${doctor.display_name}`,
    };
  }
  return {
    title: "Remover documento",
    description: "O documento deixará de ficar disponível imediatamente. Esta ação não pode ser desfeita.",
    acknowledgement: "",
  };
}

export function DigitalDocuments({
  basePath = "/me/documents",
  list,
  isAdult = false,
  onUnauthenticated = () => {},
  viewer = "patient",
  retryLabel = "Recarregar documentos",
  loadingText = "Carregando documentos…",
}) {
  const canUpload = viewer === "doctor" || isAdult;
  const canRemove = (documentItem) => (
    viewer === "doctor" ? Boolean(documentItem.can_remove) : isAdult
  );
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
        `${basePath}/${documentToDelete.document_id}`,
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
      list.resource.reload();
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
        {canUpload ? (
          <button className="compact-action" type="button" onClick={openDialog}>
            <Plus aria-hidden="true" size={16} />
            Adicionar documento
          </button>
        ) : null}
      </header>

      <PaginatedList
        list={list}
        searchLabel="Buscar documentos"
        filters={[{
          id: `${viewer}-document-type-filter`,
          label: "Tipo",
          value: list.filters.type,
          onChange: (value) => list.setFilter("type", value),
          options: DOCUMENT_TYPES,
        }]}
        itemLabel="documentos"
        loadingText={loadingText}
        emptyText="Nenhum documento disponível."
        retryLabel={retryLabel}
        renderEmpty={() => (
          <div className="document-empty">
            <FileText aria-hidden="true" size={22} />
            <div>
              <strong>Nenhum documento disponível.</strong>
              <p>{canUpload ? "Envie um arquivo ou digitalize sua primeira página." : "Os documentos aparecerão aqui."}</p>
            </div>
          </div>
        )}
        renderItems={(items) => (
          <ul className="document-list">
            {items.map((documentItem) => (
              <li key={documentItem.document_id}>
                <div className="document-icon"><FileText aria-hidden="true" size={20} /></div>
                <div className="document-copy">
                  <strong>{documentItem.title}</strong>
                  <span>{TYPE_LABELS[documentItem.type] || "Documento"} · {formatSize(documentItem.size_bytes)}</span>
                  <small>{documentItem.original_filename} · {formatDate(documentItem.created_at)}</small>
                  {documentItem.uploaded_by_doctor ? (
                    <small className="document-uploader">
                      Enviado por {doctorLabel(documentItem.uploaded_by_doctor)}
                    </small>
                  ) : null}
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
                  {canRemove(documentItem) ? (
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
      />

      {operationError ? (
        <p className="form-error document-operation-error" role="alert">
          {operationError}
        </p>
      ) : null}

      <DocumentUploadDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onUploaded={() => list.resource.reload()}
        onUnauthenticated={onUnauthenticated}
        returnFocusRef={triggerRef}
        uploadPath={basePath}
      />

      <ConfirmDialog
        isOpen={Boolean(documentToDelete)}
        onOpenChange={(open) => {
          if (!open) setDocumentToDelete(null);
        }}
        kicker="Arquivo clínico"
        {...removalCopy(documentToDelete, viewer)}
        confirmLabel="Remover documento"
        error={deleteError}
        isSaving={isDeleting}
        onConfirm={deleteDocument}
      />
    </section>
  );
}
