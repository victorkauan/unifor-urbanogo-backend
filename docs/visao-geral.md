# Visão geral

## Contexto do negócio

O UrbanoGo é um aplicativo de mobilidade urbana que conecta motoristas parceiros a
passageiros e a pequenas entregas dentro da cidade, usando geolocalização em tempo
real. O sistema precisa casar motorista e passageiro (matching) e calcular o preço
da corrida dinamicamente, reagindo em segundos a mudanças de demanda (chuva, hora do
rush), já que decisões lentas custam clientes.

**Exemplo do dia a dia:** Roberto quer enviar um presente de aniversário para a mãe
dele, que mora do outro lado da cidade, mas está sem tempo para levar pessoalmente.
Ele abre o UrbanoGo, informa o endereço de coleta e de entrega, e em poucos segundos
o app encontra um motorista bem avaliado e disponível perto dele. Roberto acompanha
a entrega em tempo real no mapa e recebe uma notificação assim que o presente chega
na casa da mãe, tudo isso mesmo em um dia chuvoso de sexta à noite, quando a demanda
por entregas está alta.

## Escopo

- Solicitação de corrida (carona) ou entrega pelo passageiro.
- Motorista define sua preferência de atendimento (carona e/ou entrega).
- Matching motorista-passageiro por proximidade e rating.
- Sistema de avaliação (rating) mútuo entre motorista e passageiro pós-corrida, com
  nota de confiança calculada por IA a partir do histórico e dos comentários.
- Rastreamento em tempo real da corrida no mapa.
- Cálculo de preço dinâmico conforme distância, horário, demanda e clima.

**Restrição especial:** matching e precificação são caminho crítico de baixa
latência. O sistema precisa responder em segundos a picos de demanda, e picos
diários são muito marcados (rush, noites de fim de semana, dias de chuva).

## SLA desejado

| Métrica | Meta | Observação |
|---|---|---|
| Disponibilidade | 99,9% | cerca de 43min de downtime tolerado por mês (error budget) |
| Tempo de resposta do matching | menor que 3s | ponta a ponta, do pedido até o motorista atribuído |
| Latência de atualização de posição no mapa | menor que 5s | percebida pelo passageiro durante a corrida |

Esse SLA é o que orienta as decisões de arquitetura: tudo que está no caminho do
matching e da precificação precisa ser assíncrono, cacheado e escalável
horizontalmente para absorver picos sem degradar a resposta.

## Mapa de importância das disciplinas

Classificação da equipe para as 19 disciplinas do curso, à luz do contexto do
UrbanoGo (latência crítica no matching, picos de demanda marcados, SLA de 99,9%,
2 públicos de app, dados sensíveis de localização e pagamento):

| Disciplina | Prioridade |
|---|---|
| Direito Digital e LGPD | Muito importante |
| Fundamentos de Engenharia de Software | Muito importante |
| Desenvolvimento de Software Integrado - DevOps | Muito importante |
| Design da Experiência do Usuário | Muito importante |
| Desenvolvimento de Software Seguro - DevSecOps | Muito importante |
| Arquitetura de Microsserviços e Escalabilidade | Muito importante |
| Documentação Técnica | Muito importante |
| Computação em Nuvem | Muito importante |
| Integração e Entrega Contínua | Muito importante |
| Orquestração de Contêineres e Gerenciamento de Cluster | Muito importante |
| Controle de Versão e Gerenciamento de Configuração | Importante |
| Infraestrutura Automatizada | Importante |
| Testes Automatizados e Contínuos | Importante |
| Monitoramento e Análise de Logs | Importante |
| Ecossistemas de Startups | Médio |
| Metodologias Ágeis em Gestão de Projetos | Médio |
| Gerenciamento de Produtos | Médio |
| Tópicos Avançados em Engenharia de Software | Médio |
| Computação sem Servidores | Pouco importante |
