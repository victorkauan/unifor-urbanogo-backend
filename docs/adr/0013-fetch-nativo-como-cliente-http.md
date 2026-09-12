# 0013. Usar fetch nativo do Node como cliente HTTP externo

* **Status:** Aceito
* **Data:** 2026-09-06

## Contexto

O backend precisa chamar três serviços HTTP externos (DeepInfra para a nota de
confiança via LLM, Open-Meteo para clima, OSRM para rotas), rodando em Node.js
24, versão que já inclui um cliente `fetch` nativo compatível com a
especificação WHATWG.

## Decisão

Vamos usar o **`fetch` nativo do Node 24** como cliente HTTP para chamadas a
serviços externos, sem biblioteca adicional.

## Alternativas Consideradas

* **axios:** biblioteca popular, com interceptors e cancelamento de requisição
  mais ergonômicos, mas soma uma dependência externa para um caso de uso que o
  runtime já resolve nativamente no Node 24.

## Consequências

* **Positivas:**
  * Zero dependência nova para chamadas HTTP externas.
  * Uma API só (`fetch`) para todo o time usar ao integrar DeepInfra,
    Open-Meteo e OSRM.
* **Negativas:**
  * Recursos de conveniência de bibliotecas como axios (interceptors,
    cancelamento via token dedicado, retry embutido) precisam ser
    implementados manualmente quando necessário.
