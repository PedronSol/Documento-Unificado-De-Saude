"use client";

import { useCallback, useEffect, useState } from "react";
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
            <dd>{patient.blood_type}</dd>
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
  const [patientsResource, setPatientsResource] = useState({
    status: "loading",
    data: [],
  });
  const [recordResource, setRecordResource] = useState(null);

  const loadPatients = useCallback(async (search = "") => {
    setPatientsResource((current) => ({ ...current, status: "loading" }));
    const normalized = search.trim();
    const path = normalized
      ? `/medical/patients?query=${encodeURIComponent(normalized)}`
      : "/medical/patients";
    try {
      const response = await apiFetch(path);
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        throw new Error("Não foi possível carregar seus pacientes.");
      }
      const data = await response.json();
      setPatientsResource({
        status: "ready",
        data: Array.isArray(data) ? data : [],
      });
    } catch (error) {
      setPatientsResource({ status: "error", data: [], error: error.message });
    }
  }, [onUnauthenticated]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

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
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome ou CPF completo"
              maxLength={100}
            />
            <button type="submit">Buscar</button>
          </div>
          <small>CPF é usado somente na busca e nunca aparece nos resultados.</small>
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
            <button type="button" onClick={() => loadPatients(query)}>
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
