# Armazenamento Seguro de Documentos de Saúde

## Status

IMPLEMENTED

## Dependências

- Step 5 e spec `005-clinical-audit.md`, implementados.
- Step 7 e spec `030-medical-panel.md`, implementados.
- Step 10 e spec `007-administrative-access-governance.md`, implementados.
- Contratos e ownership da spec `004-resource-contracts-authorization.md`,
  implementados.
- Step 11 do roadmap.

## Contexto e problema

O paciente já vê uma lista de metadados em `GET /me/documents`, mas esses
registros demonstrativos não possuem arquivo armazenado e usam os estados
legados `new` e `viewed`. Não existem upload, download, remoção, validação do
conteúdo nem isolamento do armazenamento.

Esta entrega cria a base segura de arquivos exigida pelo OCR do Step 12 sem
antecipar processamento, extração ou biomarcadores. O binário fica fora do
MySQL, atrás de um contrato pequeno de armazenamento, e todo acesso continua
mediado pelo backend.

Depois da revisão de identidade e governança, documentos são informações
clínicas acessíveis somente pelo paciente proprietário e por médico verificado
com vínculo ativo aceito pelo paciente. A role `admin`, inclusive a que criou o
médico ou o vínculo, não recebe metadados nem conteúdo do documento.

## Objetivos

- Permitir que paciente adulto, inclusive responsável atuando por dependente
  com guarda ativa, envie PDF, JPEG ou PNG de até 10 MiB.
- Validar extensão, MIME declarado, assinatura real, tamanho e integridade
  estrutural básica antes de publicar o arquivo.
- Armazenar no banco somente metadados, checksum e uma chave interna aleatória.
- Implementar armazenamento local privado para desenvolvimento e Compose.
- Permitir listagem e download do documento próprio, inclusive por paciente
  menor autenticado.
- Permitir ao médico verificado listar e baixar documentos de paciente com
  vínculo ativo, repetindo a autorização no backend.
- Negar explicitamente ao admin qualquer listagem, metadado ou binário clínico.
- Implementar remoção lógica imediata e limpeza física controlada e repetível.
- Auditar upload, liberação de download e remoção sem registrar conteúdo ou
  identificadores sensíveis do arquivo.
- Atualizar a seção de documentos do dashboard no mesmo incremento vertical,
  permitindo também digitalizar uma página com a câmera do dispositivo antes
  de enviá-la pelo mesmo fluxo seguro.

## Não objetivos

- Executar OCR, criar jobs, extrair texto ou criar biomarcadores.
- Renderizar PDF ou imagem dentro da aplicação.
- Permitir upload ou remoção por médico.
- Permitir ao administrador qualquer operação, metadado ou acesso físico via
  API da aplicação, ainda que ele tenha criado o médico ou o vínculo.
- Compartilhar documentos por QR-Code ou pelo resumo público.
- Implementar armazenamento S3 nesta entrega; o contrato não deve impedir uma
  implementação futura, mas não incluirá configuração especulativa de provedor.
- Implementar antivírus, deduplicação, versionamento, edição ou restauração.
- Alterar ou substituir o documento depois do upload.
- Montar PDF multipágina, capturar várias páginas no mesmo documento, recortar,
  corrigir perspectiva, aplicar filtros ou melhorar automaticamente a imagem.
- Gravar vídeo, áudio ou enviar o fluxo ao vivo da câmera para o backend.
- Modernizar áreas do dashboard sem relação com documentos.

## Regras de negócio e técnicas

1. Somente um paciente adulto autenticado e com perfil consistente pode enviar
   ou remover documentos. Conforme a spec `036`, o responsável adulto com
   guarda ativa também pode fazê-lo no contexto do dependente; o ator continua
   sendo o usuário responsável e o ownership é do dependente. Pacientes menores
   agindo por conta própria podem listar e baixar, mas não alterar documentos.
2. `patient_id`, `actor_user_id`, datas, estado, tamanho, MIME real, checksum e
   chave de armazenamento são derivados pelo servidor; nenhum desses campos é
   aceito do cliente.
3. O upload usa `multipart/form-data` com exatamente um arquivo, `title` e
   `type`. `title` é normalizado nos espaços, tem de 1 a 120 caracteres e
   `type` aceita `exam`, `prescription`, `report` ou `other`.
4. O limite é 10 MiB (`10 * 1024 * 1024` bytes). O backend conta bytes durante
   a cópia para uma área temporária privada e interrompe a escrita assim que o
   limite é excedido; não carrega o corpo inteiro em memória para validar o
   limite.
