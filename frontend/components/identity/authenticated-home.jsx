"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import HeartPulse from "lucide-react/dist/esm/icons/heart-pulse";
import LogOut from "lucide-react/dist/esm/icons/log-out";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Settings from "lucide-react/dist/esm/icons/settings";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import UserRound from "lucide-react/dist/esm/icons/user-round";

import { InstitutionalProfile } from "@/components/identity/institutional-profile";
import { UserAvatar } from "@/components/identity/user-avatar";
import { GuardianshipPanel } from "@/components/patient/guardianship-panel";
import { apiFetch, setActingPatient } from "@/lib/api";


const PatientDashboard = dynamic(
  () => import("@/components/patient/patient-dashboard"),
  { loading: () => <p className="home-loading">Preparando sua área de saúde…</p> },
);

const DoctorDashboard = dynamic(
  () => import("@/components/medical/doctor-dashboard"),
  { loading: () => <p className="home-loading">Preparando área profissional…</p> },
);

const AdminDashboard = dynamic(
  () => import("@/components/admin/admin-dashboard"),
  { loading: () => <p className="home-loading">Preparando área administrativa…</p> },
);

const CONTEXT_LABEL = {
  patient: "Minha saúde",
  doctor: "Área profissional",
  admin: "Administração",
};

const CONTEXT_ICON = {
  patient: HeartPulse,
  doctor: Stethoscope,
  admin: ShieldCheck,
};


