"use client";

import { useState } from "react";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import Eye from "lucide-react/dist/esm/icons/eye";
import EyeOff from "lucide-react/dist/esm/icons/eye-off";
import LockKeyhole from "lucide-react/dist/esm/icons/lock-keyhole";
import Mail from "lucide-react/dist/esm/icons/mail";

import { apiFetch } from "@/lib/api";


function redirectToHome() {
  window.location.assign("/home");
}


export function LoginForm({ onSuccess = redirectToHome }) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("username", email);
    formData.append("password", password);

    try {
      const response = await apiFetch("/login", {
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
      setIsLoading(false);
    }
  }

  return (
    <form className="access-form" onSubmit={handleSubmit} aria-busy={isLoading}>
      <div className="field-group">
        <label htmlFor="email">E-mail</label>
        <div className="field-control">
          <Mail aria-hidden="true" size={18} strokeWidth={1.8} />
          <input
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
    </form>
  );
}

export default LoginForm;
