"use client";

import { useState } from "react";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
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


export function RegistrationField({
  id,
  label,
  type = "text",
  autoComplete,
  value,
  onChange,
  placeholder,
  disabled,
  minLength,
  maxLength,
  inputMode,
}) {
  return (
    <div className="field-group">
      <label htmlFor={id}>{label}</label>
      <div className="field-control registration-field-control">
        <input
          id={id}
          name={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          minLength={minLength}
          maxLength={maxLength}
          inputMode={inputMode}
          required
        />
      </div>
    </div>
  );
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

  function chooseMethod(nextMethod) {
    setMethod(nextMethod);
    setError("");
    setGoogleCredential(null);
  }

  function updateLocal(field) {
    return (event) => {
      const value = event.target.value;
      setLocalForm((current) => ({ ...current, [field]: value }));
    };
  }

  function updateGoogle(field) {
    return (event) => {
      const value = event.target.value;
      setGoogleForm((current) => ({ ...current, [field]: value }));
    };
  }

  async function submitLocal(event) {
    event.preventDefault();
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
            <RegistrationField
              id="registration-cpf"
              label="CPF"
              inputMode="numeric"
              autoComplete="off"
              value={localForm.cpf}
              onChange={updateLocal("cpf")}
              placeholder="000.000.000-00"
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
          <RegistrationField
            id="registration-password"
            label="Crie uma senha"
            type="password"
            autoComplete="new-password"
            value={localForm.password}
            onChange={updateLocal("password")}
            placeholder="Mínimo de 12 caracteres"
            disabled={isLoading}
            minLength={12}
            maxLength={128}
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
              <RegistrationField
                id="google-registration-cpf"
                label="CPF"
                value={googleForm.cpf}
                onChange={updateGoogle("cpf")}
                placeholder="000.000.000-00"
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
