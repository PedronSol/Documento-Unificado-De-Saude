# Sugestões para o nome do marcador

## Status

IMPLEMENTED — proposta e referência visual aprovadas em 16/10/2026.

Entrega na branch `feat/marker-name-suggestions`, commit `e4ef588`.

## Dependências

- Step 6 entregue; spec `010-health-markers.md`.
- Formulário compartilhado `frontend/components/markers/marker-dialogs.jsx`.
- Design system `031-interface-design-system.md` e `docs/design-system.md`.

## Contexto e objetivo

O campo Nome do marcador exige lembrar e digitar um nome completo. Oferecer
sugestões locais pesquisáveis e agrupadas ajuda o usuário a preencher o campo,
sem restringir os nomes aceitos e sem transformar esta entrega em um sistema
de medições clínicas.

## Regras

1. Converter o campo de nome em combobox editável com lista de sugestões.
   O foco inicial mantém o menu fechado; clique na caixa/seta,
   digitação ou setas de navegação abrem as opções.
2. Catálogo inicial, fixo no frontend:
   - Cardiovascular: Pressão arterial (sistólica/diastólica); Batimentos cardíacos (frequência cardíaca).
   - Diabetes / Metabolismo: Glicemia em jejum; Glicemia pós-prandial.
   - Composição corporal: Peso corporal; Circunferência abdominal.
3. Categorias são apenas organização visual, sem relação automática com os tipos
   de marcador `condition`, `diagnosis`, `allergy` e `medication`.
4. Filtrar por trecho do nome, ignorando maiúsculas, minúsculas, acentos e espaços
   externos. Não empregar IA, serviços externos ou dados do histórico para isso.
5. Clicar ou confirmar uma sugestão preenche somente `name` e fecha a lista.
   Preservar tipo, observação, dosagem e frequência. Não salvar automaticamente.
6. Aceitar texto livre com o limite atual de 120 caracteres; sugestão é opcional.
   Exibir orientação curta de que é possível escolher ou digitar outro nome.
   Sem resultados, informar que o usuário pode continuar com o nome digitado.
7. Aplicar a mesma interação em criação e edição nos consumidores existentes:
   paciente adulto, contexto de dependente autorizado e prontuário médico.
   Ao editar, manter o nome atual; abrir sugestões não pode substituí-lo.
8. Lista aberta: setas navegam opções; Enter com opção ativa seleciona sem enviar
   o formulário; Escape fecha somente as sugestões primeiro. Tab segue o foco
   sem selecionar automaticamente e fecha a lista. Enter sem opção ativa mantém
   o envio normal do formulário. Clique fora fecha sem alterar o texto.
9. Não ativar a primeira opção automaticamente ao digitar. Depois de fechar com
   Escape, nova edição, clique ou setas permitem reabrir a lista. A busca vazia volta
   a mostrar todas as categorias; ocultar grupos sem correspondências.
10. Usar semântica de combobox/listbox, rótulo associado, `aria-expanded`,
    `aria-controls`, `aria-autocomplete=list` e `aria-activedescendant` quando
    houver opção ativa. O foco permanece no input durante navegação pela lista.
    Categorias possuem rótulos acessíveis; opções têm IDs estáveis e únicos.
11. Reutilizar o diálogo e controles existentes; componente específico da feature
    para o campo, pois não há combobox editável compartilhado. Não converter o
    campo em ClinicalSelect: ele precisa continuar aceitando texto livre.
12. Usar tokens existentes em estilos da feature, alvos de 44 px, foco visível e
    lista em dropdown sobreposto imediatamente abaixo do campo, com a mesma
    largura, altura limitada e rolagem interna. Abrir, filtrar ou fechar sugestões
    não desloca Tipo, Observação ou ações, nem redimensiona o diálogo.
    Cabeçalhos usam rótulos discretos, sem ícones, seguindo o padrão Tipo.
    Em 320 px, nenhum overflow horizontal; cabeçalho,
    lista e botões devem continuar acessíveis por rolagem. Validar também 1440 px.

13. Revisão visual solicitada explicitamente pelo usuário: apresentar as sugestões
    em cascata a partir da caixa de busca, sem painel que ocupe espaço no formulário.
    Em 320 e 1440 px, validar geometria do menu e estabilidade dos campos ao abrir
    e fechar; o menu é portado, pode ultrapassar o diálogo e deve caber na
    viewport, com rolagem interna e ajuste de colisão como o seletor Tipo.