5. Um arquivo válido deve possuir uma extensão permitida, MIME declarado
   compatível e conteúdo correspondente: `.pdf`/`application/pdf`,
   `.jpg` ou `.jpeg`/`image/jpeg`, ou `.png`/`image/png`.
6. A detecção real usa assinatura binária. A verificação básica também exige
   marcador final de PDF, fim de imagem JPEG ou chunk `IEND` de PNG. Arquivo
   vazio, truncado, com combinação divergente ou com bytes adicionais depois
   do marcador final é rejeitado. Essa verificação não é apresentada como
   proteção antivírus.
7. O nome original é reduzido ao basename, tem caracteres de controle
   removidos e fica limitado a 255 caracteres. Ele é metadado de exibição e
   nunca participa da construção do caminho físico.
8. A chave é criada pelo backend com 32 bytes aleatórios de CSPRNG e extensão
   canônica. Ela não contém nome original, ID, título nem dado do paciente e
   nunca é retornada pela API ou registrada em auditoria.
9. O contrato `DocumentStorage` possui apenas as operações necessárias agora:
   gravar atomicamente uma origem validada em uma chave nova, abrir uma chave
   para leitura e remover uma chave de modo idempotente. A implementação local
   confina toda chave a `DOCUMENT_STORAGE_ROOT`, rejeita path traversal, não
   sobrescreve arquivo existente e não fica sob diretório público do frontend.
10. O serviço recebe armazenamento e configuração pelo composition root. Regra
    de domínio não lê ambiente nem instancia filesystem.
11. Durante upload, o arquivo é validado e recebe SHA-256 enquanto é copiado
    para temporário. O registro e `document.uploaded` são preparados na mesma
    transação; o arquivo é publicado por rename atômico antes do commit. Falha
    anterior ao commit reverte banco e remove temporário ou arquivo publicado.
    Falha de limpeza pode deixar somente órfão sem referência, nunca registro
    ativo apontando para upload que respondeu sucesso.
12. Upload concluído cria o estado `uploaded`. `processing`, `needs_review`,
    `confirmed` e `failed` ficam reservados para o Step 12 e não são produzidos
    por comportamento deste step. `removed` é terminal para a API do Step 11.
13. Listagem omite documentos `removed`, ordena por `created_at` decrescente e,
    em empate, por `document_id` decrescente. Listagem rotineira não gera evento
    de auditoria, conforme a spec `005`.
14. Download do paciente resolve o documento pelo ID e pelo `patient_id` da
    sessão. Download médico resolve primeiro o paciente por perfil verificado e
    vínculo ativo e depois o documento ativo daquele paciente. Antes de liberar
    a resposta, ambos conferem existência, tamanho e SHA-256 do arquivo e
    confirmam `document.downloaded` com o ator real. Falha de armazenamento,
    integridade ou auditoria falha fechada e não entrega nenhum byte.
15. O download usa o MIME validado, `Content-Disposition: attachment` com nome
    seguro e os headers `Cache-Control: no-store, max-age=0`, `Pragma: no-cache`
    e `X-Content-Type-Options: nosniff`.
16. Documento inexistente, removido ou pertencente a outro paciente produz o
    mesmo `404`, sem revelar existência, ownership, estado ou chave.
17. Remoção bloqueia e resolve um documento ativo próprio, muda o estado para
    `removed`, define `removed_at` e grava `document.removed` na mesma transação.
    A partir do commit ele desaparece da lista e novos downloads são bloqueados.
18. Depois do commit de remoção, o backend tenta apagar o binário. Sucesso
    preenche `storage_deleted_at`; falha não reativa o recurso nem retorna o
    arquivo ao usuário e é registrada apenas em log operacional sem chave, nome
    ou dados clínicos.
19. Um comando explícito de manutenção repete a limpeza de documentos removidos
    com `storage_deleted_at` nulo. Remover chave já ausente conta como sucesso.
    O comando não remove arquivo de documento ativo nem arquivos arbitrários.
20. O nome original, chave, checksum e conteúdo não entram em snapshots. A
    allowlist de auditoria contém somente `title`, `type`, `media_type`,
    `size_bytes` e `status`.
21. Arquivos temporários e o diretório local não são versionados. No Compose,
    `DOCUMENT_STORAGE_ROOT` aponta para volume nomeado persistente e privado do
    backend; frontend e servidor web não montam esse volume.
22. Os registros demonstrativos legados não possuem binário. A migration os
    preserva como `removed`, com `removed_at`, sem inventar chave ou checksum, e
    o seed deixa de criá-los como documentos ativos.
