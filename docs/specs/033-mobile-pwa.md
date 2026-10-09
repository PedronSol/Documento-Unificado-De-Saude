# Experiência Mobile First e PWA Instalável

## Status

IMPLEMENTED

## Dependências

- Step 7 — identidade autenticada, área do paciente e área profissional.
- `docs/specs/031-interface-design-system.md` e
  `docs/specs/032-mobile-context-dock.md`.

## Contexto e problema

A revisão visual mais recente ainda mostra a troca de contexto no cabeçalho em
uma tela identificada como mobile/tablet. O breakpoint de 800 px não cobre
todos os viewports de tablet e dispositivos incorporados que apresentam uma
largura CSS maior. A aplicação também não possui manifest ou service worker e
portanto não pode ser instalada como PWA.

## Objetivos

- Manter o seletor multirole como dock inferior, com safe area e espaço de
  conteúdo, em viewports CSS menores que 1200 px ou em dispositivos touch;
  somente desktop amplo com mouse mantém a apresentação no cabeçalho.
- Tornar o frontend instalável como PWA em navegadores compatíveis, com nome,
  ícones de instalação, cores e modo standalone coerentes com a identidade DUS.
- Exibir uma página offline neutra quando uma navegação falhar por falta de
  rede, sem revelar estado de autenticação ou informações clínicas.
- Manter API, autenticação e páginas protegidas exclusivamente online.

## Não objetivos

- Disponibilizar prontuário, pacientes, alertas, vacinas, marcadores ou
  documentos offline.
- Cache offline de respostas API, HTML autenticado, credenciais ou dados
  pessoais/clínicos.
- Sincronização em segundo plano, notificações push ou fila de alterações.
- Prompt próprio de instalação; a instalação segue a interface do navegador/SO.
- Alterar contratos ou autorização no backend.

## Regras

1. Contas com mais de um contexto usam o dock quando o viewport tem menos de
   1200 px ou o dispositivo primário é touch/coarse pointer. O cabeçalho aparece
   somente a partir de 1200 px em dispositivos com ponteiro fino e hover.
2. Contas com um único contexto não exibem o seletor nem reservam espaço.
3. A instância mobile do dock é irmã do header sticky no DOM, não descendente,
   para que `position: fixed` use o viewport como containing block. Em desktop,
   somente a instância do cabeçalho fica visível.
4. O manifest declara nome `Documento Unificado de Saúde`, nome curto `DUS`,
   `start_url` na entrada pública de login, escopo `/`, modo `standalone`,
   orientação não forçada e cores do design system.
5. O service worker é registrado na origem segura e seu escopo é `/`.
6. O cache do service worker contém somente a página offline estática e genérica
   e recursos necessários para exibi-la. Nenhum request de API, navegação
   autenticada, HTML de prontuário ou recurso com dados de usuário é gravado em
   cache.
7. Requisições mutáveis e não-GET não são interceptadas/cacheadas. Requests de
   API permanecem network-only.
8. Sem rede, navegações mostram a página offline genérica, com ação de tentar
   novamente; a aplicação não simula uma sessão offline.
9. Manifest e worker usam apenas ícones/fontes/cores existentes ou assets
   derivados da marca aprovada; nenhuma dependência nova é necessária.

## Cenários de aceitação

### Cenário: dock permanece no rodapé em celular e tablet

Dado que uma pessoa autenticada possui os contextos paciente e profissional
Quando abre a aplicação em viewports de 320, 768, 1024 e 1199 px ou em um
tablet touch com viewport CSS amplo
Então o seletor fica visualmente ancorado no último trecho do viewport, junto
ao rodapé e acima da safe area
E o conteúdo pode ser rolado sem ficar encoberto.

### Cenário: cabeçalho em desktop

Dado que a pessoa possui múltiplos contextos
Quando abre a aplicação em viewport de 1200 px ou maior com mouse/ponteiro fino
Então o seletor permanece segmentado no cabeçalho.

### Cenário: instalação PWA

Dado que a aplicação é servida em origem segura por navegador compatível
Quando o navegador avalia os metadados PWA
Então encontra manifest válido, ícones nos tamanhos exigidos, nome, cores,
escopo e modo standalone.

### Cenário: navegação sem rede

Dado que a pessoa perdeu a conectividade
Quando uma navegação falha
Então é exibida a página offline neutra com opção de tentar novamente
E nenhum dado clínico, nome, contexto ou credencial é exibido nessa página.

### Cenário: dados de saúde não são persistidos pelo service worker

Dado que o service worker está ativo
Quando há navegação autenticada e requests para endpoints API
Então apenas o recurso offline genérico aparece no Cache Storage
E requests API e respostas com dados de saúde continuam sem cache.

## Contratos afetados

### API

- Nenhuma alteração.

### Browser

- Manifest web com `start_url`, `scope`, `display`, cores e ícones de app.
- Service worker no escopo raiz; interceptação limitada a fallback de
  navegação sem rede, com cache allowlist apenas do shell offline.

