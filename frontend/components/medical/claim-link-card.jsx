"use client";

import { useState } from "react";
import Copy from "lucide-react/dist/esm/icons/copy";
import { QRCodeSVG } from "qrcode.react";


function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value),
  );
}


export function ClaimLinkCard({ token, expiresAt, recipient = "patient" }) {
  const [copied, setCopied] = useState(false);
  const forGuardian = recipient === "guardian";
  const link = `${window.location.origin}/patient-claim#token=${token}${
    forGuardian ? "&for=guardian" : ""
  }`;

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
        <label htmlFor="claim-link-url">
          {forGuardian
            ? "Link para o responsável assumir a conta"
            : "Link para o paciente assumir a conta"}
        </label>
        <div>
          <input id="claim-link-url" value={link} readOnly
            onFocus={(event) => event.target.select()} />
          <button type="button" onClick={copyLink}>
            <Copy aria-hidden="true" size={16} />
            {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>
        <small>
          Exibido uma única vez. Válido até {formatDate(expiresAt)};
          {forGuardian
            ? " o responsável confirma os próprios dados e a data de nascimento do dependente."
            : " o paciente confirma CPF e data de nascimento para assumir a conta."}
        </small>
      </div>
    </div>
  );
}

export default ClaimLinkCard;
