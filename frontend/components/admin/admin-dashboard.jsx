"use client";

import { useState } from "react";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";

import { AdminAudit } from "@/components/admin/admin-audit";
import { AdminDirectory } from "@/components/admin/admin-directory";
import { AdminDoctors } from "@/components/admin/admin-doctors";
import { AdminGroups } from "@/components/admin/admin-groups";


const SECTIONS = [
  ["doctors", "Médicos", AdminDoctors],
  ["groups", "Grupos", AdminGroups],
  ["directory", "Diretório", AdminDirectory],
  ["audit", "Auditoria", AdminAudit],
];


export function AdminDashboard({ user, onUnauthenticated }) {
  const [section, setSection] = useState("doctors");
  const ActiveSection = SECTIONS.find(([key]) => key === section)[2];

  return (
    <main className="admin-main">
      <section className="admin-hero">
        <div className="admin-hero-copy">
          <p className="eyebrow">Administração · sem acesso clínico</p>
          <h1>Governança administrativa</h1>
          <p>
            Olá, {user.display_name}. Gerencie médicos, grupos e vínculos sob sua
            responsabilidade. Nenhum dado clínico é carregado neste contexto.
          </p>
        </div>
        <div className="admin-hero-seal">
          <ShieldCheck aria-hidden="true" size={22} />
          <span>Escopo administrativo</span>
        </div>
      </section>

      <nav className="admin-tabs" aria-label="Seções administrativas">
        {SECTIONS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={section === key}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="admin-content">
        <ActiveSection onUnauthenticated={onUnauthenticated} />
      </div>
    </main>
  );
}

export default AdminDashboard;
