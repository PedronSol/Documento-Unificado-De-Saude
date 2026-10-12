"use client";

import dynamic from "next/dynamic";

import { GuardianshipPanel } from "@/components/patient/guardianship-panel";
import { MyGuardiansPanel } from "@/components/patient/my-guardians-panel";
import { ActingPatientScope } from "@/components/shell/acting-patient-scope";
import { AreaGuard } from "@/components/shell/area-guard";
import { listDependents } from "@/lib/areas";
import { useSessionStore } from "@/stores/session-store";


export const PatientDashboard = dynamic(
  () => import("@/components/patient/patient-dashboard"),
  { loading: () => <p className="home-loading">Preparando sua área de saúde…</p> },
);


function OwnPatientHome() {
  const identity = useSessionStore((state) => state.identity);
  const refreshIdentity = useSessionStore((state) => state.refreshIdentity);
  const expireSession = useSessionStore((state) => state.expireSession);

  return (
    <ActingPatientScope patientId={null}>
      <PatientDashboard
        profile={identity.patient_profile}
        onUnauthenticated={expireSession}
        guardianshipPanel={(
          <>
            <GuardianshipPanel
              dependents={listDependents(identity)}
              onChanged={refreshIdentity}
              onUnauthenticated={expireSession}
            />
            <MyGuardiansPanel
              isAdult={identity.patient_profile.is_adult}
              onUnauthenticated={expireSession}
            />
          </>
        )}
      />
    </ActingPatientScope>
  );
}


export function PatientArea() {
  return (
    <AreaGuard area="patient">
      <OwnPatientHome />
    </AreaGuard>
  );
}

export default PatientArea;
