# Continuidade e atualização do resumo público por QR-Code

## Status

IMPLEMENTED — spec aprovada pelo usuário em 2026-10-14; entrega na branch
`fix/qr-code-resumo-dinamico`.

## Dependências

- Step 8 e spec `040-health-summary-sharing.md`, implementados.
- Specs `038-list-pagination.md` e `042-usability-feedback-registration-summary.md`, implementadas.
- Uma única entrega complementar do Step 8, na branch `fix/qr-code-resumo-dinamico`.

## Contexto e problema

O usuário abriu um QR-Code com tipo sanguíneo AB+, alterou o cadastro para O-
e depois encontrou a página de acesso indisponível. A inspeção do código mostra
que `update_blood_type` não revoga compartilhamentos e que `load_public_summary`
consulta o tipo sanguíneo e os marcadores atuais do banco em cada leitura.
Não foi reproduzido o incidente de produção; portanto, não se atribui a falha
observada à alteração clínica.

Há um problema comprovável no fluxo atual: `PublicHealthShare` remove o token
do fragmento com `history.replaceState` e o mantém apenas em memória. Uma recarga
perde esse token e mostra acesso indisponível mesmo antes da expiração. A página
também consulta o resumo apenas ao montar, sem ação para atualizar dados.

## Objetivos

- Permitir recarregar e reabrir o mesmo link enquanto o acesso for válido.
- Consultar os dados atuais ao abrir, recarregar ou solicitar atualização.
- Preservar validade, revogação, allowlist e auditoria existentes.

## Não objetivos

- Recuperar o token de uma URL `/share` que já perdeu o fragmento no fluxo antigo.
- Recuperar o QR/link no dashboard do emissor após perder seu estado em memória.
- Renovar prazo, manter acesso após revogação ou permitir múltiplos acessos ativos.
- Atualização automática por polling, foco, WebSocket ou eventos do banco.
- Alterar schema, criar endpoints, dependências ou cache de dados clínicos.
- Alterar autorização para menores, responsáveis ou contas desativadas.

## Regras de negócio

1. O link continua no formato `{PUBLIC_APP_URL}/share#{token}`. A página pública
   preserva o fragmento para que a recarga e a reabertura tenham o mesmo token.
   O token não vai para path, query, cookies, Web Storage ou stores globais.
2. A API recebe o token somente em `X-Share-Token`, sem credenciais de sessão,
   usando `publicApiFetch` e sua política `cache: no-store`.
3. Abrir ou recarregar consulta novamente `GET /public/shares/summary`. O retorno
   representa os dados atuais permitidos; não é um snapshot da geração do QR.
4. A tela pronta oferece `Atualizar dados` usando o `Button` existente. A ação
   faz nova consulta com o mesmo token, sem gerar outro acesso ou renovar prazo.
5. Enquanto atualiza, o resumo anterior é retirado e um estado de carregamento
   acessível informa a consulta. Não há solicitações simultâneas por cliques
   repetidos nem aplicação de respostas após desmontar o componente.
6. Sucesso substitui todo o resumo, inclusive contagens das abas e categorias
   vazias. Alterações do tipo sanguíneo, nome de preferência e marcadores não
   revogam o link. A API e suas regras de autorização permanecem a autoridade.
7. O prazo continua fixo em duas horas e não é alterado por nenhuma leitura.
   Revogação explícita, geração de outro acesso e conta desativada continuam
   impedindo novas leituras conforme a spec `040`.
8. Resposta `404` remove qualquer resumo da tela e mostra o estado genérico
   existente. Token ausente ou malformado não consulta a API e produz o mesmo
   estado. O frontend valida o formato existente de 43–64 caracteres URL-safe.
9. Falha de rede, resposta `5xx` ou resposta ilegível remove o resumo da tela e
   mostra a mensagem temporária existente, com ação `Tentar novamente` usando
   o mesmo token. Não exige gerar QR novo nem apagar o fragmento.
