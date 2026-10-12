"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import ClipboardPlus from "lucide-react/dist/esm/icons/clipboard-plus";
import HeartPulse from "lucide-react/dist/esm/icons/heart-pulse";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Search from "lucide-react/dist/esm/icons/search";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import UsersRound from "lucide-react/dist/esm/icons/users-round";

import { UserAvatar } from "@/components/identity/user-avatar";
import { HEALTH_STATUS } from "@/components/medical/medical-format";
import { PatientLinkPanel } from "@/components/medical/patient-link-panel";
import { InfiniteListFooter } from "@/components/ui/infinite-list-footer";
import { ListToolbar } from "@/components/ui/list-toolbar";
import {
  DEFAULT_PAGE_SIZE,
  usePaginatedResource,
} from "@/hooks/use-paginated-resource";


const PATIENTS_ERROR = "Não foi possível carregar seus pacientes.";
const PATIENT_SEARCH_DEBOUNCE_MS = 300;


function getPatientSearchGuidance(search) {
  const normalized = search.trim();
  if (!normalized) {
    return null;
  }

  if (/^[\d.\-\s]+$/.test(normalized)) {
    return normalized.replace(/\D/g, "").length === 11
      ? null
      : "Informe um CPF completo para pesquisar por documento.";
  }

  return normalized.length >= 2
    ? null
    : "Informe ao menos dois caracteres para buscar por nome.";
}


function PatientList({ patients }) {
  if (patients.length === 0) {
    return (
      <div className="medical-empty">
        <UsersRound aria-hidden="true" size={28} />
        <h2>Nenhum paciente encontrado</h2>
        <p>A busca considera somente seus grupos de atendimento ativos.</p>
      </div>
    );
  }

  return (
    <div className="medical-patient-list">
      {patients.map((patient, index) => (
        <article
          className="medical-patient-card"
          key={patient.patient_id}
          style={{ "--patient-order": index }}
        >
          <UserAvatar
            name={patient.preferred_name}
            src={patient.avatar_url}
            className="medical-patient-avatar"
          />
          <div className="medical-patient-copy">
            <p>{patient.preferred_name}</p>
            <h2>{patient.full_name}</h2>
            <div>
              <span>{patient.age} anos</span>
              <span data-health-status={patient.health_status}>
                {HEALTH_STATUS[patient.health_status]}
              </span>
            </div>
          </div>
          <Link
            href={`/medical/patients/${patient.patient_id}`}
            aria-label={`Abrir prontuário de ${patient.preferred_name}`}
          >
            <span>Abrir prontuário</span>
            <ChevronRight aria-hidden="true" size={18} />
          </Link>
        </article>
      ))}
    </div>
  );
}


export function DoctorDashboard({ user, onUnauthenticated }) {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [hasEditedSearch, setHasEditedSearch] = useState(false);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const searchTimerRef = useRef(null);
  const guidance = getPatientSearchGuidance(query);
  // The roster search is filtered and paginated on the server (spec 038);
  // superseded searches are cancelled (spec 030).
  const patients = usePaginatedResource("/medical/patients", {
    fallback: PATIENTS_ERROR,
    params: { query: appliedQuery },
    pageSize,
    abortStale: true,
    onUnauthenticated,
  });

  function clearSearchTimer() {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (!hasEditedSearch || guidance) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      searchTimerRef.current = null;
      setAppliedQuery(query.trim());
    }, PATIENT_SEARCH_DEBOUNCE_MS);
    searchTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (searchTimerRef.current === timer) {
        searchTimerRef.current = null;
      }
    };
  }, [guidance, hasEditedSearch, query]);

  function submitSearch(event) {
    event.preventDefault();
    setHasEditedSearch(true);
    if (guidance) {
      return;
    }
    clearSearchTimer();
    const normalized = query.trim();
    if (normalized !== appliedQuery) {
      setAppliedQuery(normalized);
    } else if (patients.status === "error") {
      patients.reload();
    }
  }

  function handleSearchChange(event) {
    setQuery(event.target.value);
    setHasEditedSearch(true);
  }

  const showResults = !(hasEditedSearch && guidance);

  return (
    <main className="doctor-main">
      <section className="medical-roster-hero">
        <div className="medical-roster-copy">
          <p className="eyebrow">Área profissional · acesso verificado</p>
          <h1>Pacientes em acompanhamento</h1>
          <p>
            Olá, {user.display_name}. Consulte apenas prontuários vinculados aos
            seus grupos ativos.
          </p>
        </div>
        <div className="medical-roster-seal">
          <ShieldCheck aria-hidden="true" size={22} />
          <span>Escopo protegido</span>
          <strong>{patients.total.toString().padStart(2, "0")}</strong>
        </div>
      </section>

      <section className="medical-roster" aria-labelledby="medical-roster-title">
        <header>
          <div>
            <p className="eyebrow">Carteira assistencial</p>
            <h2 id="medical-roster-title">Localizar paciente</h2>
          </div>
          <ClipboardPlus aria-hidden="true" size={24} />
        </header>
        <form className="medical-search" onSubmit={submitSearch} role="search">
          <label htmlFor="medical-patient-search">Buscar paciente</label>
          <div>
            <Search aria-hidden="true" size={18} />
            <input
              id="medical-patient-search"
              value={query}
              onChange={handleSearchChange}
              placeholder="Nome ou CPF completo"
              maxLength={100}
            />
            <button type="submit">Buscar</button>
          </div>
          <small>CPF é usado somente na busca e nunca aparece nos resultados.</small>
          {hasEditedSearch && getPatientSearchGuidance(query) ? (
            <small role="status">{getPatientSearchGuidance(query)}</small>
          ) : null}
        </form>

        {showResults && (patients.total > 10 || appliedQuery) && patients.status === "ready" ? (
          <ListToolbar
            searchLabel={null}
            query=""
            onQueryChange={() => {}}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={patients.total}
          />
        ) : null}
        {showResults && patients.status === "loading" ? (
          <div className="medical-list-state" role="status">
            <HeartPulse aria-hidden="true" size={22} />
            Carregando pacientes autorizados…
          </div>
        ) : null}
        {showResults && patients.status === "error" ? (
          <div className="medical-list-state medical-list-error" role="alert">
            <p>{patients.error}</p>
            <button type="button" onClick={patients.reload}>
              <RefreshCw aria-hidden="true" size={16} />
              Tentar novamente
            </button>
          </div>
        ) : null}
        {showResults && patients.status === "ready" ? (
          <>
            <PatientList patients={patients.items} />
            {patients.items.length > 0 ? (
              <InfiniteListFooter resource={patients} itemLabel="pacientes" />
            ) : null}
          </>
        ) : null}
      </section>

      <PatientLinkPanel
        onUnauthenticated={onUnauthenticated}
        onPatientsChanged={patients.reload}
      />
    </main>
  );
}

export default DoctorDashboard;
