# Modularização Mínima do Backend

## Status

IMPLEMENTED

## Dependências

- Step 0 concluído.
- Decisões de fundação registradas em `000-foundation-decisions.md`.
- Contratos HTTP atuais caracterizados antes da movimentação do código.

## Contexto e problema

O backend concentra criação da aplicação FastAPI, leitura de ambiente,
conexão e transações MySQL, autenticação, autorização, consultas do
dashboard e operações de vacinas em `main.py`. Essa concentração dificulta
testar cada responsabilidade isoladamente e bloqueia a evolução incremental
prevista no roadmap.

A mudança é estrutural. Os contratos HTTP, as regras de autenticação e
autorização, o schema do banco e as respostas existentes devem permanecer
iguais.

## Objetivos

- Registrar testes de caracterização para os contratos HTTP atuais.
- Fazer `main.py` apenas construir e configurar a aplicação.
- Centralizar configuração da aplicação em `config.py`.
- Centralizar criação de conexões e limites de transação em `database.py`.
- Separar autenticação, paciente/dashboard e vacinas em módulos explícitos.
- Registrar as rotas por `APIRouter` sem alterar URLs ou payloads.
- Permitir que configuração e acesso ao banco sejam substituídos nos testes.
- Demonstrar por testes que entradas controladas pelo cliente não são
  interpoladas em comandos SQL.

## Não objetivos

- Alterar regras de negócio, mensagens, status HTTP ou schemas Pydantic.
- Alterar tabelas, colunas, constraints, seeds ou migrations.
- Introduzir ORM, repository genérico, unit of work, interfaces sem segundo
  consumidor ou uma arquitetura em camadas completa.
- Alterar o algoritmo de senha, o formato da sessão ou o cookie.
- Criar autenticação de médicos, papéis ou IDs internos; isso pertence ao Step 3.
- Modularizar alertas e documentos antes de existirem operações próprias para
  esses recursos.
- Alterar o frontend.

## Estrutura pretendida

```text
backend/
├── main.py                 # composition root e configuração do FastAPI
├── config.py               # configuração da aplicação
├── database.py             # conexão e transações da aplicação
├── auth/                   # login, logout, sessão e dependências
├── patients/               # perfil e montagem do dashboard
└── vaccines/               # operações do recurso vacina
```

Cada pacote pode conter somente os arquivos necessários para sua
responsabilidade atual. Não é requisito criar classes ou subcamadas simétricas.

## Regras de negócio e técnicas

1. A aplicação mantém o título `Documento Unificado de Saúde`.
2. `CORS_ORIGINS` aceita valores separados por vírgula e usa
   `http://localhost:3000` por padrão.
3. O cookie de sessão continua sendo `dus_session`, HTTP-only, `SameSite=Lax`,
   no path `/`, com duração definida por `SESSION_DURATION_HOURS` e flag
   `Secure` definida por `COOKIE_SECURE`.
4. Login válido remove sessões expiradas, cria uma sessão com token aleatório
   armazenado somente como hash e retorna o dashboard do paciente.
5. Login inválido não informa se o e-mail ou a senha está incorreto.
6. Logout remove a sessão apresentada, quando existir, e apaga o cookie.
7. Rotas `/me` exigem sessão existente e não expirada.
8. Somente paciente maior de idade pode criar, atualizar ou remover vacinas.
9. Toda consulta ou mutação de vacina usa o paciente autenticado; um
   identificador fornecido na URL nunca permite acessar vacina de outro
   paciente.
10. A idade continua sendo calculada na data da requisição, considerando se o
    aniversário do ano já ocorreu.
11. Respostas de paciente nunca expõem `senha_hash`, `criado_em` ou
    `data_nascimento`.
12. Conexões e cursores são fechados tanto em sucesso quanto em erro.
13. Mutações confirmam a transação em sucesso; o registro de vacina faz
    rollback quando o conector MySQL reporta erro.
14. Configuração e factory de conexão são montadas no composition root e
    podem ser substituídas nos testes sem banco real.
15. `main.py` não contém SQL nem regras de domínio e registra routers de
    autenticação, paciente e vacinas.
16. E-mail, token de sessão, campos de vacina e IDs de rota nunca são
    concatenados ou interpolados em SQL; valores aceitos chegam ao conector
    exclusivamente pelos parâmetros da query.

## Cenários de aceitação

### Cenário: caracterizar login válido

Dado um paciente existente com senha válida
Quando `POST /login` recebe suas credenciais
Então responde `200` com o dashboard atual
E cria o cookie `dus_session` com os atributos atuais
E persiste apenas o hash do token.

### Cenário: caracterizar login inválido

Dado um e-mail inexistente ou uma senha incorreta
Quando `POST /login` recebe as credenciais
Então responde `401` com `E-mail ou senha incorretos.`
E não cria uma sessão.

### Cenário: caracterizar sessão ausente ou inválida

