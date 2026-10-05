"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import LogOut from "lucide-react/dist/esm/icons/log-out";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";

import { InstitutionalProfile } from "@/components/identity/institutional-profile";
import { UserAvatar } from "@/components/identity/user-avatar";
import { apiFetch } from "@/lib/api";


const PatientDashboard = dynamic(
  () => import("@/components/patient/patient-dashboard"),
  { loading: () => <p className="home-loading">Preparando sua área de saúde…</p> },
);

const CONTEXT_LABEL = {
  patient: "Minha saúde",
  doctor: "Área profissional",
  admin: "Administração",
};


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
  const defaultContext = roles.includes("patient") && envelope.patient_profile
    ? "patient"
    : roles.includes("doctor")
      ? "doctor"
      : roles.includes("admin")
        ? "admin"
        : null;
  const context = selectedContext && roles.includes(selectedContext)
    ? selectedContext
    : defaultContext;
  const avatarName = context === "patient" && envelope.patient_profile
    ? envelope.patient_profile.preferred_name
    : envelope.user.display_name;
  const avatarSrc = context === "patient"
    ? envelope.patient_profile?.avatar_url
    : null;

  async function logout() {
    await apiFetch("/logout", { method: "POST" });
    onUnauthenticated();
  }

  return (
    <div className="authenticated-shell">
      <header className="identity-bar">
        <a href="/home" className="identity-brand" aria-label="Documento Unificado de Saúde">
          <span aria-hidden="true">D</span>
          <strong>DUS</strong>
        </a>

        {roles.length > 1 ? (
          <nav className="context-switcher" aria-label="Contexto de acesso">
            {roles.map((role) => (
              <button
                key={role}
                type="button"
                aria-pressed={context === role}
                onClick={() => setSelectedContext(role)}
              >
                {CONTEXT_LABEL[role]}
              </button>
            ))}
          </nav>
        ) : (
          <p className="single-context">
            {context ? CONTEXT_LABEL[context] : "Nenhum perfil liberado"}
          </p>
        )}

        <div className="identity-actions">
          <div className="identity-account">
            <UserAvatar
              name={avatarName}
              src={avatarSrc}
              className="identity-avatar"
            />
            <div className="identity-account-copy">
              <span>{avatarName}</span>
              <small>{context ? CONTEXT_LABEL[context] : "Identidade autenticada"}</small>
            </div>
          </div>
          <button className="logout-action" type="button" onClick={logout}>
            <LogOut aria-hidden="true" size={16} />
            Sair
          </button>
        </div>
      </header>

      {context === "patient" ? (
        <PatientDashboard
          profile={envelope.patient_profile}
          onUnauthenticated={onUnauthenticated}
        />
      ) : (
        <InstitutionalProfile user={envelope.user} context={context} />
      )}
    </div>
  );
}

export default AuthenticatedHome;
