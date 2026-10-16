# Compartilhamento Temporário do Resumo de Saúde

## Status

IMPLEMENTED — continuidade e atualização pública complementadas pela spec `043-public-share-refresh.md`.

## Dependências

- Step 5 e spec `005-clinical-audit.md`, implementados.
- Step 6 e spec `010-health-markers.md`, implementados.
- Step 8 do roadmap, desbloqueado.

## Contexto e problema

O paciente precisa apresentar um resumo clínico em uma consulta ou atendimento
sem exigir que o destinatário tenha conta na plataforma. O acesso deve ser
temporário, revogável e limitado aos dados estritamente necessários.

O banco atual já possui marcadores ativos de alergia, medicação, condição e
diagnóstico, além do nome de preferência e tipo sanguíneo do paciente. Ainda não
existe modelo de biomarcadores ou taxas clínicas; eles estão planejados para o
Step 12, depois de documentos e OCR. Esta entrega não pode antecipar esse modelo.

Também existe um `QRCard` legado sem consumidor ativo, baseado em valor estático
e identificador universal. Ele não satisfaz expiração, revogação, auditoria nem
o design system vigente e não será tratado como fonte de verdade.

## Objetivos

- Permitir que paciente adulto autenticado gere um acesso válido por duas horas.
- Representar o acesso como QR-Code e link copiável, entregues uma única vez.
- Exibir sem login um resumo mínimo, somente leitura, com dados em allowlist.
- Permitir revogação imediata e substituição segura do compartilhamento ativo.
- Auditar geração, revogação e cada leitura pública bem-sucedida.
- Não persistir nem registrar o token bruto no backend ou em storage do navegador;
  o destinatário mantém o fragmento da URL conforme a spec `043`.

## Não objetivos

- Compartilhar prontuário completo, vacinas, documentos, alertas legados ou
  marcadores removidos.
- Compartilhar biomarcadores ou taxas clínicas antes de existir o modelo do
  Step 12 e uma atualização aprovada desta spec.
- Permitir edição, download ou identificação/cadastro do destinatário.
- Permitir que médico, admin ou paciente menor gere um compartilhamento nesta
  versão; representação legal de menores exige uma spec própria.
- Reconstruir o link no dashboard emissor depois de perder o estado em memória.
- Armazenar token em cookie, `localStorage`, `sessionStorage`, cache ou URL
  enviada ao servidor frontend.
- Criar serviço externo, Redis ou rate limit em memória por processo. Proteção
  operacional adicional poderá ser tratada no Step 14.
- Modernizar superfícies sem relação com o fluxo ou reutilizar o `QRCard` legado
  se sua adaptação for maior que um componente novo e simples.

## Regras de negócio

1. Apenas paciente adulto autenticado, com perfil consistente, pode gerar ou
   revogar seu próprio compartilhamento.
2. O paciente pode ter no máximo um compartilhamento não revogado. Gerar outro
   revoga o anterior e cria o novo na mesma transação.
3. O token é gerado com ao menos 256 bits de entropia por CSPRNG. Somente seu
   SHA-256 em hexadecimal é persistido.
4. A validade é fixa em duas horas a partir de `created_at`, usando UTC do banco.
   No instante `expires_at` o acesso já é inválido.
5. O token bruto aparece na resposta da criação, no link em memória do emissor
   e no fragmento da URL pública do destinatário (spec `043`). O backend não
   consegue reconstruí-lo depois da resposta de criação.
6. O QR-Code contém somente a URL pública no formato
   `{PUBLIC_APP_URL}/share#{token}`. Nenhum dado clínico ou identificador interno
   é codificado no QR.
7. O fragmento `#` impede que o navegador envie o token ao servidor frontend ou
   no cabeçalho `Referer`. Conforme a revisão aprovada na spec `043`, a página
   pública preserva o fragmento para recarga/reabertura e envia o token somente
   no header `X-Share-Token` para a API. O segredo pode ficar no histórico local.
8. O resumo público contém apenas nome de preferência, tipo sanguíneo quando
   informado e marcadores ativos dos quatro tipos já implementados.