function ContextSwitcher({ contexts, context, onSelect }) {
  return (
    <nav className="context-switcher" aria-label="Contexto de acesso">
      {contexts.map(({ key, label, icon: ContextIcon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={context === key}
          onClick={() => onSelect(key)}
        >
          <ContextIcon aria-hidden="true" size={17} />
          <span className="context-switcher-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}


function dependentKey(dependent) {
  return `dependent:${dependent.patient_id}`;
}


function AccountMenu({ name, avatarName, email, src, onLogout }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="account-menu-trigger"
          type="button"
          aria-label={`Conta de ${avatarName}`}
        >
          <UserAvatar name={avatarName} src={src} className="identity-avatar" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="account-menu-content"
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          <div className="account-menu-identity">
            <strong>{name}</strong>
            <span>{email}</span>
          </div>
          <DropdownMenu.Separator className="account-menu-separator" />
          <DropdownMenu.Item className="account-menu-item" asChild>
            <a href="/settings">
              <Settings aria-hidden="true" size={17} />
              Configurações
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="account-menu-separator" />
          <DropdownMenu.Item
            className="account-menu-item account-menu-logout"
            onSelect={onLogout}
          >
            <LogOut aria-hidden="true" size={17} />
            Sair da conta
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}


function redirectToLogin() {
  window.location.replace("/");
}


export function AuthenticatedHome({ onUnauthenticated = redirectToLogin }) {
  const [result, setResult] = useState({ status: "loading", data: null });
  const [selectedContext, setSelectedContext] = useState(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadIdentity() {
      setActingPatient(null);
      setResult({ status: "loading", data: null });
      try {
        const response = await apiFetch("/me");
        if (response.status === 401) {
          onUnauthenticated();
          return;
        }
        if (!response.ok) {
          throw new Error("Não foi possível carregar sua identidade.");
        }

        const data = await response.json();
        if (active) {
          setResult({ status: "ready", data });
        }
      } catch (error) {
        if (active) {
          setResult({
            status: "error",
            data: error.message || "Não foi possível carregar sua identidade.",
          });
        }
      }
    }

    loadIdentity();
    return () => {
      active = false;
    };
  }, [onUnauthenticated, requestVersion]);

  if (result.status === "loading") {
    return (
      <main className="home-state" role="status">
        <span className="document-pulse" aria-hidden="true" />
        <p>Validando sua identidade…</p>
      </main>
    );
  }

  if (result.status === "error") {
    return (
      <main className="home-state">
        <p role="alert">{result.data}</p>
        <button type="button" onClick={() => setRequestVersion((value) => value + 1)}>
          <RefreshCw aria-hidden="true" size={16} />
          Tentar novamente
        </button>
      </main>
    );
  }

  const envelope = result.data;
  const roles = envelope.user.roles;
  const dependents = roles.includes("patient") ? envelope.dependents || [] : [];
  const contexts = [
    ...roles.map((role) => ({
      key: role,
      label: CONTEXT_LABEL[role],
      icon: CONTEXT_ICON[role],
    })),
    ...dependents.map((dependent) => ({
      key: dependentKey(dependent),
      label: `Saúde de ${dependent.preferred_name}`,
      icon: UserRound,
    })),
  ];
  const activeDependent = dependents.find(
    (dependent) => dependentKey(dependent) === selectedContext,
  );
  const defaultContext = roles.includes("patient") && envelope.patient_profile
    ? "patient"
    : roles.includes("doctor")
      ? "doctor"
      : roles.includes("admin")
        ? "admin"
        : null;
  const context = activeDependent
    ? selectedContext
    : selectedContext && roles.includes(selectedContext)
      ? selectedContext
      : defaultContext;

  const contextLabel = contexts.find((item) => item.key === context)?.label;

  function selectContext(key) {
    const dependent = dependents.find((item) => dependentKey(item) === key);
    // Set before rendering so the dependent dashboard never fetches own data.
    setActingPatient(dependent ? dependent.patient_id : null);
    setSelectedContext(key);
  }
  const avatarName = context === "patient" && envelope.patient_profile
    ? envelope.patient_profile.preferred_name
    : envelope.user.display_name;
  const avatarSrc = context === "patient"
    ? envelope.patient_profile?.avatar_url
    : null;
  async function logout() {
    setActingPatient(null);
    await apiFetch("/logout", { method: "POST" });
    onUnauthenticated();
  }

  return (
    <div
      className={contexts.length > 1
        ? "authenticated-shell has-context-dock"
        : "authenticated-shell"}
    >
      <header className="identity-bar">
        <a href="/home" className="identity-brand" aria-label="Documento Unificado de Saúde">
          <span aria-hidden="true">D</span>
          <strong>DUS</strong>
        </a>

        {contexts.length === 1 ? (
          <p className="single-context">
            {contextLabel || "Nenhum perfil liberado"}
          </p>
        ) : null}

        <div className="identity-actions">
          <div className="identity-account">
            <AccountMenu
              name={envelope.user.display_name}
              avatarName={avatarName}
              email={envelope.user.email}
              src={avatarSrc}
              onLogout={() => void logout()}
            />
            <div className="identity-account-copy">
              <span>{avatarName}</span>
              <small>{contextLabel || "Identidade autenticada"}</small>
            </div>
          </div>
        </div>
      </header>

      {contexts.length > 1 && (
        <ContextSwitcher
          contexts={contexts}
          context={context}
          onSelect={selectContext}
        />
      )}

      {activeDependent ? (
        <PatientDashboard
          key={context}
          // The guardian acts for the dependent; backend enforces it per request.
          profile={{ ...activeDependent, is_adult: true }}
          onUnauthenticated={onUnauthenticated}
        />
      ) : context === "patient" ? (
        <PatientDashboard
          key="patient"
          profile={envelope.patient_profile}
          onUnauthenticated={onUnauthenticated}
          guardianshipPanel={(
            <GuardianshipPanel
              dependents={dependents}
              onChanged={() => setRequestVersion((value) => value + 1)}
              onUnauthenticated={onUnauthenticated}
            />
          )}
        />
      ) : context === "doctor" ? (
        <DoctorDashboard
          user={envelope.user}
          onUnauthenticated={onUnauthenticated}
        />
      ) : context === "admin" ? (
        <AdminDashboard
          user={envelope.user}
          onUnauthenticated={onUnauthenticated}
        />
      ) : (
        <InstitutionalProfile user={envelope.user} context={context} />
      )}
    </div>
  );
}

export default AuthenticatedHome;
