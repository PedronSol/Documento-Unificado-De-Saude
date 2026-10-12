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
import { useEffect, useId, useRef, useState } from "react";


export function ConfirmDialog({
  acknowledgement = "",
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
  const acknowledgementId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const blocked = Boolean(acknowledgement) && !acknowledged;

  // A closed dialog never keeps a previous confirmation checked.
  useEffect(() => {
    if (!isOpen) {
      setAcknowledged(false);
    }
  }, [isOpen]);

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
          {acknowledgement ? (
            <div className="confirm-acknowledgement">
              <input
                id={acknowledgementId}
                type="checkbox"
                checked={acknowledged}
                disabled={isSaving}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <label htmlFor={acknowledgementId}>{acknowledgement}</label>
            </div>
          ) : null}
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
                disabled={isSaving || blocked}
                onClick={(event) => {
                  event.preventDefault();
                  if (!blocked) {
                    onConfirm();
                  }
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
