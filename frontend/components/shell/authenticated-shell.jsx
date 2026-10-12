"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";

import { AccountMenu } from "@/components/shell/account-menu";
import { ContextSwitcher } from "@/components/shell/context-switcher";
import { apiFetch } from "@/lib/api";
import { contextKeyForPath, listContexts } from "@/lib/areas";
import { useSessionStore } from "@/stores/session-store";


function redirectToLogin() {
  window.location.replace("/");
}


function ShellState({ status, error, onRetry }) {
  if (status === "error") {
    return (
      <main className="home-state">
        <p role="alert">{error}</p>
        <button type="button" onClick={onRetry}>
          <RefreshCw aria-hidden="true" size={16} />
          Tentar novamente
        </button>
      </main>
    );
  }
  return (
    <main className="home-state" role="status">
      <span className="document-pulse" aria-hidden="true" />
      <p>Validando sua identidade…</p>
    </main>
  );
}


export function AuthenticatedShell({ children, onUnauthenticated = redirectToLogin }) {
  const pathname = usePathname();
  const status = useSessionStore((state) => state.status);
  const identity = useSessionStore((state) => state.identity);
  const error = useSessionStore((state) => state.error);
  const loadIdentity = useSessionStore((state) => state.loadIdentity);
  const expireSession = useSessionStore((state) => state.expireSession);
  const setActingPatient = useSessionStore((state) => state.setActingPatient);

  useEffect(() => {
    loadIdentity();
  }, [loadIdentity]);

  useEffect(() => {
    if (status === "unauthenticated") {
      onUnauthenticated();
    }
  }, [status, onUnauthenticated]);

  if (status !== "ready") {
    return <ShellState status={status} error={error} onRetry={loadIdentity} />;
  }

  const contexts = listContexts(identity);
  const activeKey = contextKeyForPath(pathname);
  const activeLabel = contexts.find(({ key }) => key === activeKey)?.label;
  const ownPatientContext = activeKey === "patient" && identity.patient_profile;
  const avatarName = ownPatientContext
    ? identity.patient_profile.preferred_name
    : identity.user.display_name;

  async function logout() {
    setActingPatient(null);
    try {
      await apiFetch("/logout", { method: "POST" });
    } finally {
      expireSession();
    }
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
          <p className="single-context">{contexts[0].label}</p>
        ) : null}

        <div className="identity-actions">
          <div className="identity-account">
            <AccountMenu
              name={identity.user.display_name}
              avatarName={avatarName}
              email={identity.user.email}
              src={ownPatientContext ? identity.patient_profile.avatar_url : null}
              onLogout={() => void logout()}
            />
            <div className="identity-account-copy">
              <span>{avatarName}</span>
              <small>{activeLabel || "Identidade autenticada"}</small>
            </div>
          </div>
        </div>
      </header>

      {contexts.length > 1 ? (
        <ContextSwitcher contexts={contexts} activeKey={activeKey} />
      ) : null}

      {children}
    </div>
  );
}

export default AuthenticatedShell;
