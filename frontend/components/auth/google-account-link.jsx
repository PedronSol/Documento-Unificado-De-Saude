"use client";

import { useState } from "react";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { apiFetch } from "@/lib/api";


export function GoogleAccountLink({ googleClientId }) {
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");

  async function linkCredential(credential) {
    setStatus("loading");
    setFeedback("");
    try {
      const response = await apiFetch("/me/external-identities/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : "Não foi possível vincular a conta Google.",
        );
      }
      setStatus("linked");
      setFeedback("Conta Google vinculada.");
    } catch (error) {
      setStatus("idle");
      setFeedback(
        error.message || "Não foi possível vincular a conta Google.",
      );
    }
  }

  return (
    <section className="settings-google" aria-labelledby="settings-google-title">
      <div>
        <h2 id="settings-google-title">Conta Google</h2>
        <p>
          Vincule uma conta somente se quiser usá-la como outra forma de entrar.
          Seu acesso por e-mail e senha continuará funcionando.
        </p>
      </div>
      {status === "linked" ? null : (
        <GoogleSignInButton
          clientId={googleClientId}
          onCredential={linkCredential}
          disabled={status === "loading"}
        />
      )}
      {feedback ? (
        <p
          className={status === "linked" ? "settings-success" : "settings-error"}
          role={status === "linked" ? "status" : "alert"}
        >
          {feedback}
        </p>
      ) : null}
    </section>
  );
}

export default GoogleAccountLink;
