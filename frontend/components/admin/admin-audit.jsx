"use client";

import History from "lucide-react/dist/esm/icons/history";

import { AdminListState, LoadMore } from "@/components/admin/admin-list-state";
import { useAdminPage } from "@/components/admin/admin-resources";


const ACTION_LABEL = {
  "doctor_invitation.issued": "Convite profissional emitido",
  "doctor_invitation.revoked": "Convite profissional revogado",
  "doctor_invitation.accepted": "Convite profissional concluído",
  "doctor.verified": "CRM verificado",
  "doctor.rejected": "Cadastro profissional rejeitado",
  "doctor.corrected": "CRM corrigido",
  "doctor.suspended": "Médico suspenso",
  "doctor.reactivated": "Médico reativado",
  "doctor.deactivated": "Médico desativado",
  "care_group.created": "Grupo criado",
  "care_group.updated": "Grupo atualizado",
  "care_group.doctor_added": "Médico adicionado ao grupo",
  "care_group.doctor_removed": "Médico removido do grupo",
  "care_link.invited": "Paciente convidado",
  "care_link.invitation_cancelled": "Convite de cuidado cancelado",
  "care_link.accepted": "Convite aceito pelo paciente",
  "care_link.rejected": "Convite recusado pelo paciente",
  "care_link.revoked": "Vínculo revogado",
};

const TARGET_LABEL = {
  doctor_invitation: "Convite profissional",
  doctor: "Médico",
  care_group: "Grupo",
};


function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}


export function AdminAudit({ onUnauthenticated }) {
  const events = useAdminPage(
    "/admin/audit-events",
    onUnauthenticated,
    "Não foi possível carregar a auditoria.",
  );

  return (
    <section className="admin-panel" aria-labelledby="audit-title">
      <header className="admin-panel-heading">
        <div>
          <p className="eyebrow">Sem dados clínicos</p>
          <h2 id="audit-title">Auditoria administrativa</h2>
          <p>Eventos sobre médicos, grupos e vínculos sob sua gestão.</p>
        </div>
        <History aria-hidden="true" size={22} />
      </header>
      <AdminListState
        resource={events}
        loadingLabel="Carregando eventos…"
        emptyLabel="Nenhum evento registrado."
        retryLabel="Recarregar auditoria"
      />
      <ol className="admin-audit-list">
        {events.items.map((event) => (
          <li key={event.event_id}>
            <strong>{ACTION_LABEL[event.action] || event.action}</strong>
            <span>
              {TARGET_LABEL[event.target_type] || event.target_type} #{event.target_id}
            </span>
            <time dateTime={event.occurred_at}>{formatDateTime(event.occurred_at)}</time>
          </li>
        ))}
      </ol>
      <LoadMore resource={events} itemLabel="eventos" />
    </section>
  );
}

export default AdminAudit;
