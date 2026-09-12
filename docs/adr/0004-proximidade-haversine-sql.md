# 0004. Calcular proximidade por haversine em SQL

* **Status:** Aceito
* **Data:** 2026-09-11

## Contexto

A segunda fatia da sprint de Matching precisa priorizar, entre os motoristas
disponíveis, o mais próximo do passageiro que pediu a corrida. É preciso
decidir onde e como calcular essa distância, entregável em um dia, sem somar
uma dependência de infraestrutura nova ao prazo apertado do MVP.

## Decisão

Vamos calcular a distância entre passageiro e motorista pela **fórmula de
haversine direto em SQL**, numa consulta ao PostgreSQL, ordenando os
candidatos pela distância resultante. Antes de aplicar a fórmula completa, uma
*bounding box* (um filtro simples de faixa de latitude/longitude, apoiado por
um índice B-tree em `(lat, lng)`) descarta a maior parte das linhas fora do
raio de busca, pra não calcular haversine pra todo motorista da base.

## Alternativas Consideradas

* **PostGIS** (extensão geoespacial do PostgreSQL): ofereceria funções nativas
  de distância e um índice espacial (GiST) mais eficiente que calcular
  haversine linha a linha, mas exige habilitar e manter uma extensão adicional
  no banco — um investimento de infraestrutura que decidimos adiar para depois
  do MVP, quando o volume de motoristas justificar o ganho.
* **Redis GEO** (`GEOADD`/`GEOSEARCH`): seria mais rápido para essa consulta
  específica, já que a posição também vive no Redis, mas exigiria manter dois
  lugares como fonte de verdade da posição do motorista (Redis para a busca
  geográfica, PostgreSQL para persistência) e mover parte da lógica de
  candidatos pra fora do banco relacional — complexidade demais pra entregar
  em um dia.

## Consequências

* **Positivas:**
  * Não soma nenhuma dependência nova: usa só o PostgreSQL que o projeto já
    tem rodando.
  * Simples de implementar e testar num único dia — uma consulta SQL com a
    fórmula matemática, sem infraestrutura extra.
* **Negativas:**
  * Calcular haversine linha a linha é mais lento que um índice espacial
    nativo (PostGIS) conforme o número de motoristas crescer.
  * O índice B-tree em `(lat, lng)` ajuda a filtrar a bounding box, mas não
    ordena por distância de forma otimizada — a ordenação final ainda calcula
    a fórmula para cada candidato dentro da janela.
