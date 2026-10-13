"use client";

import Link from "next/link";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";

import { UserAvatar } from "@/components/identity/user-avatar";
import { MinorBadge } from "@/components/patient/dependent-badge";
import { Redirect } from "@/components/shell/redirect";
import {
  dependentPath,
  dependentTone,
  listDependents,
  PATIENT_PATH,
  resolveDefaultArea,
} from "@/lib/areas";
import { useSessionStore } from "@/stores/session-store";


export function DependentsList() {
  const identity = useSessionStore((state) => state.identity);
  const dependents = listDependents(identity);

  if (dependents.length === 0) {
    return <Redirect to={resolveDefaultArea(identity)} />;
  }

  return (
    <main className="patient-main dependents-main">
      <section className="dependents-section" aria-labelledby="dependents-title">
        <Link className="dependent-context-back dependents-back" href={PATIENT_PATH}>
          <ArrowLeft aria-hidden="true" size={16} />
          Voltar para minha saúde
        </Link>
        <header className="dependents-heading">
          <p className="dependents-kicker">Responsabilidade legal</p>
          <h1 id="dependents-title">Meus dependentes</h1>
          <p>Acompanhe a saúde das pessoas sob a sua guarda.</p>
        </header>

        <ul className="dependents-list" aria-label="Meus dependentes">
          {dependents.map((dependent) => (
            <li
              className="dependent-card"
              key={dependent.patient_id}
              data-patient-tone={dependentTone(dependent)}
            >
              <UserAvatar
                name={dependent.preferred_name}
                src={dependent.avatar_url}
                className="dependent-avatar"
              />
              <div className="dependent-card-copy">
                <h2>{dependent.preferred_name}</h2>
                <p className="dependent-card-name">{dependent.full_name}</p>
                <p className="dependent-card-meta">
                  <span>{dependent.age} anos</span>
                  <span>
                    {dependent.has_own_access
                      ? "Possui acesso próprio"
                      : "Sem acesso próprio"}
                  </span>
                </p>
                {dependent.is_adult ? null : <MinorBadge />}
              </div>
              <Link
                className="dependent-card-link"
                href={dependentPath(dependent.patient_id)}
              >
                Ver saúde de {dependent.preferred_name}
                <ChevronRight aria-hidden="true" size={17} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export default DependentsList;
