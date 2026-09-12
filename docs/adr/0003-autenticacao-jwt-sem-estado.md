# 0003. Usar JWT sem estado para autenticação de usuários

* **Status:** Aceito
* **Data:** 2026-09-11

## Contexto

A primeira fatia da sprint de Autenticação precisa entregar cadastro, login e
logout funcionando ponta a ponta, em um único dia, servindo os dois papéis do
sistema (passageiro e motorista). Essa fatia é bloqueante para todo o resto do
projeto — matching e rastreamento em tempo real dependem de saber quem é o
usuário autenticado — então a decisão precisa ser simples de implementar, com
baixo risco técnico, e não pode depender de infraestrutura que ainda não existe.

## Decisão

Vamos adotar autenticação **stateless via JWT** (JSON Web Token): o token é
assinado com um segredo compartilhado, carrega o id do usuário (`sub`), e é
validado a cada requisição por um middleware, sem consulta a uma tabela de
sessões. O logout é tratado inteiramente no cliente (descarte do token) — não
há lista de revogação no servidor nesta fatia.

## Alternativas Consideradas

* **Sessão com cookie + armazenamento no servidor (ex.: Redis):** exigiria
  montar infraestrutura de sessão já no primeiro dia, e cookies trazem
  complicações extras de CORS entre o app mobile e a API.
* **Login social (OAuth, ex.: Google):** mais amigável para o usuário final a
  longo prazo, mas depende de configurar um provedor externo — risco alto para
  uma entrega de um dia só.

## Consequências

* **Positivas:**
  * Sem estado de sessão no servidor: qualquer instância da API valida o token
    sozinha, o que simplifica escalar horizontalmente mais adiante.
  * Rápido de implementar: uma biblioteca de assinatura e um middleware de
    verificação já resolvem o essencial.
* **Negativas:**
  * O logout não invalida o token de fato no servidor — se ele vazar, continua
    válido até expirar.
  * Revogar acesso de um usuário específico (ex.: uma conta banida) vai exigir,
    no futuro, uma lista de bloqueio ou trocar para token de vida curta com
    refresh.
