# 0006. Usar Fastify como framework HTTP

* **Status:** Aceito
* **Data:** 2026-09-06

## Contexto

O backend precisa de um framework HTTP para servir a API REST e hospedar o
WebSocket (Socket.IO) do rastreamento em tempo real, num único serviço Node.js,
sem tempo para avaliar múltiplas opções a fundo dado o prazo curto do projeto.

## Decisão

Vamos usar **Fastify** como framework HTTP do backend.

## Alternativas Consideradas

Não há registro de alternativas avaliadas formalmente. A alternativa mais
conhecida do ecossistema Node.js (Express) não foi comparada com profundidade;
Fastify foi escolhido diretamente por ser leve, rápido e ter um sistema de
plugins que se encaixa na estrutura de módulos por domínio adotada no projeto
(ver [0009](0009-estrutura-de-codigo-por-dominio.md)).

## Consequências

* **Positivas:**
  * Baixo overhead de performance em relação a alternativas mais populares.
  * Sistema de plugins (`fastify-plugin`) permite isolar cross-cutting
    concerns (conexão com banco, Redis, autenticação) sem acoplar módulos de
    domínio entre si.
* **Negativas:**
  * Ecossistema de plugins e exemplos é menor que o de frameworks mais
    populares, o que pode custar mais tempo de pesquisa ao integrar uma
    biblioteca nova.
