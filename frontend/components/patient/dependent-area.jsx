"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";

import { MinorBadge } from "@/components/patient/dependent-badge";
import { PatientDashboard } from "@/components/patient/patient-area";
import { ActingPatientScope } from "@/components/shell/acting-patient-scope";
import { Redirect } from "@/components/shell/redirect";
import {
  DEPENDENTS_PATH,
  dependentTone,
  findDependent,
  resolveDefaultArea,
} from "@/lib/areas";
import { useSessionStore } from "@/stores/session-store";


function DependentContextBanner({ dependent }) {
  const name = dependent.preferred_name;
  return (
    <section
      className="dependent-context-banner"
      aria-label={`Você está vendo a saúde de ${name}`}
    >
      <div className="dependent-context-copy">
        <p>
          Você está vendo a saúde de <strong>{name}</strong>
          <span className="dependent-context-age"> · {dependent.age} anos</span>
        </p>
        {dependent.is_adult ? null : <MinorBadge />}
      </div>
      <Link className="dependent-context-back" href={DEPENDENTS_PATH}>
        <ArrowLeft aria-hidden="true" size={16} />
        Voltar aos meus dependentes
      </Link>
    </section>
  );
}


export function DependentArea() {
  const { patientId } = useParams();
  const identity = useSessionStore((state) => state.identity);
  const expireSession = useSessionStore((state) => state.expireSession);
  const refreshIdentity = useSessionStore((state) => state.refreshIdentity);
  const dependent = findDependent(identity, patientId);

  if (!dependent) {
    return <Redirect to={resolveDefaultArea(identity)} />;
  }

  return (
    <ActingPatientScope key={dependent.patient_id} patientId={dependent.patient_id}>
      <div className="dependent-area" data-patient-tone={dependentTone(dependent)}>
        <DependentContextBanner dependent={dependent} />
        <PatientDashboard
          // The guardian acts for the dependent; backend enforces it per request.
          profile={{ ...dependent, is_adult: true }}
          context="dependent"
          onUnauthenticated={expireSession}
          onProfileChanged={refreshIdentity}
        />
      </div>
    </ActingPatientScope>
  );
}

export default DependentArea;
