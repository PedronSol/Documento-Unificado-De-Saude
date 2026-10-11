"use client";

import { useCallback, useEffect, useState } from "react";
import UserPlus from "lucide-react/dist/esm/icons/user-plus";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api";


const MINOR_DETAIL = "Paciente menor exige responsável.";
const GENERIC_ERROR = "Não foi possível concluir a ação. Tente novamente.";

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value),
  );
}

async function requestErrorMessage(response) {
  if (response.status === 404) {
    return "Nenhum paciente com conta foi encontrado para esse CPF.";
  }
  if (response.status === 422) {
    return "Informe um CPF válido.";
  }
  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    return body?.detail === MINOR_DETAIL
      ? "Pacientes menores exigem um responsável legal."
      : "Já existe solicitação ou vínculo com esse paciente, ou o CPF não está disponível.";
  }
  return GENERIC_ERROR;
}


export function PatientLinkPanel({ onUnauthenticated }) {
  const [cpf, setCpf] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState({ status: "loading", items: [] });
  const [cancelling, setCancelling] = useState(null);

  const loadPending = useCallback(async () => {
    try {
      const response = await apiFetch("/medical/patient-links?status=pending");
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        throw new Error();
      }
      const data = await response.json();
      setPending({ status: "ready", items: Array.isArray(data) ? data : [] });
    } catch {
      setPending({ status: "error", items: [] });
    }
  }, [onUnauthenticated]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  async function submit(event) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback("");
    setError("");
    try {
      const response = await apiFetch("/medical/patient-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf }),
      });
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        setError(await requestErrorMessage(response));
        return;
      }
      setCpf("");
      setFeedback("Solicitação enviada. O acesso começa após o aceite do paciente.");
      await loadPending();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmCancel() {
    setIsSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/medical/patient-links/${cancelling.link_id}`, {
        method: "DELETE",
      });
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok && response.status !== 404) {
        setError(GENERIC_ERROR);
        return;
      }
      setCancelling(null);
      setFeedback("Solicitação cancelada.");
      await loadPending();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="medical-roster patient-link-panel" aria-labelledby="patient-link-title">
      <header>
        <div>
          <p className="eyebrow">Vínculo direto · com consentimento</p>
          <h2 id="patient-link-title">Adicionar paciente</h2>
        </div>
        <UserPlus aria-hidden="true" size={24} />
      </header>

      <form className="medical-search" onSubmit={submit}>
        <label htmlFor="patient-link-cpf">CPF do paciente</label>
        <div>
          <input
            id="patient-link-cpf"
            value={cpf}
            onChange={(event) => setCpf(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={14}
            placeholder="000.000.000-00"
            required
          />
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Enviando…" : "Solicitar acesso"}
          </button>
        </div>
        <small>O acesso ao prontuário começa somente após o aceite do paciente.</small>
      </form>

      {feedback ? <p className="patient-link-feedback" role="status">{feedback}</p> : null}
      {error && !cancelling ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="patient-link-pending">
        <h3>Aguardando o paciente</h3>
        {pending.status === "loading" ? (
          <p className="medical-inline-empty" role="status">Carregando solicitações…</p>
        ) : null}
        {pending.status === "error" ? (
          <p className="medical-inline-empty">Não foi possível carregar as solicitações.</p>
        ) : null}
        {pending.status === "ready" && pending.items.length === 0 ? (
          <p className="medical-inline-empty">Nenhuma solicitação aguardando o paciente.</p>
        ) : null}
        {pending.items.map((link) => (
          <article className="patient-link-item" key={link.link_id}>
            <div>
              <h4>{link.patient_display_name}</h4>
              <p>
                <span>{link.masked_cpf}</span>
                <span>Válida até {formatDate(link.expires_at)}</span>
              </p>
            </div>
            <button
              type="button"
              disabled={isSaving}
              aria-label={`Cancelar solicitação para ${link.patient_display_name}`}
              onClick={() => {
                setError("");
                setCancelling(link);
              }}
            >
              Cancelar
            </button>
          </article>
        ))}
      </div>

      <ConfirmDialog
        isOpen={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelling(null);
          }
        }}
        kicker="Vínculo direto"
        title="Cancelar solicitação de acesso"
        description={cancelling
          ? `${cancelling.patient_display_name} não poderá mais aceitar esta solicitação.`
          : ""}
        cancelLabel="Manter solicitação"
        confirmLabel="Cancelar solicitação"
        error={cancelling ? error : ""}
        isSaving={isSaving}
        onConfirm={confirmCancel}
      />
    </section>
  );
}

export default PatientLinkPanel;