10. Uma página já aberta não recebe notificação instantânea de revogação; a
    próxima consulta deve recusá-la. Ao atingir a expiração conhecida, a página
    retira o resumo mesmo sem ação do destinatário. Uma nova consulta sempre
    valida o prazo no banco, independentemente do relógio do navegador.
11. Nenhum token ou payload entra em logs, analytics, auditoria clínica, cache
    do service worker ou HTML renderizado no servidor. O backend persiste só
    o hash e audita cada leitura pública bem-sucedida como antes.

## Cenários de aceitação

### Recarregar um link válido

Dado um link válido aberto com seu fragmento
Quando o destinatário recarrega a página
Então o fragmento permanece e a página consulta a API com o mesmo token
E mostra o resumo sem login e sem gerar outro compartilhamento.

### Atualizar AB+ para O- usando o mesmo compartilhamento

Dado um compartilhamento válido cujo resumo mostra AB+
Quando o paciente altera seu tipo sanguíneo para O-
E o destinatário usa `Atualizar dados` ou recarrega o link
Então vê O- consultado do banco
E o token e a expiração originais permanecem inalterados.

### Atualizar marcadores e contagens

Dado um resumo aberto com um marcador ativo
Quando esse marcador é alterado ou removido e o destinatário atualiza
Então a tela reflete as listas atuais, as contagens e os estados vazios
E não apresenta marcadores removidos ou campos fora da allowlist.

### Recusar acesso revogado ou substituído

Dado um resumo aberto e um token posteriormente revogado ou substituído
Quando o destinatário atualiza, recarrega ou reabre o link antigo
Então recebe o estado genérico de indisponibilidade
E nenhum resumo anterior permanece na tela.

### Expirar uma página aberta

Dado um resumo aberto com expiração conhecida
Quando o prazo é atingido
Então o conteúdo clínico é retirado e o estado indisponível é exibido
E recarregar não renova o acesso.

### Recuperar uma falha temporária

Dado um link válido cuja consulta falhou por indisponibilidade ou rede
Quando o destinatário usa `Tentar novamente` após a recuperação
Então consulta com o mesmo token e mostra o resumo atual
E nenhum dado anterior fica visível durante a falha.

### Token ausente ou malformado

Dado `/share` sem token ou com fragmento malformado
Quando a página é aberta
Então mostra o estado genérico de indisponibilidade sem consultar a API.

## Contratos, dados e erros

- Sem alterações em rotas, schemas Pydantic, tabelas ou migrations.
- `GET /public/shares/summary`, header `X-Share-Token` e resposta
  `PublicHealthSummaryResponse` permanecem iguais.
- `404` uniforme para acesso inválido; `503` em falha de banco/auditoria;
  demais falhas de consulta são apresentadas como temporárias, sem detalhes internos.