Dado que o cliente não possui cookie ou apresenta sessão expirada
Quando acessa uma rota protegida
Então recebe `401`
E nenhum dado clínico é retornado.

### Cenário: caracterizar dashboard autenticado

Dado um paciente com sessão válida
Quando solicita `GET /me`
Então recebe `200` com perfil sanitizado, vacinas, alertas e documentos
E os nomes e formatos dos campos permanecem iguais aos atuais.

### Cenário: caracterizar listagem de vacinas

Dado um paciente com sessão válida
Quando solicita `GET /me/vaccines`
Então recebe `200` apenas com suas vacinas.

### Cenário: caracterizar mutações de vacinas

Dado um paciente adulto com sessão válida
Quando cria, atualiza ou remove uma vacina própria
Então recebe os mesmos status e mensagens atuais
E a operação é confirmada no banco.

### Cenário: preservar ownership de vacina

Dado um paciente adulto autenticado
Quando tenta atualizar ou remover uma vacina que não lhe pertence
Então recebe `404` com `Vacina não encontrada.`
E nenhum registro de outro paciente é alterado.

### Cenário: preservar restrição de menor de idade

Dado um paciente menor de idade autenticado
Quando tenta criar, atualizar ou remover uma vacina
Então recebe `403` com
`Menores de idade não podem alterar o prontuário.`.

### Cenário: preservar indisponibilidade do banco

Dado que uma conexão MySQL não pode ser criada
Quando uma operação precisa acessar o banco
Então recebe `503` com `Banco de dados indisponível.`
E credenciais do banco não aparecem na resposta.

### Cenário: compor a aplicação modular

Dado os módulos de autenticação, paciente e vacinas
Quando a aplicação é criada
Então todas as rotas atuais continuam registradas
E `main.py` não contém SQL nem implementa handlers de rota.

### Cenário: rejeitar tentativas de SQL injection

Dado que e-mail, cookie, campo de vacina ou ID da URL contém fragmentos SQL
Quando a requisição é processada
Então o fragmento nunca integra o texto do comando SQL
E valores válidos são enviados separadamente como parâmetros
E IDs incompatíveis com inteiro recebem `422` antes de qualquer mutação.

## Contratos afetados

### API preservada

| Método | Rota | Entrada | Sucesso | Erros caracterizados |
|---|---|---|---|---|
| `POST` | `/login` | form `username`, `password` | `200`, `LoginResponse`, cookie | `401`, `422`, `503` |
| `POST` | `/logout` | cookie opcional | `204`, remove cookie | `503` quando há cookie e o banco falha |
| `GET` | `/me` | cookie | `200`, `LoginResponse` | `401`, `404`, `503` |
| `POST` | `/me/vaccines` | cookie, `VaccineCreateUpdate` | `201`, mensagem | `400`, `401`, `403`, `422`, `503` |
| `GET` | `/me/vaccines` | cookie | `200`, lista de `Vaccine` | `401`, `503` |
| `PUT` | `/me/vaccines/{id_vacina}` | cookie, ID, `VaccineCreateUpdate` | `200`, mensagem | `401`, `403`, `404`, `422`, `503` |
| `DELETE` | `/me/vaccines/{id_vacina}` | cookie, ID | `200`, mensagem | `401`, `403`, `404`, `422`, `503` |

### Respostas preservadas

- `LoginResponse`: `message`, `patient_data`, `vaccines`, `alerts`, `documents`.
- `patient_data`: `cpf_paciente`, `nome_paciente`, `nome_completo`, `email`,
  `avatar`, `status_saude`, `tipo_sanguineo`, `valor_qr`,
  `maior_de_idade`, `idade`.
- Vacina: `id_vacina`, `nome_vacina`, `dose`, `data_aplicacao`,
  `status_vacina`.
- Os schemas Pydantic existentes continuam sendo a fonte dos contratos.

### Dados

- Nenhuma migration ou alteração de schema.
- SQL explícito e `mysql-connector` permanecem na aplicação.
- Consultas continuam parametrizadas.

## Segurança e autorização

- O token bruto existe apenas no cookie do cliente; o banco recebe seu SHA-256.
- O cookie continua HTTP-only e pode ser marcado como Secure por ambiente.
- Senha é verificada com o algoritmo atual e nunca é retornada.
- A identidade usada nas queries protegidas vem da sessão validada, não de
  CPF ou outro identificador controlado pelo cliente.
- Mutações de vacinas filtram simultaneamente `id_vacina` e
  `paciente_id`.
- A modularização não relaxa dependências FastAPI de autenticação e idade.
- Testes de segurança inspecionam separadamente o texto SQL e seus parâmetros,
  cobrindo login, sessão, criação de vacina e ID de rota.

## Casos de erro e limites

- Campos de vacina inválidos continuam produzindo `422` pelo Pydantic.
- Nome e dose vazios ou acima do limite continuam inválidos.
- Status de vacina fora de `pending`, `applied` e `overdue` continua inválido.
- Ausência de registro em update/delete continua indistinguível de registro
  pertencente a outro paciente e retorna `404`.
