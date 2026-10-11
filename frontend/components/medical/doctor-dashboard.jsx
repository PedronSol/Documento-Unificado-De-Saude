"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { apiFetch, readApiError } from "@/lib/api";


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
  const [hasEditedSearch, setHasEditedSearch] = useState(false);
  const [patientsResource, setPatientsResource] = useState({
    status: "loading",
    data: [],
  });
  const searchTimerRef = useRef(null);
  const searchControllerRef = useRef(null);
  const searchRequestIdRef = useRef(0);
  const searchStartedForQueryRef = useRef(null);

  function cancelPatientSearch() {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    searchRequestIdRef.current += 1;
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
  }

  const loadPatients = useCallback(async (search = "") => {
    const requestId = ++searchRequestIdRef.current;
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setPatientsResource((current) => ({ ...current, status: "loading" }));
    const normalized = search.trim();
    searchStartedForQueryRef.current = normalized;
    const path = normalized
      ? `/medical/patients?query=${encodeURIComponent(normalized)}`
      : "/medical/patients";
    try {
      const response = await apiFetch(path, { signal: controller.signal });
      if (requestId !== searchRequestIdRef.current) {
        return;
      }
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        const { message } = await readApiError(response, PATIENTS_ERROR);
        if (requestId === searchRequestIdRef.current) {
          setPatientsResource({ status: "error", data: [], error: message });
        }
        return;
      }
      const data = await response.json();
      if (requestId !== searchRequestIdRef.current) {
        return;
      }
      setPatientsResource({
        status: "ready",
        data: Array.isArray(data) ? data : [],
      });
    } catch {
      if (controller.signal.aborted || requestId !== searchRequestIdRef.current) {
        return;
      }
      setPatientsResource({ status: "error", data: [], error: PATIENTS_ERROR });
    } finally {
      if (requestId === searchRequestIdRef.current) {
        searchControllerRef.current = null;
      }
    }
  }, [onUnauthenticated]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    if (!hasEditedSearch || getPatientSearchGuidance(query)) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      searchTimerRef.current = null;
      loadPatients(query);
    }, PATIENT_SEARCH_DEBOUNCE_MS);
    searchTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
      if (searchTimerRef.current === timer) {
        searchTimerRef.current = null;
      }
    };
  }, [hasEditedSearch, loadPatients, query]);

  useEffect(() => () => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
    }
    searchControllerRef.current?.abort();
    searchRequestIdRef.current += 1;
  }, []);

  function submitSearch(event) {
    event.preventDefault();
    if (getPatientSearchGuidance(query)) {
      cancelPatientSearch();
      searchStartedForQueryRef.current = null;
      setHasEditedSearch(true);
      setPatientsResource({ status: "idle", data: [] });
      return;
    }

    const normalized = query.trim();
    if (
      searchStartedForQueryRef.current === normalized &&
      patientsResource.status !== "error"
    ) {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      return;
    }

    cancelPatientSearch();
    loadPatients(query);
  }

  function handleSearchChange(event) {
    const nextQuery = event.target.value;
    cancelPatientSearch();
    searchStartedForQueryRef.current = null;
    setQuery(nextQuery);
    setHasEditedSearch(true);
    if (getPatientSearchGuidance(nextQuery)) {
      setPatientsResource({ status: "idle", data: [] });
    } else {
      setPatientsResource((current) => ({ ...current, status: "loading" }));
    }
  }

  function retryPatientSearch() {
    searchStartedForQueryRef.current = null;
    loadPatients(query);
  }

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
          <strong>{patientsResource.data.length.toString().padStart(2, "0")}</strong>
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

        {patientsResource.status === "loading" ? (
          <div className="medical-list-state" role="status">
            <HeartPulse aria-hidden="true" size={22} />
            Carregando pacientes autorizados…
          </div>
        ) : null}
        {patientsResource.status === "error" ? (
          <div className="medical-list-state medical-list-error" role="alert">
            <p>{patientsResource.error}</p>
            <button type="button" onClick={retryPatientSearch}>
              <RefreshCw aria-hidden="true" size={16} />
              Tentar novamente
            </button>
          </div>
        ) : null}
        {patientsResource.status === "ready" ? (
          <PatientList patients={patientsResource.data} />
        ) : null}
      </section>

      <PatientLinkPanel
        onUnauthenticated={onUnauthenticated}
        onPatientsChanged={() => loadPatients(query)}
      />
    </main>
  );
}

export default DoctorDashboard;
