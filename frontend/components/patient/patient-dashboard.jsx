"use client";

import { useEffect, useRef, useState } from "react";
import {
  Action as AlertDialogAction,
  Cancel as AlertDialogCancel,
  Content as AlertDialogContent,
  Description as AlertDialogDescription,
  Overlay as AlertDialogOverlay,
  Portal as AlertDialogPortal,
  Root as AlertDialogRoot,
  Title as AlertDialogTitle,
} from "@radix-ui/react-alert-dialog";
import {
  Close as DialogClose,
  Content as DialogContent,
  Description as DialogDescription,
  Overlay as DialogOverlay,
  Portal as DialogPortal,
  Root as DialogRoot,
  Title as DialogTitle,
} from "@radix-ui/react-dialog";
import Check from "lucide-react/dist/esm/icons/check";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Plus from "lucide-react/dist/esm/icons/plus";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import X from "lucide-react/dist/esm/icons/x";

import { DigitalDocuments } from "@/components/health-passport/digital-documents";
import { MedicalAlerts } from "@/components/health-passport/medical-alerts";
import { HealthMarkers } from "@/components/patient/health-markers";
import { HealthSharing } from "@/components/patient/health-sharing";
import { ClinicalSelect } from "@/components/ui/clinical-select";
import { apiFetch } from "@/lib/api";

const EMPTY_FORM = {
  name: "",
  dose: "",
  administered_on: "",
  status: "applied",
};

const STATUS_LABEL = {
  applied: "Aplicada",
  pending: "Pendente",
  overdue: "Atrasada",
};

const VACCINE_STATUS_OPTIONS = [
  { value: "applied", label: "Aplicada" },
  { value: "pending", label: "Pendente" },
  { value: "overdue", label: "Atrasada" },
];

function usePatientResource(path, errorMessage, onUnauthenticated) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [resource, setResource] = useState({ status: "loading", data: [] });

  useEffect(() => {
    let active = true;

    async function loadResource() {
      setResource((current) => ({ ...current, status: "loading" }));
      try {
        const response = await apiFetch(path);
        if (response.status === 401) {
          onUnauthenticated();
          return;
        }
        if (!response.ok) {
          throw new Error(errorMessage);
        }

        const data = await response.json();
        if (active) {
          setResource({ status: "ready", data });
        }
      } catch (error) {
        if (active) {
          setResource({ status: "error", data: [], error: error.message });
        }
      }
    }

    loadResource();
    return () => {
      active = false;
    };
  }, [errorMessage, onUnauthenticated, path, requestVersion]);

  return {
    ...resource,
    retry: () => setRequestVersion((value) => value + 1),
    updateData: (update) => setResource((current) => ({
      status: "ready",
      data: typeof update === "function" ? update(current.data) : update,
    })),
  };
}

function ResourceError({ message, retryLabel, onRetry }) {
  return (
    <div className="form-error" role="alert" aria-label={message}>
      <p>{message}</p>
      <button type="button" onClick={onRetry} aria-label={retryLabel}>
        Tentar novamente
      </button>
    </div>
  );
}

function ResourceNotice({ title, message, loading = false }) {
  return (
    <section className="clinical-section" aria-label={title}>
      <header>
        <h2>{title}</h2>
      </header>
      <p role={loading ? "status" : undefined}>{message}</p>
    </section>
  );
}