23. A listagem médica repete o mesmo verificador de grupo/vínculo de cada rota
    `/medical`; não confia em paciente previamente listado nem em controle do
    frontend. Vínculo pendente, recusado, revogado, inativo ou expirado não vale.
24. A listagem médica retorna os mesmos metadados seguros da listagem do
    paciente e grava `medical_documents.viewed` antes de responder. Falha de
    auditoria retorna `503` sem metadados.
25. Médico não envia nem remove documentos nesta entrega. Esses métodos
    retornam `403` mesmo quando o vínculo é ativo.
26. Admin recebe `403` em todas as rotas `/me/documents` e `/medical/...`, mesmo
    se uma inconsistência externa tiver acumulado outra role na conta, e não
    existe rota `/admin` de documentos. Diretório administrativo e auditoria
    administrativa não fazem join com `documents`.
27. O sigilo contra a role `admin` é regra da aplicação. A segurança de
    operadores com acesso direto à infraestrutura pertence ao Step 14 e deve
    usar controles operacionais, backup e acesso ao volume fora desta API.
28. O digitalizador é uma alternativa ao seletor de arquivo e fica disponível
    ao paciente adulto, inclusive ao responsável adulto no contexto autorizado
    do dependente. A interface solicita acesso à câmera apenas
    depois de uma ação explícita em `Digitalizar com a câmera`; abrir o dashboard
    ou o diálogo de upload nunca dispara a permissão.
29. A captura usa `navigator.mediaDevices.getUserMedia` com vídeo, áudio
    desabilitado e preferência não obrigatória pela câmera traseira. O recurso
    depende de contexto seguro (`HTTPS` ou `localhost`). Navegador sem suporte,
    câmera ausente ou ocupada e permissão negada ou dispensada produzem feedback
    acessível e mantêm a seleção de arquivo disponível.
30. O stream existe somente durante a captura. Todas as tracks são encerradas
    ao capturar, cancelar, fechar o diálogo, trocar para arquivo ou desmontar o
    componente. O frame capturado vira um `File` JPEG local com nome seguro sem
    dado do paciente, passa a ser a prévia estática e pode ser refeito antes do
    envio; a imagem não é enviada automaticamente.
31. A foto digitalizada usa o mesmo `POST /me/documents`, os mesmos campos,
    validações, limite de 10 MiB, ownership e auditoria de qualquer JPEG. A API
    não aceita nem registra a origem `camera`, e o backend não confia na captura
    do navegador para validar o arquivo.
32. A captura, a prévia e o arquivo preparado ficam apenas em memória. O
    frontend não os grava em `localStorage`, `sessionStorage`, IndexedDB, Cache
    API ou service worker; object URLs são revogadas e referências são
    descartadas ao substituir a imagem, concluir o upload ou fechar o diálogo.
33. A aplicação limita câmera ao próprio origin por
    `Permissions-Policy: camera=(self)` e não delega acesso a iframes. A prévia
    ao vivo e as ações de capturar, refazer, cancelar e enviar possuem nome
    acessível, foco visível e alvo mínimo de 44 px.
34. A seção de documentos continua renderizada quando a lista está vazia para
    apresentar o estado vazio e, ao paciente adulto, as ações de escolher
    arquivo e digitalizar. A ausência de documentos não pode esconder a porta
    de entrada do primeiro upload.

## Matriz de autorização

| Operação | Papel | Ownership | Falhas relevantes |
|---|---|---|---|
| `GET /me/documents` | paciente | `patient_id` da sessão | `401`, `403` |
| `POST /me/documents` | paciente adulto ou responsável adulto | `patient_id` efetivo da sessão | `401`, `403`, `413`, `422`, `503` |
| `GET /me/documents/{document_id}/file` | paciente | documento próprio ativo | `401`, `403`, `404`, `503` |
| `DELETE /me/documents/{document_id}` | paciente adulto ou responsável adulto | documento ativo do contexto efetivo | `401`, `403`, `404`, `503` |
| `GET /medical/patients/{patient_id}/documents` | médico verificado | vínculo ativo aceito | `401`, `403`, `503` |
| `GET /medical/patients/{patient_id}/documents/{document_id}/file` | médico verificado | vínculo ativo e documento ativo do paciente | `401`, `403`, `404`, `503` |

Role sem perfil de paciente recebe `403`. IDs inexistentes, removidos ou de
outro paciente permanecem indistinguíveis em operações por recurso.
Na área médica, paciente inexistente ou sem vínculo retorna o `403` uniforme da
spec `030`; somente depois de autorizar o paciente um documento ausente ou
removido retorna `404`. Admin recebe `403` sem executar consulta clínica.

## Cenários de aceitação

### Cenário: enviar documento válido

