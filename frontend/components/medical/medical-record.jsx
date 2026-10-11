"use client";

import Link from "next/link";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Syringe from "lucide-react/dist/esm/icons/syringe";

import { DigitalDocuments } from "@/components/documents/digital-documents";
import { HealthMarkers } from "@/components/markers/health-markers";
import { UserAvatar } from "@/components/identity/user-avatar";
import { formatDate, HEALTH_STATUS } from "@/components/medical/medical-format";
import { ProvisionalActions } from "@/components/medical/provisional-actions";
import { useApiResource } from "@/hooks/use-api-resource";
import { parsePatientId } from "@/lib/areas";


const RECORD_ERROR = "Não foi possível carregar o prontuário.";
const DOCUMENTS_ERROR = "Não foi possível carregar os documentos deste paciente.";


function MedicalRecord({
  documentsResource,
  onPatientUpdated,
  onUnauthenticated,
  record,
}) {
  const patient = record.patient;

  return (
    <div className="medical-record">
      <Link className="medical-back" href="/medical">
        <ArrowLeft aria-hidden="true" size={17} />
        Voltar para pacientes
      </Link>

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

      {patient.account_status === "provisional" ? (
        <ProvisionalActions
          patient={patient}
          onPatientUpdated={onPatientUpdated}
          onUnauthenticated={onUnauthenticated}
        />
      ) : null}

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

      {documentsResource.status === "loading" ? (
        <section className="clinical-section" aria-labelledby="medical-documents-title">
          <header><h2 id="medical-documents-title">Documentos digitais</h2></header>
          <div
            className="medical-list-state"
            role="status"
            aria-label="Carregando documentos"
          >
            Carregando documentos autorizados…
          </div>
        </section>
      ) : documentsResource.status === "error" ? (
        <section className="clinical-section" aria-label="Documentos digitais">
          <header><h2>Documentos digitais</h2></header>
          <div
            className="form-error marker-resource-error"
            role="alert"
            aria-label="Não foi possível carregar os documentos deste paciente."
          >
            <p>Não foi possível carregar os documentos deste paciente.</p>
            <button type="button" onClick={documentsResource.reload}>Tentar novamente</button>
          </div>
        </section>
      ) : (
        <DigitalDocuments
          basePath={`/medical/patients/${patient.patient_id}/documents`}
          documents={documentsResource.data}
          isAdult={false}
          onUnauthenticated={onUnauthenticated}
        />
      )}

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

function RecordState({ title, message }) {
  return (
    <main className="doctor-main medical-center-state">
      <ShieldCheck aria-hidden="true" size={34} />
      <p className="eyebrow">Fronteira de autorização</p>
      <h1>{title}</h1>
      <p>{message}</p>
      <Link className="medical-center-action" href="/medical">
        Voltar para pacientes
      </Link>
    </main>
  );
}

const NOT_FOUND = {
  title: "Paciente não encontrado.",
  message: "Verifique o endereço ou volte à lista de pacientes.",
};


// Loads one authorized record by route id. The backend decides access; the
// view only maps 403/404 to their states and never keeps another patient.
export function MedicalRecordView({ patientId: rawPatientId, onUnauthenticated }) {
  const patientId = parsePatientId(rawPatientId);
  const basePath = patientId === null ? null : `/medical/patients/${patientId}`;
  const recordResource = useApiResource(basePath, {
    fallback: RECORD_ERROR,
    initialData: null,
    onUnauthenticated,
  });
  const documentsResource = useApiResource(basePath && `${basePath}/documents`, {
    fallback: DOCUMENTS_ERROR,
    onUnauthenticated,
  });

  if (patientId === null || recordResource.errorStatus === 404) {
    return <RecordState {...NOT_FOUND} />;
  }
  if (recordResource.errorStatus === 403) {
    return (
      <RecordState
        title="Acesso ao prontuário negado."
        message="O paciente não pertence a um grupo de atendimento ativo compartilhado."
      />
    );
  }
  if (recordResource.status === "error") {
    return <RecordState title="Prontuário indisponível." message={recordResource.error} />;
  }
  if (recordResource.status !== "ready") {
    return (
      <main className="doctor-main medical-center-state" role="status">
        <span className="medical-scan-line" aria-hidden="true" />
        <p>Montando prontuário autorizado…</p>
      </main>
    );
  }

  return (
    <main className="doctor-main">
      <MedicalRecord
        documentsResource={documentsResource}
        record={recordResource.data}
        onPatientUpdated={(updatedPatient) => recordResource.updateData((current) => ({
          ...current,
          patient: updatedPatient,
        }))}
        onUnauthenticated={onUnauthenticated}
      />
    </main>
  );
}

export default MedicalRecordView;
