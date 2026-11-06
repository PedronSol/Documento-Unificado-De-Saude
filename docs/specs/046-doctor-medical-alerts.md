# Alertas médicos no prontuário do médico

## Status

IMPLEMENTED — aprovada pelo usuário em 2026-11-06; implementação na branch
`feat/document-open-doctor-alerts` (commit registrado no roadmap).

## Dependências e tarefa selecionada

- Complemento do Step 7, desbloqueado: spec `030-medical-panel.md`
  (prontuário longitudinal autorizado e auditado).
- Spec `004-resource-contracts-authorization.md` (`AlertResponse`).
- Specs `031-interface-design-system.md` e `037-frontend-organization.md`.

## Contexto e problema

Alertas médicos (alergias, condições e medicações relevantes) ficam na tabela
`alerts` e só são expostos por `GET /me/alerts`, consumido pelo
`AlertsSection` do paciente. O prontuário médico
(`GET /medical/patients/{patient_id}` → `MedicalRecordView`) mostra
identificação, tipo sanguíneo, vacinas, documentos e marcadores, mas **não**
os alertas. Justamente quem atende deixa de ver, por exemplo, uma alergia de
severidade alta.

## Objetivos

- Exibir o card `Alertas médicos` no prontuário do médico, logo após a
  identificação do paciente.
- Entregar os alertas na resposta já autorizada e auditada do prontuário.
- Reutilizar `AlertResponse` e o componente `MedicalAlerts`.

## Não objetivos

- Criar, editar ou remover alertas (pelo médico ou pelo paciente).
- Novo endpoint, paginação, busca ou filtro de alertas no prontuário.
- Migration, alteração da tabela `alerts` ou nova ação de auditoria.
- Redesenhar o card de alertas do paciente.

## Regras de negócio

1. `MedicalRecordResponse` ganha o campo aditivo `alerts: list[AlertResponse]`.
2. Os alertas são lidos na mesma transação de `get_medical_record`, somente
   depois de `get_authorized_medical_patient` aprovar o acesso, filtrados por
   `patient_id` da rota já autorizada.
3. Ordenação: severidade `high`, `medium`, `low`; empate por `id_alerta`.
4. A auditoria `medical_record.viewed` existente cobre a leitura; nenhuma ação
   nova é registrada. Falha de auditoria continua retornando `503` sem dados.
5. O frontend renderiza `MedicalAlerts` com cabeçalho `Alertas médicos`
   imediatamente após o bloco de identificação do prontuário (antes de ações
   provisórias, vacinas, documentos e marcadores).
6. Sem alertas, o card aparece com o texto `Nenhum alerta médico registrado.`,
   para distinguir ausência de alertas de falha de carregamento.
7. O card é somente leitura no prontuário, inclusive para paciente menor.

## Cenários Given/When/Then

### Médico vê alertas do paciente autorizado

Dado um médico com acesso ativo ao paciente que possui alertas
Quando abre o prontuário
Então o card `Alertas médicos` lista título, tipo, descrição e severidade
E os alertas de severidade alta aparecem primeiro.

### Paciente sem alertas

Dado um paciente autorizado sem alertas
Quando o médico abre o prontuário
Então o card mostra `Nenhum alerta médico registrado.`

### Paciente não autorizado

Dado um médico sem vínculo ativo com o paciente
Quando requisita o prontuário
Então recebe `403` e nenhuma consulta de alertas é executada.

### Falha de banco ou auditoria

Dado que a consulta ou a auditoria falham
Quando o prontuário é solicitado
Então a resposta é `503` sem alertas parciais, como hoje.

## Contratos, erros e configuração

- `GET /medical/patients/{patient_id}` → `MedicalRecordResponse` com
  `alerts: [{ alert_id, type, title, description, severity }]`.
- Erros inalterados: `401`, `403`, `404` de rota inválida no frontend, `503`.

## Segurança e autorização

- Somente médico autenticado (`get_current_doctor`) e autorizado pelo
  `AUTHORIZED_PATIENT_CLAUSE` lê alertas; nenhum identificador do cliente além
  do `patient_id` da rota, já validado.
- Lista de colunas explícita (allowlist) via `AlertResponse`.
- Sem dados em store global, Web Storage ou service worker.

## Interface e acessibilidade

- Reutilizar `components/alerts/medical-alerts.jsx`; o estado vazio entra no
  próprio componente (prop opcional) sem duplicar card.
- Título como heading acessível, severidade sempre em texto, sem depender de
  cor; sem overflow a 320 px; layout limitado por `--ds-layout-content`.
- Regressão no consumidor existente (`AlertsSection` do paciente).

## Estratégia de testes e evidência TDD

1. RED backend: em `__tests__/test_medical_area.py`, o teste do prontuário
   espera `alerts` ordenados por severidade. Confirmar falha pela ausência
   do campo.
2. RED backend: acesso não autorizado não consulta `alerts`.
3. RED frontend: `tests/medical-record.test.jsx` espera a região
   `Alertas médicos` com o alerta e o estado vazio.
4. Regressão: `AlertsSection` do paciente, testes da área médica e E2E do
   prontuário em 320 px e 1440 px.
5. `python -m pytest`, `npm test` afetado e `npm run build`.

| Ciclo | RED | GREEN | REFACTOR | Referência |
|---|---|---|---|---|
| Contrato backend | `pytest __tests__/test_medical_area.py`: 1 falha e 11 sucessos; `KeyError: 'alerts'` | Consulta de `alerts` na transação autorizada, `ORDER BY FIELD(severidade_alerta, 'high', 'medium', 'low'), id_alerta`, campo `alerts` em `MedicalRecordResponse`; 13 sucessos | Sem refactor: consulta única e explícita, sem helper sem segundo consumidor | Branch `feat/document-open-doctor-alerts` |
| Card no prontuário | `vitest run tests/medical-record.test.jsx`: 2 falhas e 14 sucessos; região `Alertas médicos` ausente | Seção após a identificação reutilizando `MedicalAlerts` com `emptyText`; 16 sucessos | Estilos da seção reaproveitam os seletores de vacinação; fixtures de prontuário atualizadas ao contrato | Branch `feat/document-open-doctor-alerts` |

## Critérios de aceite e conclusão

- [x] Spec revisada antes de implementar.
- [x] Prontuário médico retorna e exibe alertas ordenados.
- [x] Estado vazio explícito.
- [x] Autorização e auditoria preservadas.
- [x] 320 px e viewport ampla verificados.
- [x] Evidência TDD, roadmap e commit registrados.

## Verificações da entrega

- Backend em container Python 3.11 com MySQL 8.0 descartável:
  `RUN_DB_INTEGRATION=1 python -m pytest`: 337 aprovados, nenhum ignorado,
  incluindo `get_medical_record` contra banco real.
- `vitest run --maxWorkers=2`: 367 testes unitários aprovados; consumidor do
  paciente (`AlertsSection`) sem regressão.
- `npm run build` aprovado; 61 E2E aprovados no build de produção, incluindo
  `médico vê alertas médicos no prontuário` em 320 px e 1280 px (ordem antes
  de Vacinação, sem overflow). Capturas inspecionadas após a animação de
  entrada.
