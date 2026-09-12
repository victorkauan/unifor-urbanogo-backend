# Atividades da primeira sprint (desmembramento por dia)

Cada dia é um entregável utilizável por si só — não uma parte inacabada da
feature. Detalhamento das 3 features priorizadas em
[`priorizacao-sprint-1.md`](priorizacao-sprint-1.md).

## Autenticação

| Dia | Atividade | Entregável |
| --- | --- | --- |
| 1 | Criar usuário, login e logout | Cadastro e autenticação funcionando ponta a ponta, com token JWT |
| 2 | Definir perfil de usuário | Passageiro e motorista com perfis distintos (motorista com dados de veículo) |
| 3 | Reset de senha via E-mail | Integração com sistema de E-mail pra recuperação de senha |

## Matching

| Dia | Atividade | Entregável |
| --- | --- | --- |
| 1 | Solicitar e aceitar corrida/entrega | Passageiro pede, motorista aceita — fluxo básico funcionando |
| 2 | Ranking por proximidade | Motorista mais próximo é priorizado na oferta da corrida |
| 3 | Avaliação (rating) de motorista e passageiro | Nota mútua pós-corrida por média simples, sem IA |

## Rastreamento em tempo real

| Dia | Atividade | Entregável |
| --- | --- | --- |
| 1 | Mapa + posição atual | Mapa exibindo a posição atual do motorista |
| 2 | WebSocket | Posição do motorista atualizada em tempo real via socket |
| 3 | Suavização do movimento | Posição prevista entre uma atualização real e outra, pro movimento parecer contínuo |