Dado um paciente adulto autenticado
Quando envia um PDF válido menor ou igual a 10 MiB com título e tipo válidos
Então recebe `201` com metadados e estado `uploaded`
E o binário fica no armazenamento privado sob chave aleatória
E o banco não contém o binário
E a chave interna e o checksum não aparecem na resposta
E `document.uploaded` é confirmado na mesma transação do registro.

### Cenário: rejeitar formato disfarçado ou corrompido

Dado um paciente adulto autenticado
Quando envia ZIP renomeado para PDF, MIME divergente ou imagem truncada
Então recebe `422` com mensagem genérica de arquivo inválido
E nenhum registro, evento, temporário ou arquivo publicado permanece.

### Cenário: interromper arquivo acima do limite

Dado um paciente adulto autenticado
Quando o fluxo ultrapassa 10 MiB
Então a gravação é interrompida e recebe `413`
E nenhum registro, evento ou arquivo permanece
E a resposta não depende de confiar em `Content-Length`.

### Cenário: falhar durante a publicação do arquivo

Dado um upload válido cujos metadados ainda não foram confirmados
Quando o armazenamento falha ao publicar o arquivo
Então recebe `503`
E registro e auditoria são revertidos
E a limpeza do temporário é tentada.

### Cenário: falhar ao confirmar banco depois da publicação

Dado um arquivo publicado sob uma chave nova
Quando o commit do registro e da auditoria falha
Então recebe `503`
E o backend remove o arquivo publicado de modo compensatório
E nunca retorna sucesso com metadados não confirmados.

### Cenário: listar somente documentos ativos próprios

Dado um paciente autenticado com documentos ativos, removidos e registros de
outros pacientes
Quando consulta sua lista
Então recebe somente os documentos ativos próprios em ordem decrescente
E a resposta não contém chave, checksum nem caminho físico.

### Cenário: baixar documento próprio íntegro

Dado um paciente autenticado e um documento ativo próprio
Quando solicita o arquivo e sua integridade é confirmada
Então recebe o binário como anexo com MIME e headers seguros
E `document.downloaded` é confirmado antes de qualquer byte ser liberado.

### Cenário: bloquear documento alheio ou removido

Dado um paciente autenticado
Quando tenta baixar ou remover ID inexistente, removido ou de outro paciente
Então recebe a mesma resposta `404`
E nenhum metadado, arquivo ou evento de sucesso é exposto.

### Cenário: falhar fechado no download

Dado um documento próprio cujo arquivo sumiu, foi alterado ou cuja auditoria
está indisponível
Quando o paciente solicita o download
Então recebe `503` sem corpo do arquivo
E nenhum byte parcial é enviado.

### Cenário: remover logicamente antes da limpeza física

Dado um paciente adulto com documento ativo próprio
Quando confirma a remoção
Então recebe `204` depois da remoção lógica e de `document.removed`
E o documento some da lista e deixa de aceitar download imediatamente
E falha ao apagar o binário fica pendente para limpeza sem restaurar acesso.

### Cenário: impedir mutação por menor ou outro papel

Dado um paciente menor agindo por conta própria, médico sem perfil de paciente
ou administrador
Quando tenta enviar ou remover documento
Então recebe `403`
E nenhum arquivo, registro ou evento de sucesso é criado.

### Cenário: médico baixa documento de paciente vinculado

Dado um médico verificado e um paciente que aceitou vínculo ainda ativo
Quando o médico lista e baixa um documento ativo desse paciente
Então recebe somente os metadados seguros e o arquivo íntegro
E a listagem e o download registram o usuário médico como ator
E o médico não recebe controles ou endpoints de upload e remoção.

### Cenário: vínculo inválido não libera documento

Dado um convite pendente, recusado, revogado, inativo ou expirado
Quando o médico tenta listar ou baixar documento do paciente
Então recebe `403` sem confirmar a existência do paciente ou do documento
E nenhum metadado, binário ou evento de sucesso é liberado.

### Cenário: admin nunca acessa documento

Dado um admin que cadastrou o médico e criou o convite aceito pelo paciente
Quando tenta listar ou baixar documentos pelas rotas existentes de paciente ou
médico
Então recebe `403`
E não existe endpoint administrativo alternativo para documentos
E nenhuma consulta a metadados, arquivo ou auditoria clínica é executada.

### Cenário: operar documentos no dashboard

Dado um paciente adulto no dashboard em viewport de 320 px ou ampla
Quando abre a seção de documentos
Então consegue selecionar tipo, escolher arquivo, enviar, baixar e confirmar
remoção sem overflow
E vê estados independentes de carregamento, vazio, envio, sucesso e erro
E paciente menor vê lista e download sem controles de mutação.

