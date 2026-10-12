"use client";

import { useRef, useState } from "react";
import History from "lucide-react/dist/esm/icons/history";
import Plus from "lucide-react/dist/esm/icons/plus";

import { MarkerCollection } from "@/components/markers/marker-collection";
import { MarkerDialog, RemoveMarkerDialog } from "@/components/markers/marker-dialogs";
import { TYPE_OPTIONS, TYPE_ORDER } from "@/components/markers/marker-types";
import { PaginatedList } from "@/components/ui/paginated-list";
import { usePaginatedList } from "@/hooks/use-paginated-list";
import { apiFetch, readApiError } from "@/lib/api";

const EMPTY_FORM = {
  type: "condition",
  name: "",
  description: "",
  dosage: "",
  frequency: "",
};

function sortActiveMarkers(markers) {
  return [...markers].sort((left, right) => {
    const typeDifference =
      TYPE_ORDER.indexOf(left.type) - TYPE_ORDER.indexOf(right.type);
    return typeDifference || left.name.localeCompare(right.name, "pt-BR");
  });
}


const LOAD_ACTIVE_ERROR = "Não foi possível carregar seus marcadores.";
const LOAD_HISTORY_ERROR = "Não foi possível carregar o histórico de marcadores.";
const SAVE_ERROR = "Não foi possível salvar o marcador.";
const REMOVE_ERROR = "Não foi possível remover o marcador.";

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

  // Patient: server-paginated lists (spec 038). Medical record: the full
  // timeline arrives embedded and is kept in local state.
  const serverMode = !hasInitialTimeline;
  const [historyRequested, setHistoryRequested] = useState(false);
  const activeList = usePaginatedList(serverMode ? `${basePath}?status=active` : null, {
    fallback: LOAD_ACTIVE_ERROR,
    initialFilters: { type: "" },
    onUnauthenticated,
  });
  const historyList = usePaginatedList(
    serverMode && historyRequested ? `${basePath}?status=removed` : null,
    {
      fallback: LOAD_HISTORY_ERROR,
      initialFilters: { type: "" },
      onUnauthenticated,
    },
  );

  function reloadServerLists() {
    activeList.resource.reload();
    if (historyRequested) {
      historyList.resource.reload();
    }
  }

  function selectView(nextView) {
    setView(nextView);
    if (nextView === "removed" && serverMode) {
      setHistoryRequested(true);
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
        setFormError((await readApiError(response, SAVE_ERROR)).message);
        return;
      }
      const saved = await response.json();
      if (serverMode) {
        reloadServerLists();
        setIsFormOpen(false);
        return;
      }
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
    } catch {
      setFormError(SAVE_ERROR);
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
        setRemoveError((await readApiError(response, REMOVE_ERROR)).message);
        return;
      }
      if (serverMode) {
        reloadServerLists();
        setMarkerToRemove(null);
        return;
      }
      setActiveResource((current) => ({
        status: "ready",
        data: current.data.filter(
          (marker) => marker.marker_id !== markerToRemove.marker_id,
        ),
      }));
      setHistoryResource((current) => ({
        status: "ready",
        data: [
          {
            ...markerToRemove,
            status: "removed",
            removed_at: new Date().toISOString(),
          },
          ...current.data,
        ],
      }));
      setMarkerToRemove(null);
    } catch {
      setRemoveError(REMOVE_ERROR);
    } finally {
      setIsRemoving(false);
    }
  }

  const currentResource = view === "active" ? activeResource : historyResource;
  const currentList = view === "active" ? activeList : historyList;
  const activeCount = serverMode ? activeList.resource.total : activeResource.data.length;
  const collection = (markers) => (
    <MarkerCollection
      markers={markers}
      canEdit={isAdult}
      onEdit={openEditMarker}
      onRemove={openRemoveMarker}
      variant={variant}
      view={view}
    />
  );

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
          <span>{activeCount}</span>
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

      {serverMode ? (
        <PaginatedList
          key={view}
          list={currentList}
          searchLabel={view === "active" ? "Buscar marcadores" : "Buscar no histórico"}
          filters={[{
            id: `marker-${view}-type-filter`,
            label: "Tipo",
            value: currentList.filters.type,
            onChange: (value) => currentList.setFilter("type", value),
            options: TYPE_OPTIONS,
          }]}
          itemLabel="marcadores"
          loadingText={view === "active" ? "Carregando marcadores…" : "Carregando histórico…"}
          emptyText=""
          retryLabel="Tentar novamente"
          renderEmpty={() => collection([])}
          renderItems={collection}
        />
      ) : (
        collection(currentResource.data)
      )}

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
