"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";


function redirectToLogin() {
  window.location.replace("/");
}


export function SettingsPage({ onUnauthenticated = redirectToLogin }) {
  const [result, setResult] = useState({ status: "loading", profile: null });
  const [displayName, setDisplayName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const response = await apiFetch("/me");
        if (response.status === 401) {
          onUnauthenticated();
          return;
        }
        if (!response.ok) {
          throw new Error("Não foi possível carregar seus dados.");
        }
        const profile = await response.json();
        if (active) {
          setResult({ status: "ready", profile });
          setDisplayName(profile.user.display_name);
          setPreferredName(profile.patient_profile?.preferred_name || "");
        }
      } catch (error) {
        if (active) {
          setResult({
            status: "error",
            profile: error.message || "Não foi possível carregar seus dados.",
          });
        }
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [onUnauthenticated]);

  async function saveProfile(event) {
    event.preventDefault();
    setFeedback("");
    const payload = { display_name: displayName };
    if (result.profile.patient_profile) {
      payload.preferred_name = preferredName;
    }

    try {
      const response = await apiFetch("/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || "Não foi possível salvar seus dados.");
      }
      setResult({ status: "ready", profile: body });
      setDisplayName(body.user.display_name);
      setPreferredName(body.patient_profile?.preferred_name || "");
      setFeedback("Dados atualizados.");
    } catch (error) {
      setFeedback(error.message || "Não foi possível salvar seus dados.");
    }
  }

  if (result.status === "loading") {
    return <main className="settings-main" role="status">Carregando configurações…</main>;
  }

  if (result.status === "error") {
    return (
      <main className="settings-main">
        <p role="alert">{result.profile}</p>
      </main>
    );
  }

  const { user, patient_profile: patientProfile } = result.profile;

  return (
    <main className="settings-main">
      <a className="settings-back-link" href="/home">Voltar ao início</a>
      <section className="settings-card" aria-labelledby="settings-title">
        <p className="eyebrow">Minha conta</p>
        <h1 id="settings-title">Configurações</h1>
        <p className="settings-intro">
          Mantenha seus dados de identificação atualizados.
        </p>

        <form className="settings-form" onSubmit={saveProfile}>
          <label className="settings-field">
            <span>Nome de exibição</span>
            <input
              autoComplete="name"
              maxLength={100}
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>

          {patientProfile ? (
            <label className="settings-field">
              <span>Nome preferido</span>
              <input
                autoComplete="nickname"
                maxLength={20}
                required
                value={preferredName}
                onChange={(event) => setPreferredName(event.target.value)}
              />
            </label>
          ) : null}

          <label className="settings-field settings-readonly-field">
            <span>E-mail</span>
            <input aria-label="E-mail" disabled value={user.email} />
            <small>O e-mail usado para entrar não pode ser alterado aqui.</small>
          </label>

          {patientProfile ? (
            <label className="settings-field settings-readonly-field">
              <span>Nome civil</span>
              <input disabled value={patientProfile.full_name} />
              <small>Para corrigir este dado, entre em contato com o suporte.</small>
            </label>
          ) : null}

          {feedback ? (
            <p className={feedback === "Dados atualizados." ? "settings-success" : "settings-error"}
              role={feedback === "Dados atualizados." ? "status" : "alert"}
            >
              {feedback}
            </p>
          ) : null}

          <button className="settings-save" type="submit">Salvar alterações</button>
        </form>
      </section>
    </main>
  );
}
