"use client";

import { useState } from "react";
import Copy from "lucide-react/dist/esm/icons/copy";
import { QRCodeSVG } from "qrcode.react";


function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value),
  );
}


export function ClaimLinkCard({ token, expiresAt }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/patient-claim#token=${token}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="claim-link-card">
      <div className="claim-link-qr" role="img" aria-label="QR-Code para assumir a conta">
        <QRCodeSVG value={link} size={176} level="H" includeMargin={false} aria-hidden="true" />
      </div>
      <div className="claim-link-copy">
        <label htmlFor="claim-link-url">Link para o paciente assumir a conta</label>
        <div>
          <input id="claim-link-url" value={link} readOnly
            onFocus={(event) => event.target.select()} />
          <button type="button" onClick={copyLink}>
            <Copy aria-hidden="true" size={16} />
            {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>
        <small>
          Exibido uma única vez. Válido até {formatDate(expiresAt)}; o paciente
          confirma CPF e data de nascimento para assumir a conta.
        </small>
      </div>
    </div>
  );
}

export default ClaimLinkCard;
