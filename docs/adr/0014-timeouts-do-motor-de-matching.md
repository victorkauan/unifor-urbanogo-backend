# 0014. Definir os timeouts do motor de matching

* **Status:** Aceito
* **Data:** 2026-09-06

## Contexto

O motor de matching oferece a corrida a um motorista candidato por vez (Chain
of Responsibility). É preciso definir por quanto tempo esperar a resposta de
cada candidato antes de passar para o próximo, e por quanto tempo manter a
busca ativa no total, dentro da meta de SLA de matching ponta a ponta em menos
de 3s no caminho feliz, sem contar com uma fila dedicada (ex.: BullMQ) no MVP.

## Decisão

* **Timeout de aceite por motorista:** 15 segundos. Estourou ou o motorista
  recusou, a oferta passa para o próximo candidato da fila.
* **Timeout global de busca:** 60 segundos. Se a fila se esgotar ou o tempo
  total estourar sem aceite, a corrida é cancelada e o passageiro é avisado.
* Implementado com `setTimeout` no próprio processo da API; o estado da busca
  (fila, elo atual, deadline) fica no Redis para sobreviver a um restart do
  processo durante a busca.

## Alternativas Consideradas

* **Fila dedicada (ex.: BullMQ) com workers:** daria retry e persistência mais
  robustos entre reinícios do processo, mas soma infraestrutura nova
  (broker/worker) para um prazo de MVP de poucos dias; adiado para quando o
  volume justificar.
* **Oferta em lote (broadcast para vários motoristas ao mesmo tempo):**
  reduziria a cauda de latência quando o pool de motoristas é pequeno, mas
  exige lidar com corrida de aceite simultâneo entre motoristas; adiado para o
  plano de escala.

## Consequências

* **Positivas:**
  * Simples de implementar sem infraestrutura de fila dedicada, dentro do
    prazo do MVP.
  * Estado da busca sobrevive a um restart do processo, por estar no Redis.
* **Negativas:**
  * Sem fila dedicada, o matching não escala horizontalmente entre múltiplas
    instâncias da API ainda; o plano de escala trata disso.
  * `setTimeout` em processo deixa a instância da API stateful durante uma
    busca ativa — aceitável só para o MVP de instância única.
  * Ofertar um candidato por vez, com 15s de espera cada, gera uma cauda de
    latência alta quando o pool de motoristas disponíveis é pequeno (medido no
    teste de carga, ver `docs/quality/relatorio-teste-de-carga.md`).