### Cenário: digitalizar uma página com consentimento explícito

Dado um paciente adulto autenticado em contexto seguro e com câmera disponível
Quando escolhe `Digitalizar com a câmera` e concede a permissão do navegador
Então a interface abre a prévia ao vivo sem capturar áudio
E permite capturar uma página, revisar a imagem estática e refazer a captura
E encerra todas as tracks antes de exibir a imagem estática
E somente envia o JPEG pelo contrato existente após o paciente informar título
e tipo e confirmar o envio.

### Cenário: preservar privacidade ao abandonar a digitalização

Dado que a prévia da câmera está ativa ou existe uma foto ainda não enviada
Quando o paciente cancela, fecha o diálogo, troca para o seletor de arquivo ou
sai da tela
Então todas as tracks da câmera são encerradas
E a prévia, o arquivo temporário e seu object URL são descartados
E nenhum upload, registro clínico ou evento de sucesso é criado.

### Cenário: manter alternativa quando a câmera não puder ser usada

Dado um paciente adulto em navegador sem suporte, sem câmera, com câmera
ocupada, em contexto inseguro ou que negou ou dispensou a permissão
Quando tenta iniciar a digitalização
Então recebe mensagem acessível sem detalhe técnico sensível
E consegue continuar pelo seletor de PDF, JPG ou PNG
E a interface não solicita novamente a permissão sem nova ação explícita.

## Contratos afetados

### API

```text
GET    /me/documents
POST   /me/documents
GET    /me/documents/{document_id}/file
DELETE /me/documents/{document_id}
GET    /medical/patients/{patient_id}/documents
GET    /medical/patients/{patient_id}/documents/{document_id}/file
```

`POST /me/documents` recebe `multipart/form-data`:

```text
title: Hemograma de outubro
type: exam
file: <hemograma.pdf; application/pdf>
```

O upload retorna `201` e a listagem retorna `200` com o mesmo schema de item:

```json
{
  "document_id": 42,
  "title": "Hemograma de outubro",
  "type": "exam",
  "original_filename": "hemograma.pdf",
  "media_type": "application/pdf",
  "size_bytes": 482731,
  "status": "uploaded",
  "created_at": "2026-10-10T15:30:00.000000"
}
```

As duas rotas de arquivo retornam `200` com o binário ou falham antes de iniciar
o corpo. `DELETE` retorna `204` sem corpo. A listagem médica reutiliza
`DocumentSummary[]` e não inclui dados adicionais do paciente.

Os schemas Pydantic de resposta e os valores de `type` e `status` são usados
diretamente nos testes de contrato. Nenhuma resposta inclui `patient_id`,
`storage_key`, `sha256`, `removed_at` ou `storage_deleted_at`.

O digitalizador não cria endpoint, campo ou resposta adicional. A foto aprovada
no cliente é enviada como `file` JPEG no mesmo `multipart/form-data`; o servidor
aplica todas as validações como faria com um JPEG escolhido do dispositivo.

### Erros

| Situação | Status | `detail` |
|---|---:|---|
| sessão ausente ou inválida | `401` | contrato existente de autenticação |
| role sem paciente, admin, médico sem vínculo ou menor em mutação | `403` | contrato existente de autorização |
| recurso ausente, removido ou alheio | `404` | `Documento não encontrado.` |
| arquivo excede 10 MiB | `413` | `O arquivo excede o limite de 10 MB.` |
| campo, extensão, MIME, assinatura ou integridade inválida | `422` | `Envie um arquivo PDF, JPG ou PNG válido.` para falhas do arquivo; validação Pydantic para campos |
| banco, auditoria, armazenamento ou integridade armazenada indisponível | `503` | `Documento temporariamente indisponível.` |

As mensagens não incluem caminho, chave, checksum, nome interno, SQL nem causa
do provedor. Ausência de espaço e permissão do filesystem usam o mesmo `503`.

### Dados e migration

A migration forward-only `0013` evolui `documents` sem alterar migrations
aplicadas. O modelo passa a manter:

- `id_documento` e `patient_id`, preservando IDs e ownership existentes;
- `titulo_documento` e `tipo_documento` (`exam`, `prescription`, `report`,
  `other`);
- `original_filename`, `storage_key` única, `media_type`, `size_bytes` e
  `sha256` hexadecimal;
- `status_documento` com `uploaded`, `processing`, `needs_review`, `confirmed`,
  `failed` e `removed`;
- `created_at`, `removed_at` e `storage_deleted_at` em UTC com microssegundos.

