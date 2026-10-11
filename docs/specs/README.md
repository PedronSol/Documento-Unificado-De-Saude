# Specs

Esta pasta contém as especificações que orientam as implementações. Uma spec
deve ser revisada antes do início do código de produção e permanecer sincronizada
com o comportamento entregue.

## Convenção de nomes

```text
NNN-nome-curto-da-feature.md
```

Exemplo: `001-database-migrations.md`.

## Índice atual

| Spec | Assunto | Status |
|---|---|---|
| `000-foundation-decisions.md` | Decisões arquiteturais iniciais | SPEC APPROVED |
| `001-database-migrations.md` | Migrações versionadas | IMPLEMENTED |
| `002-backend-modularization.md` | Modularização mínima do backend | IMPLEMENTED |
| `003-unified-identity-roles-frontend.md` | Identidade, roles e experiência de acesso | SPEC APPROVED |
| `004-resource-contracts-authorization.md` | Contratos e autorização por recurso | IMPLEMENTED |
| `005-clinical-audit.md` | Auditoria clínica transacional | IMPLEMENTED |
| `006-patient-onboarding-authentication.md` | Cadastro local de pacientes e Google OIDC opcional | IMPLEMENTED |
| `007-administrative-access-governance.md` | Governança administrativa e vínculos | IMPLEMENTED |
| `010-health-markers.md` | Marcadores do paciente | IMPLEMENTED |
| `020-secure-document-storage.md` | Armazenamento e digitalização segura de documentos | SPEC APPROVED |
| `021-health-document-ocr.md` | OCR e revisão de documentos | SPEC WRITING |
| `030-medical-panel.md` | Área médica e grupos de atendimento | IMPLEMENTED |
| `031-interface-design-system.md` | Design system e interface médica | IMPLEMENTED |
| `032-mobile-context-dock.md` | Navegação de contexto em mobile | IMPLEMENTED |
| `033-mobile-pwa.md` | Experiência mobile-first e PWA instalável | IMPLEMENTED |
| `036-doctor-assisted-patient-registration.md` | Cadastro assistido de pacientes e responsáveis legais | IMPLEMENTED |
| `040-health-summary-sharing.md` | Compartilhamento temporário | IMPLEMENTED |

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

## Evidência de strict TDD

A descrição do PR, ou o registro de evolução quando não houver PR, deve informar:

```text
Spec: docs/specs/NNN-feature.md
RED: teste criado, comando executado e motivo esperado da falha
GREEN: implementação mínima e comando que passou
REFACTOR: melhoria realizada ou justificativa para não haver refactor
Regressão: suítes adicionais executadas
```

O estado RED precisa ser observado antes do código de produção, mas não precisa
ser publicado como commit quebrado. A tabela `Evidência TDD` da spec recebe a
referência do commit ou PR que contém o ciclo concluído.