9. A resposta não contém nome completo, CPF, e-mail, idade/data de nascimento,
   avatar, IDs, timestamps dos marcadores, autoria, documentos, vacinas, alertas
   legados, marcadores removidos ou histórico.
10. Token ausente, malformado, desconhecido, expirado ou revogado produz a mesma
    resposta pública `404`, sem indicar se já existiu ou se há paciente associado.
11. Revogação tem efeito antes da resposta de sucesso e toda leitura posterior é
    recusada. Compartilhamentos expirados também podem ser revogados/limpos, mas
    nunca voltam a ser válidos.
12. Geração, revogação explícita, revogação causada por substituição e leitura
    pública bem-sucedida são auditadas. Falha da auditoria reverte a operação ou
    impede a liberação do resumo.
13. Tentativa pública inválida não cria evento clínico porque nenhum paciente ou
    recurso autorizado foi resolvido e o token não pode ser registrado.
14. A API e a página pública enviam política `no-store`; o resumo e o token não
   são persistidos pelo service worker nem em storage do frontend; a URL pública
   preserva o fragmento conforme a spec `043`.
15. A página pública é responsiva desde 320 px, não exibe navegação autenticada e
    oferece estados de carregamento, conteúdo, vazio, indisponível e falha
    temporária sem revelar detalhes internos.

## Cenários de aceitação

### Cenário: gerar acesso temporário

Dado um paciente adulto autenticado com perfil consistente
Quando solicita um compartilhamento
Então recebe `201` com identificador, link público, criação e expiração em UTC
E a expiração ocorre duas horas depois da criação
E o token bruto existe apenas dentro do link retornado
E `health_share.created` é gravado na mesma transação.

### Cenário: substituir acesso ainda ativo

Dado um paciente com um compartilhamento não revogado
Quando gera um novo compartilhamento
Então o anterior é revogado antes da criação do novo na mesma transação
E somente o novo token permite leitura
E a auditoria registra a revogação anterior e a nova criação
E uma falha em qualquer escrita reverte toda a substituição.

### Cenário: recuperar apenas metadados do acesso

Dado um paciente com compartilhamento válido
Quando consulta seu compartilhamento ativo
Então recebe identificador, criação e expiração
E não recebe token nem link, pois o token bruto não é persistido
E, depois de perder o link em memória, pode revogar ou gerar outro.

### Cenário: consultar resumo sem cadastro

Dado um link válido aberto em um navegador
Quando a página pública lê o fragmento e consulta a API
Então o destinatário vê nome de preferência, tipo sanguíneo quando informado e
marcadores ativos
E não precisa realizar login
E a leitura e a atualização de último acesso são confirmadas junto com o evento
`health_share.accessed` antes de os dados serem retornados.

### Cenário: retornar categorias vazias

Dado um compartilhamento válido cujo paciente não possui marcadores ativos
Quando o resumo é consultado
Então recebe listas vazias para todas as categorias permitidas
E a página explica que não há informações registradas sem omitir a identidade
mínima e a expiração.

### Cenário: bloquear token inválido ou indisponível

Dado um token ausente, malformado, adulterado, desconhecido, expirado ou revogado
Quando o endpoint público é consultado
Então recebe `404` com a mesma mensagem genérica
E nenhum dado clínico, paciente, motivo ou estado anterior é retornado
E nenhum evento de acesso bem-sucedido é criado.

### Cenário: revogar acesso

Dado um paciente adulto com compartilhamento próprio não revogado
Quando solicita a revogação
Então recebe `204` depois da alteração e de `health_share.revoked`
E qualquer leitura posterior com o token é recusada imediatamente.

### Cenário: não revelar ownership na revogação

Dado um paciente adulto autenticado
Quando tenta revogar um ID inexistente, já revogado ou pertencente a outro paciente
Então recebe `404` com a mesma mensagem
E nenhuma alteração ou auditoria revela o proprietário.

### Cenário: impedir compartilhamento por menor ou outro perfil

Dado um paciente menor, médico sem perfil de paciente ou admin
Quando tenta gerar ou revogar um compartilhamento
Então recebe `403`
E nenhum token, registro ou evento de sucesso é criado.

