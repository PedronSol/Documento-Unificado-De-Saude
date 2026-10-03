import BadgeCheck from "lucide-react/dist/esm/icons/badge-check";
import Building2 from "lucide-react/dist/esm/icons/building-2";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import ShieldX from "lucide-react/dist/esm/icons/shield-x";

import { UserAvatar } from "@/components/identity/user-avatar";


const COPY = {
  doctor: {
    eyebrow: "Contexto profissional verificado",
    title: "Área profissional",
    description:
      "Sua identidade profissional está ativa. Os recursos clínicos serão disponibilizados somente em áreas autorizadas nas próximas etapas.",
    icon: BadgeCheck,
  },
  admin: {
    eyebrow: "Contexto institucional",
    title: "Administração",
    description:
      "Sua identidade administrativa está ativa. Nenhum dado clínico de paciente é carregado neste contexto.",
    icon: ShieldCheck,
  },
  unavailable: {
    eyebrow: "Identidade autenticada",
    title: "Acesso indisponível",
    description:
      "Sua identidade foi confirmada, mas nenhum contexto está autorizado para esta conta. Procure o suporte responsável pelo provisionamento.",
    icon: ShieldX,
  },
};


export function InstitutionalProfile({ user, context }) {
  const content = COPY[context] || COPY.unavailable;
  const ContextIcon = content.icon;

  return (
    <main className="institutional-main">
      <article className="institutional-credential">
        <div className="credential-topline">
          <span>DUS · IDENTIDADE DIGITAL</span>
          <ContextIcon aria-hidden="true" size={22} />
        </div>

        <div className="credential-person">
          <UserAvatar name={user.display_name} className="credential-avatar" />
          <div>
            <p className="eyebrow">{content.eyebrow}</p>
            <h1>{content.title}</h1>
            <p className="credential-name">{user.display_name}</p>
            <p className="credential-email">{user.email}</p>
          </div>
        </div>

        <div className="credential-scope">
          <Building2 aria-hidden="true" size={20} />
          <p>{content.description}</p>
        </div>

        <footer>
          <span>Identidade #{String(user.user_id).padStart(6, "0")}</span>
          <span>{context === "unavailable" ? "SEM PERFIL LIBERADO" : "ACESSO AUTORIZADO"}</span>
        </footer>
      </article>
    </main>
  );
}
