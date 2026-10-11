"use client";

import { useState } from "react";
import Search from "lucide-react/dist/esm/icons/search";

import { adminRequest, useAdminPage } from "@/components/admin/admin-resources";
import { InfiniteListFooter } from "@/components/ui/infinite-list-footer";
import { usePaginatedResource } from "@/hooks/use-paginated-resource";
import { ClinicalSelect } from "@/components/ui/clinical-select";


const PROFILE_LABEL = { patient: "Paciente", doctor: "Médico" };


function searchGuidance(query) {
  const normalized = query.trim();
  if (/^[\d.\-\s]+$/.test(normalized)) {
    return normalized.replace(/\D/g, "").length === 11
      ? null
      : "Informe um CPF completo para pesquisar por documento.";
  }
  return normalized.length >= 3
    ? null
    : "Informe ao menos três caracteres para buscar por nome.";
}


export function AdminDirectory({ onUnauthenticated }) {
  // The group picker lists up to the largest page so every own group fits.
  const groups = useAdminPage(
    "/admin/care-groups",
    onUnauthenticated,
    "Não foi possível carregar os grupos.",
    { initialPageSize: 100 },
  );
  const [groupId, setGroupId] = useState("");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const results = usePaginatedResource(submittedQuery ? "/admin/users" : null, {
    fallback: "Não foi possível consultar o diretório.",
    params: { query: submittedQuery },
    onUnauthenticated,
  });
  const [guidance, setGuidance] = useState("");
  const [invitingId, setInvitingId] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const groupOptions = groups.items
    .filter((group) => group.status === "active")
    .map((group) => ({ value: String(group.care_group_id), label: group.name }));

  async function search(event) {
    event.preventDefault();
    const message = searchGuidance(query);
    setGuidance(message || "");
    if (message) {
      return;
    }
    const normalized = query.trim();
    if (normalized === submittedQuery) {
      results.reload();
    } else {
      setSubmittedQuery(normalized);
    }
  }

  async function invite(person) {
    setInvitingId(person.user_id);
    setFeedback("");
    setError("");
    const result = await adminRequest(
      `/admin/care-groups/${groupId}/patient-invitations`,
      {
        method: "POST",
        body: { user_id: person.user_id },
        errors: {
          404: "Paciente ou grupo indisponível para convite.",
          409: "Este paciente já tem convite pendente ou vínculo ativo neste grupo.",
        },
      },
    );
    setInvitingId(null);
    if (result.unauthenticated) {
      onUnauthenticated();
      return;
    }
    if (result.error) {
      setError(result.error);
      return;
    }
    setFeedback("Convite enviado. O acesso só começa após o aceite do paciente.");
  }

  return (
    <section className="admin-panel" aria-labelledby="directory-title">
      <header className="admin-panel-heading">
        <div>
          <p className="eyebrow">Somente dados cadastrais mínimos</p>
          <h2 id="directory-title">Diretório de usuários ativos</h2>
          <p>
            O diretório nunca mostra informações clínicas nem o CPF completo.
          </p>
        </div>
      </header>

      <div className="admin-field">
        <label htmlFor="directory-group">Grupo para convite</label>
        <ClinicalSelect
          id="directory-group"
          value={groupId}
          placeholder={groupOptions.length ? "Selecione um grupo ativo" : "Nenhum grupo ativo"}
          disabled={groupOptions.length === 0}
          onValueChange={setGroupId}
          options={groupOptions}
        />
      </div>

      <form className="medical-search admin-search" onSubmit={search} role="search">
        <label htmlFor="directory-query">Buscar usuário</label>
        <div>
          <Search aria-hidden="true" size={18} />
          <input
            id="directory-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome ou CPF completo"
            maxLength={100}
          />
          <button type="submit">Buscar</button>
        </div>
        <small>CPF é usado somente na busca e nunca aparece completo nos resultados.</small>
        {guidance ? <small role="status">{guidance}</small> : null}
      </form>

      {feedback ? <p className="admin-feedback" role="status">{feedback}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {results.status === "loading" ? (
        <p className="admin-state" role="status">Buscando usuários…</p>
      ) : null}
      {results.status === "error" ? (
        <p className="admin-state admin-state-error" role="alert">
          Não foi possível consultar o diretório.
        </p>
      ) : null}
      {results.status === "ready" && results.items.length === 0 ? (
        <p className="admin-state">Nenhum usuário ativo encontrado.</p>
      ) : null}

      <div className="admin-list">
        {results.items.map((person) => (
          <article className="admin-card" key={person.user_id}>
            <div className="admin-card-copy">
              <h3>{person.display_name}</h3>
              <p><span>{person.masked_cpf}</span></p>
              <div className="admin-badges">
                {person.profiles.map((profile) => (
                  <span key={profile} data-tone="neutral">{PROFILE_LABEL[profile]}</span>
                ))}
              </div>
            </div>
            {person.profiles.includes("patient") ? (
              <div className="admin-card-actions">
                <button
                  type="button"
                  disabled={!groupId || invitingId !== null}
                  aria-label={`Convidar ${person.display_name}`}
                  onClick={() => invite(person)}
                >
                  {invitingId === person.user_id ? "Enviando…" : "Convidar para o grupo"}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {results.status === "ready" && results.items.length > 0 ? (
        <InfiniteListFooter resource={results} itemLabel="usuários" />
      ) : null}
    </section>
  );
}

export default AdminDirectory;