## Contratos e erros

- Sem alteração de API, schema, migrations ou catálogo no servidor.
- Seleção envia o nome exibido no payload atual; nomes livres continuam válidos.
- Categorias não são persistidas nem enviadas à API.
- Validações e erros existentes (incluindo duplicidade `409`, sessão expirada,
  autorização e falha de rede) continuam tratados pelo formulário atual.
- Falha de busca remota não existe: o catálogo é local e determinístico.

## Segurança

- Não coletar consultas, enviar termos a terceiros ou persistir buscas no browser.
- Nenhuma sugestão concede acesso, confirma diagnóstico ou altera dado clínico
  antes de salvar. Autenticação, autorização e auditoria seguem no backend.
- Os nomes de medidas são texto no modelo atual, sem inferir valor, unidade,
  faixa de referência ou classificação clínica.

## Cenários Given/When/Then

1. Dado o formulário novo com foco inicial no nome e menu fechado, quando clicar
   na caixa ou seta, então exibir as seis sugestões nas três categorias e manter
   foco no campo. Digitação também abre a lista filtrada.
2. Dado o catálogo aberto, quando digitar `PRESSAO`, então mostrar Pressão
   arterial (sistólica/diastólica) no grupo Cardiovascular e ocultar sugestões sem correspondência.
3. Dado o texto `gli`, quando selecionar Glicemia em jejum por clique ou teclado, então
   preencher o nome, fechar sugestões e preservar todos os outros campos,
   sem emitir requisição de gravação.
4. Dado um nome livre sem correspondência, quando salvar, então usar o contrato
   existente sem exigir escolha da lista.
5. Dado uma opção ativa na lista, quando pressionar Enter, então selecionar sem
   enviar; ao pressionar Escape com lista aberta, fechar a lista e manter o modal.
6. Dado um marcador existente, quando abrir edição e navegar nas sugestões, então
   preservar o nome até seleção explícita e permitir salvar sem trocar o nome.
7. Dado o uso de paciente, dependente ou médico, quando salvar uma sugestão,
   então manter o endpoint e as regras de autorização atuais do contexto.
8. Dado viewport de 320 px ou 1440 px, quando pesquisar e selecionar, então
   lista, campo e ações permanecem utilizáveis, sem overflow horizontal.

## Não objetivos

- Novos tipos de marcador, tabelas de sinais vitais, valores/unidades ou gráficos.
- Recomendações clínicas, diagnóstico, prescrição, cálculo de IMC ou valores alvo.
- Catálogo completo de medicamentos, alergias e diagnósticos; sinônimos ou ranking.
- Histórico, favoritos, personalização ou administração do catálogo.
- Alterar resumo público, autorização ou outros formulários.

## Critérios de aceite e validação

- Pesquisa por nome e navegação por categorias funcionam sem impedir texto livre.
- Seleção nunca altera o tipo ou salva implicitamente.
- Teclado, foco e semântica acessível cobertos por testes de interação.
- Executar RED do menor cenário antes de implementar; depois GREEN e REFACTOR.
- Regressão nos consumidores paciente, dependente e médico; E2E a 320/1440 px.
- Executar testes afetados, build frontend e `git diff --check`.
- Atualizar design system com o padrão e roadmap com evidências e commit/PR.

## Revisão do dropdown

IMPLEMENTED — revisão de apresentação solicitada pelo usuário após avaliar
a entrega inicial, concluída na mesma branch, commit `e33f64f`.

- RED funcional: teste de geometria em Chromium/320 px no build anterior falhou
  pelo motivo esperado: abrir a lista deslocava Tipo em `293.328125 px`.
- A tentativa inicial contra `next dev` parou em navegação/rede antes do cenário;
  o RED válido foi observado no build de produção, com o teste original.
- Implementação mínima: menu passa a ser filho do controle relativo, posicionado
  absolutamente sob a busca, com camada/sombra semânticas e rolagem interna.
- Regressão unitária: 33 cenários do campo, prontuário médico e design system
  aprovados no conjunto das execuções; um cenário médico excedeu 5 s e passou
  isoladamente em 4,4 s com limite de 15 s só na execução. Limites do repositório
  preservados.
