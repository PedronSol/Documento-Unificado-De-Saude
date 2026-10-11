"use client";

import { useCallback, useEffect, useRef } from "react";
import Script from "next/script";


export function GoogleSignInButton({ clientId, onCredential, disabled = false }) {
  const buttonContainer = useRef(null);

  const renderButton = useCallback(() => {
    if (!clientId || !buttonContainer.current || !window.google?.accounts?.id) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => {
        if (credential) {
          onCredential(credential);
        }
      },
    });
    buttonContainer.current.replaceChildren();
    window.google.accounts.id.renderButton(buttonContainer.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      width: Math.min(buttonContainer.current.clientWidth || 320, 400),
      locale: "pt-BR",
    });
  }, [clientId, onCredential]);

  useEffect(() => {
    renderButton();
  }, [renderButton]);

  if (!clientId) {
    return (
      <p className="auth-method-note">
        O acesso com Google não está configurado neste ambiente. Você ainda pode
        criar uma conta com e-mail e senha.
      </p>
    );
  }

  return (
    <div
      className="google-auth-control"
      aria-disabled={disabled}
      inert={disabled || undefined}
    >
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={renderButton}
      />
      <div ref={buttonContainer} />
      {disabled ? <span className="google-auth-blocker" aria-hidden="true" /> : null}
    </div>
  );
}

export default GoogleSignInButton;
