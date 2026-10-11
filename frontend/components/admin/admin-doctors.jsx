"use client";

import { useRef, useState } from "react";
import {
  Close as DialogClose,
  Content as DialogContent,
  Description as DialogDescription,
  Overlay as DialogOverlay,
  Portal as DialogPortal,
  Root as DialogRoot,
  Title as DialogTitle,
} from "@radix-ui/react-dialog";
import Copy from "lucide-react/dist/esm/icons/copy";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import X from "lucide-react/dist/esm/icons/x";

import { AdminListState, LoadMore } from "@/components/admin/admin-list-state";
import {
  adminRequest,
  formatDate,
  useAdminPage,
} from "@/components/admin/admin-resources";
import { ClinicalSelect } from "@/components/ui/clinical-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";


export const UF_OPTIONS = (
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
)
  .split(" ")
  .map((uf) => ({ value: uf, label: uf }));

const EMPTY_INVITATION = {
  cpf: "",
  display_name: "",
  email: "",
  crm_number: "",
  crm_state: "",
};

const INVITATION_STATUS = {
  pending: "Pendente",
  accepted: "Concluído",
  revoked: "Revogado",
  expired: "Expirado",
};

const VERIFICATION_STATUS = {
  pending: "CRM pendente",
  verified: "CRM verificado",
  rejected: "Cadastro rejeitado",
};

const PROFESSIONAL_STATUS = {
  active: "Ativo",
  suspended: "Suspenso",
  deactivated: "Desativado",
};

const CONFIRMATIONS = {
  reject: {
    title: "Rejeitar cadastro profissional",
    description: "O médico não terá acesso profissional. Corrigir o CRM devolve o cadastro para verificação.",
    confirmLabel: "Rejeitar cadastro",
  },
  suspend: {
    title: "Suspender médico",
    description: "O acesso aos prontuários cessa na próxima requisição. Os grupos são preservados para reativação.",
    confirmLabel: "Suspender médico",
  },
  deactivate: {
    title: "Desativar médico",
    description: "A desativação é definitiva e encerra a participação do médico em todos os grupos.",
    confirmLabel: "Desativar médico",
  },
};


function DoctorInvitationForm({ onIssued, onUnauthenticated }) {
  const [form, setForm] = useState(EMPTY_INVITATION);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [issuedLink, setIssuedLink] = useState("");
  const [copied, setCopied] = useState(false);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.crm_state) {
      setError("Selecione a UF do CRM.");
      return;
    }
    setIsSaving(true);
    setError("");
    setIssuedLink("");
    setCopied(false);
    const result = await adminRequest("/admin/doctor-invitations", {
      method: "POST",
      body: form,
      errors: {
        409: "Já existe convite pendente ou perfil profissional com esses dados.",
      },
    });
    setIsSaving(false);
    if (result.unauthenticated) {
      onUnauthenticated();
      return;
    }
    if (result.error) {
      setError(result.error);
      return;
    }
    setIssuedLink(
      `${window.location.origin}/professional-invitation#token=${result.data.token}`,
    );
    setForm(EMPTY_INVITATION);
    onIssued();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(issuedLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="doctor-invitation-title">
      <header className="admin-panel-heading">
        <div>
          <p className="eyebrow">Provisionamento profissional</p>
          <h2 id="doctor-invitation-title">Convidar médico</h2>
          <p>O médico conclui o cadastro com o próprio Google. Você nunca define a senha.</p>
        </div>
      </header>

      <form className="admin-form" onSubmit={submit}>
        <div className="admin-field">
          <label htmlFor="invite-cpf">CPF</label>
          <input id="invite-cpf" name="cpf" value={form.cpf} onChange={updateField}
            inputMode="numeric" autoComplete="off" maxLength={14} required />
        </div>
        <div className="admin-field">
          <label htmlFor="invite-name">Nome completo</label>
          <input id="invite-name" name="display_name" value={form.display_name}
            onChange={updateField} autoComplete="off" minLength={3} maxLength={100}
            required />
        </div>
        <div className="admin-field">
          <label htmlFor="invite-email">E-mail</label>
          <input id="invite-email" name="email" type="email" value={form.email}
            onChange={updateField} autoComplete="off" maxLength={254} required />
        </div>
        <div className="admin-field-row">
          <div className="admin-field">
            <label htmlFor="invite-crm">CRM</label>
            <input id="invite-crm" name="crm_number" value={form.crm_number}
              onChange={updateField} inputMode="numeric" pattern="[0-9]{4,10}"
              autoComplete="off" required />
          </div>
          <div className="admin-field">
            <label htmlFor="invite-crm-state">UF do CRM</label>
            <ClinicalSelect
              id="invite-crm-state"
              name="crm_state"
              value={form.crm_state}
              placeholder="UF"
              onValueChange={(value) => updateField({
                target: { name: "crm_state", value },
              })}
              options={UF_OPTIONS}
            />
          </div>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="admin-primary" type="submit" disabled={isSaving}>
          {isSaving ? "Emitindo…" : "Emitir convite"}
        </button>
      </form>

      {issuedLink ? (
        <div className="admin-issued-link">
          <label htmlFor="issued-link">Link do convite</label>
          <div>
            <input id="issued-link" value={issuedLink} readOnly
              onFocus={(event) => event.target.select()} />
            <button type="button" onClick={copyLink}>
              <Copy aria-hidden="true" size={16} />
              {copied ? "Copiado" : "Copiar link"}
            </button>
          </div>
          <small>
            Este link é exibido uma única vez e expira em 7 dias. Envie-o
            diretamente ao médico.
          </small>
        </div>
      ) : null}
    </section>
  );
}


