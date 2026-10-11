"use client";

import { useCallback, useEffect, useState } from "react";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import UsersRound from "lucide-react/dist/esm/icons/users-round";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api";


const LOAD_ERROR = "Não foi possível carregar suas equipes de cuidado.";

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
  const [resource, setResource] = useState({
    status: "loading",
    invitations: [],
    groups: [],
  });
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(async () => {
    setResource((current) => ({ ...current, status: "loading" }));
    try {
      const [invitationsResponse, groupsResponse] = await Promise.all([
        apiFetch("/me/care-invitations"),
        apiFetch("/me/care-groups"),
      ]);
      if (invitationsResponse.status === 401 || groupsResponse.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!invitationsResponse.ok || !groupsResponse.ok) {
        throw new Error(LOAD_ERROR);
      }
      const [invitations, groups] = await Promise.all([
        invitationsResponse.json(),
        groupsResponse.json(),
      ]);
      setResource({
        status: "ready",
        invitations: Array.isArray(invitations) ? invitations : [],
        groups: Array.isArray(groups) ? groups : [],
      });
    } catch {
      setResource({ status: "error", invitations: [], groups: [] });
    }
  }, [onUnauthenticated]);

  useEffect(() => {
    load();
  }, [load]);

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
        setActionError(
          response.status === 404
            ? "Este convite ou vínculo não está mais disponível."
            : "Não foi possível concluir a ação. Tente novamente.",
        );
        await load();
        return false;
      }
      setFeedback(successMessage);
      await load();
      return true;
    } catch {
      setActionError("Não foi possível concluir a ação. Tente novamente.");
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmRevoke() {
    const revoked = await mutate(
      `/me/care-groups/${revoking.care_group_id}`,
      "DELETE",
      "Acesso revogado. A equipe deixa de acessar seu prontuário.",
    );
    if (revoked) {
      setRevoking(null);
    }
  }

  const isEmpty = resource.status === "ready"
    && resource.invitations.length === 0
    && resource.groups.length === 0;

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

      {resource.status === "loading" ? (
        <p className="care-state" role="status">Carregando equipes de cuidado…</p>
      ) : null}

      {resource.status === "error" ? (
        <div className="care-state care-state-error" role="alert">
          <p>{LOAD_ERROR}</p>
          <button type="button" onClick={load}>
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

      {resource.status === "ready" && resource.invitations.length > 0 ? (
        <div className="care-group-list">
          <h3>Convites pendentes</h3>
          {resource.invitations.map((invitation) => (
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
          ))}
        </div>
      ) : null}

      {resource.status === "ready" && resource.groups.length > 0 ? (
        <div className="care-group-list">
          <h3>Com acesso ao seu prontuário</h3>
          {resource.groups.map((group) => (
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
                      setRevoking(group);
                    }}
                  >
                    Revogar acesso
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={revoking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevoking(null);
          }
        }}
        kicker="Consentimento · Prontuário"
        title="Revogar acesso da equipe"
        description={revoking
          ? `Os médicos de ${revoking.name} deixarão de acessar seu prontuário imediatamente.`
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
