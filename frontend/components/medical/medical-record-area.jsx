"use client";

import { useParams } from "next/navigation";

import { MedicalRecordView } from "@/components/medical/medical-record";
import { ActingPatientScope } from "@/components/shell/acting-patient-scope";
import { AreaGuard } from "@/components/shell/area-guard";
import { useSessionStore } from "@/stores/session-store";


function MedicalRecordRoute() {
  const { patientId } = useParams();
  const expireSession = useSessionStore((state) => state.expireSession);

  return (
    <ActingPatientScope patientId={null}>
      <MedicalRecordView
        key={patientId}
        patientId={patientId}
        onUnauthenticated={expireSession}
      />
    </ActingPatientScope>
  );
}


export function MedicalRecordArea() {
  return (
    <AreaGuard area="doctor">
      <MedicalRecordRoute />
    </AreaGuard>
  );
}

export default MedicalRecordArea;