## Segurança e privacidade

- Dados clínicos e de identidade não são armazenados em Cache Storage/IndexedDB.
- API usa estratégia network-only, inclusive respostas GET.
- A página offline não inclui dados dinâmicos, identificadores ou informação de
  sessão.
- Service worker não armazena nem executa mutações offline.
- Sessão, autorização e logout permanecem sob as regras atuais do backend.

## Casos de erro e limites

- Sem suporte a Service Worker ou fora de origem segura: aplicação continua
  online normalmente, sem bloquear login ou dashboard.
- Sem rede e sem cache offline válido: exibir fallback simples se disponível
  no documento, sem tentar servir dados autenticados antigos.
- Navegador pode não oferecer instalação; manifest e worker não devem prometer
  suporte universal.
- Alterações futuras ao service worker devem versionar e remover caches antigos
  para impedir conteúdo fora da allowlist.

## Estratégia de testes

- RED: Playwright confirmou o seletor estático em 1024 px e falhou pela ausência
  de `<link rel="manifest">` antes da implementação. No ajuste seguinte, a
  emulação touch a 1366 px também falhou (`static`), confirmando que o CSS
  diferenciava somente pela largura e não pelo tipo de dispositivo.
- Revisão da captura: a asserção antiga verificava `position: fixed`, mas não a
  posição geométrica. No Chrome DevTools Protocol, o elemento era fixed mas seu
  retângulo ficava em `top=-7`, `bottom=51` dentro do header sticky, em vez do
  rodapé do viewport. O teste foi corrigido para validar o limite inferior real.
- GREEN: testar dock em 320/768/1024/1199 px e em tablet touch com viewport de
  1366 px; cabeçalho em desktop com mouse a partir de 1200 px.
- E2E PWA: validar manifest, registro do worker, fallback offline e ausência de
  APIs/HTML de saúde em Cache Storage.
- Executar testes unitários, Playwright, build e `git diff --check`.
- Inspecionar manualmente em browser mobile/tablet ou emulado; documentar
  limitações do ambiente se instalação nativa não puder ser exercitada.

## Critérios de conclusão

- [x] Dock aparece no rodapé em celular/tablet até 1199 px e em dispositivos
      touch mesmo com viewport amplo.
- [x] Cabeçalho segmentado retorna em desktop com mouse a partir de 1200 px.
- [x] Manifest válido e ícones PWA instaláveis estão incluídos.
- [x] Service worker registra com fallback offline genérico.
- [x] Cache Storage não recebe respostas API nem conteúdo autenticado/clínico.
- [x] App continua funcional online sem suporte a service worker.
- [x] Testes, design system, AGENTS e roadmap ficam sincronizados.

## Evidência TDD

- RED: teste Playwright falhou em 1024 px (`static` em vez de `fixed`) e não
  encontrou o link de manifest. Comando: `npx playwright test
  tests/login.spec.ts tests/pwa.spec.ts --grep "dock em mobile|PWA"`.
- RED de geometria: a nova asserção falhou em 320 px: `bottom=51` para viewport
  de 720 px; em Chrome DevTools Protocol, o elemento fixed ocupava a caixa do
  header sticky (`top=-7`, `bottom=51`) em vez da borda inferior do viewport.
- GREEN: a suíte E2E completa (16 testes) passou, incluindo larguras
  320/475/768/1024/1199/1200 px, tablet touch a 1366 px, manifest/ícones,
  registro e controle do service worker, fallback offline e Cache Storage com
  somente `/offline.html`. As asserções verificam distância menor que 100 px
  até o bottom, não somente o `position` CSS.
- REFACTOR: registro isolado em componente client pequeno; worker faz network
  only para toda requisição exceto navegação, e limpa apenas caches versionados
  com prefixo próprio.
- Ajuste pós-captura: o estilo de cabeçalho foi limitado a
  `hover: hover` + `pointer: fine`, mantendo o dock em tablet touch mesmo quando
  o viewport CSS é 1366 px; cobertura adicionada em Playwright.
- Correção de containing block: a navegação mobile é irmã do header sticky e
  fica a 12 px do bottom em viewport Chrome emulado de 475×900.
- Referências: commits `d29389f`, `427138d`, `17892b6`, PR #7.
- Correção do bloco de contenção sticky: a instância única do nav é renderizada como
  irmã do header; no protocolo Chrome em 475×900, o retângulo fica em `top=830`,
  `bottom=888`, a 12 px do limite inferior.
- Regressão unitária e build de produção executados antes da conclusão.

## Decisões e observações

- Revisão solicitada pelo usuário em 2026-10-08 após nova captura mobile/tablet.
- A spec foi aprovada pelo usuário em 2026-10-08.
- A política offline é deliberadamente conservadora devido à natureza dos dados
  de saúde; disponibilidade offline clínica fica fora desta entrega.
