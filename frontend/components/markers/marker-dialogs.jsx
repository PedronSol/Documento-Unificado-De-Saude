"use client";

import { useRef } from "react";
import {
  Action as AlertDialogAction,
  Cancel as AlertDialogCancel,
  Content as AlertDialogContent,
  Description as AlertDialogDescription,
  Overlay as AlertDialogOverlay,
  Portal as AlertDialogPortal,
  Root as AlertDialogRoot,
  Title as AlertDialogTitle,
} from "@radix-ui/react-alert-dialog";
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

import { TYPE_OPTIONS } from "@/components/markers/marker-types";
import { ClinicalSelect } from "@/components/ui/clinical-select";


export function MarkerDialog({
  error,
  form,
  isEditing,
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
          className="clinical-dialog marker-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameFieldRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <header className="clinical-dialog-heading">
            <div>
              <p className="dialog-kicker">Prontuário · Resumo ativo</p>
              <DialogTitle asChild>
                <h2>{isEditing ? "Editar marcador" : "Adicionar marcador"}</h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="dialog-description">
                  Registre apenas informações que ajudam a representar seu
                  estado de saúde atual.
                </p>
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button
                className="dialog-close"
                type="button"
                aria-label="Fechar formulário de marcador"
                disabled={isSaving}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </DialogClose>
          </header>

          <form onSubmit={onSubmit}>
            <div className="dialog-field">
              <label htmlFor="marker-name">Nome do marcador</label>
              <input
                ref={nameFieldRef}
                id="marker-name"
                name="name"
                value={form.name}
                onChange={onFieldChange}
                placeholder="Ex.: Hipertensão"
                autoComplete="off"
                maxLength={120}
                required
              />
            </div>

            <div className="dialog-field">
              <label htmlFor="marker-type">Tipo</label>
              <ClinicalSelect
                id="marker-type"
                name="type"
                value={form.type}
                onValueChange={(value) => onFieldChange({
                  target: { name: "type", value },
                })}
                options={TYPE_OPTIONS}
              />
            </div>

            {form.type === "medication" ? (
              <div className="dialog-row marker-medication-fields">
                <div className="dialog-field">
                  <label htmlFor="marker-dosage">Dosagem</label>
                  <input
                    id="marker-dosage"
                    name="dosage"
                    value={form.dosage}
                    onChange={onFieldChange}
                    placeholder="Ex.: 50 mg"
                    maxLength={100}
                  />
                </div>
                <div className="dialog-field">
                  <label htmlFor="marker-frequency">Frequência</label>
                  <input
                    id="marker-frequency"
                    name="frequency"
                    value={form.frequency}
                    onChange={onFieldChange}
                    placeholder="Ex.: 1 vez ao dia"
                    maxLength={100}
                  />
                </div>
              </div>
            ) : null}

            <div className="dialog-field">
              <label htmlFor="marker-description">Observação</label>
              <textarea
                id="marker-description"
                name="description"
                value={form.description}
                onChange={onFieldChange}
                placeholder="Contexto clínico relevante, se necessário"
                maxLength={500}
                rows={4}
              />
            </div>

            {error ? (
              <p className="form-error dialog-error" role="alert">
                {error}
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
                  : isEditing
                    ? "Salvar alterações"
                    : "Adicionar marcador"}
              </button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}

export function RemoveMarkerDialog({
  error,
  isOpen,
  isRemoving,
  marker,
  onConfirm,
  onOpenChange,
  returnFocusRef,
  variant,
}) {
  const cancelRef = useRef(null);
  const isSuspension = variant === "medical" && marker?.type === "medication";

  return (
    <AlertDialogRoot open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogPortal>
        <AlertDialogOverlay className="modal-backdrop" />
        <AlertDialogContent
          className="clinical-confirm-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <p className="dialog-kicker">Preservação de histórico</p>
          <AlertDialogTitle>
            {isSuspension ? "Suspender medicação" : "Remover marcador"}
          </AlertDialogTitle>
          <AlertDialogDescription className="dialog-description">
            {marker
              ? `${marker.name} ${isSuspension ? "será suspensa" : "sairá do resumo ativo"} e permanecerá no histórico.`
              : "O marcador sairá do resumo ativo e permanecerá no histórico."}
          </AlertDialogDescription>
          {error ? (
            <p className="form-error dialog-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="dialog-actions">
            <AlertDialogCancel asChild>
              <button
                ref={cancelRef}
                className="dialog-secondary"
                type="button"
                disabled={isRemoving}
              >
                {isSuspension ? "Cancelar suspensão" : "Cancelar remoção"}
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                className="dialog-danger"
                type="button"
                disabled={isRemoving}
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
              >
                {isRemoving
                  ? isSuspension ? "Suspendendo…" : "Removendo…"
                  : isSuspension ? "Suspender medicação" : "Remover do resumo"}
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  );
}
