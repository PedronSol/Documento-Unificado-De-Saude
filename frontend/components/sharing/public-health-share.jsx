"use client";

import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import Droplets from "lucide-react/dist/esm/icons/droplets";
import HeartPulse from "lucide-react/dist/esm/icons/heart-pulse";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { publicApiFetch } from "@/lib/api";


const GROUPS = [
  ["allergies", "Alergias"],
  ["medications", "Medicações ativas"],
  ["conditions", "Condições"],
  ["diagnoses", "Diagnósticos"],
];

const EMPTY_LABEL = {
  allergies: "Nenhuma alergia registrada.",
  medications: "Nenhuma medicação ativa registrada.",
  conditions: "Nenhuma condição registrada.",
  diagnoses: "Nenhum diagnóstico registrado.",
};

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function UnavailableShare({ temporaryFailure = false }) {
  return (
    <main className="public-share-shell">
      <section className="public-share-state" role={temporaryFailure ? "alert" : undefined}>
        <span aria-hidden="true"><AlertTriangle size={28} /></span>
        <p className="eyebrow">Acesso protegido</p>
        <h1>
          {temporaryFailure
            ? "Não foi possível consultar agora"
            : "Este acesso não está disponível"}
        </h1>
        <p>
          {temporaryFailure
            ? "Tente abrir o link novamente em alguns instantes."
            : "O link pode ter expirado, sido revogado ou digitado incorretamente."}
        </p>
      </section>
    </main>
  );
}

export function PublicHealthShare() {
  const [result, setResult] = useState({ status: "loading", data: null });
  const tokenRef = useRef(null);

  useEffect(() => {
    let current = true;
    if (tokenRef.current === null) {
      tokenRef.current = window.location.hash.slice(1);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
    const token = tokenRef.current;

    if (!token) {
      setResult({ status: "unavailable", data: null });
      return undefined;
    }

    async function loadSummary() {
      try {
        const response = await publicApiFetch("/public/shares/summary", {
          headers: { "X-Share-Token": token },
        });
        if (response.status === 404) {
          if (current) setResult({ status: "unavailable", data: null });
          return;
        }
        if (!response.ok) {
          throw new Error("temporary failure");
        }
        const data = await response.json();
        if (current) setResult({ status: "ready", data });
      } catch {
        if (current) setResult({ status: "error", data: null });
      }
    }

    loadSummary();
    return () => {
      current = false;
    };
  }, []);

  if (result.status === "loading") {
    return (
      <main className="public-share-shell">
        <div className="public-share-loading" role="status">
          <span className="document-pulse" aria-hidden="true" />
          Verificando acesso temporário…
        </div>
      </main>
    );
  }
  if (result.status === "unavailable") return <UnavailableShare />;
  if (result.status === "error") return <UnavailableShare temporaryFailure />;

  const summary = result.data;
  return (
    <main className="public-share-shell">
      <header className="public-share-brand">
        <span aria-hidden="true">D</span>
        <div>
          <strong>Documento Unificado de Saúde</strong>
          <small>Resumo temporário verificado</small>
        </div>
        <ShieldCheck aria-label="Acesso protegido" size={24} />
      </header>

      <section className="public-share-hero" aria-labelledby="public-share-title">
        <div>
          <p className="eyebrow">Resumo clínico temporário</p>
          <h1 id="public-share-title">Resumo de {summary.patient.preferred_name}</h1>
          <p>
            Este acesso é somente leitura e contém uma seleção mínima de
            informações fornecidas pelo paciente.
          </p>
        </div>
        <div className="public-share-facts">
          <div>
            <Droplets aria-hidden="true" size={20} />
            <span>Tipo sanguíneo</span>
            <strong>{summary.patient.blood_type}</strong>
          </div>
          <div>
            <Clock3 aria-hidden="true" size={20} />
            <span>Disponível até</span>
            <strong>{formatDate(summary.expires_at)}</strong>
          </div>
        </div>
      </section>

      <section className="public-share-grid" aria-label="Informações clínicas compartilhadas">
        {GROUPS.map(([key, label]) => {
          const items = summary.markers[key];
          return (
            <Card className="public-share-card" key={key}>
              <CardHeader>
                <HeartPulse aria-hidden="true" size={19} />
                <CardTitle><h2>{label}</h2></CardTitle>
                <Badge variant="secondary">{items.length}</Badge>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="public-share-empty">{EMPTY_LABEL[key]}</p>
                ) : (
                  <ul>
                    {items.map((item) => (
                      <li key={`${key}-${item.name}`}>
                        <strong>{item.name}</strong>
                        {item.description ? <p>{item.description}</p> : null}
                        {key === "medications" && (item.dosage || item.frequency) ? (
                          <dl>
                            {item.dosage ? <div><dt>Dosagem</dt><dd>{item.dosage}</dd></div> : null}
                            {item.frequency ? <div><dt>Frequência</dt><dd>{item.frequency}</dd></div> : null}
                          </dl>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <footer className="public-share-footer">
        <ShieldCheck aria-hidden="true" size={18} />
        Este resumo não substitui avaliação profissional nem contém o prontuário completo.
      </footer>
    </main>
  );
}
