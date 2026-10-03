# Documentos de Saúde e OCR

## Status

SPEC REVIEW

## Dependências

- Steps 5, 9 e 10 do roadmap.
- Armazenamento, auditoria e ownership aprovados.

## Contexto e problema

O paciente precisa enviar exames, laudos e receitas, revisar dados extraídos por
OCR e somente então incorporá-los ao histórico clínico.

## Objetivos

- Armazenar PDF, JPG e PNG com segurança.
- Processar OCR fora da requisição de upload.
- Exibir confiança e exigir revisão de campos duvidosos.
- Permitir correção antes da confirmação.
- Vincular biomarcadores confirmados ao documento original.
- Remover documentos da biblioteca de forma auditável.

## Não objetivos

- Diagnóstico automático.
- Interpretação clínica dos resultados.
- Substituição do documento original.
- Escolha definitiva de provedor OCR ou armazenamento remoto.

## Regras de negócio

1. Formatos aceitos: PDF, JPG e PNG, validados por conteúdo e não só extensão.
2. O nome físico do arquivo é aleatório e não expõe dados do paciente.
3. O banco armazena metadados e chave, nunca o binário.
4. Upload cria documento em `uploaded` e job de OCR.
5. OCR altera o documento para `processing`, `needs_review`, `confirmed` ou `failed`.
6. Campos de baixa confiança exigem revisão manual.
7. Dados extraídos são rascunho até confirmação explícita.
8. Correções do paciente substituem o valor extraído no rascunho e são auditadas.
9. Confirmação cria biomarcadores de forma idempotente.
10. Remoção é lógica e bloqueia novos acessos ao arquivo.

## Cenários de aceitação

### Cenário: upload e OCR bem-sucedido

Dado que sou um paciente autenticado
Quando envio um PDF ou imagem válida
Então o upload é aceito e o processamento é iniciado
E posso consultar o progresso
E, ao revisar e confirmar, o documento entra na biblioteca
E os biomarcadores confirmados entram na linha do tempo.

### Cenário: corrigir dado extraído

Dado que o OCR leu incorretamente um valor de glicemia
Quando corrijo o valor para "98 mg/dL" e confirmo
Então o valor corrigido é persistido
E o valor original não é usado como biomarcador confirmado.

### Cenário: rejeitar arquivo inválido

Dado que sou um paciente autenticado
Quando envio ZIP, executável ou PDF corrompido
Então o sistema rejeita o upload
E informa que somente PDF, JPG e PNG válidos são aceitos.

### Cenário: baixa confiança

Dado que o OCR encontrou campos com confiança abaixo do limite
Quando abro a revisão
Então vejo o aviso de leitura imprecisa
E os campos afetados aparecem destacados
E não posso confirmar sem revisá-los.

### Cenário: remover documento

Dado que possuo um documento armazenado
Quando solicito a remoção e confirmo
Então o documento deixa de aparecer na biblioteca ativa
E novos downloads são bloqueados
E a remoção é registrada na auditoria.

## Contratos propostos

```text
GET    /me/documents
POST   /me/documents
GET    /me/documents/{document_id}
GET    /me/documents/{document_id}/file
GET    /me/documents/{document_id}/extraction
PUT    /me/documents/{document_id}/extraction
POST   /me/documents/{document_id}/confirm
DELETE /me/documents/{document_id}
```

- Upload aceito retorna `202`.
- Formato ou conteúdo inválido retorna `422`.
- Arquivo acima do limite retorna `413`.
- Recurso de outro paciente nunca é retornado.

## Segurança e autorização

- Todos os endpoints, exceto nenhum nesta spec, exigem autenticação.
- Chaves internas de armazenamento não são retornadas ao cliente.
- Download passa pelo backend ou por URL curta e assinada.
- O OCR trata conteúdo do documento como dado não confiável.
- Logs não incluem texto integral extraído.

## Estratégia de testes

- Primeiro RED: aceitar arquivo válido e criar documento mais job.
- Arquivos inválidos, corrompidos e grandes.
- Ownership no download e remoção.
- OCR fake para sucesso, baixa confiança e falha.
- Correção e confirmação idempotente.
- Playwright para revisão e remoção.

## Critérios de conclusão

- [ ] Spec aprovada.
- [ ] Upload não aguarda o OCR.
- [ ] Falha do OCR preserva o arquivo original.
- [ ] Biomarcadores somente nascem após confirmação.
- [ ] Definition of Done atendida.

## Questões para revisão

1. Limite inicial por arquivo: recomendação de 10 MB.
2. Ao remover o documento, biomarcadores já confirmados devem permanecer com
   indicação de fonte removida ou também ser desativados? Requer decisão clínica.
3. Existe provedor obrigatório de OCR ou armazenamento no ambiente final?
