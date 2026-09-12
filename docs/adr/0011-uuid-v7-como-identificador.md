# 0011. Usar UUID v7 como estratégia de identificadores

* **Status:** Aceito
* **Data:** 2026-09-06

## Contexto

O schema do banco precisa de uma estratégia de geração de IDs que funcione bem
com múltiplas trilhas escrevendo no mesmo banco em paralelo, sem exigir
coordenação entre desenvolvedores, e que seja segura para expor em URLs e
payloads da API.

## Decisão

Vamos usar **UUID v7** (`@default(uuid(7))` do Prisma) como identificador
primário de todas as entidades.

## Alternativas Consideradas

* **Inteiro auto-incremento:** mais simples e ordenável nativamente pelo
  banco, mas exigiria coordenação (ou uma sequência centralizada) para não
  colidir entre ambientes, e expõe contagem de registros ao ser usado em URLs
  públicas.
* **UUID v4:** seguro para expor e sem coordenação entre devs, mas não é
  ordenável por tempo de criação, o que prejudica índices e paginação por
  data de criação.

## Consequências

* **Positivas:**
  * Ordenável por tempo de criação (ao contrário do UUID v4), o que ajuda em
    índices e consultas paginadas.
  * Sem coordenação entre desenvolvedores trabalhando em paralelo — cada um
    gera IDs localmente sem risco de colisão.
  * Seguro para expor em URLs e payloads da API, sem vazar contagem de
    registros.
* **Negativas:**
  * Ocupa mais espaço em disco e em índices do que um inteiro auto-incremento.