### Cenário: não persistir o segredo no navegador

Dado que o paciente acabou de gerar o link
Quando o QR-Code e a ação de copiar são exibidos
Então o link permanece apenas no estado em memória do componente emissor
E não aparece em storage, cookie, cache do service worker ou parâmetro de busca
E, após recarregar, a interface mostra somente os metadados do acesso ativo.

### Cenário: falhar fechado quando a auditoria pública falha

Dado um token válido e uma falha ao registrar `health_share.accessed`
Quando o resumo é consultado
Então a API retorna `503` sem dados clínicos
E `last_accessed_at` e o evento parcial são revertidos.

## Contratos afetados

### API autenticada

```text
POST   /me/shares
GET    /me/shares/active
DELETE /me/shares/{share_id}
```

`POST /me/shares` não recebe body e retorna `201`:

```json
{
  "share_id": 42,
  "share_url": "https://app.example/share#token-entregue-uma-vez",
  "created_at": "2026-10-09T12:00:00.000000",
  "expires_at": "2026-10-09T14:00:00.000000"
}
```

`GET /me/shares/active` retorna `200` com metadados, sem token/link:

```json
{
  "share_id": 42,
  "created_at": "2026-10-09T12:00:00.000000",
  "expires_at": "2026-10-09T14:00:00.000000"
}
```

Quando não há compartilhamento válido, `GET /me/shares/active` retorna `200`
com corpo JSON `null`. `DELETE` retorna `204` sem corpo.

### API pública

```text
GET /public/shares/summary
X-Share-Token: <token bruto lido do fragmento>
```

Resposta `200`:

```json
{
  "expires_at": "2026-10-09T14:00:00.000000",
  "patient": {
    "preferred_name": "Carlos",
    "blood_type": "A+"
  },
  "markers": {
    "allergies": [
      {"name": "Dipirona", "description": "Reação cutânea"}
    ],
    "medications": [
      {
        "name": "Losartana",
        "description": "Uso contínuo",
        "dosage": "50 mg",
        "frequency": "1 vez ao dia"
      }
    ],
    "conditions": [],
    "diagnoses": [
      {"name": "Hipertensão", "description": null}
    ]
  }
}
```

Cada item possui somente os campos aplicáveis exibidos acima. `dosage` e
`frequency` existem somente em medicações. A ordem é alfabética por `name` em
cada categoria.

Respostas públicas incluem:

```text
Cache-Control: no-store, max-age=0
Pragma: no-cache
Referrer-Policy: no-referrer
X-Robots-Tag: noindex, nofollow
```

O CORS aceita `X-Share-Token` somente para origens já presentes em
`CORS_ORIGINS`; não é adotado `*` com credenciais.

### Schemas Pydantic

- `HealthShareCreatedResponse`: contrato de criação com link entregue uma vez.
- `HealthShareMetadataResponse`: metadados seguros do acesso autenticado.
- `PublicPatientSummary`: `preferred_name` e `blood_type`, que pode ser `null`
  enquanto o dado ainda não foi informado.
- `PublicMarkerSummary`: `name` e `description`.
- `PublicMedicationSummary`: campos anteriores mais `dosage` e `frequency`.
- `PublicHealthSummaryResponse`: expiração, paciente e categorias permitidas.

Os schemas usam `extra="forbid"` quando recebem entrada. Os mesmos schemas de
resposta são usados pela API e pelos testes de contrato.

### Erros

| Caso | Resposta |
|---|---|
| sessão ausente ou inválida em `/me` | `401`, contrato existente |
| role incorreta ou paciente menor em geração/revogação | `403`, contrato existente |
| perfil de paciente inconsistente | `409`, contrato existente |
| compartilhamento ausente, revogado ou alheio no `DELETE` | `404`, `{"detail":"Compartilhamento não encontrado."}` |
| token público ausente, malformado, desconhecido, expirado ou revogado | `404`, `{"detail":"Compartilhamento indisponível."}` |
| path inválido | `422`, formato padrão do FastAPI |
| falha de banco ou auditoria | `503`, `{"detail":"Banco de dados indisponível."}` |

### Dados

