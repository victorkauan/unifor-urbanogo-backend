# Relatório de teste de carga (URB-64)

`TST-7` · Execução dos cenários k6 (URB-58) contra o ambiente publicado (URB-20) e
comparação dos números medidos com o SLA definido em
[`visao-geral.md`](visao-geral.md#sla-desejado).

## Ambiente e metodologia

- **Ambiente:** VPS de produção (`https://187-127-62-64.sslip.io/`), a mesma
  provisionada na URB-20 - não existe um ambiente de staging separado.
- **Scripts:** `load-tests/rush.js` e `load-tests/chuva.js` (URB-58), sem alteração
  de lógica - só os parâmetros de VUs/duração e dois knobs novos, adicionados só
  pra viabilizar rodar contra a VPS (ver "Restrição encontrada" abaixo):
  `RECONCILE_INTERVAL_MS` (intervalo do polling de `GET /rides/:id` que mede a
  latência do matching) e `PASSENGER_THINK_MIN_S`/`PASSENGER_THINK_MAX_S` (pausa do
  passageiro entre tentativas). Antes desses knobs, os dois valores eram fixos no
  script (1s e 3-8s).
- **Execução:** da minha máquina, via `docker run grafana/k6`, direto contra a URL
  pública (sem VPN/túnel).

### Restrição encontrada: rate limiting

Depois da URB-58, a develop recebeu um hardening de segurança (`security.ts`) com
rate limiting de **100 requisições por minuto por IP**, em praticamente todas as
rotas. Como todo o teste de carga sai de uma única máquina (um único IP), esse
limite é compartilhado por *todos* os motoristas e passageiros simulados juntos -
os cenários padrão da URB-58 (10-25 VUs) estourariam o limite quase de imediato,
o que faria o teste medir o rate limiter, não o motor de matching.

Decisão (com o Tiago): não alterar o rate limiting em produção. Em vez disso,
reduzir a carga pra ficar **bem abaixo** do limite - poucos VUs, `think time` maior
entre tentativas do passageiro, polling mais espaçado. Isso significa que os
números aqui **não medem o teto de capacidade real do sistema** (throughput
máximo) - medem correção e latência de ponta a ponta sob concorrência modesta.
Rodar um teste de capacidade de verdade exige primeiro resolver o rate limiting
(seção "Próximos passos").

Taxa efetiva usada em cada execução: ~53-63 requisições/minuto, sempre abaixo do
limite de 100/min (confirmado - 100% dos `checks` passaram em toda execução, sem
nenhuma resposta 429).

## Resultados

### Cenário `rush` (2 motoristas, 3 passageiros, 5 minutos)

| Métrica | Valor |
|---|---|
| Requisições HTTP | 296 (≈53/min) |
| Checks aprovados | 100% (190/190) |
| Corridas com desfecho | 57 |
| Sessões de WebSocket | 91 (100% handshake OK) |
| **Latência de matching** - mediana | **77 ms** |
| Latência de matching - p90 | 95 ms |
| **Latência de matching - p95** | **11,4 s** |
| Latência de matching - máxima | 30,1 s |

### Cenário `chuva` (1 motorista, 4 passageiros, 5 minutos)

| Métrica | Valor |
|---|---|
| Requisições HTTP | 301 (≈55/min) |
| Checks aprovados | 100% (186/186) |
| Corridas com desfecho | 66 |
| Sessões de WebSocket | 87 (100% handshake OK) |
| **Latência de matching** - mediana | **73 ms** |
| Latência de matching - p90 | 89 ms |
| **Latência de matching - p95** | **1,6 s** |
| Latência de matching - máxima | 30,1 s |

*(Latência de matching = `assigned_at - requested_at`, ambos os timestamps do
próprio servidor - ver comentário em `load-tests/lib/flows.js`.)*

## Comparação com o SLA

| Meta (visao-geral.md) | Medido | Resultado |
|---|---|---|
| Matching < 3s, ponta a ponta | mediana 73-77ms; **p95 de 11,4s no `rush`** | ✅ na mediana, **❌ na cauda** |
| Posição no mapa < 5s | não instrumentado diretamente (ver limitação) | não avaliado |
| Erros | 0% de falha real (só 409 esperados, contabilizados no `check`) | ✅ |
| Disponibilidade / throughput máximo | não testado (rate limiting impôs carga baixa) | não avaliado |

**A mediana passa com folga enorme** (77ms contra uma meta de 3.000ms) - o caminho
"feliz" do matching é muito rápido. **Mas existe uma cauda real que viola o SLA**:
em ambas as execuções, uma fração pequena das corridas levou até ~30 segundos pra
encontrar motorista.

## Achado: a cauda de ~15-30 segundos

O motor de matching oferece a corrida a **um candidato por vez**, esperando até 15s
por uma resposta antes de passar pro próximo (ver ADR 0004). Se a oferta chega
justamente no instante em que o socket daquele motorista não está conectado - a
troca de janela de 30s do motorista simulado, ou (hipótese, não confirmada por
falta de acesso à VPS) uma conta de teste de uma execução anterior que ainda
aparece como "online" no banco mas não tem ninguém escutando - essa oferta
específica fica sem resposta pelos 15 segundos inteiros antes de tentar o próximo
candidato. Com poucos motoristas disponíveis (2 no `rush`, 1 no `chuva`), isso
basta pra empurrar o tempo total pra ~15s ou ~30s (2 candidatos "perdidos" em
sequência) nos casos raros em que acontece - exatamente os valores observados.

Isso não é um bug do script de carga: é uma característica real do desenho atual
do matching (oferta sequencial com timeout fixo) que só fica visível com um pool
pequeno de motoristas disponíveis - e é justamente o tipo de coisa que um teste de
carga existe pra revelar.

## Limitações desta execução

- **Não mede capacidade máxima** - o rate limiting da API forçou uma carga bem
  abaixo do que os cenários padrão da URB-58 pedem.
- **Latência de posição (WS) não instrumentada** - os scripts confirmam que o
  socket aceita conexão e mensagens corretamente (100% dos handshakes, sem erro),
  mas não medem "quanto tempo até a posição aparecer pra outro participante da
  corrida" ponta a ponta.
- **Sem acesso às métricas internas da VPS** (Prometheus/Grafana bloqueado na
  borda pro público, por design da URB-62) - os números aqui são só o que o k6
  mediu do lado de fora.
- Amostra modesta (57-66 corridas por cenário) - suficiente pra ver a cauda
  existe, não pra caracterizar sua distribuição com precisão.

## Próximos passos (sugestão, não implementado nesta issue)

1. **Testar capacidade de verdade**: criar uma exceção de rate limit pro IP do
   teste de carga (ou subir `RATE_LIMIT_MAX` temporariamente na VPS) só durante uma
   execução controlada, pra medir o teto real de throughput.
2. **Investigar a cauda do matching**: confirmar se a causa é mesmo a janela de
   reconexão do motorista ou contas de teste antigas ainda "online" no banco -
   precisaria de acesso à VPS (SSH/logs) pra confirmar.
3. **Medir latência de posição** (a outra metade do SLA) com uma instrumentação
   dedicada nos scripts.
4. **Limpar contas `k6-driver-*`/`k6-passenger-*`** acumuladas no banco da VPS
   entre execuções de teste, pra não poluir buscas futuras.