function VaccineDialog({
  actionError,
  editingId,
  form,
  isOpen,
  isSaving,
  onFieldChange,
  onOpenChange,
  onSubmit,
  returnFocusRef,
}) {
  const nameFieldRef = useRef(null);

  return (
    <DialogRoot open={isOpen} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="modal-backdrop" />
        <DialogContent
          className="clinical-dialog vaccine-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameFieldRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <header className="clinical-dialog-heading vaccine-dialog-heading">
            <div>
              <p className="dialog-kicker">Prontuário · Imunização</p>
              <DialogTitle asChild>
                <h2>{editingId ? "Editar vacina" : "Registrar vacina"}</h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="dialog-description">
                  {editingId
                    ? "Revise os dados registrados na sua linha do tempo clínica."
                    : "Inclua uma dose recebida ou acompanhe uma aplicação pendente."}
                </p>
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button
                className="dialog-close"
                type="button"
                aria-label="Fechar formulário de vacina"
                disabled={isSaving}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </DialogClose>
          </header>

          <form onSubmit={onSubmit}>
            <div className="dialog-field">
              <label htmlFor="vaccine-name">Nome da vacina</label>
              <input
                ref={nameFieldRef}
                id="vaccine-name"
                name="name"
                value={form.name}
                onChange={onFieldChange}
                placeholder="Ex.: Influenza tetravalente"
                autoComplete="off"
                required
              />
            </div>

            <div className="dialog-field">
              <label htmlFor="vaccine-dose">Dose</label>
              <input
                id="vaccine-dose"
                name="dose"
                value={form.dose}
                onChange={onFieldChange}
                placeholder="Ex.: Dose anual"
                autoComplete="off"
                required
              />
            </div>

            <div className="dialog-row">
              <div className="dialog-field">
                <label htmlFor="vaccine-status">Status</label>
                <ClinicalSelect
                  id="vaccine-status"
                  name="status"
                  value={form.status}
                  onValueChange={(value) => onFieldChange({
                    target: { name: "status", value },
                  })}
                  options={VACCINE_STATUS_OPTIONS}
                />
              </div>
              <div className="dialog-field">
                <label htmlFor="vaccine-date">Data de aplicação</label>
                <input
                  id="vaccine-date"
                  name="administered_on"
                  type="date"
                  value={form.administered_on}
                  onChange={onFieldChange}
                  disabled={form.status !== "applied"}
                  required={form.status === "applied"}
                />
              </div>
            </div>

            {actionError ? (
              <p className="form-error dialog-error" role="alert">
                {actionError}
              </p>
            ) : null}

            <div className="dialog-actions">
              <DialogClose asChild>
                <button
                  className="dialog-secondary"
                  type="button"
                  disabled={isSaving}
                >
                  Cancelar
                </button>
              </DialogClose>
              <button
                className="dialog-primary"
                type="submit"
                disabled={isSaving}
              >
                {isSaving
                  ? "Salvando…"
                  : editingId
                    ? "Salvar alterações"
                    : "Registrar vacina"}
              </button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}

function VaccineRemoveDialog({
  error,
  isOpen,
  isRemoving,
  onConfirm,
  onOpenChange,
  returnFocusRef,
  vaccine,
}) {
  const cancelRef = useRef(null);

  return (
    <AlertDialogRoot open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogPortal>
        <AlertDialogOverlay className="modal-backdrop" />
        <AlertDialogContent
          className="clinical-confirm-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <p className="dialog-kicker">Prontuário · Imunização</p>
          <AlertDialogTitle>Remover vacina</AlertDialogTitle>
          <AlertDialogDescription className="dialog-description">
            {vaccine
              ? `${vaccine.name} será removida do histórico de vacinação.`
              : "A vacina será removida do histórico de vacinação."}
          </AlertDialogDescription>
          {error ? (
            <p className="form-error dialog-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="dialog-actions">
            <AlertDialogCancel asChild>
              <button
                ref={cancelRef}
                className="dialog-secondary"
                type="button"
                disabled={isRemoving}
              >
                Cancelar remoção da vacina
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                className="dialog-danger"
                type="button"
                disabled={isRemoving}
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
              >
                {isRemoving ? "Removendo…" : "Remover vacina"}
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  );
}

export default function PatientDashboard({ profile, onUnauthenticated }) {
  const vaccinesResource = usePatientResource(
    "/me/vaccines",
    "Não foi possível carregar suas vacinas.",
    onUnauthenticated,
  );
  const alertsResource = usePatientResource(
    "/me/alerts",
    "Não foi possível carregar seus alertas.",
    onUnauthenticated,
  );
  const documentsResource = usePatientResource(
    "/me/documents",
    "Não foi possível carregar seus documentos.",
    onUnauthenticated,
  );
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [vaccineToDelete, setVaccineToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const dialogTriggerRef = useRef(null);
  const deleteTriggerRef = useRef(null);

  const vaccines = vaccinesResource.data;
  const alerts = alertsResource.data;
  const documents = documentsResource.data;

  function openNewVaccine(event) {
    dialogTriggerRef.current = event.currentTarget;
    setEditingId(null);
    setForm(EMPTY_FORM);
    setActionError("");
    setIsModalOpen(true);
  }

  function openEditVaccine(vaccine, trigger) {
    dialogTriggerRef.current = trigger;
    setEditingId(vaccine.vaccine_id);
    setForm({
      name: vaccine.name,
      dose: vaccine.dose,
      administered_on: vaccine.administered_on || "",
      status: vaccine.status,
    });
    setActionError("");
    setIsModalOpen(true);
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function saveVaccine(event) {
    event.preventDefault();
    setIsSaving(true);
    setActionError("");
    const path = editingId
      ? `/me/vaccines/${editingId}`
      : "/me/vaccines";

    try {
      const response = await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          administered_on: form.administered_on || null,
        }),
      });
      if (!response.ok) {
        throw new Error("Não foi possível salvar a vacina.");
      }

      const refreshed = await apiFetch("/me/vaccines");
      if (!refreshed.ok) {
        throw new Error("A vacina foi salva, mas a lista não pôde ser atualizada.");
      }
      const refreshedVaccines = await refreshed.json();
      vaccinesResource.updateData(refreshedVaccines);
      setIsModalOpen(false);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  function openDeleteVaccine(vaccine, trigger) {
    deleteTriggerRef.current = trigger;
    setVaccineToDelete(vaccine);
    setDeleteError("");
  }

  async function deleteVaccine() {
    if (!vaccineToDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError("");
    try {
      const response = await apiFetch(
        `/me/vaccines/${vaccineToDelete.vaccine_id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error("Não foi possível remover a vacina.");
      }
      vaccinesResource.updateData((current) =>
        current.filter(
          (item) => item.vaccine_id !== vaccineToDelete.vaccine_id,
        ),
      );
      setVaccineToDelete(null);
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="patient-main">
      <section className="patient-identity" aria-labelledby="patient-name">
        <div>
          <p className="eyebrow">Meu perfil</p>
          <h1 id="patient-name">{profile.preferred_name}</h1>
          <p>{profile.full_name}</p>
        </div>
        <dl className="patient-facts">
          <div>
            <dt>Idade</dt>
            <dd>{profile.age} anos</dd>
          </div>
          <div>
            <dt>Tipo sanguíneo</dt>
            <dd>{profile.blood_type || "Não informado"}</dd>
          </div>
        </dl>
      </section>

      <div className="patient-sections">
        <HealthSharing
          isAdult={profile.is_adult}
          onUnauthenticated={onUnauthenticated}
        />
        {alertsResource.status === "loading" ? (
          <ResourceNotice
            title="Alertas médicos"
            message="Carregando alertas…"
            loading
          />
        ) : alertsResource.status === "error" ? (
          <ResourceError
            message={alertsResource.error}
            retryLabel="Recarregar alertas"
            onRetry={alertsResource.retry}
          />
        ) : alerts.length > 0 ? (
          <MedicalAlerts alerts={alerts} />
        ) : (
          <ResourceNotice
            title="Alertas médicos"
            message="Nenhum alerta médico."
          />
        )}
        <HealthMarkers
          isAdult={profile.is_adult}
          onUnauthenticated={onUnauthenticated}
        />
        {documentsResource.status === "loading" ? (
          <ResourceNotice
            title="Documentos digitais"
            message="Carregando documentos…"
            loading
          />
        ) : documentsResource.status === "error" ? (
          <ResourceError
            message={documentsResource.error}
            retryLabel="Recarregar documentos"
            onRetry={documentsResource.retry}
          />
        ) : documents.length > 0 ? (
          <DigitalDocuments documents={documents} />
        ) : (
          <ResourceNotice
            title="Documentos digitais"
            message="Nenhum documento disponível."
          />
        )}

        <section className="clinical-section" aria-labelledby="vaccines-title">
          <header>
            <div>
              <p className="eyebrow">Linha do tempo clínica</p>
              <h2 id="vaccines-title">Histórico de Vacinação</h2>
            </div>
            {profile.is_adult ? (
              <button
                className="compact-action"
                type="button"
                onClick={openNewVaccine}
              >
                <Plus aria-hidden="true" size={16} />
                Adicionar vacina
              </button>
            ) : null}
          </header>

          {actionError ? (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          ) : null}

          {vaccinesResource.status === "loading" ? (
            <p role="status">Carregando vacinas…</p>
          ) : null}
          {vaccinesResource.status === "error" ? (
            <ResourceError
              message={vaccinesResource.error}
              retryLabel="Recarregar vacinas"
              onRetry={vaccinesResource.retry}
            />
          ) : null}
          {vaccinesResource.status === "ready" && vaccines.length === 0 ? (
            <p>Nenhuma vacina registrada.</p>
          ) : null}

          <div className="vaccine-grid">
            {vaccines.map((vaccine) => (
              <article className="vaccine-entry" key={vaccine.vaccine_id}>
                <div className="vaccine-status" data-status={vaccine.status}>
                  <Check aria-hidden="true" size={14} />
                  {STATUS_LABEL[vaccine.status]}
                </div>
                <h3>{vaccine.name}</h3>
                <p>{vaccine.dose}</p>
                <small>
                  {vaccine.administered_on
                    ? `Aplicada em ${vaccine.administered_on}`
                    : "Sem data de aplicação"}
                </small>
                {profile.is_adult ? (
                  <div className="vaccine-actions">
                    <button
                      type="button"
                      onClick={(event) =>
                        openEditVaccine(vaccine, event.currentTarget)
                      }
                      aria-label={`Editar ${vaccine.name}`}
                    >
                      <Pencil aria-hidden="true" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) =>
                        openDeleteVaccine(vaccine, event.currentTarget)
                      }
                      aria-label={`Excluir ${vaccine.name}`}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>

      <VaccineDialog
        actionError={actionError}
        editingId={editingId}
        form={form}
        isOpen={isModalOpen}
        isSaving={isSaving}
        onFieldChange={updateField}
        onOpenChange={setIsModalOpen}
        onSubmit={saveVaccine}
        returnFocusRef={dialogTriggerRef}
      />
      <VaccineRemoveDialog
        error={deleteError}
        isOpen={vaccineToDelete !== null}
        isRemoving={isDeleting}
        onConfirm={deleteVaccine}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setVaccineToDelete(null);
          }
        }}
        returnFocusRef={deleteTriggerRef}
        vaccine={vaccineToDelete}
      />
    </main>
  );
}
