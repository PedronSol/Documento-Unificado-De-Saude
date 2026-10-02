# Compartilhamento Temporário do Resumo de Saúde

## Status

SPEC REVIEW

## Dependências

- Steps 5, 6 e 8 do roadmap.
- Marcadores e auditoria aprovados.

## Contexto e problema

O paciente precisa compartilhar um resumo clínico em uma consulta sem exigir que
o profissional destinatário tenha conta na plataforma.

## Objetivos

- Gerar link aleatório com validade de duas horas.
- Representar o link como QR-Code e permitir cópia.
- Exibir somente um resumo clínico mínimo.
- Revogar o acesso imediatamente.
- Não exigir login do destinatário.

## Não objetivos

- Compartilhar prontuário completo.
- Permitir edição pelo destinatário.
- Identificar ou cadastrar o médico visitante.
- Incluir dados clínicos diretamente no conteúdo do QR-Code.

## Regras de negócio

1. Apenas paciente autenticado gera ou revoga seu compartilhamento.
2. O token possui entropia adequada e somente seu hash é armazenado.
3. Validade inicial é de duas horas a partir da criação.
4. O QR-Code contém somente a URL pública com o token.
5. Resumo inclui alergias, medicações ativas, diagnósticos e biomarcadores recentes.
6. CPF, e-mail, documentos originais e histórico completo ficam fora do resumo.
7. Token expirado, revogado ou desconhecido nunca retorna dados clínicos.
8. Geração, revogação e acesso são auditados.
9. O endpoint público é somente leitura.

## Cenários de aceitação

### Cenário: gerar QR-Code temporário

Dado que sou paciente autenticado com dados clínicos
Quando gero acesso para consulta
Então recebo um link e QR-Code válidos por duas horas
E vejo o tempo restante e a ação de copiar link.

### Cenário: consultar sem cadastro

Dado um link válido
Quando o destinatário o abre em um navegador
Então vê página responsiva com alergias, medicações ativas, diagnósticos e taxas recentes
E não precisa realizar login.

### Cenário: bloquear link expirado

Dado que o link ultrapassou a validade
Quando alguém tenta acessá-lo
Então vê que o acesso expirou
E nenhum dado clínico é retornado.

### Cenário: revogar acesso

Dado que possuo compartilhamento ativo
Quando revogo o acesso
Então tentativas posteriores são bloqueadas imediatamente.

### Cenário: token adulterado

Dado um token desconhecido ou modificado
Quando o endpoint público é acessado
Então nenhum dado é retornado
E a resposta não revela se existe um paciente relacionado.

## Contratos propostos

```text
POST   /me/shares
GET    /me/shares/active
DELETE /me/shares/{share_id}
GET    /shares/{token}
```

- Geração retorna `201`.
- Expirado ou revogado retorna `410` na página pública.
- Token desconhecido retorna `404` sem detalhes clínicos.

## Dados propostos

```text
compartilhamentos
- id
- token_hash
- paciente_id
- criado_por_usuario_id
- expira_em
- revogado_em
- ultimo_acesso_em
- criado_em
```

## Segurança e autorização

- Token puro nunca é persistido nem registrado em logs.
- Comparação usa hash do token recebido.
- Resposta pública possui whitelist explícita de campos.
- Página pública não carrega endpoints privados.
- Acesso pode receber limitação de taxa quando a feature for implementada.

## Estratégia de testes

- Primeiro RED: token válido retorna somente os campos permitidos.
- Expiração usando relógio controlado.
- Revogação imediata.
- Token adulterado.
- Garantia de que CPF e e-mail não aparecem no payload.
- Playwright para QR, temporizador e página pública responsiva.

## Critérios de conclusão

- [ ] Spec aprovada.
- [ ] Token nunca é armazenado em texto puro.
- [ ] Expiração e revogação estão cobertas por testes.
- [ ] Payload público possui somente campos permitidos.
- [ ] Definition of Done atendida.

## Questões para revisão

1. Pode existir mais de um compartilhamento ativo por paciente? Recomendação
   inicial: apenas um; gerar um novo revoga o anterior.
2. Quantos biomarcadores recentes entram no resumo? Recomendação inicial: o
   último valor confirmado de cada tipo.
3. A página pública deve mostrar nome completo ou apenas primeiro nome?