Novos registros ativos exigem todos os metadados do arquivo. Campos de arquivo
podem ser nulos apenas nos registros legados convertidos para `removed`; uma
constraint impede novo documento ativo sem chave, MIME, tamanho e checksum.
`storage_key` é única, `size_bytes` precisa ser positivo e `sha256` possui 64
caracteres hexadecimais. Há índice para `(patient_id, status_documento,
created_at, id_documento)` e para a fila de limpeza `(status_documento,
storage_deleted_at)`.

A migration converte os registros `new`/`viewed` existentes para `removed`,
preenche `created_at` a partir da data legada e define `removed_at` no momento da
migration. O teste em MySQL real prova upgrade com registro legado e aplicação
idempotente pelo Alembic.

### Armazenamento e configuração

- `DOCUMENT_STORAGE_ROOT`: diretório privado; no Compose,
  `/var/lib/dus/documents`.
- `DOCUMENT_MAX_BYTES`: inteiro positivo; padrão `10485760`.
- Volume nomeado `document_data`, montado somente no backend.

Valores inválidos falham na inicialização. A raiz é criada com permissão
restrita quando ausente; falha de criação impede o backend de anunciar saúde.

### Auditoria

| Ação | Momento | Snapshots permitidos |
|---|---|---|
| `document.uploaded` | depois do INSERT, antes da publicação/commit | anterior nulo; posterior com allowlist |
| `document.downloaded` | depois de validar arquivo, antes da resposta | anterior nulo; posterior com allowlist |
| `document.removed` | depois de bloquear/alterar, antes do commit | anterior e posterior com allowlist |
| `medical_documents.viewed` | depois de autorizar o paciente, antes da lista | snapshots nulos; paciente/recurso identificados pelo evento |

O snapshot posterior da remoção difere apenas pelo estado `removed`. Datas,
nome original, chave, checksum, corpo e texto extraído não são serializados.

### Frontend

A seção existente `DigitalDocuments` deixa o padrão visual legado e passa a
usar tokens `--ds-*` e componentes compartilhados. A entrega inclui:

- cabeçalho de seção com ação de upload apenas para paciente adulto;
- diálogo acessível com título, `ClinicalSelect` para tipo, input de arquivo e
  ação secundária `Digitalizar com a câmera`;
- descrição de PDF/JPG/PNG e 10 MB antes da seleção;
- estado de câmera com pedido de permissão somente após clique, prévia ao vivo,
  captura de uma página, prévia estática, refazer e cancelar;
- fallback permanente para escolher arquivo e feedback acessível para câmera
  indisponível, ocupada, não suportada ou sem permissão;
- itens com título, tipo, nome original, tamanho, data e estado;
- download autenticado sem persistir blob e com revogação do object URL;
- diálogo de confirmação para remoção, com foco devolvido ao gatilho;
- feedback local de envio, download, remoção e erros sem apagar os demais
  recursos carregados do dashboard.
- seção somente leitura no prontuário médico, com lista, download autenticado,
  vazio, erro e acesso negado sem manter dados do paciente anterior.

Alvos interativos têm no mínimo 44 px, foco é visível e o fluxo funciona sem
overflow a partir de 320 px. O conteúdo respeita `--ds-layout-content`, reduced
motion, quebra de nomes longos e o espaço do dock multirole quando aplicável.

## Segurança e autorização

- Autorização é aplicada no backend; esconder controles é apenas UX.
- Rotas `/me` usam o paciente derivado da sessão e nunca aceitam um ID de
  paciente fornecido pelo cliente.
- Rotas médicas aceitam `patient_id`, mas repetem no mesmo SQL a verificação do
  vínculo ativo aceito; o ID nunca é prova de autorização.
- A role `admin` não é aceita por nenhuma dependência de documento e não possui
  rota alternativa para arquivo ou metadado.
- Arquivos ficam fora de `frontend/public`, não recebem URL direta e nunca são
  servidos pelo servidor web sem a autorização do backend.
- Chaves aleatórias não substituem ownership; ambas as proteções são obrigatórias.
- Upload é entrada não confiável. Nenhuma ferramenta externa ou interpretador é
  executado nesta entrega.
- Permissão de câmera é solicitada pelo navegador somente após gesto explícito,
  sem áudio, limitada ao próprio origin e sem persistir a captura no cliente.
- A câmera nunca é iniciada por paciente menor agindo por conta própria, médico
  ou admin; responsável adulto em contexto de guarda ativa segue a autorização
  da spec `036`. A ausência do controle no frontend não substitui o `403` do
  backend para mutações.
- Logs e auditoria não contêm corpo, nome original, chave, checksum ou texto do
  documento.
