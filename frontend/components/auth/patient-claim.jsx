"use client";

import { useEffect, useRef, useState } from "react";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import {
  CpfField,
  PasswordField,
  RegistrationField,
  RequiredFieldsNote,
  usePasswordConfirmation,
} from "@/components/auth/registration-fields";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { readFragment } from "@/lib/fragment-token";


const ERROR_MESSAGES = {
  403: "Link inválido, expirado ou dados que não conferem. Após 5 tentativas o link é bloqueado.",
  409: "Esse e-mail ou conta Google já está em uso.",
  422: "Revise os dados informados. A senha precisa ter ao menos 8 caracteres.",
};
const GENERIC_ERROR = "Não foi possível assumir a conta agora. Tente novamente.";


function redirectHome() {
  window.location.replace("/home");
}


export function PatientClaim({ googleClientId, onCompleted = redirectHome }) {
  const tokenRef = useRef(undefined);
  const [forGuardian, setForGuardian] = useState(false);
  const [status, setStatus] = useState("reading");
  const [method, setMethod] = useState("local");
  const [identity, setIdentity] = useState({
    cpf: "",
    birth_date: "",
    dependent_birth_date: "",
  });
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const passwordConfirmation = usePasswordConfirmation();

  useEffect(() => {
    if (tokenRef.current === undefined) {
      const fragment = readFragment();
      tokenRef.current = fragment.token;
      setForGuardian(fragment.params.get("for") === "guardian");
    }
    setStatus(tokenRef.current ? "ready" : "missing");
  }, []);

  async function submitClaim(path, extra) {
    setIsLoading(true);
    setError("");
    try {
      const response = await apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenRef.current,
          cpf: identity.cpf,
          birth_date: identity.birth_date,
          ...(forGuardian ? { dependent_birth_date: identity.dependent_birth_date } : {}),
          ...extra,
        }),
      });
      if (response.status === 201) {
        onCompleted();
        return;
      }
      setError(ERROR_MESSAGES[response.status] || GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsLoading(false);
    }
  }

  function updateIdentity(field) {
    return (event) => setIdentity((current) => ({ ...current, [field]: event.target.value }));
  }

  if (status === "reading") {
    return <p className="auth-method-note" role="status">Lendo link…</p>;
  }

  if (status === "missing") {
    return (
      <p className="form-error" role="alert">
        Link incompleto. Peça ao seu médico um novo link para assumir a conta.
      </p>
    );
  }

  const identityReady = identity.cpf.replace(/\D/g, "").length === 11
    && identity.birth_date
    && (!forGuardian || identity.dependent_birth_date);

  return (
    <div className="registration-flow">
      <RequiredFieldsNote />
      <div className="access-form">
        <CpfField
          id="claim-cpf"
          value={identity.cpf}
          onValueChange={(cpf) => setIdentity((current) => ({ ...current, cpf }))}
          disabled={isLoading}
        />
        <RegistrationField
          id="claim-birth-date"
          label="Data de nascimento"
          type="date"
          value={identity.birth_date}
          onChange={updateIdentity("birth_date")}
          disabled={isLoading}
        />
        {forGuardian ? (
          <RegistrationField
            id="claim-dependent-birth-date"
            label="Data de nascimento do dependente"
            type="date"
            value={identity.dependent_birth_date}
            onChange={updateIdentity("dependent_birth_date")}
            disabled={isLoading}
          />
        ) : null}
      </div>

      <div className="auth-method-switch" aria-label="Forma de acesso">
        <Button
          type="button"
          variant={method === "local" ? "default" : "ghost"}
          aria-pressed={method === "local"}
          onClick={() => setMethod("local")}
        >
          E-mail e senha
        </Button>
        <Button
          type="button"
          variant={method === "google" ? "default" : "ghost"}
          aria-pressed={method === "google"}
          onClick={() => setMethod("google")}
        >
          Conta Google
        </Button>
      </div>

      {method === "local" ? (
        <form
          className="access-form registration-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (passwordConfirmation.confirms(credentials.password)) {
              submitClaim("/auth/patient-claim/local", credentials);
            }
          }}
        >
          <RegistrationField
            id="claim-email"
            label="E-mail"
            type="email"
            autoComplete="email"
            value={credentials.email}
            onChange={(event) => setCredentials((current) => ({
              ...current,
              email: event.target.value,
            }))}
            placeholder="nome@exemplo.com"
            disabled={isLoading}
          />
          <PasswordField
            id="claim-password"
            label="Senha"
            value={credentials.password}
            onChange={(event) => {
              passwordConfirmation.clearMismatch();
              setCredentials((current) => ({
                ...current,
                password: event.target.value,
              }));
            }}
            disabled={isLoading}
          />
          <PasswordField
            id="claim-password-confirmation"
            {...passwordConfirmation.fieldProps}
            disabled={isLoading}
          />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <Button className="registration-submit" size="lg" disabled={isLoading}>
            {isLoading ? "Assumindo…" : "Assumir minha conta"}
          </Button>
        </form>
      ) : (
        <div className="google-registration-panel">
          {googleClientId ? (
            <>
              <p className="auth-method-note">
                Confirme CPF e data de nascimento acima e continue com a sua conta Google.
              </p>
              <GoogleSignInButton
                clientId={googleClientId}
                disabled={!identityReady || isLoading}
                onCredential={(credential) => submitClaim(
                  "/auth/google/patient-claim",
                  { credential },
                )}
              />
            </>
          ) : (
            <p className="auth-method-note">
              O acesso com Google não está disponível neste ambiente. Use e-mail e senha.
            </p>
          )}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

export default PatientClaim;
