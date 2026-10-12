# Proxy de Mesma Origem para a API

## Status

IMPLEMENTED — verificação no Railway pendente

## Dependências

- Spec `008-persistent-session.md`: cookies `dus_session` e `dus_remembered`,
  implementada; o contrato dos cookies não muda.
- Spec `020-secure-document-storage.md` e `022-medical-document-upload.md`:
  uploads de até `DOCUMENT_MAX_BYTES` (10 MiB), que precisam atravessar o proxy.

## Contexto e problema

No Railway, frontend e backend recebem domínios distintos em
`*.up.railway.app`. Como `up.railway.app` está na Public Suffix List, o
navegador trata os dois como sites diferentes. Os cookies de sessão usam
`SameSite=Lax`, então não acompanham as chamadas `fetch` do frontend para a
API: o `POST /login` responde 200, mas a chamada seguinte chega sem sessão,
recebe 401 e o usuário volta ao login.

Relaxar o cookie para `SameSite=None` dependeria de cookies de terceiros, que
Safari e modos anônimos bloqueiam, e ampliaria a superfície de CSRF.

## Objetivos

- Permitir que o navegador fale com uma única origem (a do frontend), que
  encaminha `/api/*` para o backend no servidor.
- Manter os cookies como first-party, host-only, `HttpOnly`, `Secure` e
  `SameSite=Lax`, sem alterar o backend.
- Preservar o fluxo local atual (`make both`, `docker compose`) sem
  configuração nova.

## Não objetivos

- Alterar atributos de cookie, CORS ou rotas do backend.
- Criar `proxy.ts`, route handlers ou BFF no Next; o encaminhamento usa somente
  `rewrites` do `next.config.mjs`.
- Configurar domínio próprio ou CDN.
- Remover o acesso direto ao backend; ele continua disponível para quem não
  usar o proxy.

## Regras

1. Uma variável de servidor `API_PROXY_TARGET` define a URL absoluta do
   backend (ex.: `https://dus-backend-production-8465.up.railway.app`).
   Ela não tem prefixo `NEXT_PUBLIC_` e não entra no bundle do navegador.
2. Com `API_PROXY_TARGET` definida, `next.config.mjs` declara um único rewrite:
   `/api/:path*` → `${API_PROXY_TARGET}/:path*`, com barra final removida do
   alvo.
3. Sem `API_PROXY_TARGET`, nenhum rewrite é declarado e o comportamento atual
   permanece.
4. O frontend continua chamando `${NEXT_PUBLIC_API_URL}${path}`
   (`frontend/lib/api.js`). Em produção com proxy, `NEXT_PUBLIC_API_URL=/api`.
   O código de `lib/api.js` não muda.
5. `API_PROXY_TARGET` precisa ser uma URL `http://` ou `https://`; qualquer
   outro valor faz o build falhar com mensagem explícita, evitando proxy para
   destino inválido ou relativo (o erro que motivou esta spec com
   `NEXT_PUBLIC_API_URL` sem protocolo).
6. Os rewrites são resolvidos em `next build`; portanto
   `frontend/Dockerfile.railway` declara `ARG API_PROXY_TARGET`. Mudar o alvo
   exige novo build.
7. O Next armazena em memória o corpo das requisições encaminhadas e o trunca
   em 10 MB por padrão, abaixo de um arquivo de 10 MiB mais o envelope
   multipart. `experimental.proxyClientMaxBodySize` fica em `"11mb"`: cobre
   `DOCUMENT_MAX_BYTES` máximo com folga para o multipart, e o backend segue
   aplicando o limite real de 10 MiB.

## Cenários de aceitação

### Cenário: rewrite configurado

- **Given** `API_PROXY_TARGET=https://api.example.com/`
- **When** o Next carrega `rewrites()`
- **Then** recebe exatamente
  `[{ source: "/api/:path*", destination: "https://api.example.com/:path*" }]`

### Cenário: sem proxy

- **Given** `API_PROXY_TARGET` ausente ou vazia
- **When** o Next carrega `rewrites()`
- **Then** recebe `[]`

### Cenário: alvo inválido

- **Given** `API_PROXY_TARGET=dus-backend.up.railway.app`
- **When** o Next carrega `rewrites()`
- **Then** é lançado erro informando que a variável exige `http://` ou
  `https://`

### Cenário: sessão mantida após login (verificação manual em produção)

- **Given** frontend com `NEXT_PUBLIC_API_URL=/api` e `API_PROXY_TARGET`
  apontando para o backend