- Refactor: reaproveitar a âncora `.marker-name-control` existente; manter filtro,
  catálogo, seleção e eventos sem duplicação ou nova dependência.
- GREEN geométrico e regressão E2E: quatro cenários aprovados em Chromium sobre
  o build de produção, incluindo 320/1440 px, toque e teclado. Abrir o dropdown
  desloca Tipo e altera altura do diálogo em no máximo 1 px; a largura coincide
  com a busca e o menu fica imediatamente abaixo, dentro do diálogo.
- Dependente: cenário de abertura/seleção aprovado, com espera inicial ampliada
  apenas no contêiner (`asyncUtilTimeout: 10000`, testTimeout 15000), após falha
  de carregamento com espera padrão de 1 s. Total: 34 cenários unitários únicos
  aprovados no conjunto das execuções desta revisão.
- Build final aprovado; capturas de 320/1440 px revisadas visualmente. Refactor
  mantido mínimo; eventos e catálogo existentes preservados.
- Logs locais: `/tmp/dus-dropdown-red.log`, `/tmp/dus-dropdown-green.log`,
  `/tmp/dus-dropdown-unit.log`, `/tmp/dus-dropdown-unit-recheck.log`,
  `/tmp/dus-dropdown-dependent-recheck.log` e `/tmp/dus-dropdown-build.log`.
  Capturas: `/tmp/dus-marker-dropdown-320.png` e `/tmp/dus-marker-dropdown-1440.png`.

## Evidência TDD

| Etapa | Comando / evidência | Resultado |
|---|---|---|
| RED | `NODE_ENV=test npm test -- tests/marker-name-suggestions.test.jsx` antes do código | 5 falhas esperadas: combobox, opções e atributos ausentes. A primeira execução no contêiner herdou NODE_ENV=production; foi corrigida antes de observar o RED funcional. |
| GREEN | Mesmo comando após implementar o campo e a proteção de Escape no diálogo | 5 testes aprovados. Escape no Radix foi confirmado no diálogo real, não apenas no componente isolado. |
| REFACTOR | Dependência do efeito por ID da opção ativa e cálculo explícito de navegação por setas | 5 testes do campo permaneceram verdes na regressão. |
| Regressão | Campo, `medical-record.test.jsx`, `design-system.test.js` e `authenticated-areas.test.jsx`, Node 22, um worker | 83 cenários aprovados no conjunto das verificações; inclui seleção no contexto de dependente e abertura no prontuário médico. Ver ressalva de tempo abaixo. |
| E2E | `npx playwright test tests/login.spec.ts -g 'sugere nomes\|gerencia marcador\|oferece busca, prontuário'`, Chromium, um worker | 4 testes aprovados: sugestões em 320/1440 px, criação/edição/histórico do paciente e fluxo médico. Em 320 px a escolha final usou toque. |
| Build | `npm run build`, frontend em contêiner isolado | Aprovado. |
| Visual | Capturas em 320×720 e 1440×900; revisão visual e verificações geométricas no E2E | Sem overflow horizontal; nomes quebram, opções têm alvo mínimo de 44 px; lista e diálogo permitem rolagem para acessar ações. |

### Ressalva da regressão

A primeira execução concorrente com o build teve cinco falhas de tempo/espera em
`authenticated-areas.test.jsx` (78/83 passaram). A repetição isolada padrão teve
47/50 sucessos, com esperas insuficientes no carregamento inicial de áreas.
A execução final dessa suíte passou 50/50 com `asyncUtilTimeout: 10000` e
`--testTimeout=15000`, ajustados **somente no contêiner de validação**; nenhum
limite de espera foi alterado no repositório. As outras três suítes passaram com
os limites padrão. Não houve mudança de produção para contornar essas esperas.

Os E2E usaram build isolado, API simulada e a configuração temporária do Chromium
contra localhost:3100. Nenhum dado clínico real foi gravado. Backend e contratos
não foram alterados; a suíte backend não foi executada nesta entrega.

Logs locais: `/tmp/dus-marker-red.log`, `/tmp/dus-marker-green.log`,
`/tmp/dus-marker-regression.log`, `/tmp/dus-marker-areas-slow-environment.log`,
`/tmp/dus-marker-e2e.log` e `/tmp/dus-marker-build.log`.

## Revisão para o padrão do seletor Tipo

