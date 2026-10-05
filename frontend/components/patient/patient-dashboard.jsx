"use client";

import { useEffect, useState } from "react";
import Check from "lucide-react/dist/esm/icons/check";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Plus from "lucide-react/dist/esm/icons/plus";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import X from "lucide-react/dist/esm/icons/x";

import { DigitalDocuments } from "@/components/health-passport/digital-documents";
import { MedicalAlerts } from "@/components/health-passport/medical-alerts";
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

  const vaccines = vaccinesResource.data;
  const alerts = alertsResource.data;
  const documents = documentsResource.data;

  function openNewVaccine() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setActionError("");
    setIsModalOpen(true);
  }

  function openEditVaccine(vaccine) {
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

  async function deleteVaccine(vaccine) {
    if (!window.confirm(`Remover ${vaccine.name} do prontuário?`)) {
      return;
    }

    setActionError("");
    try {
      const response = await apiFetch(`/me/vaccines/${vaccine.vaccine_id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Não foi possível remover a vacina.");
      }
      vaccinesResource.updateData((current) =>
        current.filter((item) => item.vaccine_id !== vaccine.vaccine_id),
      );
    } catch (error) {
      setActionError(error.message);
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
            <dd>{profile.blood_type}</dd>
          </div>
        </dl>
      </section>

      <div className="patient-sections">
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
              <button className="compact-action" type="button" onClick={openNewVaccine}>
                <Plus aria-hidden="true" size={16} />
                Adicionar vacina
              </button>
            ) : null}
          </header>

          {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}

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
                      onClick={() => openEditVaccine(vaccine)}
                      aria-label={`Editar ${vaccine.name}`}
                    >
                      <Pencil aria-hidden="true" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteVaccine(vaccine)}
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

      {isModalOpen ? (
        <div className="modal-layer" role="presentation">
          <button
            className="modal-backdrop"
            type="button"
            onClick={() => setIsModalOpen(false)}
            aria-label="Fechar formulário de vacina"
          />
          <section className="vaccine-dialog" role="dialog" aria-modal="true" aria-labelledby="vaccine-dialog-title">
            <header>
              <h2 id="vaccine-dialog-title">
                {editingId ? "Editar vacina" : "Registrar vacina"}
              </h2>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Fechar">
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form onSubmit={saveVaccine}>
              <label htmlFor="vaccine-name">Nome da vacina</label>
              <input id="vaccine-name" name="name" value={form.name} onChange={updateField} required />
              <label htmlFor="vaccine-dose">Dose</label>
              <input id="vaccine-dose" name="dose" value={form.dose} onChange={updateField} required />
              <div className="dialog-row">
                <div>
                  <label htmlFor="vaccine-status">Status</label>
                  <select id="vaccine-status" name="status" value={form.status} onChange={updateField}>
                    <option value="applied">Aplicada</option>
                    <option value="pending">Pendente</option>
                    <option value="overdue">Atrasada</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="vaccine-date">Data de aplicação</label>
                  <input id="vaccine-date" name="administered_on" type="date" value={form.administered_on} onChange={updateField} disabled={form.status !== "applied"} required={form.status === "applied"} />
                </div>
              </div>
              {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
              <div className="dialog-actions">
                <button type="button" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" disabled={isSaving}>{isSaving ? "Salvando…" : "Salvar registro"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
