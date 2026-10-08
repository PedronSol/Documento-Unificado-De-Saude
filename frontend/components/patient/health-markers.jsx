"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import HeartPulse from "lucide-react/dist/esm/icons/heart-pulse";
import History from "lucide-react/dist/esm/icons/history";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Pill from "lucide-react/dist/esm/icons/pill";
import Plus from "lucide-react/dist/esm/icons/plus";
import ShieldAlert from "lucide-react/dist/esm/icons/shield-alert";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import X from "lucide-react/dist/esm/icons/x";

import { apiFetch } from "@/lib/api";

const EMPTY_FORM = {
  type: "condition",
  name: "",
  description: "",
  dosage: "",
  frequency: "",
};

const TYPE_ORDER = ["allergy", "medication", "condition", "diagnosis"];

const TYPE_CONFIG = {
  allergy: {
    label: "Alergias",
    singular: "Alergia",
    icon: ShieldAlert,
  },
  medication: {
    label: "Medicações",
    singular: "Medicação",
    icon: Pill,
  },
  condition: {
    label: "Condições",
    singular: "Condição",
    icon: HeartPulse,
  },
  diagnosis: {
    label: "Diagnósticos",
    singular: "Diagnóstico",
    icon: Stethoscope,
  },
};

function formatClinicalDate(value) {
  if (!value) {
    return "Data não informada";
  }
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function sortActiveMarkers(markers) {
  return [...markers].sort((left, right) => {
    const typeDifference =
      TYPE_ORDER.indexOf(left.type) - TYPE_ORDER.indexOf(right.type);
    return typeDifference || left.name.localeCompare(right.name, "pt-BR");
  });
}

async function readError(response, fallback) {
  try {
    const body = await response.json();
    return typeof body.detail === "string" ? body.detail : fallback;
  } catch {
    return fallback;
  }
}

function MarkerDialog({
  error,
  form,
  isEditing,
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
          className="clinical-dialog marker-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameFieldRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <header className="clinical-dialog-heading">
            <div>
              <p className="dialog-kicker">Prontuário · Resumo ativo</p>
              <DialogTitle asChild>
                <h2>{isEditing ? "Editar marcador" : "Adicionar marcador"}</h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="dialog-description">
                  Registre apenas informações que ajudam a representar seu
                  estado de saúde atual.
                </p>
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button
                className="dialog-close"
                type="button"
                aria-label="Fechar formulário de marcador"
                disabled={isSaving}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </DialogClose>
          </header>

          <form onSubmit={onSubmit}>
            <div className="dialog-field">
              <label htmlFor="marker-name">Nome do marcador</label>
              <input
                ref={nameFieldRef}
                id="marker-name"
                name="name"
                value={form.name}
                onChange={onFieldChange}
                placeholder="Ex.: Hipertensão"
                autoComplete="off"
                maxLength={120}
                required
              />
            </div>

            <div className="dialog-field">
              <label htmlFor="marker-type">Tipo</label>
              <select
                id="marker-type"
                name="type"
                value={form.type}
                onChange={onFieldChange}
              >
                <option value="condition">Condição</option>
                <option value="diagnosis">Diagnóstico</option>
                <option value="allergy">Alergia</option>
                <option value="medication">Medicação</option>
              </select>
            </div>

            {form.type === "medication" ? (
              <div className="dialog-row marker-medication-fields">
                <div className="dialog-field">
                  <label htmlFor="marker-dosage">Dosagem</label>
                  <input
                    id="marker-dosage"
                    name="dosage"
                    value={form.dosage}
                    onChange={onFieldChange}
                    placeholder="Ex.: 50 mg"
                    maxLength={100}
                  />
                </div>
                <div className="dialog-field">
                  <label htmlFor="marker-frequency">Frequência</label>
                  <input
                    id="marker-frequency"
                    name="frequency"
                    value={form.frequency}
                    onChange={onFieldChange}
                    placeholder="Ex.: 1 vez ao dia"
                    maxLength={100}
                  />
                </div>
              </div>
            ) : null}

            <div className="dialog-field">
              <label htmlFor="marker-description">Observação</label>
              <textarea
                id="marker-description"
                name="description"
                value={form.description}
                onChange={onFieldChange}
                placeholder="Contexto clínico relevante, se necessário"
                maxLength={500}
                rows={4}
              />
            </div>

            {error ? (
              <p className="form-error dialog-error" role="alert">
                {error}
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
                  : isEditing
                    ? "Salvar alterações"
                    : "Adicionar marcador"}
              </button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}

function RemoveMarkerDialog({
  error,
  isOpen,
  isRemoving,
  marker,
  onConfirm,
  onOpenChange,
  returnFocusRef,
  variant,
}) {
  const cancelRef = useRef(null);
  const isSuspension = variant === "medical" && marker?.type === "medication";

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
          <p className="dialog-kicker">Preservação de histórico</p>
          <AlertDialogTitle>
            {isSuspension ? "Suspender medicação" : "Remover marcador"}
          </AlertDialogTitle>
          <AlertDialogDescription className="dialog-description">
            {marker
              ? `${marker.name} ${isSuspension ? "será suspensa" : "sairá do resumo ativo"} e permanecerá no histórico.`
              : "O marcador sairá do resumo ativo e permanecerá no histórico."}
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
                {isSuspension ? "Cancelar suspensão" : "Cancelar remoção"}
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
                {isRemoving
                  ? isSuspension ? "Suspendendo…" : "Removendo…"
                  : isSuspension ? "Suspender medicação" : "Remover do resumo"}
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  );
}

function MarkerCard({ marker, canEdit, onEdit, onRemove, variant }) {
  const type = TYPE_CONFIG[marker.type];
  const TypeIcon = type.icon;

  return (
    <article className="marker-card" data-marker-type={marker.type}>
      <div className="marker-card-type">
        <TypeIcon aria-hidden="true" size={15} />
        {type.singular}
      </div>
      <h4>{marker.name}</h4>
      {marker.description ? <p>{marker.description}</p> : null}
      {marker.type === "medication" && (marker.dosage || marker.frequency) ? (
        <dl className="marker-medication-details">
          {marker.dosage ? (
            <div>
              <dt>Dosagem</dt>
              <dd>{marker.dosage}</dd>
            </div>
          ) : null}
          {marker.frequency ? (
            <div>
              <dt>Frequência</dt>
              <dd>{marker.frequency}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {marker.status === "removed" ? (
        <small>Removido em {formatClinicalDate(marker.removed_at)}</small>
      ) : null}
      {canEdit && marker.status === "active" ? (
        <div className="marker-card-actions">
          <button
            type="button"
            onClick={(event) => onEdit(marker, event.currentTarget)}
            aria-label={`Editar ${marker.name}`}
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
          <button
            type="button"
            onClick={(event) => onRemove(marker, event.currentTarget)}
            aria-label={`${variant === "medical" && marker.type === "medication" ? "Suspender" : "Remover"} ${marker.name}`}
          >
            <Trash2 aria-hidden="true" size={15} />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function MarkerCollection({ markers, canEdit, onEdit, onRemove, variant, view }) {
  if (markers.length === 0) {
    return (
      <div className="marker-empty">
        <span aria-hidden="true">{view === "active" ? "＋" : "○"}</span>
        <p>
          {view === "active"
            ? "Nenhum marcador ativo."
            : "Nenhum marcador no histórico."}
        </p>
      </div>
    );
  }

  if (view === "removed") {
    return (
      <div className="marker-history-list">
        {markers.map((marker) => (
          <MarkerCard
            key={marker.marker_id}
            marker={marker}
            canEdit={false}
            onEdit={onEdit}
            onRemove={onRemove}
            variant={variant}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="marker-groups">
      {TYPE_ORDER.map((type) => {
        const group = markers.filter((marker) => marker.type === type);
        if (group.length === 0) {
          return null;
        }
        const config = TYPE_CONFIG[type];
        return (
          <section className="marker-group" key={type} aria-label={config.label}>
            <h3>
              {config.label}
              <span>{group.length.toString().padStart(2, "0")}</span>
            </h3>
            <div className="marker-card-grid">
              {group.map((marker) => (
                <MarkerCard
                  key={marker.marker_id}
                  marker={marker}
                  canEdit={canEdit}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  variant={variant}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function HealthMarkers({
  basePath = "/me/markers",
  initialActive = null,
  initialRemoved = null,
  isAdult,
  onUnauthenticated,
  variant = "patient",
}) {
  const hasInitialTimeline = initialActive !== null;
  const [activeResource, setActiveResource] = useState(() => ({
    status: hasInitialTimeline ? "ready" : "loading",
    data: hasInitialTimeline ? sortActiveMarkers(initialActive) : [],
  }));
  const [historyResource, setHistoryResource] = useState(() => ({
    status: initialRemoved !== null ? "ready" : "idle",
    data: initialRemoved || [],
  }));
  const [view, setView] = useState("active");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [markerToRemove, setMarkerToRemove] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const formTriggerRef = useRef(null);
  const removeTriggerRef = useRef(null);

  const loadActiveMarkers = useCallback(async () => {
    setActiveResource((current) => ({ ...current, status: "loading" }));
    try {
      const response = await apiFetch(`${basePath}?status=active`);
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        throw new Error("Não foi possível carregar seus marcadores.");
      }
      const data = await response.json();
      setActiveResource({
        status: "ready",
        data: Array.isArray(data) ? data : [],
      });
    } catch (error) {
      setActiveResource({ status: "error", data: [], error: error.message });
    }
  }, [basePath, onUnauthenticated]);

  const loadHistoryMarkers = useCallback(async () => {
    setHistoryResource((current) => ({ ...current, status: "loading" }));
    try {
      const response = await apiFetch(`${basePath}?status=removed`);
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        throw new Error("Não foi possível carregar o histórico de marcadores.");
      }
      const data = await response.json();
      setHistoryResource({
        status: "ready",
        data: Array.isArray(data) ? data : [],
      });
    } catch (error) {
      setHistoryResource({ status: "error", data: [], error: error.message });
    }
  }, [basePath, onUnauthenticated]);

  useEffect(() => {
    if (!hasInitialTimeline) {
      loadActiveMarkers();
    }
  }, [hasInitialTimeline, loadActiveMarkers]);

  function selectView(nextView) {
    setView(nextView);
    if (nextView === "removed" && historyResource.status === "idle") {
      loadHistoryMarkers();
    }
  }

  function openNewMarker(event) {
    formTriggerRef.current = event.currentTarget;
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditMarker(marker, trigger) {
    formTriggerRef.current = trigger;
    setEditingId(marker.marker_id);
    setForm({
      type: marker.type,
      name: marker.name,
      description: marker.description || "",
      dosage: marker.dosage || "",
      frequency: marker.frequency || "",
    });
    setFormError("");
    setIsFormOpen(true);
  }

  function openRemoveMarker(marker, trigger) {
    removeTriggerRef.current = trigger;
    setMarkerToRemove(marker);
    setRemoveError("");
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => {
      if (name === "type" && value !== "medication") {
        return { ...current, type: value, dosage: "", frequency: "" };
      }
      return { ...current, [name]: value };
    });
  }

  async function saveMarker(event) {
    event.preventDefault();
    setIsSaving(true);
    setFormError("");
    const path = editingId ? `${basePath}/${editingId}` : basePath;

    try {
      const response = await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          description: form.description || null,
          dosage: form.type === "medication" ? form.dosage || null : null,
          frequency: form.type === "medication" ? form.frequency || null : null,
        }),
      });
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        throw new Error(
          await readError(response, "Não foi possível salvar o marcador."),
        );
      }
      const saved = await response.json();
      setActiveResource((current) => ({
        status: "ready",
        data: sortActiveMarkers(
          editingId
            ? current.data.map((marker) =>
                marker.marker_id === editingId ? saved : marker,
              )
            : [...current.data, saved],
        ),
      }));
      setIsFormOpen(false);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeMarker() {
    if (!markerToRemove) {
      return;
    }
    setIsRemoving(true);
    setRemoveError("");
    try {
      const response = await apiFetch(`${basePath}/${markerToRemove.marker_id}`, {
        method: "DELETE",
      });
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        throw new Error(
          await readError(response, "Não foi possível remover o marcador."),
        );
      }
      setActiveResource((current) => ({
        status: "ready",
        data: current.data.filter(
          (marker) => marker.marker_id !== markerToRemove.marker_id,
        ),
      }));
      setHistoryResource((current) =>
        hasInitialTimeline
          ? {
              status: "ready",
              data: [
                {
                  ...markerToRemove,
                  status: "removed",
                  removed_at: new Date().toISOString(),
                },
                ...current.data,
              ],
            }
          : { status: "idle", data: [] },
      );
      setMarkerToRemove(null);
    } catch (error) {
      setRemoveError(error.message);
    } finally {
      setIsRemoving(false);
    }
  }

  const currentResource = view === "active" ? activeResource : historyResource;

  return (
    <section
      className="clinical-section marker-section"
      aria-labelledby="markers-title"
    >
      <header className="marker-section-header">
        <div>
          <p className="eyebrow">
            {variant === "medical"
              ? "Registro clínico compartilhado"
              : "Resumo clínico pessoal"}
          </p>
          <h2 id="markers-title">Marcadores de saúde</h2>
          <p className="section-intro">
            {variant === "medical"
              ? "Marcadores ativos e histórico preservado deste paciente."
              : "Uma leitura objetiva do que está ativo no seu cuidado hoje."}
          </p>
        </div>
        {isAdult ? (
          <button
            className="compact-action"
            type="button"
            onClick={openNewMarker}
          >
            <Plus aria-hidden="true" size={16} />
            Adicionar marcador
          </button>
        ) : null}
      </header>

      <div
        className="marker-view-switch"
        role="group"
        aria-label="Exibição dos marcadores"
      >
        <button
          type="button"
          aria-pressed={view === "active"}
          onClick={() => selectView("active")}
        >
          Ativos
          <span>{activeResource.data.length}</span>
        </button>
        <button
          type="button"
          aria-pressed={view === "removed"}
          onClick={() => selectView("removed")}
        >
          <History aria-hidden="true" size={14} />
          Histórico
        </button>
      </div>

      {currentResource.status === "loading" || currentResource.status === "idle" ? (
        <p className="marker-resource-state" role="status">
          {view === "active"
            ? "Carregando marcadores…"
            : "Carregando histórico…"}
        </p>
      ) : null}
      {currentResource.status === "error" ? (
        <div className="form-error marker-resource-error" role="alert">
          <p>{currentResource.error}</p>
          <button
            type="button"
            onClick={view === "active" ? loadActiveMarkers : loadHistoryMarkers}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
      {currentResource.status === "ready" ? (
        <MarkerCollection
          markers={currentResource.data}
          canEdit={isAdult}
          onEdit={openEditMarker}
          onRemove={openRemoveMarker}
          variant={variant}
          view={view}
        />
      ) : null}

      <MarkerDialog
        error={formError}
        form={form}
        isEditing={editingId !== null}
        isOpen={isFormOpen}
        isSaving={isSaving}
        onFieldChange={updateField}
        onOpenChange={setIsFormOpen}
        onSubmit={saveMarker}
        returnFocusRef={formTriggerRef}
      />
      <RemoveMarkerDialog
        error={removeError}
        isOpen={markerToRemove !== null}
        isRemoving={isRemoving}
        marker={markerToRemove}
        onConfirm={removeMarker}
        onOpenChange={(open) => {
          if (!open) {
            setMarkerToRemove(null);
          }
        }}
        returnFocusRef={removeTriggerRef}
        variant={variant}
      />
    </section>
  );
}
