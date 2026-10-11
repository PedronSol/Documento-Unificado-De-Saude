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
import Check from "lucide-react/dist/esm/icons/check";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import Copy from "lucide-react/dist/esm/icons/copy";
import QrCode from "lucide-react/dist/esm/icons/qr-code";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useApiResource } from "@/hooks/use-api-resource";
import { apiFetch, readApiError } from "@/lib/api";


function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRemaining(expiresAt, now) {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - now) / 1000),
  );
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function ShareConfirmationDialog({
  action,
  error,
  isOpen,
  isSaving,
  mode,
  onConfirm,
  onOpenChange,
  returnFocusRef,
}) {
  const cancelRef = useRef(null);
  const replacing = mode === "replace";

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
          <p className="dialog-kicker">Privacidade · Resumo clínico</p>
          <AlertDialogTitle>
            {replacing ? "Gerar novo acesso temporário" : "Revogar acesso temporário"}
          </AlertDialogTitle>
          <AlertDialogDescription className="dialog-description">
            {replacing
              ? "O QR-Code atual deixará de funcionar assim que o novo acesso for criado."
              : "O QR-Code e o link atuais deixarão de funcionar imediatamente."}
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
                {replacing ? "Cancelar" : "Manter acesso"}
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                className={replacing ? "dialog-primary" : "dialog-danger"}
                type="button"
                disabled={isSaving}
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
              >
                {isSaving ? "Processando…" : action}
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  );
}

const LOAD_ERROR = "Não foi possível consultar o acesso temporário.";
const GENERATE_ERROR = "Não foi possível gerar o acesso temporário.";
const REVOKE_ERROR = "Não foi possível revogar o acesso temporário.";

