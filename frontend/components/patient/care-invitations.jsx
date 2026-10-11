"use client";

import { useCallback, useEffect, useState } from "react";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import UsersRound from "lucide-react/dist/esm/icons/users-round";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch, readApiError } from "@/lib/api";


const LOAD_ERROR = "Não foi possível carregar suas equipes de cuidado.";
const ACTION_ERROR = "Não foi possível concluir a ação. Tente novamente.";
const CARE_RESOURCES = [
  ["/me/care-invitations", "invitations"],
  ["/me/care-groups", "groups"],
  ["/me/care-requests", "requests"],
  ["/me/care-doctors", "doctors"],
];
const EMPTY_CARE = { invitations: [], groups: [], requests: [], doctors: [] };

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
    requests: [],
    doctors: [],
  });
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(async () => {
    setResource((current) => ({ ...current, status: "loading" }));
    try {
      const responses = await Promise.all(CARE_RESOURCES.map(([path]) => apiFetch(path)));
      if (responses.some((response) => response.status === 401)) {
        onUnauthenticated();
        return;
      }
      if (responses.some((response) => !response.ok)) {
        throw new Error(LOAD_ERROR);
      }
      const bodies = await Promise.all(responses.map((response) => response.json()));
      setResource({
        status: "ready",
        ...Object.fromEntries(CARE_RESOURCES.map(([, key], index) => [
          key,
          Array.isArray(bodies[index]) ? bodies[index] : [],
        ])),
      });
    } catch {
      setResource({ ...EMPTY_CARE, status: "error" });
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
        setActionError((await readApiError(response, ACTION_ERROR)).message);
        await load();
        return false;
      }
      setFeedback(successMessage);
      await load();
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

  const isEmpty = resource.status === "ready"
    && Object.keys(EMPTY_CARE).every((key) => resource[key].length === 0);

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

      {resource.status === "ready" && resource.requests.length > 0 ? (
        <div className="care-group-list">
          <h3>Solicitações de médicos</h3>
          {resource.requests.map((request) => (
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
          ))}
        </div>
      ) : null}

      {resource.status === "ready" && resource.doctors.length > 0 ? (
        <div className="care-group-list">
          <h3>Médicos com acesso direto</h3>
          {resource.doctors.map((doctor) => (
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
