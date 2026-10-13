"use client";

import { useState } from "react";
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
import { apiFetch, readApiError } from "@/lib/api";


const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const BLOOD_TYPE_OPTIONS = BLOOD_TYPES.map((value) => ({ value, label: value }));
const SAVE_ERROR = "Não foi possível salvar o tipo sanguíneo.";


// Shared by the patient summary and the medical record (spec 042). Callers
// remount it per opening (key) so each opening starts from the stored value.
export function BloodTypeDialog({
  currentValue,
  endpoint,
  isOpen,
  onOpenChange,
  onSaved,
  onUnauthenticated,
  returnFocusRef,
  selfDeclared = true,
}) {
  const [selected, setSelected] = useState(currentValue || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const isChange = Boolean(currentValue);

  async function submit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const response = await apiFetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blood_type: selected }),
      });
      if (!response.ok) {
        const { status, message } = await readApiError(response, SAVE_ERROR);
        if (status === 401) {
          onUnauthenticated();
          return;
        }
        setError(message);
        return;
      }
      onSaved(await response.json());
      onOpenChange(false);
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <DialogRoot open={isOpen} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="modal-backdrop" />
        <DialogContent
          className="clinical-dialog blood-type-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <header className="clinical-dialog-heading">
            <div>
              <p className="dialog-kicker">Resumo clínico</p>
              <DialogTitle asChild>
                <h2>{isChange ? "Alterar tipo sanguíneo" : "Informar tipo sanguíneo"}</h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="dialog-description">
                  {selfDeclared
                    ? "O tipo sanguíneo deve vir de um exame ou documento confiável. "
                      + "O médico responsável pode confirmá-lo ou corrigi-lo."
                    : "Registre o tipo sanguíneo confirmado por exame. "
                      + "O registro profissional prevalece sobre o autodeclarado."}
                </p>
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button
                className="dialog-close"
                type="button"
                aria-label="Fechar formulário de tipo sanguíneo"
                disabled={isSaving}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </DialogClose>
          </header>

          <form onSubmit={submit}>
            {isChange ? (
              <p className="blood-type-current">Valor atual: {currentValue}</p>
            ) : null}
            <div className="dialog-field">
              <label htmlFor="blood-type-value">Tipo sanguíneo</label>
              <ClinicalSelect
                id="blood-type-value"
                name="blood_type"
                value={selected}
                onValueChange={setSelected}
                options={BLOOD_TYPE_OPTIONS}
                placeholder="Selecione"
                required
              />
            </div>

            {error ? (
              <p className="form-error dialog-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="dialog-actions">
              <DialogClose asChild>
                <button className="dialog-secondary" type="button" disabled={isSaving}>
                  Cancelar
                </button>
              </DialogClose>
              <button
                className="dialog-primary"
                type="submit"
                disabled={isSaving || !selected || selected === currentValue}
              >
                {isSaving
                  ? "Salvando…"
                  : isChange
                    ? "Confirmar alteração"
                    : "Salvar tipo sanguíneo"}
              </button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
