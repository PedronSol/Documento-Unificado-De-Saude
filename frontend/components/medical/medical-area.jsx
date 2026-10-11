"use client";

import dynamic from "next/dynamic";

import { ActingPatientScope } from "@/components/shell/acting-patient-scope";
import { AreaGuard } from "@/components/shell/area-guard";
import { useSessionStore } from "@/stores/session-store";


const DoctorDashboard = dynamic(
  () => import("@/components/medical/doctor-dashboard"),
  { loading: () => <p className="home-loading">Preparando área profissional…</p> },
);


function MedicalHome() {
  const user = useSessionStore((state) => state.identity.user);
  const expireSession = useSessionStore((state) => state.expireSession);

  return (
    <ActingPatientScope patientId={null}>
      <DoctorDashboard user={user} onUnauthenticated={expireSession} />
    </ActingPatientScope>
  );
}


export function MedicalArea() {
  return (
    <AreaGuard area="doctor">
      <MedicalHome />
    </AreaGuard>
  );
}

export default MedicalArea;
