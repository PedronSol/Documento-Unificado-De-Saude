# Marcadores de Saúde do Paciente

## Status

SPEC REVIEW

## Dependências

- Steps 3, 4, 5 e 6 do roadmap.
- Identidade, ownership e auditoria aprovados.

## Contexto e problema

O paciente precisa manter medicações, diagnósticos, condições crônicas e
alergias atualizados sem perder o histórico de itens removidos ou suspensos.

## Objetivos

- Listar marcadores ativos do paciente autenticado.
- Criar e editar marcadores próprios.
- Desativar marcadores sem apagar histórico.
- Impedir duplicidade ativa.
- Registrar autoria e data de todas as alterações.

## Não objetivos

- Prescrição médica eletrônica.
- Validação de interação medicamentosa.
- Compartilhamento por QR-Code.
- Operações médicas, tratadas na spec `030-medical-panel.md`.

## Regras de negócio

1. Tipos iniciais: `medication`, `diagnosis`, `condition` e `allergy`.
2. Nome é obrigatório após remoção de espaços externos.
3. Medicação pode possuir dosagem e frequência.
4. Um paciente não pode ter dois marcadores ativos com mesmo tipo e nome
   normalizado, sem diferenciar maiúsculas, minúsculas ou espaços externos.
5. Remover significa alterar o status para `removed` e registrar `desativado_em`.
6. Marcadores removidos não aparecem na listagem ativa, mas permanecem no histórico.
7. Somente paciente adulto pode alterar seu prontuário diretamente.
8. Toda alteração registra usuário responsável e auditoria.
9. O backend deriva o paciente da sessão; IDs enviados pelo cliente não definem ownership.

## Cenários de aceitação

### Cenário: adicionar medicação

Dado que sou um paciente adulto autenticado
Quando cadastro uma medicação chamada "Losartana", dosagem "50mg" e frequência
"1x ao dia"
Então o marcador passa a aparecer na minha listagem ativa
E recebo confirmação de que foi salvo.

### Cenário: rejeitar nome vazio

Dado que abri o formulário de marcador
Quando tento cadastrar o marcador sem nome
Então o envio é impedido
E vejo que o nome é obrigatório.

### Cenário: impedir marcador ativo duplicado

Dado que possuo "Diabetes Tipo 2" ativo como condição
Quando tento cadastrar novamente a mesma condição
Então recebo um conflito informando que ela já está cadastrada
E a interface oferece acesso à edição do marcador existente.

### Cenário: remover marcador

Dado que possuo "Aspirina 100mg" ativa
Quando escolho remover e confirmo a ação
Então o marcador é desativado
E deixa de aparecer na listagem ativa
E permanece no histórico com data e autoria.

### Cenário: cancelar remoção

Dado que solicitei a remoção de "Hipertensão"
Quando cancelo a confirmação
Então nenhuma requisição de alteração é enviada
E o marcador permanece inalterado.

### Cenário: bloquear alteração de outro paciente

Dado que estou autenticado como paciente
Quando tento alterar diretamente o ID de um marcador que não me pertence
Então o backend não modifica o recurso
E retorna uma resposta segura sem expor dados do proprietário.

## Contratos propostos

```text
GET    /me/markers?status=active
POST   /me/markers
PUT    /me/markers/{marker_id}
DELETE /me/markers/{marker_id}
```

- `POST` retorna `201`.
- Duplicidade ativa retorna `409`.
- Nome ou tipo inválido retorna `422`.
- Recurso próprio inexistente retorna `404`.
- Menor de idade recebe `403` em operações de escrita.

## Dados propostos

```text
marcadores_saude
- id
- paciente_id
- tipo
- nome
- nome_normalizado
- descricao
- dosagem
- frequencia
- status
- criado_por_usuario_id
- atualizado_por_usuario_id
- criado_em
- atualizado_em
- desativado_em
```

## Segurança e autorização

- Todas as rotas exigem autenticação.
- Ownership é verificado no `WHERE` da consulta de escrita.
- O payload não aceita `paciente_id` nem autoria.
- Casos positivos e negativos entram na matriz de autorização.

## Estratégia de testes

- Primeiro RED: cadastrar medicação válida para o paciente autenticado.
- Validação de nome e tipo.
- Duplicidade normalizada.
- Desativação lógica.
- Ownership e menoridade.
- Auditoria na mesma transação.
- Playwright para confirmação, cancelamento e mensagens.

## Critérios de conclusão

- [ ] Spec aprovada.
- [ ] Todos os cenários possuem teste automatizado.
- [ ] Nenhuma remoção física ocorre.
- [ ] API e UI usam os mesmos estados definidos.
- [ ] Definition of Done atendida.

## Questões para revisão

1. Duplicidade deve considerar também dosagem? Recomendação inicial: não; editar
   o marcador existente para mudar dosagem.
2. Marcador removido pode ser reativado? Recomendação inicial: fora da primeira versão.
