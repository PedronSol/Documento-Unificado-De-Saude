"use client";

import { useRef, useState } from "react";
import Check from "lucide-react/dist/esm/icons/check";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Plus from "lucide-react/dist/esm/icons/plus";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";

import { ResourceError } from "@/components/ui/resource-state";
import { EMPTY_VACCINE_FORM, VaccineDialog } from "@/components/vaccines/vaccine-dialog";
import { VaccineRemoveDialog } from "@/components/vaccines/vaccine-remove-dialog";
import { useApiResource } from "@/hooks/use-api-resource";
import { apiFetch, readApiError } from "@/lib/api";


const STATUS_LABEL = {
  applied: "Aplicada",
  pending: "Pendente",
  overdue: "Atrasada",
};

const SAVE_VACCINE_ERROR = "Não foi possível salvar a vacina.";
const REFRESH_VACCINES_ERROR = "A vacina foi salva, mas a lista não pôde ser atualizada.";
const DELETE_VACCINE_ERROR = "Não foi possível remover a vacina.";


export function VaccinationHistory({ isAdult, onUnauthenticated }) {
  const vaccinesResource = useApiResource("/me/vaccines", {
    fallback: "Não foi possível carregar suas vacinas.",
    onUnauthenticated,
  });
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_VACCINE_FORM);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [vaccineToDelete, setVaccineToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const dialogTriggerRef = useRef(null);
  const deleteTriggerRef = useRef(null);

  const vaccines = vaccinesResource.data;

  function openNewVaccine(event) {
    dialogTriggerRef.current = event.currentTarget;
    setEditingId(null);
    setForm(EMPTY_VACCINE_FORM);
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
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        setActionError((await readApiError(response, SAVE_VACCINE_ERROR)).message);
        return;
      }

      const refreshed = await apiFetch("/me/vaccines");
      if (!refreshed.ok) {
        setActionError(REFRESH_VACCINES_ERROR);
        return;
      }
      vaccinesResource.updateData(await refreshed.json());
      setIsModalOpen(false);
    } catch {
      setActionError(SAVE_VACCINE_ERROR);
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
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        setDeleteError((await readApiError(response, DELETE_VACCINE_ERROR)).message);
        return;
      }
      vaccinesResource.updateData((current) =>
        current.filter(
          (item) => item.vaccine_id !== vaccineToDelete.vaccine_id,
        ),
      );
      setVaccineToDelete(null);
    } catch {
      setDeleteError(DELETE_VACCINE_ERROR);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
    <section className="clinical-section" aria-labelledby="vaccines-title">
      <header>
        <div>
          <p className="eyebrow">Linha do tempo clínica</p>
          <h2 id="vaccines-title">Histórico de Vacinação</h2>
        </div>
        {isAdult ? (
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
          onRetry={vaccinesResource.reload}
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
            {isAdult ? (
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
    </>
  );
}

export default VaccinationHistory;