IMPLEMENTED — commit `1b9bc74`. Usuário solicitou seguir o seletor Tipo e manter
associação entre a sugestão escolhida e o texto do campo. Esta revisão prevalece
sobre a abertura automática e o posicionamento interno das versões anteriores.

- Menu fechado no foco inicial do diálogo. Clique no campo ou seta, digitação
  e setas do teclado abrem as opções; seta também permite fechar.
- Reutilizar a apresentação de `ClinicalSelect` (superfície, espaçamento das
  opções, destaque e check) e o Popover Radix já instalado para portal e
  posicionamento com colisão. Não criar um segundo modal nem copiar o seletor
  somente leitura: o campo deve continuar editável.
- Remover a lupa e os ícones das categorias; manter grupos com rótulos discretos.
- Digitar `pressão` ou `PRESSAO` filtra a opção de pressão arterial. Selecionar
  associa o campo ao nome completo: clicar ou Enter preenche `name` com o rótulo
  canônico. Ao salvar, enviar esse mesmo nome no contrato existente.
- Ao reabrir depois de selecionar, exibir o catálogo completo e o check no nome
  atual. Navegação destaca sem confirmar; editar o texto invalida a seleção
  quando ele deixa de corresponder ao nome escolhido. Texto livre permanece válido.
- Menu usa a largura da caixa e pode inverter o lado para caber na viewport,
  como Tipo; pode ultrapassar os limites do diálogo sem ser recortado. Não muda
  a posição dos campos ou a altura do formulário.
- Validar foco, check, abertura/fechamento pela seta, filtragem, payload e texto
  livre; comparar visualmente com Tipo em 320 e 1440 px e verificar que a seleção
  no menu portado não fecha o formulário.

### Evidência desta revisão

- RED: sete testes do campo executados antes da produção; quatro falharam e três
  passaram. Falhas esperadas: menu aberto no foco inicial, seta acionável ausente,
  check/seleção persistente ausentes e navegação confundida com seleção.
- GREEN: sete testes aprovados com abertura por clique/seta, busca acentuada,
  associação ao nome canônico, check ao reabrir, texto livre e preservação dos
  demais campos; eventos, foco e Escape verificados com o diálogo real.
- REFACTOR: normalização da consulta calculada uma vez por render; superfície,
  viewport, itens, indicador e chevron reutilizam as classes de ClinicalSelect.
  Popover já era dependência direta do projeto; nenhuma dependência nova.
- Regressão: 85 cenários unitários únicos aprovados no conjunto das execuções
  (campo, áreas autenticadas/dependente, prontuário médico e design system). A
  primeira execução passou 84/85; o carregamento inicial do paciente excedeu a
  espera explícita de 3 s e passou isoladamente em 1,5 s. Como nas verificações
  anteriores, asyncUtilTimeout 10000 e testTimeout 15000 foram aplicados somente
  no ambiente de validação; nenhum timeout do repositório foi alterado.
- E2E: quatro cenários aprovados em Chromium; menus comparados por cor de fundo,
  borda, raio e sombra com Tipo. Inclui 320/1440 px, check, nome associado,
  seleção por toque, payload, texto livre, edição/histórico e fluxo médico.
- RED adicional observado na revisão visual: o overflow do menu era `hidden`
  por precedência da classe compartilhada. Correção restrita ao seletor composto
  da feature; dois cenários em 320/1440 px repetidos e aprovados com rolagem `auto`.
- Build final aprovado. Capturas verificadas; a captura da seleção aguarda o fim
  da animação de abertura para registrar o estado estável.
- Frontend local atualizado com o build validado e ID público Google existente.
  A execução anterior não continha o novo campo. Apenas artefatos do frontend e
  fontes da feature foram substituídos no contêiner; versão anterior preservada
  para reversão. Sem mudança de banco, backend ou arquivos de ambiente.
- Backend não alterado; sua suíte não foi executada nesta revisão.

Logs locais: `/tmp/dus-select-pattern-red.log`, `/tmp/dus-select-pattern-green.log`,
`/tmp/dus-select-pattern-regression.log`, `/tmp/dus-select-pattern-recheck.log`,
`/tmp/dus-select-pattern-scroll-red.log`, `/tmp/dus-select-pattern-final-e2e.log`
e `/tmp/dus-select-pattern-build.log`. Capturas de referência:
`/tmp/dus-marker-search-320.png` e `/tmp/dus-marker-selected-1440.png`.
