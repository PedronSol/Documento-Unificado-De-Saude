# Autorização e Autenticação

Para o Sprint 04 da matéria de Engenharia de Software foi solicitado que fossem implementados mecanismos simples de autorização e autenticação na aplicação. A explicação da implementação e do funcionamento destes conceitos está descrita a seguir.

## Autenticação

A autenticação começa na página de login. A senha fornecida é verificada contra um hash PBKDF2 armazenado no banco; senhas em texto puro não são armazenadas. Após uma autenticação válida, a API cria uma sessão aleatória com expiração, armazena apenas o hash do token no MySQL e envia o token ao navegador em um cookie `HttpOnly`. As rotas privadas consultam essa sessão para identificar o paciente atual.

## Autorização

A autorização é feita com base na idade do paciente, em um modelo simples de **ABAC** (*Attribute-Based Access Control*). A idade é calculada no backend a partir da data de nascimento armazenada no banco.

Pacientes adultos podem adicionar, alterar e remover suas vacinas. Para menores de idade, os controles não são exibidos no frontend e, principalmente, o backend rejeita essas alterações com status HTTP 403. As rotas usam o paciente identificado pela sessão e não aceitam um CPF arbitrário enviado pelo cliente.

## Testes

Para testar a autenticação e a autorização simultâneamente, é possível utilizar as combinações "carlos.silva@email.com" (usuário) e "senha123" (senha) para o usuário Carlos Silva que possui 41 anos, e "mariana.souza@email.com" (usuário) e "senha123" (senha) para a usuário Mariana Souza que é uma criança de 4 anos.