- Respostas de download impedem sniffing e armazenamento em cache; o service
  worker continua sem cachear API, HTML autenticado ou dado clínico.

## Casos de erro e limites

- Upload vazio, múltiplos arquivos, nome sem extensão ou campos extras falha
  sem persistência parcial.
- Falha ao obter a câmera não fecha o diálogo nem remove título, tipo ou arquivo
  que já tenham sido informados; ela afeta somente o estado do digitalizador.
- Foto capturada acima de 10 MiB não pode ser enviada pela interface e ainda é
  rejeitada pelo limite autoritativo do backend caso o cliente seja contornado.
- Títulos ou nomes multibyte respeitam limites depois da normalização.
- Dois uploads iguais são permitidos; checksum não implica deduplicação.
- Colisão de chave gera nova chave antes da persistência e nunca sobrescreve.
- Cliente desconectado durante upload aciona limpeza do temporário.
- Falha de limpeza física depois da remoção não reabre acesso.
- Execuções concorrentes da limpeza são idempotentes e usam bloqueio no banco
  para não disputar o mesmo registro.
- O Step 14 poderá definir quota por paciente, retenção, antivírus e observabilidade
  adicional; nenhum limite não especificado é introduzido agora.

## Estratégia de testes

- Primeiro RED: `POST /me/documents` com PDF mínimo válido deve retornar `201`,
  persistir somente metadados e arquivo por chave aleatória e auditar na mesma
  transação; hoje a rota aceita somente `GET` e responde `405`.
- Testes unitários do validador cobrem PDF, JPEG, PNG, vazio, truncado, assinatura,
  final, MIME/extensão divergentes, tamanho exato e primeiro byte acima do limite.
- Testes unitários do armazenamento local cobrem confinamento da raiz, chave
  inválida, colisão, publicação atômica, leitura e remoção idempotente.
- Testes de serviço cobrem falha ao gravar, auditar, publicar, confirmar banco,
  compensar arquivo e limpar fisicamente.
- Testes de API reutilizam schemas Pydantic e cobrem lista, upload, download,
  remoção, sessão ausente, role errada, menoridade e ownership negativo.
- Testes médicos cobrem vínculo aceito e cada estado inválido, troca de
  `patient_id`, documento alheio, auditoria e proibição de mutação.
- Testes administrativos provam `403` antes de qualquer query clínica, inclusive
  para o admin que criou o médico, grupo e convite.
- Teste específico prova que nenhum byte é liberado quando integridade ou
  auditoria do download falha.
- Testes de auditoria provam a allowlist e a ausência de conteúdo, nome, chave e
  checksum nos snapshots.
- Testes da migration cobrem estrutura, upgrade de registro legado e MySQL 8
  real; a migration anterior permanece inalterada.
- Testes de frontend cobrem estados, upload, download, remoção, menoridade,
  foco, erro isolado e nomes longos.
- Testes de frontend simulam `mediaDevices` e cobrem ausência de solicitação no
  carregamento, pedido após clique, preferência pela câmera traseira sem áudio,
  captura JPEG, refazer, troca para arquivo, permissão negada, falta de suporte,
  limite de tamanho e `stop()` de todas as tracks em cada saída do fluxo.
- Teste de integração da configuração confirma
  `Permissions-Policy: camera=(self)`, e o estado vazio do dashboard mantém as
  ações de upload e digitalização para paciente adulto.
- Teste de contrato do frontend prova que arquivo escolhido e foto capturada
  produzem o mesmo `FormData` e que nenhum marcador de origem da câmera é
  enviado ou persistido.
- Playwright valida o fluxo principal em 320 px e viewport ampla, sem overflow,
  e regressão dos consumidores do dashboard e do dock multirole. Com mídia
  simulada, cobre permissão concedida e captura; com permissão negada, confirma
  o erro recuperável e o fallback para arquivo.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | `POST /me/documents` com PDF mínimo válido respondia `405`: em `HEAD` (`6bbcbfb`) a rota aceita somente `GET` | validador por assinatura e marcador final, `LocalDocumentStorage` confinado à raiz, `DocumentService` com publicação atômica e compensação, migration `0013`, download íntegro auditado e remoção lógica | storage, limite e configuração injetados no composition root | `test_documents.py`, `test_migrations.py`, `test_resource_contracts.py`, `test_api_characterization.py`, `test_config.py`, `test_app_composition.py` |
