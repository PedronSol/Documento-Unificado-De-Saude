"use client";

import { useCallback, useEffect, useState } from "react";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";

import { ClaimLinkCard } from "@/components/medical/claim-link-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api";


const RELATIONSHIP_LABEL = {
  parent: "Mãe ou pai",
  legal_guardian: "Responsável legal",
};
const GENERIC_ERROR = "Não foi possível concluir a ação. Tente novamente.";


export function GuardianshipPanel({ dependents, onChanged, onUnauthenticated }) {
  const [pending, setPending] = useState([]);
  const [birthDates, setBirthDates] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [renouncing, setRenouncing] = useState(null);
  const [transfers, setTransfers] = useState({});

  const loadPending = useCallback(async () => {
    try {
      const response = await apiFetch("/me/guardianships?status=pending");
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      const body = response.ok ? await response.json() : [];
      setPending(Array.isArray(body) ? body : []);
    } catch {
      setPending([]);
    }
  }, [onUnauthenticated]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  async function mutate(path, options, errors = {}) {
    setIsSaving(true);
    setError("");
    try {
      const response = await apiFetch(path, options);
      if (response.status === 401) {
        onUnauthenticated();
        return false;
      }
      if (!response.ok) {
        setError(errors[response.status] || GENERIC_ERROR);
        return false;
      }
      await loadPending();
      onChanged();
      return true;
    } catch {
      setError(GENERIC_ERROR);
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function accept(guardianship) {
    const birthDate = birthDates[guardianship.guardianship_id];
    if (!birthDate) {
      setError("Informe a data de nascimento do dependente.");
      return;
    }
    await mutate(
      `/me/guardianships/${guardianship.guardianship_id}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependent_birth_date: birthDate }),
      },
      { 403: "A data de nascimento não confere com o cadastro do dependente." },
    );
  }

  async function issueTransfer(dependent) {
    setIsSaving(true);
    setError("");
    try {
      const response = await apiFetch(
        `/me/dependents/${dependent.patient_id}/claim-link`,
        { method: "POST" },
      );
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        setError("Não foi possível gerar o acesso. Tente novamente.");
        return;
      }
      const claim = await response.json();
      setTransfers((current) => ({ ...current, [dependent.patient_id]: claim }));
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmRenounce() {
    const done = await mutate(
      `/me/guardianships/${renouncing.guardianship_id}`,
      { method: "DELETE" },
      {
        409: "Você é o último responsável e há médicos com acesso. Revogue esses acessos antes de renunciar.",
      },
    );
    if (done) {
      setRenouncing(null);
    }
  }

  if (pending.length === 0 && dependents.length === 0) {
    return null;
  }

  return (
    <section className="clinical-section care-section" aria-labelledby="guardianship-title">
      <header>
        <div>
          <p className="eyebrow">Representação legal</p>
          <h2 id="guardianship-title">Responsabilidade legal</h2>
        </div>
        <ShieldCheck aria-hidden="true" size={22} />
      </header>

      {error && !renouncing ? <p className="form-error" role="alert">{error}</p> : null}

      {pending.length > 0 ? (
        <div className="care-group-list">
          <h3>Pedidos de guarda</h3>
          {pending.map((guardianship) => {
            const name = guardianship.dependent_preferred_name;
            const fieldId = `guardianship-birth-${guardianship.guardianship_id}`;
            return (
              <article className="care-card care-card-pending" key={guardianship.guardianship_id}>
                <div className="care-card-copy">
                  <p>{RELATIONSHIP_LABEL[guardianship.relationship]}</p>
                  <h4>{guardianship.dependent_full_name}</h4>
                  {guardianship.requested_by ? (
                    <p>Solicitado por {guardianship.requested_by}</p>
                  ) : null}
                  <div className="patient-link-field">
                    <label htmlFor={fieldId}>Data de nascimento de {name}</label>
                    <input
                      id={fieldId}
                      type="date"
                      value={birthDates[guardianship.guardianship_id] || ""}
                      onChange={(event) => setBirthDates((current) => ({
                        ...current,
                        [guardianship.guardianship_id]: event.target.value,
                      }))}
                    />
                  </div>
                </div>
                <div className="care-card-actions">
                  <button
                    type="button"
                    className="care-accept"
                    disabled={isSaving}
                    aria-label={`Aceitar guarda de ${name}`}
                    onClick={() => accept(guardianship)}
                  >
                    Aceitar
                  </button>
                  <button
                    type="button"
                    className="care-reject"
                    disabled={isSaving}
                    aria-label={`Recusar guarda de ${name}`}
                    onClick={() => mutate(
                      `/me/guardianships/${guardianship.guardianship_id}/reject`,
                      { method: "POST" },
                    )}
                  >
                    Recusar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {dependents.length > 0 ? (
        <div className="care-group-list">
          <h3>Meus dependentes</h3>
          {dependents.map((dependent) => (
            <article className="care-card" key={dependent.patient_id}>
              <div className="care-card-copy">
                <p>{dependent.age} anos</p>
                <h4>{dependent.full_name}</h4>
                <p>Use o seletor de contexto para acessar a saúde de {dependent.preferred_name}.</p>
                {transfers[dependent.patient_id] ? (
                  <ClaimLinkCard
                    token={transfers[dependent.patient_id].token}
                    expiresAt={transfers[dependent.patient_id].expires_at}
                  />
                ) : null}
              </div>
              <div className="care-card-actions">
                {dependent.is_adult && !dependent.has_own_access ? (
                  <button
                    type="button"
                    className="care-accept"
                    disabled={isSaving}
                    aria-label={`Gerar acesso para ${dependent.preferred_name}`}
                    onClick={() => issueTransfer(dependent)}
                  >
                    Gerar acesso próprio
                  </button>
                ) : null}
                <button
                  type="button"
                  className="care-reject"
                  disabled={isSaving}
                  aria-label={`Renunciar à guarda de ${dependent.preferred_name}`}
                  onClick={() => {
                    setError("");
                    setRenouncing(dependent);
                  }}
                >
                  Renunciar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={renouncing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenouncing(null);
            setError("");
          }
        }}
        kicker="Representação legal"
        title="Renunciar à guarda"
        description={renouncing
          ? `Você deixará de acessar e decidir pela saúde de ${renouncing.preferred_name}.`
          : ""}
        cancelLabel="Manter guarda"
        confirmLabel="Renunciar à guarda"
        error={renouncing ? error : ""}
        isSaving={isSaving}
        onConfirm={confirmRenounce}
      />
    </section>
  );
}

export default GuardianshipPanel;