function CrmCorrectionDialog({ doctor, onClose, onSaved, onUnauthenticated }) {
  const [form, setForm] = useState({
    crm_number: doctor.crm_number,
    crm_state: doctor.crm_state,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const numberRef = useRef(null);

  async function submit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    const result = await adminRequest(`/admin/doctors/${doctor.doctor_id}`, {
      method: "PATCH",
      body: form,
      errors: { 409: "Este CRM já pertence a outro perfil profissional." },
    });
    setIsSaving(false);
    if (result.unauthenticated) {
      onUnauthenticated();
      return;
    }
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved(result.data);
  }

  return (
    <DialogRoot open onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogPortal>
        <DialogOverlay className="modal-backdrop" />
        <DialogContent
          className="clinical-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            numberRef.current?.focus();
          }}
        >
          <header className="clinical-dialog-heading">
            <div>
              <p className="dialog-kicker">Cadastro profissional</p>
              <DialogTitle asChild>
                <h2>Corrigir CRM</h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="dialog-description">
                  A correção devolve o cadastro de {doctor.display_name} para verificação.
                </p>
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button className="dialog-close" type="button" aria-label="Fechar correção de CRM"
                disabled={isSaving}>
                <X aria-hidden="true" size={18} />
              </button>
            </DialogClose>
          </header>
          <form onSubmit={submit}>
            <div className="dialog-row">
              <div className="dialog-field">
                <label htmlFor="correction-crm">CRM</label>
                <input ref={numberRef} id="correction-crm" value={form.crm_number}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    crm_number: event.target.value,
                  }))}
                  inputMode="numeric" pattern="[0-9]{4,10}" required />
              </div>
              <div className="dialog-field">
                <label htmlFor="correction-crm-state">UF do CRM</label>
                <ClinicalSelect
                  id="correction-crm-state"
                  value={form.crm_state}
                  onValueChange={(value) => setForm((current) => ({
                    ...current,
                    crm_state: value,
                  }))}
                  options={UF_OPTIONS}
                />
              </div>
            </div>
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