- Mantêm-se `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, ausência
  de credenciais de sessão e todas as regras de ownership/autorização do backend.

## Segurança e revisão da spec 040

Esta proposta substitui, apenas na página pública do destinatário, a remoção do
fragmento prevista na regra 7 e na direção frontend da spec `040`. Manter o
fragmento permite recuperar o acesso pela URL, mas também deixa o segredo
visível na barra de endereço e potencialmente no histórico do navegador.
Quem possuir o link poderá consultar a allowlist até expiração ou revogação.
Esse é o tradeoff explícito proposto para revisão.

O fragmento não é enviado pelo navegador ao servidor frontend nem no Referer.
Não será criado storage adicional. As regras do dashboard emissor continuam
iguais: após recarga, ele recupera apenas metadados, sem reconstruir o token.
As passagens correspondentes da spec `040` foram atualizadas para distinguir
o dashboard emissor da página pública e citar esta spec.

## Interface e acessibilidade

- Reutilizar `Button`, estados e layout existentes; sem redesenho das telas.
- Estilos na feature com tokens semânticos, mobile-first e alvo de 44 px.
- Estados de carregamento e erro anunciados; teclado e foco visível preservados.
- Verificar 320 px e 1440 px, quebra de textos e ausência de overflow.

## Estratégia de testes e evidência TDD

1. RED: teste React monta o resumo, desmonta e monta novamente com a mesma URL;
   espera fragmento preservado e consulta bem-sucedida. Confirmar falha esperada
   porque o código atual apaga o fragmento, antes de alterar produção.
2. GREEN: preservar o fragmento e consultar com o mesmo token ao montar.
3. Ciclos RED/GREEN próprios para `Atualizar dados`, retry, expiração e retirada
   do conteúdo em erro/404; validar Strict Mode e resposta após desmontagem.
4. Integração backend com MySQL real: gerar acesso, ler AB+, alterar para O- pelo
   endpoint autenticado e ler O- com o mesmo token e expiração; usar os schemas
   Pydantic existentes. Cobrir marcadores atuais, revogação e expiração.
5. Playwright: abrir link, alterar tipo sanguíneo, atualizar, recarregar e revogar,
   com viewport mínima e ampla; validar ausência de persistência adicional.
6. REFACTOR apenas de duplicação concreta no fluxo de consulta, mantendo verde.
7. Executar testes afetados do backend e frontend, E2E, build frontend,
   `git diff --check` e `git status`; registrar verificações indisponíveis.

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| Continuidade, atualização, retry e expiração | `vitest run tests/public-health-share.test.jsx`: 14 falhas e 3 sucessos antes de produção; fragmento vazio na recarga, botão de atualização ausente e resumo mantido após expirar | Mesmo comando: 17 testes passaram após preservar o fragmento e adicionar atualização, retry e expiração | Fluxo de leitura reutiliza `useApiResource`/`readApiError`; o teste Strict Mode verifica o comportamento sem exigir quantidade de requisições da implementação anterior | Branch `fix/qr-code-resumo-dinamico`; commit `f8984b4`, registrado no roadmap |
| Transporte público do hook | `vitest run tests/use-api-resource.test.jsx`: 1 falha e 10 sucessos; transporte público injetado não era utilizado (`errorStatus` nulo em vez de `401`) | Hook recebe `fetchResource` e permite `onUnauthenticated: null`; cenários públicos e consumidores existentes passaram | Removida a duplicação do ciclo de carregamento, reload, erros e descarte de respostas no componente público | Branch `fix/qr-code-resumo-dinamico`; commit `f8984b4`, registrado no roadmap |

## Critérios de conclusão

- [x] Spec revisada antes de implementar comportamento.
- [x] Recarga e atualização usam o mesmo token e os dados atuais do banco.
- [x] Expiração e revogação mantidas, sem renovação implícita.
- [x] Falhas retiram dados antigos e permitem retry quando temporárias.
- [x] Testes RED/GREEN/REFACTOR documentados e verificações relevantes concluídas.
- [x] Specs `040`/`043`, índice e roadmap sincronizados com a implementação.
- [x] Referência da implementação: commit `f8984b4`.


## Verificação da entrega

Comandos executados em containers temporários, com Node 22, as dependências
travadas no `package-lock.json`, Python 3.11 e MySQL 8 local. Nenhum serviço
existente foi substituído e não houve publicação em produção.

- `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --reporter=dot`:
  337 sucessos e 4 falhas de ambiente, pois o mount inicial continha apenas
  `frontend/` e não disponibilizava o guia e o `AGENTS.md` da raiz. Após copiar
  esses dois arquivos de referência, `vitest run tests/design-system.test.js
  --maxWorkers=1 --reporter=dot` passou os 14 testes. Todos os 341 testes unitários
  ficaram aprovados. A primeira execução com workers automáticos excedeu os
  recursos disponíveis; a repetição serial resolveu os timeouts de workers.
- `RUN_DB_INTEGRATION=1 python -m pytest __tests__/test_health_shares.py
  __tests__/test_blood_type_flows.py -q`: 17 testes passaram, incluindo duas
  novas caracterizações do contrato já implementado. MySQL real confirma
  AB+ → O-, retirada de marcador com o mesmo token/prazo e recusa após
  revogação/expiração. Uma expectativa inicial foi corrigida para o contrato
  existente de remoção de marcadores (`200`, não `204`); produção backend intacta.
- `PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test
  tests/login.spec.ts --grep "resumo público|QR público|QR temporário|tipo sanguíneo em"
  --workers=1 --reporter=list`: os três cenários existentes passaram. Os dois
  novos cenários foram repetidos com `--grep "QR público"` e passaram depois
  de corrigir os seletores para `Confirmar alteração` e para o alerta da
  feature, distinguindo-o do anunciador de rota do Next.js. Cinco cenários
  relevantes aprovados no build de produção.
- Capturas inspecionadas em 320 px e 1440 px: O- atualizado, botão com 44 px,
  categorias vazias e ausência de overflow. Testes também verificaram recarga,
  uso por teclado, retry, revogação, ausência de cookie na consulta pública e
  ausência de Web Storage.
- `npm run build`: compilação, TypeScript e geração das rotas aprovados.
- `git diff --check`: aprovado; `git status` revisado, sem artefatos gerados
  adicionados ao versionamento.

O componente lê o segredo apenas no cliente e injeta `publicApiFetch` no hook
existente; `onUnauthenticated: null` impede efeitos na sessão autenticada.
O timer respeita os timestamps UTC do contrato, limpa-se ao desmontar e
preserva o prazo conhecido durante uma atualização pendente. O módulo local
`@vercel/analytics/next` recebe pathname/rota sem fragmento; o token continua
somente no fragmento local e no header da API.

Não há teste, build ou referência de implementação pendente para esta entrega.
Após o usuário fornecer nome/e-mail, a autoria foi configurada apenas neste
repositório e a implementação registrada no commit `f8984b4`. A suíte backend
completa e os demais E2E não foram repetidos: o backend de produção não mudou,
a integração afetada passou e todos os consumidores do hook foram cobertos
pela regressão unitária completa.


## Revisão de texto aprovada em 2026-10-15

A pedido explícito do usuário, o botão da área do paciente que abre o diálogo
para encerrar o compartilhamento passa de `Revogar acesso` para `Cancelar acesso`.
A alteração se restringe ao texto do acionador: contrato `DELETE`, confirmação,
mensagens e regra de revogação permanecem iguais. O teste existente deve
localizar o botão pelo novo nome e continuar comprovando a chamada de revogação.
Não há novo comportamento a revisar.

A entrega permanece na branch `fix/qr-code-resumo-dinamico`, vinculada à
[PR #16](https://github.com/PedronSol/Documento-Unificado-De-Saude/pull/16), cujo
destino foi verificado como `develop` antes da correção; a PR está aberta.


Evidência TDD da revisão de texto:

- RED: `vitest run tests/health-sharing.test.jsx --maxWorkers=1 --reporter=dot`
  apresentou 1 falha e 7 sucessos; o teste não encontrou o botão `Cancelar acesso`
  porque o componente ainda exibia `Revogar acesso`.
- GREEN: após substituir apenas o texto do botão, o mesmo comando passou os
  8 testes, incluindo confirmação acessível e chamada ao `DELETE` existente.
- REFACTOR: nenhuma extração necessária para a alteração de um único literal.
  Seletores dos E2E consumidores foram atualizados para o nome acessível atual.

- Regressão visual/funcional: `PLAYWRIGHT_BASE_URL=http://localhost:3001 npx
  playwright test tests/login.spec.ts --grep "QR temporário|QR público"
  --workers=1 --reporter=list` passou os 3 cenários afetados. O botão foi
  verificado em 320 px e 1440 px, sem overflow e com alvo mínimo de 44 px,
  preservando foco inicial seguro no diálogo e a confirmação da revogação.
- `npm run build` passou compilação, TypeScript e geração de rotas. A primeira
  tentativa encontrou páginas antigas presentes apenas na imagem do container;
  após limpar a cópia temporária e copiar somente o código atual, o build passou.
- `git diff --check` aprovado. Sem mudanças no backend nem nos componentes base;
  os testes e build executados cobrem a revisão de texto e seus consumidores.
