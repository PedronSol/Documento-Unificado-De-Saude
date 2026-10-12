"use client";

import { useEffect } from "react";

import { useSessionStore } from "@/stores/session-store";


// Children mount only after the acting patient matches the route, so no
// request leaves with the header of another context.
export function ActingPatientScope({ patientId, children }) {
  const actingPatientId = useSessionStore((state) => state.actingPatientId);
  const setActingPatient = useSessionStore((state) => state.setActingPatient);

  useEffect(() => {
    setActingPatient(patientId);
    return () => setActingPatient(null);
  }, [patientId, setActingPatient]);

  return actingPatientId === patientId ? children : null;
}
