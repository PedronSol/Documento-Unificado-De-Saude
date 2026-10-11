"use client";

import { useCallback, useEffect, useState } from "react";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import UsersRound from "lucide-react/dist/esm/icons/users-round";

import { AdminListState, LoadMore } from "@/components/admin/admin-list-state";
import {
  adminRequest,
  formatDate,
  useAdminPage,
} from "@/components/admin/admin-resources";
import { ClinicalSelect } from "@/components/ui/clinical-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";


const GROUP_STATUS = { active: "Ativo", inactive: "Inativo" };

const CONFIRMATIONS = {
  doctor: (item) => ({
    title: "Remover médico do grupo",
    description: `${item.display_name} deixa de acessar os pacientes deste grupo imediatamente.`,
    confirmLabel: "Remover médico",
    cancelLabel: "Manter médico",
  }),
  patient: (item) => ({
    title: "Revogar vínculo de cuidado",
    description: `Os médicos do grupo deixam de acessar o prontuário de ${item.display_name} na próxima requisição.`,
    confirmLabel: "Revogar vínculo",
    cancelLabel: "Manter vínculo",
  }),
  invitation: (item) => ({
    title: "Cancelar convite de cuidado",
    description: `O convite enviado para ${item.display_name} deixa de poder ser aceito.`,
    confirmLabel: "Cancelar convite",
    cancelLabel: "Manter convite",
  }),
};


