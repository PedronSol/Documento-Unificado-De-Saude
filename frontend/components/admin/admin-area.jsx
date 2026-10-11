"use client";

import dynamic from "next/dynamic";

import { ActingPatientScope } from "@/components/shell/acting-patient-scope";
import { AreaGuard } from "@/components/shell/area-guard";
import { useSessionStore } from "@/stores/session-store";


const AdminDashboard = dynamic(
  () => import("@/components/admin/admin-dashboard"),
  { loading: () => <p className="home-loading">Preparando área administrativa…</p> },
);


function AdminHome() {
  const user = useSessionStore((state) => state.identity.user);
  const expireSession = useSessionStore((state) => state.expireSession);

  return (
    <ActingPatientScope patientId={null}>
      <AdminDashboard user={user} onUnauthenticated={expireSession} />
    </ActingPatientScope>
  );
}


export function AdminArea() {
  return (
    <AreaGuard area="admin">
      <AdminHome />
    </AreaGuard>
  );
}

export default AdminArea;
