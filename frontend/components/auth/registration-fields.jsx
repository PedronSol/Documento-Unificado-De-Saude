"use client";

import { useRef, useState } from "react";
import Eye from "lucide-react/dist/esm/icons/eye";
import EyeOff from "lucide-react/dist/esm/icons/eye-off";

import { formatCpf } from "@/lib/cpf";


const PASSWORD_MISMATCH = "As senhas não coincidem.";


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
  required = true,
  ref,
  trailing,
  error,
}) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="field-group">
      <span className="field-label">
        <label htmlFor={id}>{label}</label>
        {required ? (
          <span className="required-mark" aria-hidden="true">*</span>
        ) : null}
      </span>
      <div className="field-control registration-field-control">
        <input
          ref={ref}
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
          required={required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={errorId}
        />
        {trailing}
      </div>
      {error ? <p id={errorId} className="field-error">{error}</p> : null}
    </div>
  );
}


export function CpfField({ id, value, onValueChange, disabled }) {
  return (
    <RegistrationField
      id={id}
      label="CPF"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(event) => onValueChange(formatCpf(event.target.value))}
      placeholder="000.000.000-00"
      disabled={disabled}
      maxLength={14}
    />
  );
}


export function RequiredFieldsNote() {
  return (
    <p className="required-fields-note">
      Campos marcados com * são obrigatórios.
    </p>
  );
}


export function PasswordField({ toggleLabel = "Mostrar senha", ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <RegistrationField
      {...props}
      type={visible ? "text" : "password"}
      autoComplete="new-password"
      minLength={12}
      maxLength={128}
      trailing={(
        <button
          className="password-toggle registration-password-toggle"
          type="button"
          aria-label={toggleLabel}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          disabled={props.disabled}
        >
          {visible ? (
            <EyeOff aria-hidden="true" size={18} />
          ) : (
            <Eye aria-hidden="true" size={18} />
          )}
        </button>
      )}
    />
  );
}


export function usePasswordConfirmation() {
  const confirmationRef = useRef(null);
  const [confirmation, setConfirmation] = useState("");
  const [mismatch, setMismatch] = useState(false);

  function confirms(password) {
    if (password === confirmation) {
      return true;
    }
    setMismatch(true);
    confirmationRef.current?.focus();
    return false;
  }

  return {
    confirms,
    clearMismatch: () => setMismatch(false),
    fieldProps: {
      ref: confirmationRef,
      label: "Confirme a senha",
      toggleLabel: "Mostrar confirmação de senha",
      value: confirmation,
      onChange: (event) => {
        setConfirmation(event.target.value);
        setMismatch(false);
      },
      error: mismatch ? PASSWORD_MISMATCH : undefined,
    },
  };
}
