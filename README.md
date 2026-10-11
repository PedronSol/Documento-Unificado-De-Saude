# Documento-Unificado-de-Saude-DUS

## Índice
- [Sobre o Projeto](#sobre-o-projeto)
- [Como clonar ou baixar](#como-clonar-ou-baixar)
- [Como Executar?](#como-executar)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Licença](#licença)

## Sobre o Projeto

### Título
Documento Unificado de Saúde (DUS)

### Descrição
Este é um projeto universitário para as disciplinas de Engenharia de Software e Banco de Dados do curso de Engenharia de Computação da UFRN, que busca criar uma aplicação para servir como um centralizador de dados pessoais e de saúde para auxiliar pessoas e pacientes na organização e utilização de seus dados de saúde e exames.

### Componentes
- Diogo Esthevão Silva de Oliveira
- Luis Gabriel Alves de Oliveira
- Pedro Nelson Nóbrega Monteiro Leite Fonseca
- Reinaldo Tavares da Silva Filho

## Como clonar ou baixar

### Clonar via HTTPS

```bash
git clone https://github.com/PedronSol/Documento-Unificado-de-Saude-DUS.git
```

Clonar por este método criará uma cópia local deste repositório em sua máquina.

### Clonar via SSH (Apenas se houver chave SSH configurada no GitHub)

```bash
git clone git@github.com:PedronSol/Documento-Unificado-de-Saude-DUS.git
```

Clonar por este método criará uma cópia local deste repositório em sua máquina.

### Baixar como ZIP

1. Acesse a página do repositório no GitHub:
   [https://github.com/PedronSol/Documento-Unificado-de-Saude-DUS](https://github.com/PedronSol/Documento-Unificado-de-Saude-DUS)
2. Clique no botão **Code** (verde).
3. Selecione **Download ZIP**.
4. Extraia o arquivo ZIP para o local desejado em seu computador.

## Como Executar?

Os principais comandos de desenvolvimento estão disponíveis no `Makefile`:

```bash
make front-dev  # inicia o frontend local
make back-dev   # inicia o backend local
make both       # inicia frontend e backend locais em paralelo
make build      # constrói as imagens Docker
make local-up   # sobe banco, aplica migrations/seeds e inicia o backend
make db-migrate # aplica migrations pendentes via Docker
make db-seed    # carrega dados demonstrativos em desenvolvimento
make db-reset   # recria o banco local e reaplica migrations/seeds
```

Os comandos `db-*` executam dentro do Compose. Para executar o backend
diretamente no host, exporte `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e
`DB_NAME` conforme o MySQL local. Configure também `PUBLIC_APP_URL` com a origem
pública do frontend usada nos links temporários; `.env.example` documenta os
valores esperados. Documentos enviados ficam fora do banco e do diretório
público, em `DOCUMENT_STORAGE_ROOT`; `DOCUMENT_MAX_BYTES` limita cada arquivo a
no máximo 10 MiB. No Compose, o volume privado `document_data` é montado somente
no backend.

Para executar a aplicação como um todo, deve-se entrar no diretório no qual o projeto foi clonado e executar o comando:
```Docker
docker compose up --build
```
Isso fará com que todos os contêineres da aplicação sejam criados e, após esse passo (e o carregamento de todos os contêineres), torna-se possível acessar a aplicação via http://localhost:3000. É válido citar que, para executar o comando Docker acima, deve-se ter instalado em sua máquina o "Docker" e o "Docker Compose".

Ao acessar a aplicação, será solicitado um login, e para fins de testes é possível utilizar os usuários "carlos.silva@email.com" e "mariana.souza@email.com", ambos com a senha "senha123".

Uma vez que os contêineres estiverem completamente montados e a aplicação funcionando, para executar os testes unitários, deve-se abrir um outro terminal, também no diretório do projeto, e executar o comando:
```Docker
docker exec -it saude_backend_container python -m pytest
```

Por fim, para finalizar a execução do projeto, basta utilizar o comando:
```Docker
docker compose down -v
```

## Estrutura do Projeto

### Banco de Dados
A primeira parte do projeto é o banco MySQL. O schema evolui por revisões
Alembic versionadas em `db/migrations/versions/`, enquanto dados fictícios de desenvolvimento
ficam separados em `db/seeds/`. O serviço `migrate` aplica alterações pendentes
antes da inicialização do backend. Migrations aplicadas são imutáveis; correções
devem ser feitas em uma nova migration. O SQLAlchemy é usado somente nessa
infraestrutura; as regras da aplicação não dependem do ORM.

### Front End

A segunda parte do projeto é sua interface, que contém a página de login, a página principal e seus componentes. A interface foi feita com Next.js e está presente na pasta `frontend`.

### Back End

A terceira parte é o backend, responsável pelas rotas, autenticação e
autorização. O código está em `backend/` e os testes em `backend/__tests__/`.

### Docker

A última parte, por fim, é a conteinerização de cada uma das partes citadas acima, feitas utilizando dois arquivos "Dockerfile", um para o Back e outro para o Front e um arquivo "docker-compose.yml" para gerir os contêineres do Front, Back e Banco de Dados

## Licença
Este projeto está licenciado sob a **Licença MIT**. Veja o arquivo `LICENSE` para mais detalhes.