- **When** o usuário faz login e navega para a área autenticada
- **Then** o cookie `dus_session` fica registrado no host do frontend e as
  chamadas `/api/*` seguintes respondem 200, sem redirecionar ao login

### Cenário: upload pelo proxy (verificação manual)

- **Given** a mesma configuração
- **When** o paciente envia um documento de até 10 MiB
- **Then** o upload conclui como no acesso direto ao backend

## Contratos afetados

- `frontend/next.config.mjs`: novo `rewrites()` condicional e
  `experimental.proxyClientMaxBodySize`.
- `frontend/Dockerfile.railway`: novo `ARG API_PROXY_TARGET`.
- Variáveis do serviço frontend no Railway: `NEXT_PUBLIC_API_URL=/api` e
  `API_PROXY_TARGET=<url do backend>`.
- `.env.example`: documenta `API_PROXY_TARGET` vazia por padrão.
- Nenhuma rota ou payload da API muda.

## Segurança

- O destino é fixo por variável de ambiente no build; nenhum valor do cliente
  escolhe o destino, então não há SSRF.
- Cookies continuam host-only no domínio do frontend, `HttpOnly`, `Secure` e
  `SameSite=Lax`; nenhuma flexibilização de cookie ou CORS.
- O backend não confia em IP de cliente nem em cabeçalhos de origem para
  autorização, então receber as requisições pelo servidor do Next não altera
  regras de acesso.
- `X-Share-Token` e `X-Acting-Patient` são repassados como os demais
  cabeçalhos; a autorização continua no backend.

## Casos de erro e limites

- Backend fora do ar: o proxy responde erro 5xx, tratado como falha de rede
  pelo frontend, igual ao acesso direto.
- Alvo sem protocolo: falha no build (regra 5).
- Corpos até 10 MiB precisam passar; a verificação manual de upload confirma.
- Corpos acima de 11 MB são truncados pelo Next e o encaminhamento falha
  (5xx), antes de chegar ao backend; o frontend já valida o tamanho antes do
  envio.

## Estratégia de testes

### Primeiro ciclo RED

`frontend/tests/next-config.test.js` importa `next.config.mjs` e verifica o
cenário "rewrite configurado"; falha porque `rewrites` não existe.

### Ciclos seguintes

- "sem proxy" e "alvo inválido" no mesmo arquivo.
- Limite de corpo do proxy em `"11mb"` (regra 7).
- Build da imagem `frontend/Dockerfile.railway` com o `ARG`.
- Verificação manual local: imagem do frontend com proxy apontando para o
  backend local, login e chamada autenticada.
- Verificação manual no Railway: cenários de sessão e upload.

## Evidência TDD

1. RED: `tests/next-config.test.js` "proxies /api…" falhou com
   `TypeError: default.rewrites is not a function`. GREEN com `rewrites()`.
2. RED: "sem proxy" (`undefined` e `""`) falhou com `expected [ {…} ] to deeply
   equal []`; "alvo inválido" falhou com `promise resolved … instead of
   rejecting`. GREEN com o retorno vazio e a validação de protocolo.
3. RED: "lets a 10 MiB multipart upload…" falhou com
   `expected undefined to be '11mb'`. GREEN com
   `experimental.proxyClientMaxBodySize`.

## Verificações executadas

- `npm test`: 30 arquivos, 292 testes verdes.
- `npm run build` sem `API_PROXY_TARGET`: verde.
- Imagens `backend/Dockerfile.railway` e `frontend/Dockerfile.railway`
  (`NEXT_PUBLIC_API_URL=/api`, `API_PROXY_TARGET=http://<backend>:8000`) em
  rede Docker isolada com MySQL novo, migrations e seed:
  - `POST /api/login` → 200, cookie `dus_session` host-only no host do
    frontend;
  - `GET /api/me` com cookie → 200; sem cookie → 401;
  - upload de PDF com 10.485.746 bytes → 201;
  - upload acima de 10 MiB → 413 do backend;
  - antes da regra 7, o mesmo upload de 10 MiB falhava com
    `Request body exceeded 10MB` e `ECONNRESET` no proxy.
- Pendente: cenários de sessão e upload no Railway com `*.up.railway.app`.

## Critérios de conclusão

- Testes de `next.config.mjs` verdes e suíte do frontend verde.
- `npm run build` verde com e sem `API_PROXY_TARGET`.
- Login mantém sessão no Railway com os domínios `*.up.railway.app`.
- Spec, índice de specs e `.env.example` sincronizados.
