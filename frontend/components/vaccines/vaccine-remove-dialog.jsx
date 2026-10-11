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


export function VaccineRemoveDialog({
  error,
  isOpen,
  isRemoving,
  onConfirm,
  onOpenChange,
  returnFocusRef,
  vaccine,
}) {
  const cancelRef = useRef(null);

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
          <p className="dialog-kicker">Prontuário · Imunização</p>
          <AlertDialogTitle>Remover vacina</AlertDialogTitle>
          <AlertDialogDescription className="dialog-description">
            {vaccine
              ? `${vaccine.name} será removida do histórico de vacinação.`
              : "A vacina será removida do histórico de vacinação."}
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
                Cancelar remoção da vacina
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
                {isRemoving ? "Removendo…" : "Remover vacina"}
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  );
}
