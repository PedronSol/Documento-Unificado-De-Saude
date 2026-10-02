"use client";

import { useState } from "react";
import Check from "lucide-react/dist/esm/icons/check";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Plus from "lucide-react/dist/esm/icons/plus";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import X from "lucide-react/dist/esm/icons/x";

import { DigitalDocuments } from "@/components/health-passport/digital-documents";
import { MedicalAlerts } from "@/components/health-passport/medical-alerts";
import { apiFetch } from "@/lib/api";


const EMPTY_FORM = {
  nome_vacina: "",
  dose: "",
  data_aplicacao: "",
  status_vacina: "applied",
};

const STATUS_LABEL = {
  applied: "Aplicada",
  pending: "Pendente",
  overdue: "Atrasada",
};


export default function PatientDashboard({ envelope }) {
  const patient = envelope.patient_data;
  const [vaccines, setVaccines] = useState(envelope.vaccines);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  function openNewVaccine() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setActionError("");
    setIsModalOpen(true);
  }

  function openEditVaccine(vaccine) {
    setEditingId(vaccine.id_vacina);
    setForm({
      nome_vacina: vaccine.nome_vacina,
      dose: vaccine.dose,
      data_aplicacao: vaccine.data_aplicacao || "",
      status_vacina: vaccine.status_vacina,
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
          data_aplicacao: form.data_aplicacao || null,
        }),
      });
      if (!response.ok) {
        throw new Error("Não foi possível salvar a vacina.");
      }

      const refreshed = await apiFetch("/me/vaccines");
      if (!refreshed.ok) {
        throw new Error("A vacina foi salva, mas a lista não pôde ser atualizada.");
      }
      setVaccines(await refreshed.json());
      setIsModalOpen(false);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteVaccine(vaccine) {
    if (!window.confirm(`Remover ${vaccine.nome_vacina} do prontuário?`)) {
      return;
    }

    setActionError("");
    try {
      const response = await apiFetch(`/me/vaccines/${vaccine.id_vacina}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Não foi possível remover a vacina.");
      }
      setVaccines((current) =>
        current.filter((item) => item.id_vacina !== vaccine.id_vacina),
      );
    } catch (error) {
      setActionError(error.message);
    }
  }

  return (
    <main className="patient-main">
      <section className="patient-identity" aria-labelledby="patient-name">
        <div>
          <p className="eyebrow">Minha saúde</p>
          <h1 id="patient-name">Olá, {patient.nome_paciente}</h1>
          <p>{patient.nome_completo}</p>
        </div>
        <dl className="patient-facts">
          <div>
            <dt>Idade</dt>
            <dd>{patient.idade} anos</dd>
          </div>
          <div>
            <dt>Tipo sanguíneo</dt>
            <dd>{patient.tipo_sanguineo}</dd>
          </div>
          <div>
            <dt>Permissão</dt>
            <dd>{patient.maior_de_idade ? "Acesso completo" : "Acesso restrito"}</dd>
          </div>
        </dl>
      </section>

      <div className="patient-sections">
        {envelope.alerts.length > 0 ? (
          <MedicalAlerts alerts={envelope.alerts} />
        ) : null}
        {envelope.documents.length > 0 ? (
          <DigitalDocuments documents={envelope.documents} />
        ) : null}

        <section className="clinical-section" aria-labelledby="vaccines-title">
          <header>
            <div>
              <p className="eyebrow">Linha do tempo clínica</p>
              <h2 id="vaccines-title">Histórico de Vacinação</h2>
            </div>
            {patient.maior_de_idade ? (
              <button className="compact-action" type="button" onClick={openNewVaccine}>
                <Plus aria-hidden="true" size={16} />
                Adicionar vacina
              </button>
            ) : null}
          </header>

          {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}

          <div className="vaccine-grid">
            {vaccines.map((vaccine) => (
              <article className="vaccine-entry" key={vaccine.id_vacina}>
                <div className="vaccine-status" data-status={vaccine.status_vacina}>
                  <Check aria-hidden="true" size={14} />
                  {STATUS_LABEL[vaccine.status_vacina]}
                </div>
                <h3>{vaccine.nome_vacina}</h3>
                <p>{vaccine.dose}</p>
                <small>
                  {vaccine.data_aplicacao
                    ? `Aplicada em ${vaccine.data_aplicacao}`
                    : "Sem data de aplicação"}
                </small>
                {patient.maior_de_idade ? (
                  <div className="vaccine-actions">
                    <button
                      type="button"
                      onClick={() => openEditVaccine(vaccine)}
                      aria-label={`Editar ${vaccine.nome_vacina}`}
                    >
                      <Pencil aria-hidden="true" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteVaccine(vaccine)}
                      aria-label={`Excluir ${vaccine.nome_vacina}`}
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
              <input id="vaccine-name" name="nome_vacina" value={form.nome_vacina} onChange={updateField} required />
              <label htmlFor="vaccine-dose">Dose</label>
              <input id="vaccine-dose" name="dose" value={form.dose} onChange={updateField} required />
              <div className="dialog-row">
                <div>
                  <label htmlFor="vaccine-status">Status</label>
                  <select id="vaccine-status" name="status_vacina" value={form.status_vacina} onChange={updateField}>
                    <option value="applied">Aplicada</option>
                    <option value="pending">Pendente</option>
                    <option value="overdue">Atrasada</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="vaccine-date">Data de aplicação</label>
                  <input id="vaccine-date" name="data_aplicacao" type="date" value={form.data_aplicacao} onChange={updateField} disabled={form.status_vacina !== "applied"} required={form.status_vacina === "applied"} />
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
