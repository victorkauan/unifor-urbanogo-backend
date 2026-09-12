# 0005. Usar WebSocket (Socket.IO) para atualizar a posição em tempo real

* **Status:** Aceito
* **Data:** 2026-09-11

## Contexto

A segunda fatia do rastreamento em tempo real precisa entregar a posição do
motorista sendo atualizada automaticamente no mapa do passageiro — a fatia
anterior só mostrava a posição atual, sem atualização contínua. É preciso
escolher o mecanismo de transporte dessas atualizações entre o app do
motorista, o servidor e o app do passageiro.

## Decisão

Vamos usar **WebSocket via Socket.IO**, com uma sala isolada por corrida
(`ride:{rideId}`) e autenticação por token no handshake da conexão. O
motorista envia a posição e o servidor a retransmite para todos que estão na
sala daquela corrida.

## Alternativas Consideradas

* **Polling HTTP repetido** (o app pergunta `GET /rides/:id` a cada poucos
  segundos): mais simples de implementar, mas gera mais requisições, mais
  latência média até perceber a mudança, e escala pior com muitos usuários
  simultâneos.
* **Server-Sent Events (SSE):** resolveria o envio do servidor para o cliente,
  mas é unidirecional — o motorista ainda precisaria de outro canal pra mandar
  a posição, duplicando a infraestrutura de tempo real.

## Consequências

* **Positivas:**
  * Atualização quase instantânea, sem o cliente precisar perguntar
    repetidamente.
  * Um único canal bidirecional serve tanto para o motorista mandar a posição
    quanto para o passageiro recebê-la.
* **Negativas:**
  * Introduz estado de conexão (quem está conectado a qual sala) que precisa
    ser gerenciado, e que vai exigir reconciliação se a API escalar para mais
    de uma instância no futuro.
  * Exige lidar com reconexão e queda de conexão, algo que não existe num
    modelo simples de requisição e resposta.
