"use client";

import { MedicalAlerts } from "@/components/alerts/medical-alerts";
import { ResourceError, ResourceNotice } from "@/components/ui/resource-state";
import { useApiResource } from "@/hooks/use-api-resource";


export function AlertsSection({ onUnauthenticated }) {
  const alertsResource = useApiResource("/me/alerts", {
    fallback: "Não foi possível carregar seus alertas.",
    onUnauthenticated,
  });
  const alerts = alertsResource.data;

  return (
    <>
    {alertsResource.status === "loading" ? (
      <ResourceNotice
        title="Alertas médicos"
        message="Carregando alertas…"
        loading
      />
    ) : alertsResource.status === "error" ? (
      <ResourceError
        message={alertsResource.error}
        retryLabel="Recarregar alertas"
        onRetry={alertsResource.reload}
      />
    ) : alerts.length > 0 ? (
      <MedicalAlerts alerts={alerts} />
    ) : (
      <ResourceNotice
        title="Alertas médicos"
        message="Nenhum alerta médico."
      />
    )}
    </>
  );
}

export default AlertsSection;
