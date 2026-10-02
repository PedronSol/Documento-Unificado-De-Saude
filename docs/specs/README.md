# Specs

Esta pasta contém as especificações que orientam as implementações. Uma spec
deve ser revisada antes do início do código de produção e permanecer sincronizada
com o comportamento entregue.

## Convenção de nomes

```text
NNN-nome-curto-da-feature.md
```

Exemplo: `001-database-migrations.md`.

## Template

```markdown
# Título da mudança

## Status

SPEC WRITING | SPEC REVIEW | SPEC APPROVED | IMPLEMENTED

## Dependências

- Steps, specs ou decisões necessárias.

## Contexto e problema

Descreva o comportamento atual e o problema concreto.

## Objetivos

- Resultado observável que a mudança deve entregar.

## Não objetivos

- Comportamentos e infraestrutura deliberadamente fora do escopo.

## Regras de negócio

1. Regras explícitas e verificáveis.

## Cenários de aceitação

### Cenário: nome

Dado que ...
Quando ...
Então ...

## Contratos afetados

### API

- Método, rota, entrada, saída e erros.

### Dados

- Tabelas, campos, constraints e estratégia de migração.

## Segurança e autorização

- Quem pode executar a operação.
- Como ownership, papel e dados sensíveis serão protegidos.

## Casos de erro e limites

- Entradas inválidas, conflitos, indisponibilidade e limites de tamanho.

## Estratégia de testes

- Primeiro teste RED.
- Testes unitários.
- Testes de integração.
- Testes ponta a ponta.
- Casos positivos e negativos de autorização.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | — | — | — | — |

## Critérios de conclusão

- [ ] Cenários implementados e testados.
- [ ] Definition of Done do roadmap atendida.

## Decisões e observações

- Decisões tomadas durante a revisão da spec.
```

## Regra de atualização

Se uma regra nova for descoberta durante a implementação, pare, atualize a spec
e obtenha revisão antes de escrever o comportamento correspondente.
