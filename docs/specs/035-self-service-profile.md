# Spec 035 — Edição dos próprios dados cadastrais

## Contexto e problema

A aplicação autentica usuários e expõe sua identidade em `/me`, mas não oferece
uma forma de corrigir informações básicas da própria conta. A tela `/settings`
precisa permitir alterações de baixo risco sem expor edição de identificadores
ou dados clínicos cuja alteração possa comprometer identidade e prontuário.

## História

Como usuário autenticado, quero atualizar meu nome de exibição e, se tenho
perfil de paciente, meu nome preferido, para manter meus dados de identificação
atualizados.

## Escopo dos campos

- Editáveis por qualquer usuário autenticado: `display_name`.
- Editável somente quando o próprio usuário possui perfil de paciente:
  `preferred_name`.
- Somente leitura: e-mail, CPF, nome civil (`full_name`), data de nascimento,
  tipo sanguíneo, CRM/UF e status de verificação profissional.
- Não permitir edição de idade calculada, papéis, vínculos/grupos, dados clínicos,
  avatar/foto, senha ou status da conta nesta entrega.
- Não permitir alteração do e-mail: ele também identifica login e não existe
  fluxo de confirmação de novo endereço.
- Nome civil e data de nascimento requerem processo de correção/verificação
  separado; tipo sanguíneo pertence ao fluxo clínico.

## Regras de negócio e validação

- Atualizações sempre se referem ao usuário autenticado da sessão; cliente não
  envia `user_id`, `patient_id` ou CPF como alvo.
- Remover espaços externos dos nomes e rejeitar resultado vazio.
- `display_name`: 1–100 caracteres após trim, conforme coluna `users`.
- `preferred_name`: 1–20 caracteres após trim, conforme coluna `patients`.
- Campos ausentes não são alterados; payload vazio é rejeitado.
- Campos extras ou campos somente leitura são rejeitados (422), não ignorados.
- Nome preferido não altera `full_name` e não altera dados de autenticação.
- Após sucesso, `/me` retorna os novos valores; a UI sincroniza o cabeçalho/menu
  sem exigir logout.

## Contrato proposto

- `PATCH /me/profile`, autenticado por cookie de sessão.
- Request:

  ```json
  {
    "display_name": "Helena Costa",
    "preferred_name": "Helena"
  }
  ```

  `preferred_name` é opcional e permitido apenas para usuário com perfil de
  paciente. Um usuário exclusivamente profissional pode enviar somente
  `display_name`.
- Response `200`: mesmo envelope tipado de `GET /me`, com identidade e perfil
  atualizados.
- `401` sem sessão válida; `422` para campos fora do contrato ou inválidos;
  `409` para inconsistência entre identidade e perfil paciente; `503` para
  indisponibilidade do banco, sem indicar/retornar dados de outras contas.
- Atualizar as duas tabelas, quando aplicável, em uma única transação. Em erro,
  nenhuma alteração parcial deve ser persistida.

## Segurança e privacidade

- Autorização obrigatória no backend; atualizar linhas por `user_id` obtido da
  sessão, nunca por identificador fornecido pelo cliente.
- Usuário sem perfil paciente não pode alterar `preferred_name` nem consultar ou
  alterar perfil de outra pessoa.
- SQL parametrizado; não registrar payloads de perfil ou dados pessoais em logs.
- A API usa cookie `HttpOnly`, `SameSite=Lax` e CORS com origens permitidas
  configuráveis. O `PATCH` aceita JSON (que exige preflight cross-origin); não
  ampliar CORS nem aceitar formatos simples de formulário para esta operação.
- CORS deve permitir o método `PATCH` às origens já configuradas, sem ampliar a
  allowlist de origens ou headers.
- Não enfraquecer o contrato de sessão nem permitir origem cross-origin fora da
  allowlist configurada.
- Não criar campos adicionais, dados de auditoria ou migração sem necessidade
  demonstrada pela implementação e incorporada à spec.

## Cenários de aceitação (Given/When/Then)

### Atualização própria de nome de exibição

Given uma sessão autenticada
When o usuário envia `PATCH /me/profile` com `display_name` válido
Then somente seu `users.display_name` é atualizado
And a resposta contém o novo nome e os dados atuais de `/me`.

### Atualização de nome preferido de paciente

Given uma sessão autenticada de usuário com perfil de paciente
When envia `preferred_name` válido
Then somente o nome preferido de seu perfil é alterado
And o nome civil permanece inalterado.

### Impedir alteração alheia ou de campos protegidos

Given uma sessão autenticada
When o cliente inclui `user_id`, CPF, e-mail, nome civil, data de nascimento ou
campo clínico no payload
Then a API rejeita o payload com 422 e nenhuma linha é alterada.

### Rejeitar campo específico de paciente a usuário sem perfil

Given uma sessão sem perfil de paciente
When o cliente envia `preferred_name`
Then a API rejeita o payload e não altera identidade ou dados de terceiros.

### Validação e atomicidade

Given um payload vazio, nome vazio após trim ou nome acima do limite
When o cliente envia a atualização
Then recebe 422 sem alteração parcial.

### Sem sessão

Given nenhuma sessão válida
When o cliente chama `PATCH /me/profile`
Then recebe 401 e nenhuma alteração ocorre.

### Interface de configurações

Given usuário autenticado em `/settings`
When a página carrega
Then nome e, para paciente, nome preferido são editáveis
And e-mail e demais dados explicitamente somente leitura aparecem identificados
And sucesso, validação e erro de serviço têm feedback acessível.

## Não objetivos

- Alteração/verificação de e-mail, senha, CPF, nome civil ou data de nascimento.
- Upload de avatar, gestão de papéis, vínculo médico, preferências de tema,
  auditoria de atividade ou redefinição de credenciais.
- Editar informações clínicas nesta tela.

## Estratégia de testes

- RED backend para escopo próprio, isolamento de `user_id`, campos extras,
  validação, transação/atomicidade e regras de usuário sem paciente.
- RED frontend para rota protegida, campos por perfil, erros, sucesso e
  atualização do resumo da identidade.
- Playwright mobile-first para menu → `/settings`, fluxo completo e ausência de
  overflow em viewport de 320 px.
- Executar testes backend/frontend afetados, build e verificação do diff.

## Dependências e critérios de conclusão

- Spec 034 aprovada para acesso via menu e rota `/settings`.
- Revisão explícita desta spec antes da implementação; registrar RED antes do
  código de produção.
- Implementação de API, UI, autorização e testes sincronizada com as specs e o
  roadmap.

## Revisão

- Estado: SPEC APPROVED em 2026-10-08 pelo usuário.
- TDD: RED na API com `404` para `PATCH /me/profile`; RED no preflight CORS com
  `400` para `PATCH`. GREEN com atualização autoescopada/transacional,
  `422` para campos extras/fora do escopo e allowlist de origem preservada.
- Verificações: testes de rollback, limites de nomes e sessão; edição E2E a
  320 px; suíte de backend/frontend, E2E e build registrados no roadmap ao
  publicar a alteração.
- Implementação concluída na branch `feat/medical-panel`, PR #7. `npm run lint`
  não executou porque o binário `eslint` não está instalado no workspace.