A migration forward-only `0006_health_shares.py`, sucessora de `0005`, cria
`health_shares`:

| Coluna | Tipo | Regra |
|---|---|---|
| `share_id` | `BIGINT` | chave primária auto incremental |
| `token_hash` | `CHAR(64)` | obrigatório e único; nunca recebe token bruto |
| `patient_id` | `BIGINT` | FK obrigatória para `patients` |
| `created_by_user_id` | `BIGINT` | FK obrigatória para `users` |
| `created_at` | `DATETIME(6)` | UTC preenchido pelo banco |
| `expires_at` | `DATETIME(6)` | exatamente duas horas após criação |
| `revoked_at` | `DATETIME(6) NULL` | UTC da revogação |
| `last_accessed_at` | `DATETIME(6) NULL` | UTC do último acesso bem-sucedido |
| `active_patient_id` | `BIGINT NULL` | coluna gerada: paciente apenas quando não revogado |

Regras estruturais:

- Unique constraints protegem `token_hash` e `active_patient_id`.
- O lock da linha do paciente serializa duas gerações concorrentes; a unique
  constraint permanece como proteção final.
- `expires_at > created_at`; `revoked_at` e `last_accessed_at`, quando presentes,
  não antecedem `created_at`.
- FKs usam `ON DELETE RESTRICT` para preservar rastreabilidade.
- Índices atendem lookup por hash e consulta por paciente/expiração.
- A migration não altera revisões anteriores nem faz backfill de `valor_qr`.
- A coluna legada `patients.valor_qr` permanece sem uso; sua remoção exige spec
  própria porque alterar a migration `0002` é proibido.

### Configuração

- `PUBLIC_APP_URL` é injetada em `AppSettings`, sem barra final, com default
  local `http://localhost:3000`.
- `.env.example`, Compose e testes de configuração documentam/validam a opção.
- A duração de duas horas é regra desta spec e não vira configuração sem um
  consumidor concreto.

## Auditoria

| Ação | Ator | Recurso | Snapshot |
|---|---|---|---|
| `health_share.created` | `user` | `health_share` | posterior com `created_at`, `expires_at` e estado `active` |
| `health_share.revoked` | `user` | `health_share` | anterior/posterior com datas e estado, sem hash/token |
| `health_share.accessed` | `public_share` | `health_share` | sem snapshot clínico; registra somente o evento |

- Nenhum snapshot contém token, hash, link, nome, CPF, e-mail ou conteúdo do
  resumo.
- Geração/substituição/revogação e respectivos eventos usam uma transação.
- Acesso público atualiza `last_accessed_at` e grava o evento na mesma transação
  antes de retornar os dados.
- O `resource_id` é o `share_id`; `actor_user_id` é nulo para `public_share`, de
  acordo com a constraint já existente.

## Segurança e autorização

- Ownership e autoria vêm exclusivamente da sessão e do perfil resolvido pelo
  backend; nenhum endpoint aceita `patient_id` ou `user_id` do cliente.
- Geração e revogação usam a política de paciente adulto. O frontend esconder o
  controle para menor não substitui essa regra.
- Busca e revogação combinam `share_id` com `patient_id`; IDs alheios e
  inexistentes são indistinguíveis.
- O lookup público calcula SHA-256 antes da query parametrizada e exige hash,
  ausência de revogação e `expires_at > UTC_TIMESTAMP(6)` na mesma consulta.
- Token bruto, header de acesso, URL completa e payload clínico não entram em
  logs, exceções, auditoria ou métricas.
- O token não fica no path nem na query da requisição, reduzindo exposição em
  access logs, histórico, analytics e `Referer`.
- A página `/share` não envia o fragmento ao Analytics e não monta o resumo em
  HTML gerado no servidor.
- A API pública ignora eventual cookie de sessão e não amplia dados para usuário
  autenticado.
- Entropia de 256 bits torna enumeração impraticável; rate limit distribuído é
  deliberadamente adiado, sem criar proteção local enganosa.
- Todas as respostas públicas, inclusive erros, impedem cache.

## Frontend e direção visual