function GroupDetail({ groupId, onBack, onUnauthenticated }) {
  const [detail, setDetail] = useState({ status: "loading", data: null });
  const [ownDoctors, setOwnDoctors] = useState([]);
  const [doctorToAdd, setDoctorToAdd] = useState("");
  const [pending, setPending] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    const [groupResult, doctorsResult] = await Promise.all([
      adminRequest(`/admin/care-groups/${groupId}`),
      adminRequest("/admin/doctors"),
    ]);
    if (groupResult.unauthenticated || doctorsResult.unauthenticated) {
      onUnauthenticated();
      return;
    }
    if (groupResult.error) {
      setDetail({ status: "error", data: null });
      return;
    }
    setDetail({ status: "ready", data: groupResult.data });
    setOwnDoctors(doctorsResult.data?.items || []);
  }, [groupId, onUnauthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  async function mutate(path, method, body, successMessage, errors) {
    setIsSaving(true);
    setError("");
    setFeedback("");
    const result = await adminRequest(path, { method, body, errors });
    setIsSaving(false);
    if (result.unauthenticated) {
      onUnauthenticated();
      return false;
    }
    if (result.error) {
      setError(result.error);
      return false;
    }
    setFeedback(successMessage);
    await load();
    return true;
  }

  async function confirmPending() {
    const { kind, item } = pending;
    const paths = {
      doctor: `/admin/care-groups/${groupId}/doctors/${item.doctor_id}`,
      patient: `/admin/care-groups/${groupId}/patients/${item.user_id}`,
      invitation: `/admin/care-groups/${groupId}/patient-invitations/${item.invitation_id}`,
    };
    const messages = {
      doctor: "Médico removido do grupo.",
      patient: "Vínculo revogado.",
      invitation: "Convite cancelado.",
    };
    if (await mutate(paths[kind], "DELETE", undefined, messages[kind])) {
      setPending(null);
    }
  }

  if (detail.status === "loading") {
    return <p className="admin-state" role="status">Carregando grupo…</p>;
  }
  if (detail.status === "error") {
    return (
      <div className="admin-state admin-state-error" role="alert">
        <p>Não foi possível carregar o grupo.</p>
        <button type="button" onClick={onBack}>Voltar para grupos</button>
      </div>
    );
  }

  const group = detail.data;
  const memberIds = new Set(group.doctors.map((doctor) => doctor.doctor_id));
  const doctorOptions = ownDoctors
    .filter((doctor) => (
      doctor.professional_status !== "deactivated" && !memberIds.has(doctor.doctor_id)
    ))
    .map((doctor) => ({
      value: String(doctor.doctor_id),
      label: `${doctor.display_name} · CRM ${doctor.crm_number}/${doctor.crm_state}`,
    }));
  const confirmation = pending ? CONFIRMATIONS[pending.kind](pending.item) : null;

  return (
    <section className="admin-panel" aria-labelledby="group-detail-title">
      <button className="admin-back" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" size={17} />
        Voltar para grupos
      </button>
      <header className="admin-panel-heading">
        <div>
          <p className="eyebrow">Grupo de atendimento</p>
          <h2 id="group-detail-title">{group.name}</h2>
          <div className="admin-badges">
            <span data-tone={group.status === "active" ? "success" : "neutral"}>
              {GROUP_STATUS[group.status]}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="admin-secondary"
          disabled={isSaving}
          onClick={() => mutate(
            `/admin/care-groups/${groupId}`,
            "PATCH",
            { status: group.status === "active" ? "inactive" : "active" },
            group.status === "active" ? "Grupo inativado." : "Grupo ativado.",
          )}
        >
          {group.status === "active" ? "Inativar grupo" : "Ativar grupo"}
        </button>
      </header>

      {feedback ? <p className="admin-feedback" role="status">{feedback}</p> : null}
      {error && !pending ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="admin-subsection">
        <h3>Médicos</h3>
        {group.doctors.length === 0 ? (
          <p className="admin-state">Nenhum médico no grupo.</p>
        ) : (
          <div className="admin-list">
            {group.doctors.map((doctor) => (
              <article className="admin-card" key={doctor.doctor_id}>
                <div className="admin-card-copy">
                  <h4>{doctor.display_name}</h4>
                  <p><span>CRM {doctor.crm_number}/{doctor.crm_state}</span></p>
                </div>
                <div className="admin-card-actions">
                  <button
                    type="button"
                    className="admin-danger-action"
                    disabled={isSaving}
                    aria-label={`Remover ${doctor.display_name} do grupo`}
                    onClick={() => setPending({ kind: "doctor", item: doctor })}
                  >
                    Remover
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        <form
          className="admin-inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!doctorToAdd) {
              setError("Selecione um médico.");
              return;
            }
            if (await mutate(
              `/admin/care-groups/${groupId}/doctors/${doctorToAdd}`,
              "PUT",
              undefined,
              "Médico adicionado ao grupo.",
              { 409: "Médico desativado não pode integrar grupos." },
            )) {
              setDoctorToAdd("");
            }
          }}
        >
          <div className="admin-field">
            <label htmlFor="group-add-doctor">Adicionar médico</label>
            <ClinicalSelect
              id="group-add-doctor"
              value={doctorToAdd}
              placeholder={doctorOptions.length ? "Selecione um médico" : "Nenhum médico disponível"}
              disabled={doctorOptions.length === 0}
              onValueChange={setDoctorToAdd}
              options={doctorOptions}
            />
          </div>
          <button className="admin-primary" type="submit"
            disabled={isSaving || doctorOptions.length === 0}>
            Adicionar ao grupo
          </button>
        </form>
      </div>

      <div className="admin-subsection">
        <h3>Pacientes com acesso ativo</h3>
        {group.patients.length === 0 ? (
          <p className="admin-state">Nenhum paciente aceitou convite deste grupo.</p>
        ) : (
          <div className="admin-list">
            {group.patients.map((patient) => (
              <article className="admin-card" key={patient.user_id}>
                <div className="admin-card-copy">
                  <h4>{patient.display_name}</h4>
                  <p>
                    <span>{patient.masked_cpf}</span>
                    <span>Desde {formatDate(patient.starts_at)}</span>
                  </p>
                </div>
                <div className="admin-card-actions">
                  <button
                    type="button"
                    className="admin-danger-action"
                    disabled={isSaving}
                    aria-label={`Revogar vínculo de ${patient.display_name}`}
                    onClick={() => setPending({ kind: "patient", item: patient })}
                  >
                    Revogar vínculo
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="admin-subsection">
        <h3>Convites pendentes</h3>
        <p className="admin-hint">Para convidar pacientes, use o Diretório.</p>
        {group.pending_invitations.length === 0 ? (
          <p className="admin-state">Nenhum convite pendente.</p>
        ) : (
          <div className="admin-list">
            {group.pending_invitations.map((invitation) => (
              <article className="admin-card" key={invitation.invitation_id}>
                <div className="admin-card-copy">
                  <h4>{invitation.display_name}</h4>
                  <p><span>Expira em {formatDate(invitation.expires_at)}</span></p>
                </div>
                <div className="admin-card-actions">
                  <button
                    type="button"
                    className="admin-danger-action"
                    disabled={isSaving}
                    aria-label={`Cancelar convite de ${invitation.display_name}`}
                    onClick={() => setPending({ kind: "invitation", item: invitation })}
                  >
                    Cancelar convite
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setError("");
          }
        }}
        kicker="Governança · Grupos"
        title={confirmation?.title}
        description={confirmation?.description}
        confirmLabel={confirmation?.confirmLabel}
        cancelLabel={confirmation?.cancelLabel}
        error={pending ? error : ""}
        isSaving={isSaving}
        onConfirm={confirmPending}
      />
    </section>
  );
}


export function AdminGroups({ onUnauthenticated }) {
  const groups = useAdminPage(
    "/admin/care-groups",
    onUnauthenticated,
    "Não foi possível carregar os grupos.",
  );
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [openGroupId, setOpenGroupId] = useState(null);

  async function createGroup(event) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    const result = await adminRequest("/admin/care-groups", {
      method: "POST",
      body: { name },
      errors: { 409: "Você já possui um grupo com esse nome." },
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
    setName("");
    groups.reload();
  }

  if (openGroupId !== null) {
    return (
      <GroupDetail
        groupId={openGroupId}
        onUnauthenticated={onUnauthenticated}
        onBack={() => {
          setOpenGroupId(null);
          groups.reload();
        }}
      />
    );
  }

  return (
    <div className="admin-stack">
      <section className="admin-panel" aria-labelledby="group-create-title">
        <header className="admin-panel-heading">
          <div>
            <p className="eyebrow">Organização do cuidado</p>
            <h2 id="group-create-title">Criar grupo</h2>
          </div>
        </header>
        <form className="admin-inline-form" onSubmit={createGroup}>
          <div className="admin-field">
            <label htmlFor="group-name">Nome do grupo</label>
            <input id="group-name" value={name} onChange={(event) => setName(event.target.value)}
              minLength={3} maxLength={100} autoComplete="off" required />
          </div>
          <button className="admin-primary" type="submit" disabled={isSaving}>
            {isSaving ? "Criando…" : "Criar grupo"}
          </button>
        </form>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </section>

      <section className="admin-panel" aria-labelledby="groups-title">
        <header className="admin-panel-heading">
          <div>
            <p className="eyebrow">Sob sua gestão</p>
            <h2 id="groups-title">Grupos</h2>
          </div>
          <UsersRound aria-hidden="true" size={22} />
        </header>
        <AdminListState
          resource={groups}
          loadingLabel="Carregando grupos…"
          emptyLabel="Você ainda não gerencia grupos."
          retryLabel="Recarregar grupos"
        />
        <div className="admin-list">
          {groups.items.map((group) => (
            <article className="admin-card" key={group.care_group_id}>
              <div className="admin-card-copy">
                <h3>{group.name}</h3>
                <div className="admin-badges">
                  <span data-tone={group.status === "active" ? "success" : "neutral"}>
                    {GROUP_STATUS[group.status]}
                  </span>
                </div>
              </div>
              <div className="admin-card-actions">
                <button
                  type="button"
                  aria-label={`Abrir ${group.name}`}
                  onClick={() => setOpenGroupId(group.care_group_id)}
                >
                  Abrir grupo
                  <ChevronRight aria-hidden="true" size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
        <LoadMore resource={groups} label="Carregar mais grupos" />
      </section>
    </div>
  );
}

export default AdminGroups;