- A spec não corrige inconsistências de tratamento de erro preexistentes; um
  ajuste comportamental exige spec própria ou revisão desta spec.

## Estratégia de testes

### Baseline de caracterização

- Testar as sete operações HTTP com `TestClient` e doubles de banco.
- Fixar status, payloads, mensagens, cookie, autenticação, autorização e
  ownership antes de mover código.
- Exercitar payloads com fragmentos SQL e confirmar parametrização ou rejeição
  pela validação de tipo.
- Executar esses testes ainda contra o `main.py` atual; eles devem iniciar
  verdes porque registram comportamento existente.

### Primeiro ciclo TDD estrutural

**RED:** teste de composição importa `create_app` e os routers esperados, que
ainda não existem, e verifica a mesma tabela de rotas.

**GREEN:** extrair a factory da aplicação e registrar os routers com a menor
movimentação necessária.

**REFACTOR:** extrair configuração, conexão/transação e responsabilidades de
autenticação, paciente e vacinas em ciclos pequenos, mantendo a caracterização
verde a cada passo.

### Regressão

- Suíte completa de `backend/__tests__/`.
- OpenAPI ou tabela de rotas antes/depois para confirmar métodos, paths e
  response models.
- Sem necessidade de MySQL real quando os doubles cobrem a refatoração; smoke
  test no Compose ao final confirma integração da conexão.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| caracterização | Não se aplica: 7 testes registraram o legado já verde | Contratos congelados antes da movimentação | Ampliada para 12 casos, incluindo SQL injection e logout sem cookie | `backend/__tests__/test_api_characterization.py` |
| composition root | ImportError: `create_app` ausente | Factory mínima e 8 testes de composição/contrato verdes | Factory passou a criar instâncias independentes e registrar routers | `backend/__tests__/test_app_composition.py` |
| configuração | ModuleNotFoundError: `config` ausente | 2 testes de mapping e defaults verdes | Dataclass imutável; SQLAlchemy permaneceu fora do runtime da API | `backend/__tests__/test_config.py` |
| banco | ModuleNotFoundError: `database` ausente | 4 testes de conexão, fechamento, commit/rollback e `503` verdes | Context managers pequenos substituíram `try/finally` duplicado | `backend/__tests__/test_database.py` |
| módulos de domínio | ModuleNotFoundError: `auth` ausente | Routers de auth, patients e vaccines preservaram a caracterização | SQL e handlers removidos de `main.py`; regressões `422` e logout `503` detectadas e corrigidas | `backend/auth/`, `backend/patients/`, `backend/vaccines/` |

## Critérios de conclusão

- [x] Spec revisada e aprovada.
- [x] Contratos atuais cobertos por testes de caracterização.
- [x] `main.py` apenas configura a aplicação e registra routers.
- [x] Configuração extraída para `config.py`.
- [x] Conexões e transações extraídas para `database.py`.
- [x] Autenticação, paciente/dashboard e vacinas em módulos próprios.
- [x] Nenhum SQL permanece em `main.py`.
- [x] Nenhuma abstração genérica sem consumidor concreto foi adicionada.
- [x] Contratos HTTP e regras de segurança permanecem inalterados.
- [x] Tentativas de SQL injection cobertas para credenciais, sessão, payloads
  de vacina e IDs de rota.
- [x] Suíte do backend e smoke test de integração passam.
- [x] Roadmap e evidência RED/GREEN/REFACTOR atualizados.

## Questões para revisão

1. A divisão mínima em `auth/`, `patients/` e `vaccines/` atende ao escopo sem
   criar camadas adicionais? **Sim.**
2. Alertas e documentos permanecem como partes da leitura do dashboard até
   ganharem operações próprias; essa fronteira está adequada? **Sim.**
3. Os contratos listados devem ser congelados integralmente neste step, deixando
   qualquer correção comportamental para specs posteriores? **Sim.**

## Decisões e observações

- Documento iniciado em 2026-10-02 para o Step 2.
- Spec aprovada em 2026-10-02.
- A divisão mínima em `auth/`, `patients/` e `vaccines/` foi aprovada.
- Alertas e documentos permanecem na leitura do dashboard até possuírem
  operações próprias.
- Os contratos existentes ficam congelados neste step; correções de
  comportamento exigem uma spec posterior.
- Escopo de testes ampliado e aprovado pelo usuário em 2026-10-02 para cobrir
  tentativas de SQL injection.
- A caracterização precede a extração; ela não precisa falhar porque registra
  o comportamento legado. O primeiro RED do step será estrutural.
- Implementação concluída em 2026-10-02 na branch
  `refactor/backend-modularization`.
- Validação final: 44 testes passaram, incluindo 2 testes com MySQL real;
  imagem Docker construída; migrations concluídas; smoke test de `/me`
  retornou o `401` esperado.