export function HealthSharing({ isAdult, onUnauthenticated }) {
  const resource = useApiResource(isAdult ? "/me/shares/active" : null, {
    fallback: LOAD_ERROR,
    initialData: null,
    onUnauthenticated,
  });
  const [shareUrl, setShareUrl] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [dialogMode, setDialogMode] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const dialogTriggerRef = useRef(null);

  const active = resource.data;

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  function showGenerateError(message) {
    if (dialogMode) {
      setDialogError(message);
    } else {
      setActionError(message);
    }
  }

  async function generateShare() {
    setIsSaving(true);
    setDialogError("");
    setFeedback("");
    setActionError("");
    try {
      const response = await apiFetch("/me/shares", { method: "POST" });
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        showGenerateError((await readApiError(response, GENERATE_ERROR)).message);
        return;
      }
      const created = await response.json();
      resource.updateData(created);
      setShareUrl(created.share_url);
      setActionError("");
      setNow(Date.now());
      setDialogMode(null);
    } catch {
      showGenerateError(GENERATE_ERROR);
    } finally {
      setIsSaving(false);
    }
  }

  async function revokeShare() {
    setIsSaving(true);
    setDialogError("");
    try {
      const response = await apiFetch(`/me/shares/${active.share_id}`, {
        method: "DELETE",
      });
      if (response.status === 401) {
        onUnauthenticated();
        return;
      }
      if (!response.ok) {
        setDialogError((await readApiError(response, REVOKE_ERROR)).message);
        return;
      }
      resource.updateData(null);
      setShareUrl(null);
      setActionError("");
      setDialogMode(null);
      setFeedback("Acesso revogado.");
    } catch {
      setDialogError(REVOKE_ERROR);
    } finally {
      setIsSaving(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setFeedback("Link copiado com segurança.");
    } catch {
      setFeedback("Não foi possível copiar. Tente novamente.");
    }
  }

  function openDialog(mode, event) {
    dialogTriggerRef.current = event.currentTarget;
    setDialogError("");
    setDialogMode(mode);
  }

  if (!isAdult) {
    return (
      <Card className="health-share-card">
        <CardHeader>
          <CardTitle><h2>Compartilhar resumo</h2></CardTitle>
          <CardDescription>
            O compartilhamento está disponível apenas para pacientes adultos.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const remaining = active ? formatRemaining(active.expires_at, now) : null;

  return (
    <>
      <Card className="health-share-card">
        <CardHeader>
          <div>
            <p className="eyebrow">Acesso em consulta</p>
            <CardTitle><h2>Compartilhar resumo</h2></CardTitle>
            <CardDescription>
              Crie um acesso de duas horas apenas com seu nome de preferência,
              tipo sanguíneo e marcadores ativos.
            </CardDescription>
          </div>
          <CardAction>
            <span className="health-share-seal" aria-hidden="true">
              <ShieldCheck size={22} />
            </span>
          </CardAction>
        </CardHeader>
        <CardContent>
          {resource.status === "loading" ? (
            <p className="health-share-state" role="status">Consultando acesso temporário…</p>
          ) : null}

          {resource.status === "error" ? (
            <div className="health-share-state health-share-error" role="alert">
              <p>{resource.error}</p>
              <Button variant="outline" onClick={resource.reload}>
                Tentar novamente
              </Button>
            </div>
          ) : null}

          {actionError ? (
            <p className="form-error health-share-action-error" role="alert">
              {actionError}
            </p>
          ) : null}

          {resource.status === "ready" && !active ? (
            <div className="health-share-empty">
              <div>
                <QrCode aria-hidden="true" size={24} />
                <div>
                  <strong>Nenhum acesso ativo</strong>
                  <p>O destinatário não precisa ter conta para consultar o resumo.</p>
                </div>
              </div>
              <Button onClick={generateShare} disabled={isSaving}>
                {isSaving ? "Gerando…" : "Gerar acesso temporário"}
              </Button>
            </div>
          ) : null}

          {resource.status === "ready" && active ? (
            <div className="health-share-active">
              <div className="health-share-status-line">
                <Badge variant="secondary">
                  <Check aria-hidden="true" size={14} />
                  Acesso temporário ativo
                </Badge>
                <span>
                  <Clock3 aria-hidden="true" size={16} />
                  Tempo restante: <strong>{remaining}</strong>
                </span>
              </div>

              <div className={shareUrl ? "health-share-secret" : "health-share-metadata"}>
                {shareUrl ? (
                  <div className="health-share-qr" aria-label="QR-Code temporário">
                    <QRCodeSVG
                      value={shareUrl}
                      size={176}
                      level="H"
                      includeMargin={false}
                      aria-label="QR-Code do compartilhamento"
                    />
                  </div>
                ) : (
                  <ShieldCheck aria-hidden="true" size={30} />
                )}
                <div>
                  <p>
                    Expira em <time dateTime={active.expires_at}>{formatDate(active.expires_at)}</time>.
                  </p>
                  {!shareUrl ? (
                    <p>
                      Por segurança, o link não fica armazenado. Gere um novo
                      acesso para exibir outro QR-Code.
                    </p>
                  ) : (
                    <Button variant="secondary" onClick={copyLink}>
                      <Copy aria-hidden="true" size={16} />
                      Copiar link
                    </Button>
                  )}
                </div>
              </div>

              <div className="health-share-actions">
                <Button variant="outline" onClick={(event) => openDialog("replace", event)}>
                  <QrCode aria-hidden="true" size={16} />
                  Gerar novo acesso
                </Button>
                <Button variant="destructive" onClick={(event) => openDialog("revoke", event)}>
                  <Trash2 aria-hidden="true" size={16} />
                  Revogar acesso
                </Button>
              </div>
            </div>
          ) : null}

          {feedback ? <p className="health-share-feedback" role="status">{feedback}</p> : null}
        </CardContent>
      </Card>

      <ShareConfirmationDialog
        action={dialogMode === "replace" ? "Gerar novo acesso" : "Confirmar revogação"}
        error={dialogError}
        isOpen={dialogMode !== null}
        isSaving={isSaving}
        mode={dialogMode}
        onConfirm={dialogMode === "replace" ? generateShare : revokeShare}
        onOpenChange={(open) => {
          if (!open && !isSaving) setDialogMode(null);
        }}
        returnFocusRef={dialogTriggerRef}
      />
    </>
  );
}
