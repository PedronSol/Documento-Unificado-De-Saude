"use client";

import { useState } from "react";
import UsersRound from "lucide-react/dist/esm/icons/users-round";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useApiResource } from "@/hooks/use-api-resource";
import { apiFetch, readApiError } from "@/lib/api";


const RELATIONSHIP_LABEL = {
  parent: "Mãe ou pai",
  legal_guardian: "Responsável legal",
};
const GENERIC_ERROR = "Não foi possível concluir a ação. Tente novamente.";


export function MyGuardiansPanel({ isAdult, onUnauthenticated }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [releasing, setReleasing] = useState(null);

  const guardiansResource = useApiResource("/me/guardians", {
    fallback: GENERIC_ERROR,
    onUnauthenticated,
  });
  const guardians = Array.isArray(guardiansResource.data) ? guardiansResource.data : [];

  async function mutate(path, method) {
    setIsSaving(true);
    setError("");
    try {
      const response = await apiFetch(path, { method });
      if (response.status === 401) {
        onUnauthenticated();
        return false;
      }
      if (!response.ok) {
        setError((await readApiError(response, GENERIC_ERROR)).message);
        return false;
      }
      guardiansResource.reload();
      return true;
    } catch {
      setError(GENERIC_ERROR);
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  if (guardians.length === 0) {
    return null;
  }

  return (
    <section className="clinical-section care-section" aria-labelledby="my-guardians-title">
      <header>
        <div>
          <p className="eyebrow">Representação legal</p>
          <h2 id="my-guardians-title">Meus responsáveis</h2>
        </div>
        <UsersRound aria-hidden="true" size={22} />
      </header>

      {!isAdult ? (
        <p className="care-note">
          Após completar 18 anos, você pode desvincular responsáveis quando quiser.
        </p>
      ) : null}
      {error && !releasing ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="care-group-list">
        {guardians.map((guardian) => (
          <article
            className={guardian.awaiting_my_confirmation ? "care-card care-card-pending" : "care-card"}
            key={guardian.guardianship_id}
          >
            <div className="care-card-copy">
              <p>
                {RELATIONSHIP_LABEL[guardian.relationship]}
                {guardian.awaiting_my_confirmation ? " · aguardando sua confirmação" : ""}
              </p>
              <h4>{guardian.guardian_display_name}</h4>
            </div>
            <div className="care-card-actions">
              {guardian.awaiting_my_confirmation ? (
                <button
                  type="button"
                  className="care-accept"
                  disabled={isSaving}
                  aria-label={`Confirmar ${guardian.guardian_display_name} como responsável`}
                  onClick={() => mutate(
                    `/me/guardianships/${guardian.guardianship_id}/confirm`,
                    "POST",
                  )}
                >
                  Confirmar
                </button>
              ) : null}
              {isAdult && guardian.status === "active" ? (
                <button
                  type="button"
                  className="care-reject"
                  disabled={isSaving}
                  aria-label={`Desvincular ${guardian.guardian_display_name}`}
                  onClick={() => {
                    setError("");
                    setReleasing(guardian);
                  }}
                >
                  Desvincular
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <ConfirmDialog
        isOpen={releasing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReleasing(null);
            setError("");
          }
        }}
        kicker="Representação legal"
        title="Desvincular responsável"
        description={releasing
          ? `${releasing.guardian_display_name} deixará de acessar e decidir pela sua saúde.`
          : ""}
        cancelLabel="Manter responsável"
        confirmLabel="Desvincular responsável"
        error={releasing ? error : ""}
        isSaving={isSaving}
        onConfirm={async () => {
          if (await mutate(`/me/guardians/${releasing.guardianship_id}`, "DELETE")) {
            setReleasing(null);
          }
        }}
      />
    </section>
  );
}

export default MyGuardiansPanel;
