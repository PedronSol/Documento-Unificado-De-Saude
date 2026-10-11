"use client";

import { useCallback, useEffect, useState } from "react";
import UserPlus from "lucide-react/dist/esm/icons/user-plus";

import { ClaimLinkCard } from "@/components/medical/claim-link-card";
import { ClinicalSelect } from "@/components/ui/clinical-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api";


const MINOR_DETAIL = "Paciente menor exige responsável.";
const GUARDIAN_UNAVAILABLE_DETAIL = "Responsável indisponível.";
const GENERIC_ERROR = "Não foi possível concluir a ação. Tente novamente.";

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value),
  );
}

const EMPTY_PROVISIONAL = { full_name: "", preferred_name: "", birth_date: "" };
const EMPTY_GUARDIAN = { cpf: "", full_name: "", birth_date: "", relationship: "" };
const RELATIONSHIP_OPTIONS = [
  { value: "parent", label: "Mãe ou pai" },
  { value: "legal_guardian", label: "Responsável legal" },
];
const GUARDIAN_FIELDS = [
  ["cpf", "CPF do responsável", "text", 14],
  ["full_name", "Nome completo do responsável", "text", 100],
  ["birth_date", "Data de nascimento do responsável", "date", undefined],
];

function conflictMessage(detail) {
  if (detail === GUARDIAN_UNAVAILABLE_DETAIL) {
    return "O responsável informado não pode ser vinculado. Verifique o CPF.";
  }
  return "Já existe solicitação ou vínculo com esse paciente, ou o CPF não está disponível.";
}

async function requestErrorMessage(response) {
  if (response.status === 422) {
    return "Revise os dados informados.";
  }
  return GENERIC_ERROR;
}


function GuardianFieldset({ guardian, onChange }) {
  return (
    <fieldset className="patient-link-guardian">
      <legend>Paciente menor de idade: informe o responsável legal.</legend>
      {GUARDIAN_FIELDS.map(([field, label, type, maxLength]) => (
        <div className="patient-link-field" key={field}>
          <label htmlFor={`guardian-${field}`}>{label}</label>
          <input
            id={`guardian-${field}`}
            type={type}
            value={guardian[field]}
            maxLength={maxLength}
            inputMode={field === "cpf" ? "numeric" : undefined}
            autoComplete="off"
            required
            onChange={(event) => onChange((current) => ({
              ...current,
              [field]: event.target.value,
            }))}
          />
        </div>
      ))}
      <div className="patient-link-field">
        <label htmlFor="guardian-relationship">Parentesco</label>
        <ClinicalSelect
          id="guardian-relationship"
          value={guardian.relationship}
          placeholder="Selecione"
          onValueChange={(value) => onChange((current) => ({
            ...current,
            relationship: value,
          }))}
          options={RELATIONSHIP_OPTIONS}
        />
      </div>
    </fieldset>
  );
}


export function PatientLinkPanel({ onUnauthenticated, onPatientsChanged = () => {} }) {
  const [cpf, setCpf] = useState("");
  const [provisional, setProvisional] = useState(null);
  const [issuedClaim, setIssuedClaim] = useState(null);
  const [guardian, setGuardian] = useState(null);
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
    if (guardian && !guardian.relationship) {
      setError("Selecione o parentesco.");
      return;
    }
    setIsSaving(true);
    setFeedback("");
    setError("");
    setIssuedClaim(null);
    try {
      const response = await apiFetch("/medical/patient-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpf,
          ...(provisional ? { patient: provisional } : {}),
          ...(guardian ? { guardian } : {}),
        }),
      });
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (response.status === 404 && !provisional) {
        setProvisional(EMPTY_PROVISIONAL);
        return;
      }
      if (response.status === 409) {
        const conflict = await response.json().catch(() => ({}));
        if (conflict?.detail === MINOR_DETAIL && !guardian) {
          setGuardian(EMPTY_GUARDIAN);
          return;
        }
        setError(conflictMessage(conflict?.detail));
        return;
      }
      if (!response.ok) {
        setError(await requestErrorMessage(response));
        return;
      }
      const body = await response.json();
      const guardianWasSent = guardian !== null;
      setCpf("");
      setProvisional(null);
      setGuardian(null);
      setIssuedClaim(body.claim || null);
      if (body.result === "provisional_created") {
        setIssuedClaim(body.claim);
        setFeedback(body.claim === null
          ? "Paciente cadastrado. O responsável já tem conta e aceitará a guarda no próprio login."
          : "Paciente provisório cadastrado. Você já pode registrar informações no prontuário.");
        onPatientsChanged();
        return;
      }
      setFeedback(guardianWasSent
        ? "Solicitação enviada. O responsável decide depois que a guarda for confirmada pelo paciente."
        : "Solicitação enviada. O acesso começa após o aceite do paciente.");
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
            onChange={(event) => {
              setCpf(event.target.value);
              setProvisional(null);
              setGuardian(null);
            }}
            inputMode="numeric"
            autoComplete="off"
            maxLength={14}
            placeholder="000.000.000-00"
            required
          />
          {provisional ? null : (
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Enviando…" : "Solicitar acesso"}
            </button>
          )}
        </div>
        <small>O acesso ao prontuário começa somente após o aceite do paciente.</small>
      </form>

      {guardian && !provisional ? (
        <form className="patient-link-provisional" onSubmit={submit}>
          <GuardianFieldset guardian={guardian} onChange={setGuardian} />
          <div className="patient-link-provisional-actions">
            <button type="button" className="patient-link-secondary"
              onClick={() => setGuardian(null)} disabled={isSaving}>
              Voltar
            </button>
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Enviando…" : "Solicitar acesso com responsável"}
            </button>
          </div>
        </form>
      ) : null}

      {provisional ? (
        <form className="patient-link-provisional" onSubmit={submit}>
          <p role="status">
            Nenhum paciente com conta para esse CPF. Cadastre um paciente provisório.
          </p>
          {[
            ["full_name", "Nome completo", "text", 100],
            ["preferred_name", "Nome preferido", "text", 20],
            ["birth_date", "Data de nascimento", "date", undefined],
          ].map(([field, label, type, maxLength]) => (
            <div className="patient-link-field" key={field}>
              <label htmlFor={`provisional-${field}`}>{label}</label>
              <input
                id={`provisional-${field}`}
                type={type}
                value={provisional[field]}
                maxLength={maxLength}
                autoComplete="off"
                required
                onChange={(event) => setProvisional((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))}
              />
            </div>
          ))}
          {guardian ? <GuardianFieldset guardian={guardian} onChange={setGuardian} /> : null}
          <div className="patient-link-provisional-actions">
            <button type="button" className="patient-link-secondary"
              onClick={() => {
                setProvisional(null);
                setGuardian(null);
              }} disabled={isSaving}>
              Voltar
            </button>
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Cadastrando…" : "Cadastrar paciente provisório"}
            </button>
          </div>
        </form>
      ) : null}

      {feedback ? <p className="patient-link-feedback" role="status">{feedback}</p> : null}
      {issuedClaim ? (
        <ClaimLinkCard
          token={issuedClaim.token}
          expiresAt={issuedClaim.expires_at}
          recipient={issuedClaim.recipient}
        />
      ) : null}
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
