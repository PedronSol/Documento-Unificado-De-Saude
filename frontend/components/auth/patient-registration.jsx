"use client";

import { useState } from "react";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";

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


const EMPTY_LOCAL_FORM = {
  email: "",
  displayName: "",
  preferredName: "",
  cpf: "",
  birthDate: "",
  password: "",
};

const EMPTY_GOOGLE_FORM = {
  cpf: "",
  preferredName: "",
  birthDate: "",
};


function redirectToHome() {
  window.location.assign("/home");
}


async function responseDetail(response, fallback) {
  try {
    const body = await response.json();
    return typeof body.detail === "string" ? body.detail : fallback;
  } catch {
    return fallback;
  }
}


export function PatientRegistration({
  googleClientId,
  onSuccess = redirectToHome,
}) {
  const [method, setMethod] = useState("local");
  const [localForm, setLocalForm] = useState(EMPTY_LOCAL_FORM);
  const [googleForm, setGoogleForm] = useState(EMPTY_GOOGLE_FORM);
  const [googleCredential, setGoogleCredential] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const passwordConfirmation = usePasswordConfirmation();

  function chooseMethod(nextMethod) {
    setMethod(nextMethod);
    setError("");
    setGoogleCredential(null);
  }

  function setLocalValue(field, value) {
    setLocalForm((current) => ({ ...current, [field]: value }));
  }

  function setGoogleValue(field, value) {
    setGoogleForm((current) => ({ ...current, [field]: value }));
  }

  function updateLocal(field) {
    return (event) => setLocalValue(field, event.target.value);
  }

  function updateGoogle(field) {
    return (event) => setGoogleValue(field, event.target.value);
  }

  async function submitLocal(event) {
    event.preventDefault();
    if (!passwordConfirmation.confirms(localForm.password)) {
      return;
    }
    setIsLoading(true);
    setError("");

    try {
      const response = await apiFetch("/auth/patient-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: localForm.email,
          password: localForm.password,
          cpf: localForm.cpf,
          display_name: localForm.displayName,
          preferred_name: localForm.preferredName,
          birth_date: localForm.birthDate,
        }),
      });
      if (!response.ok) {
        setError(await responseDetail(response, "Não foi possível criar a conta."));
        return;
      }
      await response.json();
      onSuccess();
    } catch {
      setError("Não foi possível acessar o serviço. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  async function authenticateGoogle(credential) {
    setIsLoading(true);
    setError("");
    try {
      const response = await apiFetch("/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      if (!response.ok) {
        setError(await responseDetail(response, "Credencial Google inválida."));
        return;
      }
      const body = await response.json();
      if (body.status === "onboarding_required") {
        setGoogleCredential(credential);
        return;
      }
      onSuccess();
    } catch {
      setError("Não foi possível acessar o serviço. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitGoogleOnboarding(event) {
    event.preventDefault();
    if (!googleCredential) {
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const response = await apiFetch("/auth/google/patient-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: googleCredential,
          cpf: googleForm.cpf,
          preferred_name: googleForm.preferredName,
          birth_date: googleForm.birthDate,
        }),
      });
      if (!response.ok) {
        setError(await responseDetail(response, "Não foi possível criar a conta."));
        return;
      }
      await response.json();
      setGoogleCredential(null);
      onSuccess();
    } catch {
      setError("Não foi possível acessar o serviço. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="registration-flow">
      <div className="auth-method-switch" aria-label="Forma de cadastro">
        <Button
          type="button"
          variant={method === "local" ? "default" : "ghost"}
          aria-pressed={method === "local"}
          onClick={() => chooseMethod("local")}
        >
          E-mail e senha
        </Button>
        <Button
          type="button"
          variant={method === "google" ? "default" : "ghost"}
          aria-pressed={method === "google"}
          onClick={() => chooseMethod("google")}
        >
          Conta Google
        </Button>
      </div>

      {method === "local" ? (
        <form className="access-form registration-form" onSubmit={submitLocal}>
          <RequiredFieldsNote />
          <RegistrationField
            id="registration-email"
            label="E-mail"
            type="email"
            autoComplete="email"
            value={localForm.email}
            onChange={updateLocal("email")}
            placeholder="nome@exemplo.com"
            disabled={isLoading}
          />
          <RegistrationField
            id="registration-display-name"
            label="Nome completo"
            autoComplete="name"
            value={localForm.displayName}
            onChange={updateLocal("displayName")}
            placeholder="Seu nome civil"
            disabled={isLoading}
            maxLength={100}
          />
          <RegistrationField
            id="registration-preferred-name"
            label="Como prefere ser chamado"
            autoComplete="nickname"
            value={localForm.preferredName}
            onChange={updateLocal("preferredName")}
            placeholder="Nome usado no cuidado"
            disabled={isLoading}
            maxLength={20}
          />
          <div className="registration-row">
            <CpfField
              id="registration-cpf"
              value={localForm.cpf}
              onValueChange={(value) => setLocalValue("cpf", value)}
              disabled={isLoading}
            />
            <RegistrationField
              id="registration-birth-date"
              label="Data de nascimento"
              type="date"
              autoComplete="bday"
              value={localForm.birthDate}
              onChange={updateLocal("birthDate")}
              disabled={isLoading}
            />
          </div>
          <PasswordField
            id="registration-password"
            label="Crie uma senha"
            value={localForm.password}
            onChange={(event) => {
              passwordConfirmation.clearMismatch();
              setLocalValue("password", event.target.value);
            }}
            placeholder="Mínimo de 12 caracteres"
            disabled={isLoading}
          />
          <PasswordField
            id="registration-password-confirmation"
            {...passwordConfirmation.fieldProps}
            disabled={isLoading}
          />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <Button className="registration-submit" size="lg" disabled={isLoading}>
            {isLoading ? "Criando conta…" : "Criar minha conta"}
            <ArrowRight aria-hidden="true" />
          </Button>
        </form>
      ) : (
        <div className="google-registration-panel">
          {googleCredential ? (
            <form className="access-form" onSubmit={submitGoogleOnboarding}>
              <p className="auth-method-note">
                Identidade confirmada. Complete apenas os dados necessários ao
                seu perfil de paciente.
              </p>
              <RequiredFieldsNote />
              <CpfField
                id="google-registration-cpf"
                value={googleForm.cpf}
                onValueChange={(value) => setGoogleValue("cpf", value)}
                disabled={isLoading}
              />
              <RegistrationField
                id="google-registration-preferred-name"
                label="Como prefere ser chamado"
                value={googleForm.preferredName}
                onChange={updateGoogle("preferredName")}
                placeholder="Nome usado no cuidado"
                disabled={isLoading}
                maxLength={20}
              />
              <RegistrationField
                id="google-registration-birth-date"
                label="Data de nascimento"
                type="date"
                value={googleForm.birthDate}
                onChange={updateGoogle("birthDate")}
                disabled={isLoading}
              />
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <Button className="registration-submit" size="lg" disabled={isLoading}>
                {isLoading ? "Concluindo…" : "Concluir cadastro"}
                <ArrowRight aria-hidden="true" />
              </Button>
            </form>
          ) : (
            <>
              <p className="auth-method-note">
                Use sua conta Google para entrar ou iniciar um cadastro de
                paciente. Ela nunca concede acesso médico ou administrativo.
              </p>
              <GoogleSignInButton
                clientId={googleClientId}
                onCredential={authenticateGoogle}
                disabled={isLoading}
              />
              {error ? <p className="form-error" role="alert">{error}</p> : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default PatientRegistration;
