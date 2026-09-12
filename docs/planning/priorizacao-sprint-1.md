# Priorização de features — primeira sprint

Desmembramento dia a dia de cada feature em
[`atividades-sprint-1.md`](atividades-sprint-1.md).

### Projeto: `UrbanoGo`
### Equipe: `João Victor, Matheus Guimarães, Tiago Nascimento, Victor Kauan`

---

### 🥇 Feature 1 — `Autenticação`

- **Problema real que ela resolve:** sem saber quem é motorista e quem é passageiro,
  nada mais no sistema funciona — não dá nem pra pedir uma corrida, nem pra
  oferecer, nem pra manter histórico ou confiança entre as partes. É a fundação
  de que tudo depende.
- **Critério(s) de prioridade que mais pesaram:** bloqueante (nenhuma outra
  feature roda sem ela), baixo risco técnico (é a parte mais bem conhecida do
  time), e altíssima alavancagem — desbloqueia o resto do sistema.
- **Em uma frase o que seria a aplicação utópica** (a versão completa, dos
  sonhos): login social, autenticação multifator, verificação de CNH e
  identidade do motorista com biometria, e detecção automática de conta
  fraudulenta/duplicada.
- **E qual seria um MVP comercializável?** (a menor versão possível, ponta a
  ponta, entregável em ~3 dias): cadastro e login por e-mail/senha com token
  JWT, dois papéis (passageiro e motorista), sem verificação de documento nem
  recuperação de senha ainda.

---

### 🥈 Feature 2 — `Matching`

- **Problema real que ela resolve:** conectar quem pediu uma corrida a um
  motorista disponível e próximo, rápido — é o motivo do app existir. Sem isso,
  "pedir corrida" não leva a lugar nenhum.
- **Critério(s) de prioridade que mais pesaram:** é o core da proposta de valor
  (sem ele não existe produto, só um formulário), e é o caminho crítico de
  latência do projeto — decisão lenta aqui custa cliente.
- **O "elefante" dela** (a versão completa, dos sonhos): matching por múltiplos
  critérios em tempo real (distância, nota de confiança, tipo de veículo,
  trânsito previsto), leilão dinâmico entre motoristas, e balanceamento de carga
  entre regiões sem gargalo.
- **A primeira fatia** (a menor versão possível, ponta a ponta, entregável em
  ~3 dias): oferta sequencial pro motorista disponível mais próximo, com
  timeout e fallback pro próximo da fila — sem otimização de rota, sem previsão
  de trânsito, só proximidade.

---

### 🥉 Feature 3 — `Rastreamento em tempo real`

- **Problema real que ela resolve:** sem ver a posição do motorista se
  movendo, o passageiro não sabe se ele está vindo ou parado — perde a
  confiança que é a base de qualquer app de mobilidade.
- **Critério(s) de prioridade que mais pesaram:** alto valor percebido pelo
  usuário (é o que faz o app "parecer" de mobilidade de verdade), está na meta
  de SLA do projeto, e é o diferencial mais visível numa demo.
- **O "elefante" dela** (a versão completa, dos sonhos): GPS de alta precisão
  com o carro "grudado" na rua no mapa, notificações push proativas,
  compartilhamento do trajeto com terceiros, e histórico completo replayável
  da viagem.
- **A primeira fatia** (a menor versão possível, ponta a ponta, entregável em
  ~3 dias): WebSocket simples emitindo a posição a cada poucos segundos,
  mostrada como um ponto se movendo no mapa — sem ajuste à rua, sem histórico
  de trajeto salvo.

---

### Ficou de fora (e por quê)

| Feature descartada | Por que não entrou entre as 3 |
| --- | --- |
| Avaliação com IA | Dá qualidade e confiança de longo prazo, mas não impede ninguém de pedir e completar uma corrida sem ela — pode nascer com nota neutra/fixa e a IA entrar depois. |
| Precificação dinâmica | Sem ela, dá pra cobrar um preço fixo por distância; o ajuste por demanda e clima é otimização de receita, não algo que bloqueia o fluxo principal de pedir e completar uma corrida. |
