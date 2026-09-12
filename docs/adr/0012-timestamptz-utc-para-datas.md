# 0012. Padronizar datas em timestamptz UTC

* **Status:** Aceito
* **Data:** 2026-09-06

## Contexto

O sistema registra marcos de tempo importantes para o negócio (criação de
corrida, aceite, conclusão) e para métricas de SLA (latência do matching), com
app, backend e banco potencialmente rodando em fusos horários diferentes
durante o desenvolvimento e em produção.

## Decisão

Todo campo de data e hora no banco usa o tipo `timestamptz` do PostgreSQL,
sempre gravado e lido em **UTC**. Na API, o valor trafega como string ISO 8601.

## Alternativas Consideradas

Não há registro de alternativas avaliadas formalmente (ex.: gravar em horário
local de Fortaleza, ou usar `timestamp` sem timezone). UTC com `timestamptz`
foi escolhido diretamente por evitar ambiguidade de fuso entre banco, backend
e app.

## Consequências

* **Positivas:**
  * Nenhuma ambiguidade de fuso horário entre banco, backend e app, mesmo se
    algum componente rodar em máquinas com fuso local diferente.
  * Cálculos de duração e SLA (ex.: tempo de matching) não sofrem com
    conversões inconsistentes de fuso.
* **Negativas:**
  * Toda exibição de data para o usuário final precisa converter de UTC para
    o fuso local no app, já que o backend nunca aplica esse ajuste.
