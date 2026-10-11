"use client";

import { useState } from "react";
import {
  Close as DialogClose,
  Content as DialogContent,
  Description as DialogDescription,
  Overlay as DialogOverlay,
  Portal as DialogPortal,
  Root as DialogRoot,
  Title as DialogTitle,
} from "@radix-ui/react-dialog";
import X from "lucide-react/dist/esm/icons/x";

import { ClaimLinkCard } from "@/components/medical/claim-link-card";
import { apiFetch } from "@/lib/api";


function ProvisionalCorrectionDialog({ patient, onClose, onSaved, onUnauthenticated }) {
  const [form, setForm] = useState({
    full_name: patient.full_name,
    preferred_name: patient.preferred_name,
    birth_date: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    const body = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value),
    );
    try {
      const response = await apiFetch(
        `/medical/patients/${patient.patient_id}/provisional-profile`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        setError(response.status === 409
          ? "A correção não pode mudar a faixa etária do paciente."
          : "Não foi possível salvar a correção. Revise os dados.");
        return;
      }
      onSaved(await response.json());
    } catch {
      setError("Não foi possível salvar a correção. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <DialogRoot open onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogPortal>
        <DialogOverlay className="modal-backdrop" />
        <DialogContent className="clinical-dialog">
          <header className="clinical-dialog-heading">
            <div>
              <p className="dialog-kicker">Paciente provisório</p>
              <DialogTitle asChild>
                <h2>Corrigir dados</h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="dialog-description">
                  Disponível até o paciente assumir a conta. Preencha a data de
                  nascimento apenas para corrigi-la.
                </p>
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button className="dialog-close" type="button"
                aria-label="Fechar correção de dados" disabled={isSaving}>
                <X aria-hidden="true" size={18} />
              </button>
            </DialogClose>
          </header>
          <form onSubmit={submit}>
            {[
              ["full_name", "Nome completo", "text", 100],
              ["preferred_name", "Nome preferido", "text", 20],
              ["birth_date", "Data de nascimento", "date", undefined],
            ].map(([field, label, type, maxLength]) => (
              <div className="dialog-field" key={field}>
                <label htmlFor={`correction-${field}`}>{label}</label>
                <input
                  id={`correction-${field}`}
                  type={type}
                  value={form[field]}
                  maxLength={maxLength}
                  required={field !== "birth_date"}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))}
                />
              </div>
            ))}
            {error ? <p className="form-error dialog-error" role="alert">{error}</p> : null}
            <div className="dialog-actions">
              <DialogClose asChild>
                <button className="dialog-secondary" type="button" disabled={isSaving}>
                  Cancelar
                </button>
              </DialogClose>
              <button className="dialog-primary" type="submit" disabled={isSaving}>
                {isSaving ? "Salvando…" : "Salvar correção"}
              </button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}


export function ProvisionalActions({ patient, onPatientUpdated, onUnauthenticated }) {
  const [correcting, setCorrecting] = useState(false);
  const [claim, setClaim] = useState(null);
  const [error, setError] = useState("");

  async function issueLink() {
    setError("");
    try {
      const response = await apiFetch(
        `/medical/patients/${patient.patient_id}/claim-link`,
        { method: "POST" },
      );
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (response.status === 409) {
        setError("O responsável já tem conta e aceitará a guarda no próprio login.");
        return;
      }
      if (!response.ok) {
        throw new Error();
      }
      setClaim(await response.json());
    } catch {
      setError("Não foi possível gerar um novo link. Tente novamente.");
    }
  }

  return (
    <section className="provisional-actions" aria-label="Paciente provisório">
      <p>
        <strong>Conta provisória</strong>
        <span>O paciente ainda não assumiu a conta.</span>
      </p>
      {patient.manages_provisional ? (
        <div>
          <button type="button" onClick={() => setCorrecting(true)}>Corrigir dados</button>
          <button type="button" onClick={issueLink}>Gerar novo link</button>
        </div>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {claim ? (
        <ClaimLinkCard
          token={claim.token}
          expiresAt={claim.expires_at}
          recipient={claim.recipient}
        />
      ) : null}
      {correcting ? (
        <ProvisionalCorrectionDialog
          patient={patient}
          onClose={() => setCorrecting(false)}
          onUnauthenticated={onUnauthenticated}
          onSaved={(updated) => {
            setCorrecting(false);
            onPatientUpdated(updated);
          }}
        />
      ) : null}
    </section>
  );
}
