"use client";

import { MedicalAlerts } from "@/components/alerts/medical-alerts";
import { PaginatedList } from "@/components/ui/paginated-list";
import { usePaginatedList } from "@/hooks/use-paginated-list";


const SEVERITY_OPTIONS = [
  { value: "high", label: "Alta" },
  { value: "medium", label: "Média" },
  { value: "low", label: "Baixa" },
];


export function AlertsSection({ onUnauthenticated }) {
  const list = usePaginatedList("/me/alerts", {
    fallback: "Não foi possível carregar seus alertas.",
    initialFilters: { severity: "" },
    onUnauthenticated,
  });

  return (
    <section className="clinical-section alerts-section" aria-labelledby="alerts-title">
      <header>
        <h2 id="alerts-title">Alertas médicos</h2>
      </header>
      <PaginatedList
        list={list}
        searchLabel="Buscar alertas"
        filters={[{
          id: "alert-severity-filter",
          label: "Severidade",
          value: list.filters.severity,
          onChange: (value) => list.setFilter("severity", value),
          options: SEVERITY_OPTIONS,
        }]}
        itemLabel="alertas"
        loadingText="Carregando alertas…"
        emptyText="Nenhum alerta médico."
        retryLabel="Recarregar alertas"
        renderItems={(items) => <MedicalAlerts alerts={items} withHeader={false} />}
      />
    </section>
  );
}

export default AlertsSection;
