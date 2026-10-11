"use client";

import { useRef } from "react";
import {
  Close as DialogClose,
  Content as DialogContent,
  Description as DialogDescription,
  Overlay as DialogOverlay,
  Portal as DialogPortal,
  Root as DialogRoot,
  Title as DialogTitle,
} from "@radix-ui/react-dialog";
import X from "lucide-react/dist/esm/icons/x";

import { ClinicalSelect } from "@/components/ui/clinical-select";


export const EMPTY_VACCINE_FORM = {
  name: "",
  dose: "",
  administered_on: "",
  status: "applied",
};

const VACCINE_STATUS_OPTIONS = [
  { value: "applied", label: "Aplicada" },
  { value: "pending", label: "Pendente" },
  { value: "overdue", label: "Atrasada" },
];

export function VaccineDialog({
  actionError,
  editingId,
  form,
  isOpen,
  isSaving,
  onFieldChange,
  onOpenChange,
  onSubmit,
  returnFocusRef,
}) {
  const nameFieldRef = useRef(null);

  return (
    <DialogRoot open={isOpen} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="modal-backdrop" />
        <DialogContent
          className="clinical-dialog vaccine-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameFieldRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <header className="clinical-dialog-heading vaccine-dialog-heading">
            <div>
              <p className="dialog-kicker">Prontuário · Imunização</p>
              <DialogTitle asChild>
                <h2>{editingId ? "Editar vacina" : "Registrar vacina"}</h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="dialog-description">
                  {editingId
                    ? "Revise os dados registrados na sua linha do tempo clínica."
                    : "Inclua uma dose recebida ou acompanhe uma aplicação pendente."}
                </p>
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button
                className="dialog-close"
                type="button"
                aria-label="Fechar formulário de vacina"
                disabled={isSaving}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </DialogClose>
          </header>

          <form onSubmit={onSubmit}>
            <div className="dialog-field">
              <label htmlFor="vaccine-name">Nome da vacina</label>
              <input
                ref={nameFieldRef}
                id="vaccine-name"
                name="name"
                value={form.name}
                onChange={onFieldChange}
                placeholder="Ex.: Influenza tetravalente"
                autoComplete="off"
                required
              />
            </div>

            <div className="dialog-field">
              <label htmlFor="vaccine-dose">Dose</label>
              <input
                id="vaccine-dose"
                name="dose"
                value={form.dose}
                onChange={onFieldChange}
                placeholder="Ex.: Dose anual"
                autoComplete="off"
                required
              />
            </div>

            <div className="dialog-row">
              <div className="dialog-field">
                <label htmlFor="vaccine-status">Status</label>
                <ClinicalSelect
                  id="vaccine-status"
                  name="status"
                  value={form.status}
                  onValueChange={(value) => onFieldChange({
                    target: { name: "status", value },
                  })}
                  options={VACCINE_STATUS_OPTIONS}
                />
              </div>
              <div className="dialog-field">
                <label htmlFor="vaccine-date">Data de aplicação</label>
                <input
                  id="vaccine-date"
                  name="administered_on"
                  type="date"
                  value={form.administered_on}
                  onChange={onFieldChange}
                  disabled={form.status !== "applied"}
                  required={form.status === "applied"}
                />
              </div>
            </div>

            {actionError ? (
              <p className="form-error dialog-error" role="alert">
                {actionError}
              </p>
            ) : null}

            <div className="dialog-actions">
              <DialogClose asChild>
                <button
                  className="dialog-secondary"
                  type="button"
                  disabled={isSaving}
                >
                  Cancelar
                </button>
              </DialogClose>
              <button
                className="dialog-primary"
                type="submit"
                disabled={isSaving}
              >
                {isSaving
                  ? "Salvando…"
                  : editingId
                    ? "Salvar alterações"
                    : "Registrar vacina"}
              </button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
