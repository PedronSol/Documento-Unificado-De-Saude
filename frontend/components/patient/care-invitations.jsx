"use client";

import { useState } from "react";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import UsersRound from "lucide-react/dist/esm/icons/users-round";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PaginatedList } from "@/components/ui/paginated-list";
import { usePaginatedList } from "@/hooks/use-paginated-list";
import { apiFetch, readApiError } from "@/lib/api";


const LOAD_ERROR = "Não foi possível carregar suas equipes de cuidado.";
const ACTION_ERROR = "Não foi possível concluir a ação. Tente novamente.";
function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value),
  );
}


function CareTeam({ doctors }) {
  if (doctors.length === 0) {
    return <p className="care-team-empty">Nenhum médico verificado no grupo.</p>;
  }

  return (
    <ul className="care-team">
      {doctors.map((doctor) => (
        <li key={`${doctor.crm_state}-${doctor.crm_number}`}>
          <Stethoscope aria-hidden="true" size={16} />
          <span>{doctor.display_name}</span>
          <small>CRM {doctor.crm_number}/{doctor.crm_state}</small>
        </li>
      ))}
    </ul>
  );
}


export function CareInvitations({ isAdult, onUnauthenticated }) {
  // Four independent server-paginated lists (spec 038).
  const listOptions = { fallback: LOAD_ERROR, onUnauthenticated };
  const invitations = usePaginatedList("/me/care-invitations", listOptions);
  const requests = usePaginatedList("/me/care-requests", listOptions);
  const doctors = usePaginatedList("/me/care-doctors", listOptions);
  const groups = usePaginatedList("/me/care-groups", listOptions);
  const lists = [invitations, requests, doctors, groups];
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const status = lists.some(({ resource }) => resource.status === "error")
    ? "error"
    : lists.some(({ resource }) => resource.status !== "ready")
      ? "loading"
      : "ready";

  function reloadAll() {
    lists.forEach(({ resource }) => resource.reload());
  }

  async function mutate(path, method, successMessage) {
    setPendingAction(path);
    setActionError("");
    setFeedback("");
    try {
      const response = await apiFetch(path, { method });
      if (response.status === 401) {
        onUnauthenticated();
        return false;
      }
      if (!response.ok) {
        setActionError((await readApiError(response, ACTION_ERROR)).message);
        reloadAll();
        return false;
      }
      setFeedback(successMessage);
      reloadAll();
      return true;
    } catch {
      setActionError(ACTION_ERROR);
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmRevoke() {
    const revoked = await mutate(
      revoking.path,
      "DELETE",
      "Acesso revogado. A equipe deixa de acessar seu prontuário.",
    );
    if (revoked) {
      setRevoking(null);
    }
  }

  const isEmpty = status === "ready"
    && lists.every((list) => list.resource.total === 0 && !list.isFiltered);
  const visible = (list) => status === "ready" && (list.resource.total > 0 || list.isFiltered);

  function subList(list, { title, searchLabel, itemLabel, renderItem }) {
    if (!visible(list)) {
      return null;
    }
    return (
      <div className="care-group-list">
        <h3>{title}</h3>
        <PaginatedList
          list={list}
          searchLabel={searchLabel}
          itemLabel={itemLabel}
          loadingText="Carregando…"
          emptyText=""
          retryLabel="Recarregar equipes"
          renderItems={(items) => items.map(renderItem)}
        />
      </div>
    );
  }

  return (
    <section className="clinical-section care-section" aria-labelledby="care-title">
      <header>
        <div>
          <p className="eyebrow">Consentimento de acesso</p>
          <h2 id="care-title">Equipes de cuidado</h2>
        </div>
        <UsersRound aria-hidden="true" size={22} />
      </header>

      {!isAdult ? (
        <p className="care-note">
          Aceitar, recusar ou revogar equipes exige maioridade.
        </p>
      ) : null}

      {status === "loading" ? (
        <p className="care-state" role="status">Carregando equipes de cuidado…</p>
      ) : null}

      {status === "error" ? (
        <div className="care-state care-state-error" role="alert">
          <p>{LOAD_ERROR}</p>
          <button type="button" onClick={reloadAll}>
            <RefreshCw aria-hidden="true" size={16} />
            Recarregar equipes
          </button>
        </div>
      ) : null}

      {isEmpty ? (
        <p className="care-state">Nenhuma equipe acompanha seu prontuário.</p>
      ) : null}

      {feedback ? <p className="care-feedback" role="status">{feedback}</p> : null}
      {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}

      {subList(invitations, {
        title: "Convites pendentes",
        searchLabel: "Buscar convites",
        itemLabel: "convites",
        renderItem: (invitation) => (
        <article className="care-card care-card-pending" key={invitation.invitation_id}>
          <div className="care-card-copy">
            <p>Válido até {formatDate(invitation.expires_at)}</p>
            <h4>{invitation.care_group_name}</h4>
            <CareTeam doctors={invitation.doctors} />
          </div>
          {isAdult ? (
            <div className="care-card-actions">
              <button
                type="button"
                className="care-accept"
                disabled={pendingAction !== null}
                aria-label={`Aceitar convite de ${invitation.care_group_name}`}
                onClick={() => mutate(
                  `/me/care-invitations/${invitation.invitation_id}/accept`,
                  "POST",
                  "Convite aceito. A equipe passa a acessar seu prontuário.",
                )}
              >
                Aceitar
              </button>
              <button
                type="button"
                className="care-reject"
                disabled={pendingAction !== null}
                aria-label={`Recusar convite de ${invitation.care_group_name}`}
                onClick={() => mutate(
                  `/me/care-invitations/${invitation.invitation_id}/reject`,
                  "POST",
                  "Convite recusado.",
                )}
              >
                Recusar
              </button>
            </div>
          ) : null}
        </article>
        ),
      })}

      {subList(requests, {
        title: "Solicitações de médicos",
        searchLabel: "Buscar solicitações",
        itemLabel: "solicitações",
        renderItem: (request) => (
        <article className="care-card care-card-pending" key={request.link_id}>
          <div className="care-card-copy">
            <p>Válida até {formatDate(request.expires_at)}</p>
            <h4>{request.doctor_display_name}</h4>
            <p>CRM {request.crm_number}/{request.crm_state}</p>
          </div>
          {isAdult ? (
            <div className="care-card-actions">
              <button
                type="button"
                className="care-accept"
                disabled={pendingAction !== null}
                aria-label={`Aceitar solicitação de ${request.doctor_display_name}`}
                onClick={() => mutate(
                  `/me/care-requests/${request.link_id}/accept`,
                  "POST",
                  "Solicitação aceita. O médico passa a acessar seu prontuário.",
                )}
              >
                Aceitar
              </button>
              <button
                type="button"
                className="care-reject"
                disabled={pendingAction !== null}
                aria-label={`Recusar solicitação de ${request.doctor_display_name}`}
                onClick={() => mutate(
                  `/me/care-requests/${request.link_id}/reject`,
                  "POST",
                  "Solicitação recusada.",
                )}
              >
                Recusar
              </button>
            </div>
          ) : null}
        </article>
        ),
      })}

      {subList(doctors, {
        title: "Médicos com acesso direto",
        searchLabel: "Buscar médicos",
        itemLabel: "médicos",
        renderItem: (doctor) => (
        <article className="care-card" key={doctor.link_id}>
          <div className="care-card-copy">
            <p>Desde {formatDate(doctor.since)}</p>
            <h4>{doctor.doctor_display_name}</h4>
            <p>CRM {doctor.crm_number}/{doctor.crm_state}</p>
          </div>
          {isAdult ? (
            <div className="care-card-actions">
              <button
                type="button"
                className="care-reject"
                disabled={pendingAction !== null}
                aria-label={`Revogar acesso de ${doctor.doctor_display_name}`}
                onClick={() => {
                  setActionError("");
                  setRevoking({
                    name: doctor.doctor_display_name,
                    path: `/me/care-doctors/${doctor.link_id}`,
                  });
                }}
              >
                Revogar acesso
              </button>
            </div>
          ) : null}
        </article>
        ),
      })}

      {subList(groups, {
        title: "Com acesso ao seu prontuário",
        searchLabel: "Buscar equipes",
        itemLabel: "equipes",
        renderItem: (group) => (
        <article className="care-card" key={group.care_group_id}>
          <div className="care-card-copy">
            <p>Desde {formatDate(group.starts_at)}</p>
            <h4>{group.name}</h4>
            <CareTeam doctors={group.doctors} />
          </div>
          {isAdult ? (
            <div className="care-card-actions">
              <button
                type="button"
                className="care-reject"
                disabled={pendingAction !== null}
                aria-label={`Revogar acesso de ${group.name}`}
                onClick={() => {
                  setActionError("");
                  setRevoking({
                    name: group.name,
                    path: `/me/care-groups/${group.care_group_id}`,
                  });
                }}
              >
                Revogar acesso
              </button>
            </div>
          ) : null}
        </article>
        ),
      })}

      <ConfirmDialog
        isOpen={revoking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevoking(null);
          }
        }}
        kicker="Consentimento · Prontuário"
        title="Revogar acesso ao prontuário"
        description={revoking
          ? `${revoking.name} deixará de acessar seu prontuário imediatamente.`
          : ""}
        cancelLabel="Manter acesso"
        confirmLabel="Revogar acesso"
        isSaving={pendingAction !== null}
        onConfirm={confirmRevoke}
      />
    </section>
  );
}

export default CareInvitations;