- Um módulo de compartilhamento entra no dashboard do paciente como section
  card, com ação azul, explicação curta de privacidade e estados independentes.
- Ao gerar, mostra QR-Code, expiração absoluta, temporizador textual, copiar link
  e revogar. O temporizador é informativo; a API continua sendo a autoridade.
- Se a página for recarregada, mostra que há acesso ativo, a expiração e as ações
  revogar/gerar novo, mas não tenta reconstruir QR ou link.
- Revogação e substituição usam diálogo acessível com foco inicial seguro,
  loading, erro e retorno ao acionador.
- A rota pública `/share` é client-side para ler e preservar o fragmento e
  consultar a API. Ela não exige nem redireciona para login. A spec `043`
  acrescenta atualização manual, retry e retirada do resumo ao expirar.
- O resumo público usa Instrument Sans, tokens `--ds-*`, `Card`, `Badge` e
  `Button`; não usa o gradiente, ID universal ou CTA verde do `QRCard` legado.
- Categorias vazias permanecem explícitas. Informações clínicas não são
  truncadas e quebram em conteúdo longo.
- O layout começa em 320 px, preserva alvos de 44 px, foco visível, zoom de 200%,
  reduced motion e largura máxima `--ds-layout-content` em telas amplas.
- A rota pública não reserva espaço do dock de contexto e não exibe conta,
  configurações ou navegação autenticada.
- O service worker continua armazenando somente `offline.html`; nenhum dado da
  API ou HTML com resumo clínico é colocado em cache.

## Estratégia de testes

### Primeiro ciclo RED

Adicionar o teste estrutural que espera a revisão `0006`, sucessora de `0005`,
forward-only, e a tabela `health_shares`. Confirmar que falha porque a migration
ainda não existe.

### Ciclos seguintes

1. Migration cria colunas, checks, FKs, uniques e índices no MySQL 8 real.
2. Segurança gera tokens distintos, hash de 64 caracteres e nunca passa token
   bruto como parâmetro de persistência.
3. Configuração valida `PUBLIC_APP_URL` injetada e seu default local.
4. Criação adulta retorna o link uma vez, expira em duas horas e audita na mesma
   transação.
5. Geração concorrente/substituição mantém apenas um registro não revogado e
   reverte por inteiro quando a auditoria falha.
6. Consulta autenticada retorna somente metadados próprios e `null` sem ativo.
7. Revogação própria é imediata; ID alheio, inexistente ou já revogado retorna o
   mesmo `404` sem evento.
8. Lookup público cobre válido, expirado, revogado, adulterado, ausente e
   malformado com relógio/estado controlado.
9. Payload público comprova a allowlist, somente marcadores ativos, categorias e
   ordem, e ausência explícita de CPF, e-mail, IDs, nome completo e histórico.
10. Acesso válido atualiza último acesso e audita; falha de auditoria retorna
    `503` sem payload e reverte a transação.
11. Testes React cobrem loading, vazio, criação, QR, cópia, timer, recarga do
    dashboard sem reconstruir token, diálogo de revogação/substituição e erros.
12. Testes da página pública comprovam leitura/preservação do fragmento, header,
    estados, headers `no-store` e ausência de storage/cache.
13. Playwright cobre geração e abertura do QR/link, revogação imediata, viewport
    de 320 px e uma viewport ampla.

### Regressão e verificações

- Suíte completa de `backend/__tests__/` e integração MySQL 8 real.
- `npm test`, Playwright e `npm run build` no frontend.
- Regressão dos consumidores de primitives/componentes compartilhados tocados.
- Inspeção de OpenAPI para confirmar que somente a leitura pública não exige
  sessão e que schemas não expõem campos extras.
