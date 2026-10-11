"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import ClipboardPlus from "lucide-react/dist/esm/icons/clipboard-plus";
import HeartPulse from "lucide-react/dist/esm/icons/heart-pulse";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Search from "lucide-react/dist/esm/icons/search";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Syringe from "lucide-react/dist/esm/icons/syringe";
import UsersRound from "lucide-react/dist/esm/icons/users-round";

import { UserAvatar } from "@/components/identity/user-avatar";
import { HealthMarkers } from "@/components/patient/health-markers";
import { apiFetch } from "@/lib/api";


const HEALTH_STATUS = {
  updated: "Prontuário atualizado",
  pending: "Atualização pendente",
  overdue: "Revisão necessária",
};
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


function formatDate(value) {
  if (!value) {
    return "Data não informada";
  }
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}


function PatientList({ patients, onOpen }) {
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
          <button
            type="button"
            onClick={() => onOpen(patient.patient_id)}
            aria-label={`Abrir prontuário de ${patient.preferred_name}`}
          >
            <span>Abrir prontuário</span>
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </article>
      ))}
    </div>
  );
}


function MedicalRecord({ record, onBack, onUnauthenticated }) {
  const patient = record.patient;

  return (
    <div className="medical-record">
      <button className="medical-back" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" size={17} />
        Voltar para pacientes
      </button>

      <section className="medical-record-hero" aria-labelledby="medical-patient-name">
        <div className="medical-record-index" aria-hidden="true">
          #{String(patient.patient_id).padStart(4, "0")}
        </div>
        <div className="medical-record-person">
          <UserAvatar
            name={patient.preferred_name}
            src={patient.avatar_url}
            className="medical-record-avatar"
          />
          <div>
            <p className="eyebrow">Prontuário longitudinal</p>
            <h1 id="medical-patient-name">{patient.full_name}</h1>
            <p>{patient.preferred_name} · {patient.age} anos</p>
          </div>
        </div>
        <dl className="medical-vitals">
          <div>
            <dt>Tipo sanguíneo</dt>
            <dd>{patient.blood_type || "Não informado"}</dd>
          </div>
          <div>
            <dt>Situação</dt>
            <dd>{HEALTH_STATUS[patient.health_status]}</dd>
          </div>
          <div>
            <dt>Escopo</dt>
            <dd>Grupo ativo</dd>
          </div>
        </dl>
      </section>

      <section className="medical-vaccine-section" aria-labelledby="medical-vaccines-title">
        <header>
          <div>
            <p className="eyebrow">Linha do tempo preventiva</p>
            <h2 id="medical-vaccines-title">Vacinação</h2>
          </div>
          <span>{record.vaccines.length.toString().padStart(2, "0")}</span>
        </header>
        {record.vaccines.length === 0 ? (
          <div className="medical-inline-empty">
            <Syringe aria-hidden="true" size={20} />
            Nenhuma vacina registrada.
          </div>
        ) : (
          <div className="medical-vaccine-grid">
            {record.vaccines.map((vaccine) => (
              <article key={vaccine.vaccine_id}>
                <Syringe aria-hidden="true" size={18} />
                <div>
                  <h3>{vaccine.name}</h3>
                  <p>{vaccine.dose}</p>
                </div>
                <time dateTime={vaccine.administered_on || undefined}>
                  {formatDate(vaccine.administered_on)}
                </time>
              </article>
            ))}
          </div>
        )}
      </section>

      <HealthMarkers
        key={patient.patient_id}
        basePath={`/medical/patients/${patient.patient_id}/markers`}
        initialActive={record.markers.active}
        initialRemoved={record.markers.removed}
        isAdult={patient.age >= 18}
        onUnauthenticated={onUnauthenticated}
        variant="medical"
      />
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
  const [recordResource, setRecordResource] = useState(null);
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
        throw new Error("Não foi possível carregar seus pacientes.");
      }
      const data = await response.json();
      if (requestId !== searchRequestIdRef.current) {
        return;
      }
      setPatientsResource({
        status: "ready",
        data: Array.isArray(data) ? data : [],
      });
    } catch (error) {
      if (controller.signal.aborted || requestId !== searchRequestIdRef.current) {
        return;
      }
      setPatientsResource({ status: "error", data: [], error: error.message });
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

  async function openRecord(patientId) {
    setRecordResource({ status: "loading", patientId, data: null });
    try {
      const response = await apiFetch(`/medical/patients/${patientId}`);
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (response.status === 403) {
        setRecordResource({ status: "denied", patientId, data: null });
        return;
      }
      if (!response.ok) {
        throw new Error("Não foi possível carregar o prontuário.");
      }
      setRecordResource({
        status: "ready",
        patientId,
        data: await response.json(),
      });
    } catch (error) {
      setRecordResource({
        status: "error",
        patientId,
        data: null,
        error: error.message,
      });
    }
  }

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

  if (recordResource?.status === "ready") {
    return (
      <main className="doctor-main">
        <MedicalRecord
          record={recordResource.data}
          onBack={() => setRecordResource(null)}
          onUnauthenticated={onUnauthenticated}
        />
      </main>
    );
  }

  if (recordResource?.status === "loading") {
    return (
      <main className="doctor-main medical-center-state" role="status">
        <span className="medical-scan-line" aria-hidden="true" />
        <p>Montando prontuário autorizado…</p>
      </main>
    );
  }

  if (recordResource?.status === "denied" || recordResource?.status === "error") {
    const denied = recordResource.status === "denied";
    return (
      <main className="doctor-main medical-center-state">
        <ShieldCheck aria-hidden="true" size={34} />
        <p className="eyebrow">Fronteira de autorização</p>
        <h1>{denied ? "Acesso ao prontuário negado." : "Prontuário indisponível."}</h1>
        <p>
          {denied
            ? "O paciente não pertence a um grupo de atendimento ativo compartilhado."
            : recordResource.error}
        </p>
        <button type="button" onClick={() => setRecordResource(null)}>
          Voltar para pacientes
        </button>
      </main>
    );
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
          <PatientList patients={patientsResource.data} onOpen={openRecord} />
        ) : null}
      </section>
    </main>
  );
}

export default DoctorDashboard;