| 2 | limpeza física sem comando de manutenção (`cleanup-documents` inexistente) | `cleanup_removed_documents` com bloqueio no banco e remoção idempotente, alvo `make documents-cleanup` | caso de uso injetado em `database_tasks` | `test_document_cleanup.py`, `test_migrations.py` |
| 3 | rotas `/medical/patients/{id}/documents` inexistentes e prontuário sem seção de documentos | listagem e download médicos com vínculo ativo no mesmo SQL e `medical_documents.viewed`; seção somente leitura no prontuário | reutilização de `DocumentSummary` e dos auxiliares de download do paciente | `test_documents.py`, `doctor-dashboard.test.jsx` |
| 4 | em `HEAD` não havia ação `Digitalizar com a câmera` nem `getUserMedia` no frontend | diálogo de upload com `ClinicalSelect`, digitalizador de página única, encerramento das tracks e `Permissions-Policy: camera=(self)` | mesmo `FormData` para arquivo e captura; estilos em tokens `--ds-*` | `digital-documents.test.jsx`, `design-system.test.js`, `login.spec.ts` |

Os ciclos RED/GREEN foram executados nas sessões registradas no roadmap em
2026-10-11. A saída textual das falhas não foi retida; o estado RED de base foi
reconfirmado inspecionando `HEAD` (`6bbcbfb`) em worktree isolada.

## Critérios de conclusão

- [x] Spec aprovada antes do primeiro teste.
- [x] PDF, JPEG e PNG válidos de até 10 MiB podem ser enviados.
- [x] Arquivos inválidos, corrompidos ou grandes não deixam estado parcial.
- [x] Binários não ficam no MySQL, em diretório público ou no Git.
- [x] Nomes físicos não são previsíveis nem derivados de dados do paciente.
- [x] Ownership positivo e negativo está automatizado em download e remoção.
- [x] Médico vinculado possui leitura auditada; vínculo inválido falha fechado.
- [x] Admin não acessa metadado, binário ou auditoria clínica de documento.
- [x] Auditoria falha fechada e contém somente a allowlist.
- [x] Remoção lógica bloqueia acesso antes da limpeza física.
- [x] Dashboard permite operar documentos em 320 px e viewport ampla.
- [x] Paciente adulto digitaliza uma página após consentimento explícito e pode
      revisar, refazer ou enviar a captura pelo contrato existente.
- [x] Câmera nunca inicia sem gesto do paciente; áudio fica desabilitado e todas
      as tracks e prévias locais são liberadas ao sair do fluxo.
- [x] Indisponibilidade ou recusa da câmera mantém upload por arquivo utilizável;
      paciente menor e demais papéis não recebem o controle de digitalização.
- [x] Migration passa em banco vazio e upgrade com dado legado no MySQL 8.
- [x] Testes afetados, regressão, build, `git diff --check` e `git status` foram
  verificados.
- [x] Spec, documentação de ambiente, roadmap e referência de commit ou PR estão
  sincronizados.
- [x] Definition of Done do roadmap atendida.

## Verificações executadas

- Backend: `python -m pytest` (191 passed, 52 skipped) e
  `RUN_DB_INTEGRATION=1 python -m pytest` no MySQL 8 real (243 passed),
  incluindo upgrade da migration `0013` com registro legado.
- Frontend: `npm test` (104 passed), `npx playwright test` (33 passed, com a
  digitalização em 320 px e 1280 px) e `npm run build`.
- `git diff --check` sem pendências.
- Não executado: `npm run lint` (`eslint` não instalado no projeto, situação
  anterior); câmera física real (mídia simulada por canvas nos testes).

## Decisões e observações

1. O limite inicial é 10 MiB e pode ser reduzido por ambiente, nunca elevado
   acima desse teto sem nova revisão de segurança e da spec.
2. Download é `attachment`; preview autenticado fica fora deste step.
3. Registros legados sem binário são preservados como removidos para não fingir
   que um arquivo inexistente está disponível.
4. O contrato pequeno permite armazenamento remoto futuro sem criar uma camada
   de provedor que não possui consumidor atual.
5. OCR e os estados posteriores permanecem na spec
   `021-health-document-ocr.md` e dependem desta entrega concluída.
6. A reavaliação de 2026-10-10 moveu esta entrega do Step 9 para o Step 11 e
   incorporou o consumidor médico autorizado, mantendo admin fora do prontuário.
7. O digitalizador captura uma página JPEG por documento e reaproveita o upload
   existente. Captura multipágina, PDF, recorte, perspectiva e filtros exigem
   nova revisão de produto e segurança; não são implícitos nesta entrega.
8. A migration desta entrega é `0013`, pois as migrations `0009` a `0012`
   passaram a atender vínculos diretos, cadastro assistido, guarda e
   transferência de conta antes do início do Step 11.