- Verificação de que o service worker mantém apenas a página offline genérica.
- `git diff --check`, `git status` e ausência de artefatos gerados.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| migration `0006` | Teste falhou porque `0006_health_shares.py` ainda não existia. | Tabela, FKs, checks, índices e unicidade do compartilhamento ativo passaram nos testes de estrutura e no MySQL 8. | A migration permaneceu forward-only e sem alteração das anteriores. | `backend/__tests__/test_migrations.py`, `backend/__tests__/test_migrations_integration.py` |
| token e configuração | A coleta falhou pela ausência de `create_share_token`; configuração ainda não expunha `PUBLIC_APP_URL`. | Token URL-safe de 256 bits, SHA-256 e URL pública configurável ficaram verdes. | Primitivas privadas comuns preservaram a API de sessão existente. | `backend/__tests__/test_security.py`, `backend/__tests__/test_config.py` |
| criação e substituição | O módulo `shares` não existia e os cenários falharam na importação. | Criação persiste somente o hash, substitui o acesso anterior e audita ambos na mesma transação. | Lock do paciente e unique gerada concentram a garantia de apenas um acesso não revogado. | `backend/__tests__/test_health_shares.py`, `backend/shares/service.py` |
| consulta e revogação autenticadas | As quatro rotas estavam ausentes e o CORS não aceitava `X-Share-Token`. | Consulta retorna somente metadados e revogação exige ownership de paciente adulto. | Router fino delega regra e transação ao serviço, mantendo erros existentes. | `backend/__tests__/test_app_composition.py`, `backend/shares/router.py` |
| resumo e auditoria pública | Respostas públicas de erro perdiam `no-store`; token inválido e falha de auditoria não tinham contrato implementado. | Allowlist, validade, revogação, headers privados e auditoria pública transacional passaram, inclusive no MySQL 8. | Lookup público bloqueia a linha durante leitura/auditoria para fechar a corrida com revogação. | `backend/__tests__/test_health_shares.py`, `backend/__tests__/test_migrations_integration.py` |
| dashboard e página pública | Componentes não existiam e o dashboard não consultava `/me/shares/active`; geração `503` não anunciava erro. | QR, cópia, timer, diálogos, remoção do fragmento, estados públicos e responsividade passaram. | Boundary cliente foi mantida pequena; `useRef` preserva o token entre efeitos do Strict Mode sem usar storage. | `frontend/tests/health-sharing.test.jsx`, `frontend/tests/public-health-share.test.jsx`, `frontend/tests/login.spec.ts` |

## Revisão do impacto no frontend

- O card foi inserido no dashboard do paciente sem alterar os componentes base;
  reutiliza `Card`, `Button`, `Badge` e o diálogo Radix já adotado.
- A rota `/share` usa apenas dados da allowlist e não cria cookie, cache,
  `localStorage` ou `sessionStorage`. A spec `043` revisa a remoção original
  do fragmento, preservando-o para recarga e atualização do destinatário.
- O visual segue a linguagem clínica institucional e os tokens `--ds-*`, com
  comportamento mobile-first validado em 320 px e grid expandido em desktop.
- O service worker continua limitado ao fallback offline genérico; o cenário
  PWA de regressão comprova que a página clínica não entra no cache.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| Backend sem integração externa | 121 aprovados, 7 ignorados pela flag de MySQL |
| Backend com MySQL 8 real | 128 aprovados |
| Frontend unitário | 41 aprovados |
| Playwright Chromium | 19 aprovados, incluindo 320 px e viewport ampla |
| Build Next.js | aprovado; `/share` gerada como shell estático |
| Service worker/PWA | regressão Playwright aprovada sem cache clínico |
| Lint | indisponível: o script referencia `eslint`, ausente nas dependências atuais |

## Plano de execução

1. **Persistência e contratos:** migration `0006`, schemas, configuração e
   primitivas de token, todos iniciados por testes RED.
2. **Ciclo autenticado:** criar, consultar metadados e revogar com ownership,
   unicidade, transações e auditoria.
3. **Leitura pública:** resolver token pelo header, projetar allowlist, auditar e
   aplicar headers de privacidade/cache.
4. **Interface vertical:** integrar o card de compartilhamento no dashboard e a
   rota pública `/share` seguindo o design system.
5. **Regressão e documentação:** validar banco real, API, frontend, viewports,
   build, configuração, evidências TDD e tracker.

## Tarefas menores

