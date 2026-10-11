"use client";

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
import { useRef } from "react";


export function ConfirmDialog({
  confirmLabel,
  cancelLabel = "Cancelar",
  description,
  error,
  isOpen,
  isSaving = false,
  kicker,
  onConfirm,
  onOpenChange,
  title,
  tone = "danger",
}) {
  const cancelRef = useRef(null);
  const openerRef = useRef(null);

  return (
    <AlertDialogRoot open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogPortal>
        <AlertDialogOverlay className="modal-backdrop" />
        <AlertDialogContent
          className="clinical-confirm-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            openerRef.current = document.activeElement;
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (openerRef.current?.isConnected) {
              openerRef.current.focus();
            }
          }}
        >
          {kicker ? <p className="dialog-kicker">{kicker}</p> : null}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="dialog-description">
            {description}
          </AlertDialogDescription>
          {error ? <p className="form-error dialog-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <AlertDialogCancel asChild>
              <button
                ref={cancelRef}
                className="dialog-secondary"
                type="button"
                disabled={isSaving}
              >
                {cancelLabel}
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                className={tone === "danger" ? "dialog-danger" : "dialog-primary"}
                type="button"
                disabled={isSaving}
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
              >
                {isSaving ? "Processando…" : confirmLabel}
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  );
}

export default ConfirmDialog;
