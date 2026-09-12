# 0008. Usar Zod para validação de payload

* **Status:** Aceito
* **Data:** 2026-09-06

## Contexto

Toda rota da API que recebe entrada do cliente (app Flutter) precisa validar o
payload antes de chegar à camada de regra de negócio, e o contrato de API
(`docs/contrato-api.md`) precisa de uma fonte única de verdade para o formato
de cada payload, tanto para validar quanto para documentar.

## Decisão

Vamos usar **Zod** para validação de entrada, integrado ao Fastify via
`fastify-type-provider-zod`.

## Alternativas Consideradas

Não há registro de alternativas avaliadas formalmente (ex.: Joi, Yup, class
validator). Zod foi escolhido diretamente pela ergonomia de reaproveitar o
mesmo schema como tipo TypeScript (DTO) e como validador em runtime, evitando
manter duas definições separadas.

## Consequências

* **Positivas:**
  * Um schema Zod serve tanto de validador em runtime quanto de tipo estático
    do TypeScript, reduzindo duplicação entre contrato e código.
  * Erros de validação já saem estruturados, o que alimenta diretamente o
    formato `data.errors` do envelope de resposta (ver
    [0010](0010-envelope-de-resposta-padronizado.md)).
* **Negativas:**
  * Acopla a definição de contrato de entrada a uma biblioteca específica do
    ecossistema TypeScript/Node, o que custaria reescrever schemas se o
    backend mudasse de linguagem no futuro.
