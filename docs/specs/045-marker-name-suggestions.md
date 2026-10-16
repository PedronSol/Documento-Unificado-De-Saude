# Sugestões para o nome do marcador

## Status

SPEC REVIEW — implementação aguarda revisão desta proposta.

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

1. Converter o campo de nome em combobox editável com lista de sugestões. Ao
   focar o campo vazio, apresentar o catálogo agrupado, sem exigir digitação.
2. Catálogo inicial, fixo no frontend:
   - Cardiovascular: Pressão arterial; Batimentos cardíacos.
   - Diabetes: Glicemia.
   - Corporal: Peso; Altura; Gordura corporal.
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
   Escape, nova edição ou novo foco permite reabrir a lista. A busca vazia volta
   a mostrar todas as categorias; ocultar grupos sem correspondências.
10. Usar semântica de combobox/listbox, rótulo associado, `aria-expanded`,
    `aria-controls`, `aria-autocomplete=list` e `aria-activedescendant` quando
    houver opção ativa. O foco permanece no input durante navegação pela lista.
    Categorias possuem rótulos acessíveis; opções têm IDs estáveis e únicos.
11. Reutilizar o diálogo e controles existentes; componente específico da feature
    para o campo, pois não há combobox editável compartilhado. Não converter o
    campo em ClinicalSelect: ele precisa continuar aceitando texto livre.
12. Usar tokens existentes em estilos da feature, alvos de 44 px, foco visível e
    lista com rolagem limitada. Em 320 px, nenhum overflow horizontal; cabeçalho,
    lista e botões devem continuar acessíveis por rolagem. Validar também 1440 px.

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

1. Dado o formulário novo, quando focar Nome do marcador vazio, então exibir as
   seis sugestões agrupadas nas três categorias e manter foco no campo.
2. Dado o catálogo aberto, quando digitar `PRESSAO`, então mostrar Pressão
   arterial no grupo Cardiovascular e ocultar sugestões sem correspondência.
3. Dado o texto `gli`, quando selecionar Glicemia por clique ou teclado, então
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

## Evidência TDD

Pendente: revisão da spec antes de iniciar testes e implementação.
