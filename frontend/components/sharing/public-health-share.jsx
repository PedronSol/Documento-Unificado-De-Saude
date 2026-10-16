"use client";

import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import Droplets from "lucide-react/dist/esm/icons/droplets";
import HeartPulse from "lucide-react/dist/esm/icons/heart-pulse";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import { useCallback, useEffect, useState } from "react";
import {
  Content as TabsContent,
  List as TabsList,
  Root as TabsRoot,
  Trigger as TabsTrigger,
} from "@radix-ui/react-tabs";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiResource } from "@/hooks/use-api-resource";
import { publicApiFetch } from "@/lib/api";


const GROUPS = [
  ["allergies", "Alergias"],
  ["medications", "Medicações ativas"],
  ["conditions", "Condições"],
  ["diagnoses", "Diagnósticos"],
];

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,64}$/;

// The API serializes naive MySQL timestamps in UTC (spec 040).
function expirationTime(value) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`).getTime();
}

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
  }).format(new Date(expirationTime(value)));
}

function UnavailableShare({ temporaryFailure = false, onRetry }) {
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
        {temporaryFailure && <Button onClick={onRetry}>Tentar novamente</Button>}
      </section>
    </main>
  );
}

export function PublicHealthShare() {
  const [token, setToken] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [, setNow] = useState(Date.now);

  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    setToken(TOKEN_PATTERN.test(fragment) ? fragment : "");
  }, []);

  const fetchSummary = useCallback((path) => publicApiFetch(path, {
    headers: { "X-Share-Token": token },
  }), [token]);
  const { reload, ...result } = useApiResource(token ? "/public/shares/summary" : null, {
    fallback: "Não foi possível consultar agora",
    initialData: null,
    fetchResource: fetchSummary,
    onUnauthenticated: null,
  });
  const deadline = result.status === "ready" ? expirationTime(result.data?.expires_at) : expiresAt;

  useEffect(() => {
    if (result.status === "ready" && Number.isFinite(deadline)) setExpiresAt(deadline);
  }, [deadline, result.status]);

  useEffect(() => {
    if (expiresAt === null) return undefined;
    let timer;
    function checkExpiration() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setNow(Date.now());
        return;
      }
      // Avoid timeout overflow when tests or servers return distant dates.
      timer = window.setTimeout(checkExpiration, Math.min(remaining, 2 ** 31 - 1));
    }
    checkExpiration();
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  if (token === "" || result.errorStatus === 404 || (deadline !== null && deadline <= Date.now())) {
    return <UnavailableShare />;
  }
  if (token === null || result.status === "idle" || result.status === "loading") {
    return (
      <main className="public-share-shell">
        <div className="public-share-loading" role="status">
          <span className="document-pulse" aria-hidden="true" />
          Verificando acesso temporário…
        </div>
      </main>
    );
  }
  if (result.status === "error" || !Number.isFinite(deadline)) return <UnavailableShare temporaryFailure onRetry={reload} />;

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
            <strong>{summary.patient.blood_type || "Não informado"}</strong>
          </div>
          <div>
            <Clock3 aria-hidden="true" size={20} />
            <span>Disponível até</span>
            <strong>{formatDate(summary.expires_at)}</strong>
          </div>
          <Button onClick={reload}>Atualizar dados</Button>
        </div>
      </section>

      {/* All categories stay complete; tabs only organize them (spec 038). */}
      <TabsRoot className="public-share-tabs" defaultValue="allergies">
        <TabsList className="public-share-tablist" aria-label="Categorias clínicas">
          {GROUPS.map(([key, label]) => (
            <TabsTrigger className="public-share-tab" key={key} value={key}>
              {label} ({summary.markers[key].length})
            </TabsTrigger>
          ))}
        </TabsList>
        {GROUPS.map(([key, label]) => {
          const items = summary.markers[key];
          return (
            <TabsContent className="public-share-panel" key={key} value={key}>
              <Card className="public-share-card">
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
            </TabsContent>
          );
        })}
      </TabsRoot>

      <footer className="public-share-footer">
        <ShieldCheck aria-hidden="true" size={18} />
        Este resumo não substitui avaliação profissional nem contém o prontuário completo.
      </footer>
    </main>
  );
}