function DoctorActions({ doctor, disabled, onAction, onCorrect }) {
  const name = doctor.display_name;
  const actions = [];
  if (doctor.verification_status === "pending") {
    actions.push(["verify", `Verificar CRM de ${name}`, "Verificar CRM"]);
    actions.push(["reject", `Rejeitar ${name}`, "Rejeitar"]);
  }
  if (doctor.professional_status === "active") {
    actions.push(["suspend", `Suspender ${name}`, "Suspender"]);
  }
  if (doctor.professional_status === "suspended") {
    actions.push(["reactivate", `Reativar ${name}`, "Reativar"]);
  }
  if (doctor.professional_status !== "deactivated") {
    actions.push(["deactivate", `Desativar ${name}`, "Desativar"]);
  }

  return (
    <div className="admin-card-actions">
      {doctor.professional_status !== "deactivated" ? (
        <button type="button" disabled={disabled} onClick={onCorrect}
          aria-label={`Corrigir CRM de ${name}`}>
          Corrigir CRM
        </button>
      ) : null}
      {actions.map(([action, ariaLabel, label]) => (
        <button
          key={action}
          type="button"
          className={CONFIRMATIONS[action] ? "admin-danger-action" : undefined}
          disabled={disabled}
          aria-label={ariaLabel}
          onClick={() => onAction(action)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}


export function AdminDoctors({ onUnauthenticated }) {
  const invitations = useAdminPage(
    "/admin/doctor-invitations",
    onUnauthenticated,
    "Não foi possível carregar os convites.",
  );
  const doctors = useAdminPage(
    "/admin/doctors",
    onUnauthenticated,
    "Não foi possível carregar os médicos.",
  );
  const [pending, setPending] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [correcting, setCorrecting] = useState(null);

  async function runDoctorAction(doctor, action) {
    setIsSaving(true);
    setError("");
    const result = await adminRequest(`/admin/doctors/${doctor.doctor_id}/status`, {
      method: "POST",
      body: { action },
      errors: { 409: "Essa transição não é permitida no estado atual do médico." },
    });
    setIsSaving(false);
    if (result.unauthenticated) {
      onUnauthenticated();
      return false;
    }
    if (result.error) {
      setError(result.error);
      return false;
    }
    doctors.replaceItem("doctor_id", result.data);
    return true;
  }

  async function revokeInvitation(invitation) {
    setIsSaving(true);
    setError("");
    const result = await adminRequest(
      `/admin/doctor-invitations/${invitation.invitation_id}`,
      { method: "DELETE" },
    );
    setIsSaving(false);
    if (result.unauthenticated) {
      onUnauthenticated();
      return false;
    }
    if (result.error) {
      setError(result.error);
      return false;
    }
    invitations.reload();
    return true;
  }

  function requestAction(doctor, action) {
    setError("");
    if (CONFIRMATIONS[action]) {
      setPending({ kind: "doctor", doctor, action });
      return;
    }
    runDoctorAction(doctor, action);
  }

  async function confirmPending() {
    const done = pending.kind === "doctor"
      ? await runDoctorAction(pending.doctor, pending.action)
      : await revokeInvitation(pending.invitation);
    if (done) {
      setPending(null);
    }
  }

  const confirmation = pending?.kind === "doctor"
    ? CONFIRMATIONS[pending.action]
    : {
      title: "Revogar convite profissional",
      description: "O link deixa de funcionar imediatamente.",
      confirmLabel: "Revogar convite",
    };

  return (
    <div className="admin-stack">
      <DoctorInvitationForm onIssued={invitations.reload} onUnauthenticated={onUnauthenticated} />

      {error && !pending ? <p className="form-error" role="alert">{error}</p> : null}

      <section className="admin-panel" aria-labelledby="doctors-title">
        <header className="admin-panel-heading">
          <div>
            <p className="eyebrow">Sob sua responsabilidade</p>
            <h2 id="doctors-title">Médicos</h2>
          </div>
          <Stethoscope aria-hidden="true" size={22} />
        </header>
        <AdminListState
          resource={doctors}
          loadingLabel="Carregando médicos…"
          emptyLabel="Nenhum médico concluiu convite emitido por você."
          retryLabel="Recarregar médicos"
        />
        <div className="admin-list">
          {doctors.items.map((doctor) => (
            <article className="admin-card" key={doctor.doctor_id}>
              <div className="admin-card-copy">
                <h3>{doctor.display_name}</h3>
                <p>
                  <span>{doctor.masked_cpf}</span>
                  <span>CRM {doctor.crm_number}/{doctor.crm_state}</span>
                </p>
                <div className="admin-badges">
                  <span data-tone={doctor.verification_status === "verified" ? "success" : "neutral"}>
                    {VERIFICATION_STATUS[doctor.verification_status]}
                  </span>
                  <span data-tone={doctor.professional_status === "active" ? "neutral" : "danger"}>
                    {PROFESSIONAL_STATUS[doctor.professional_status]}
                  </span>
                </div>
              </div>
              <DoctorActions
                doctor={doctor}
                disabled={isSaving}
                onAction={(action) => requestAction(doctor, action)}
                onCorrect={() => setCorrecting(doctor)}
              />
            </article>
          ))}
        </div>
        <LoadMore resource={doctors} label="Carregar mais médicos" />
      </section>

      <section className="admin-panel" aria-labelledby="invitations-title">
        <header className="admin-panel-heading">
          <div>
            <p className="eyebrow">Uso único · 7 dias</p>
            <h2 id="invitations-title">Convites emitidos</h2>
          </div>
        </header>
        <AdminListState
          resource={invitations}
          loadingLabel="Carregando convites…"
          emptyLabel="Nenhum convite emitido."
          retryLabel="Recarregar convites"
        />
        <div className="admin-list">
          {invitations.items.map((invitation) => (
            <article className="admin-card" key={invitation.invitation_id}>
              <div className="admin-card-copy">
                <h3>{invitation.display_name}</h3>
                <p>
                  <span>{invitation.email}</span>
                  <span>CRM {invitation.crm_number}/{invitation.crm_state}</span>
                  <span>Expira em {formatDate(invitation.expires_at)}</span>
                </p>
                <div className="admin-badges">
                  <span data-tone={invitation.status === "pending" ? "primary" : "neutral"}>
                    {INVITATION_STATUS[invitation.status]}
                  </span>
                </div>
              </div>
              {invitation.status === "pending" ? (
                <div className="admin-card-actions">
                  <button
                    type="button"
                    className="admin-danger-action"
                    disabled={isSaving}
                    aria-label={`Revogar convite de ${invitation.display_name}`}
                    onClick={() => setPending({ kind: "invitation", invitation })}
                  >
                    Revogar convite
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
        <LoadMore resource={invitations} label="Carregar mais convites" />
      </section>

      <ConfirmDialog
        isOpen={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setError("");
          }
        }}
        kicker="Governança · Médicos"
        title={confirmation.title}
        description={confirmation.description}
        confirmLabel={confirmation.confirmLabel}
        error={pending ? error : ""}
        isSaving={isSaving}
        onConfirm={confirmPending}
      />

      {correcting ? (
        <CrmCorrectionDialog
          doctor={correcting}
          onClose={() => setCorrecting(null)}
          onUnauthenticated={onUnauthenticated}
          onSaved={(doctor) => {
            doctors.replaceItem("doctor_id", doctor);
            setCorrecting(null);
          }}
        />
      ) : null}
    </div>
  );
}

export default AdminDoctors;
