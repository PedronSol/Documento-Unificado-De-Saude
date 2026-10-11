# OCR e Revisão de Documentos de Saúde

## Status

SPEC WRITING

## Dependências

- Step 11 e spec `020-secure-document-storage.md`, ainda não implementados.
- Step 12 do roadmap.

## Contexto e problema

Depois que o armazenamento seguro existir, o paciente precisará extrair dados
de exames, revisar leituras incertas e confirmar explicitamente o que entrará
no histórico clínico. Esta spec preserva o escopo futuro que antes estava
misturado à entrega de armazenamento; seus contratos ainda exigem revisão antes
do Step 12.

## Objetivos

- Processar OCR fora da requisição de upload.
- Exibir confiança e exigir revisão de campos duvidosos.
- Permitir correção antes da confirmação.
- Vincular biomarcadores confirmados ao documento original.
- Preservar o documento original quando o processamento falhar.

## Não objetivos

- Diagnóstico automático ou interpretação clínica.
- Substituição do documento original.
- Escolha antecipada de provedor OCR.
- Alterar as regras de armazenamento, download ou remoção do Step 11.

## Regras preliminares

1. OCR altera o documento de `uploaded` para `processing` e depois para
   `needs_review` ou `failed`.
2. Dados extraídos são rascunho até confirmação explícita.
3. Campos abaixo do limite de confiança exigem revisão manual.
4. Correções substituem o valor extraído no rascunho e são auditadas.
5. Confirmação muda o documento para `confirmed` e cria biomarcadores de forma
   idempotente.
6. Falha muda o documento para `failed`, preservando o arquivo original.
7. Conteúdo integral e texto extraído não entram em logs ou snapshots.

## Cenários preliminares

### Cenário: OCR bem-sucedido

Dado um documento próprio no estado `uploaded`
Quando o worker processa o arquivo com sucesso
Então o documento passa por `processing` e chega a `needs_review`
E o paciente pode consultar os campos extraídos e suas confianças.

### Cenário: corrigir dado extraído

Dado que o OCR leu incorretamente um valor de glicemia
Quando o paciente corrige para `98 mg/dL` e confirma
Então o valor corrigido é persistido
E o valor original não é usado como biomarcador confirmado.

### Cenário: baixa confiança

Dado que existem campos abaixo do limite
Quando o paciente abre a revisão
Então vê os campos destacados
E não pode confirmar sem revisá-los.

### Cenário: falha do OCR

Dado um documento armazenado e íntegro
Quando o OCR falha
Então o documento passa para `failed`
E o arquivo original continua disponível conforme a autorização do Step 11.

## Contratos propostos para revisão futura

```text
GET  /me/documents/{document_id}/extraction
PUT  /me/documents/{document_id}/extraction
POST /me/documents/{document_id}/confirm
```

O modelo de jobs, o payload dos campos extraídos, o limite de confiança, as
transições idempotentes e os schemas de biomarcadores precisam ser definidos na
revisão do Step 12.

## Segurança e autorização

- Endpoints exigem paciente adulto e ownership derivado da sessão.
- O OCR trata arquivo e texto como dados não confiáveis.
- Texto integral não é enviado a logs nem à auditoria.
- Documento alheio ou removido nunca é processado ou retornado.

## Estratégia de testes preliminar

- Worker fake para sucesso, baixa confiança e falha.
- Ownership positivo e negativo em extração, correção e confirmação.
- Correção e confirmação idempotente.
- Preservação do arquivo original em todas as falhas.
- Playwright para revisão e confirmação.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | — | — | — | — |

## Critérios de conclusão preliminares

- [ ] Spec revisada e aprovada depois da conclusão do Step 11.
- [ ] Upload não aguarda OCR.
- [ ] Falha do OCR preserva o arquivo original.
- [ ] Biomarcadores somente nascem após confirmação.
- [ ] Definition of Done atendida.

## Questões para a revisão do Step 12

1. Qual modelo mínimo de biomarcador e unidade será introduzido?
2. Qual limite de confiança exige revisão manual?
3. Qual engine local ou provedor será usado e quais dados poderão sair do
   ambiente da aplicação?
4. Biomarcadores confirmados permanecem ativos quando a fonte é removida ou
   passam a indicar fonte removida?