| ID | Tarefa | Responsável sugerido | Esforço | Pré-requisitos | Definition of Done |
|---|---|---|---|---|---|
| T1 | Testar e criar migration `0006` | backend/infra | M | spec aprovada | schema, constraints e índices verdes no MySQL 8 |
| T2 | Definir schemas, token e configuração | backend | S | T1 | contratos, entropia, hash e URL cobertos |
| T3 | Criar geração/substituição transacional | backend | M | T1, T2 | apenas um não revogado e auditoria atômica |
| T4 | Criar consulta e revogação próprias | backend | S | T3 | metadados sem token, ownership e erros cobertos |
| T5 | Criar resumo público seguro | backend | M | T2, T3 | allowlist, validade, auditoria e no-store cobertos |
| T6 | Integrar card no dashboard | frontend | M | T3, T4 | QR, cópia, timer, recarga e diálogos testados |
| T7 | Criar página pública responsiva | frontend | M | T5 | fragmento, estados, 320 px e viewport ampla testados |
| T8 | Executar regressão e atualizar docs | qa/fullstack | M | T1–T7 | DoD, evidências e referência registrados |

## Riscos e mitigação

- **Vazamento em logs/Referer:** token no fragmento e depois em header, nunca em
  path/query; testes inspecionam URLs e parâmetros persistidos.
- **Impossibilidade de recuperar o link:** consequência deliberada de armazenar
  somente hash; a UI explica e oferece revogar/gerar novo.
- **Duas gerações concorrentes:** lock do paciente, transação e unique gerada.
- **Resumo crescer sem revisão:** schemas de resposta e projeção SQL usam
  allowlist; novos campos exigem atualização aprovada da spec.
- **Auditoria falhar em leitura:** resposta falha fechada com rollback e sem dado
  clínico.
- **Timer divergir:** contador é apenas apresentação; toda autorização usa o UTC
  do banco.
- **Abuso do endpoint público:** token de alta entropia evita enumeração; rate
  limit distribuído fica explícito para consolidação operacional.

## Decisões aprovadas

1. Manter somente um compartilhamento não revogado por paciente, substituído de
   forma atômica por uma nova geração.
2. Usar nome de preferência e tipo sanguíneo como identidade mínima; nome
   completo permanece privado.
3. Excluir biomarcadores/taxas deste step porque o modelo só será
   criado no Step 12.
4. Permitir geração/revogação apenas por paciente adulto até existir fluxo de
   representação legal.
5. Usar token no fragmento mais header `X-Share-Token`, em vez de token no
   path, para reduzir vazamento em logs e `Referer`.
6. Usar resposta pública uniforme `404` para inválido, expirado e revogado,
   sem revelar o estado anterior do link.

## Critérios de conclusão

- [x] Spec aprovada antes do primeiro teste RED.
- [x] Migration `0006` validada no MySQL 8 real e sem alterar migrations antigas.
- [x] Token bruto é entregue uma vez e nunca persiste em banco, log ou storage.
- [x] Apenas um compartilhamento não revogado existe por paciente.
- [x] Expiração, substituição e revogação têm efeito imediato e testes.
- [x] Payload público contém somente a allowlist aprovada e marcadores ativos.
- [x] Geração, revogação e leitura pública são auditadas de forma atômica.
- [x] Frontend possui QR, cópia, temporizador e página pública acessível.
- [x] Página pública e service worker não armazenam dados clínicos.
- [x] Revisão do impacto no frontend é registrada depois do backend verde.
- [x] Suítes afetadas, regressão, build e viewports obrigatórias passam.
- [x] Evidências RED, GREEN e REFACTOR são registradas.
- [x] Roadmap e referência do commit ou PR são atualizados.

## Decisões e observações

- Documento aprofundado em 2026-10-09 para iniciar o Step 8.
- Risco da entrega: **alto**, pois combina acesso público a dados clínicos,
  segredo bearer, autorização, auditoria, persistência e uma nova rota pública.
- Spec aprovada pelo usuário em 2026-10-09 antes do primeiro teste RED.
- Implementação concluída por strict TDD em 2026-10-09; o único comando não
  executável foi o lint, pois o repositório não possui `eslint` instalado.
- Implementação registrada no commit `333df01`; o fechamento documental atualiza
  o tracker do roadmap para `DONE`.
