"use client";

import { useEffect, useRef, useState } from "react";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { apiFetch } from "@/lib/api";
import { readTokenFromFragment } from "@/lib/fragment-token";


const ERROR_MESSAGES = {
  403: "Convite inválido, expirado ou destinado a outro e-mail.",
  409: "Já existe uma conta com estes dados. Entre com ela, vincule o Google em Configurações e abra o link de convite novamente.",
};
const GENERIC_ERROR = "Não foi possível concluir o convite agora. Tente novamente.";


function redirectHome() {
  window.location.replace("/home");
}


export function ProfessionalInvitation({ googleClientId, onCompleted = redirectHome }) {
  const tokenRef = useRef(undefined);
  const [state, setState] = useState({ status: "reading", error: "" });

  useEffect(() => {
    if (tokenRef.current === undefined) {
      tokenRef.current = readTokenFromFragment();
    }
    setState({ status: tokenRef.current ? "ready" : "missing", error: "" });
  }, []);

  async function completeInvitation(credential) {
    setState({ status: "submitting", error: "" });
    try {
      const response = await apiFetch("/auth/google/doctor-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential,
          invitation_token: tokenRef.current,
        }),
      });
      if (response.status === 201) {
        onCompleted();
        return;
      }
      setState({
        status: "ready",
        error: ERROR_MESSAGES[response.status] || GENERIC_ERROR,
      });
    } catch {
      setState({ status: "ready", error: GENERIC_ERROR });
    }
  }

  if (state.status === "reading") {
    return <p className="auth-method-note" role="status">Lendo convite…</p>;
  }

  if (state.status === "missing") {
    return (
      <p className="form-error" role="alert">
        Link de convite incompleto. Solicite um novo link ao administrador.
      </p>
    );
  }

  return (
    <div className="professional-invitation-access">
      {googleClientId ? (
        <GoogleSignInButton
          clientId={googleClientId}
          onCredential={completeInvitation}
          disabled={state.status === "submitting"}
        />
      ) : (
        <p className="auth-method-note">
          O acesso com Google não está disponível neste ambiente. Contate o
          administrador responsável.
        </p>
      )}
      {state.status === "submitting" ? (
        <p className="auth-method-note" role="status">Concluindo convite…</p>
      ) : null}
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    </div>
  );
}

export default ProfessionalInvitation;
