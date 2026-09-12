# 0005. Usar TypeScript como linguagem do backend

* **Status:** Aceito
* **Data:** 2026-09-06

## Contexto

O backend do UrbanoGo é um serviço único em Node.js, construído por uma equipe de
4 pessoas com cerca de 7h por semana cada, em várias trilhas paralelas. Módulos
diferentes (auth, corridas, matching, pricing) são desenvolvidos por pessoas
diferentes ao mesmo tempo, sobre um contrato de API que também está em
formação — o risco de integração quebrar silenciosamente entre módulos é alto
nesse cenário.

## Decisão

Vamos escrever todo o backend em **TypeScript**.

## Alternativas Consideradas

Não há registro de alternativas avaliadas formalmente: a escolha já vinha do
planejamento anterior ao início da sprint, fechada para não travar as trilhas
paralelas no primeiro dia. A alternativa óbvia do ecossistema (JavaScript puro
sobre Node.js) não foi comparada.

## Consequências

* **Positivas:**
  * Tipagem estática reduz o risco de erros de integração entre módulos
    desenvolvidos em paralelo por pessoas diferentes.
  * Ecossistema maduro de bibliotecas já tipadas (Fastify, Prisma, Zod),
    reduzindo a necessidade de tipos manuais.
* **Negativas:**
  * Exige um passo de compilação antes de rodar em produção.
  * Configuração adicional de tooling (`tsconfig`, build) em relação a
    JavaScript puro.
