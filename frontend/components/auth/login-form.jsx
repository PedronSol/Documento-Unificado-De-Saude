"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import Eye from "lucide-react/dist/esm/icons/eye";
import EyeOff from "lucide-react/dist/esm/icons/eye-off";
import LockKeyhole from "lucide-react/dist/esm/icons/lock-keyhole";
import Mail from "lucide-react/dist/esm/icons/mail";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { apiFetch, readApiError } from "@/lib/api";


const GOOGLE_UNAVAILABLE = "O acesso com Google não está disponível neste ambiente. Use e-mail e senha.";
const GOOGLE_ERROR = "Não foi possível entrar com Google agora. Tente novamente.";
const GOOGLE_ERRORS = {
  401: "Não foi possível autenticar com Google. Tente novamente.",
  403: "Não foi possível acessar esta conta.",
  404: GOOGLE_UNAVAILABLE,
};
const GOOGLE_ONBOARDING = "Conclua seu cadastro pelo link Criar conta de paciente. "
  + "Se já possui uma conta, entre com e-mail e senha para vincular o Google nas configurações.";


function redirectToHome() {
  window.location.assign("/home");
}


function replaceWithHome() {
  window.location.replace("/home");
}


async function resolveInitialAccess() {
  try {
    const session = await apiFetch("/me");
    if (session.status === 200) {
      return { mode: "authenticated", account: null };
    }
    const remembered = await apiFetch("/auth/remembered");
    if (remembered.status === 200) {
      return { mode: "remembered", account: await remembered.json() };
    }
  } catch {
    // Sem resposta do serviço, o login completo continua disponível.
  }
  return { mode: "full", account: null };
}


export function LoginForm({
  googleClientId = "",
  onSuccess = redirectToHome,
  onAuthenticated = replaceWithHome,
}) {
  const [mode, setMode] = useState("checking");
  const [rememberedAccount, setRememberedAccount] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingMethod, setPendingMethod] = useState(null);
  const isLoading = pendingMethod !== null;
  const [error, setError] = useState("");
  const emailRef = useRef(null);
  const focusEmailRef = useRef(false);
  const authenticationPending = useRef(false);

  useEffect(() => {
    let active = true;
    resolveInitialAccess().then(({ mode: initialMode, account }) => {
      if (!active) {
        return;
      }
      if (initialMode === "authenticated") {
        onAuthenticated();
        return;
      }
      setRememberedAccount(account);
      setMode(initialMode);
    });
    return () => {
      active = false;
    };
  }, [onAuthenticated]);

  useEffect(() => {
    if (mode === "full" && focusEmailRef.current) {
      focusEmailRef.current = false;
      emailRef.current?.focus();
    }
  }, [mode]);

  async function useAnotherAccount() {
    if (authenticationPending.current) return;
    setError("");
    setPassword("");
    try {
      await apiFetch("/auth/remembered", { method: "DELETE" });
    } catch {
      // O próximo login por senha substitui o lembrete deste aparelho.
    }
    setRememberedAccount(null);
    focusEmailRef.current = true;
    setMode("full");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (authenticationPending.current) return;
    authenticationPending.current = true;
    setPendingMethod("password");
    setError("");

    const isRemembered = mode === "remembered";
    const formData = new FormData();
    if (!isRemembered) {
      formData.append("username", email);
    }
    formData.append("password", password);

    try {
      const response = await apiFetch(isRemembered ? "/login/remembered" : "/login", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json();
        setError(body.detail || "E-mail ou senha incorretos.");
        return;
      }

      await response.json();
      onSuccess();
    } catch {
      setError("Não foi possível acessar o serviço. Tente novamente.");
    } finally {
      authenticationPending.current = false;
      setPendingMethod(null);
    }
  }

  const authenticateGoogle = useCallback(async (credential) => {
    if (mode === "checking" || authenticationPending.current) return;
    authenticationPending.current = true;
    setPendingMethod("google");
    setError("");
    try {
      const response = await apiFetch("/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      if (!response.ok) {
        // readApiError leaves 401 messaging to the authentication flow.
        const failure = await readApiError(response, GOOGLE_ERROR, {
          [response.status]: GOOGLE_ERRORS[response.status] || GOOGLE_ERROR,
        });
        setError(failure.message || GOOGLE_ERRORS[401]);
        return;
      }
      const body = await response.json();
      if (body?.status === "onboarding_required") {
        setError(GOOGLE_ONBOARDING);
        return;
      }
      if (!Number.isInteger(body?.user?.user_id) || body.user.user_id <= 0) {
        throw new Error("Invalid authentication response");
      }
      onSuccess();
    } catch {
      setError(GOOGLE_ERROR);
    } finally {
      authenticationPending.current = false;
      setPendingMethod(null);
    }
  }, [mode, onSuccess]);

  if (mode === "checking") {
    return (
      <p className="access-checking" role="status">
        <i className="button-spinner" aria-hidden="true" />
        Verificando sua sessão…
      </p>
    );
  }

  return (
    <>
      <form className="access-form" onSubmit={handleSubmit} aria-busy={isLoading}>
        {mode === "remembered" ? (
          <div className="remembered-account">
            <p className="remembered-account-name">Olá, {rememberedAccount.first_name}</p>
            <p className="remembered-account-email">{rememberedAccount.masked_email}</p>
          </div>
        ) : (
          <div className="field-group">
            <label htmlFor="email">E-mail</label>
            <div className="field-control">
              <Mail aria-hidden="true" size={18} strokeWidth={1.8} />
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@exemplo.com"
                disabled={isLoading}
                required
              />
            </div>
          </div>
        )}

        <div className="field-group">
          <label htmlFor="password">Senha</label>
          <div className="field-control">
            <LockKeyhole aria-hidden="true" size={18} strokeWidth={1.8} />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              disabled={isLoading}
              required
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              disabled={isLoading}
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" size={18} />
              ) : (
                <Eye aria-hidden="true" size={18} />
              )}
            </button>
          </div>
        </div>

        {error ? (
          <p className="form-error" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}

        <button className="submit-access" type="submit" disabled={isLoading}>
          <span>{isLoading ? "Entrando…" : "Entrar"}</span>
          {isLoading ? (
            <i className="button-spinner" aria-hidden="true" />
          ) : (
            <ArrowRight aria-hidden="true" size={18} />
          )}
        </button>

        {mode === "remembered" ? (
          <button
            className="use-another-account"
            type="button"
            onClick={useAnotherAccount}
            disabled={isLoading}
          >
            Usar outra conta
          </button>
        ) : null}
      </form>
      <div className="login-google-method">
        <p className="login-method-separator">ou</p>
        {googleClientId ? (
          <GoogleSignInButton
            clientId={googleClientId}
            onCredential={authenticateGoogle}
            disabled={isLoading}
          />
        ) : (
          <p className="auth-method-note">{GOOGLE_UNAVAILABLE}</p>
        )}
        {pendingMethod === "google" ? (
          <p className="auth-method-note" role="status">Entrando com Google…</p>
        ) : null}
      </div>
    </>
  );
}

export default LoginForm;
