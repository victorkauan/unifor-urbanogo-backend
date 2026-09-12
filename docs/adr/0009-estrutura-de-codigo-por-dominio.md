# 0009. Organizar o código por domínio

* **Status:** Aceito
* **Data:** 2026-09-06

## Contexto

Quatro trilhas de trabalho (auth/usuários, corridas/matching, pricing,
avaliações, tempo real) precisam ser desenvolvidas em paralelo por pessoas
diferentes, sobre o mesmo repositório, sem gerar conflitos constantes de
merge nem acoplamento acidental entre áreas que não deveriam depender uma da
outra.

## Decisão

Vamos organizar o código-fonte por domínio (feature), em `src/modules/<dominio>/`
(`auth`, `users`, `drivers`, `rides`, `matching`, `pricing`, `ratings`,
`realtime`), cada um com seus próprios `.routes.ts`, `.service.ts`, `.repo.ts` e
`.schema.ts`. Cross-cutting concerns (conexão com banco, Redis, autenticação,
Swagger) entram como plugins Fastify registrados com `fastify-plugin`, fora dos
módulos de domínio. Um módulo não importa arquivos internos de outro módulo; se
precisar, expõe pela camada de `service`.

## Alternativas Consideradas

Não há registro de alternativas avaliadas formalmente (ex.: organização em
camadas técnicas — `controllers/`, `services/`, `repositories/` — cruzando
todos os domínios). A estrutura por domínio foi escolhida diretamente por
isolar cada trilha de trabalho num diretório próprio, reduzindo a chance de
conflito de merge entre pessoas trabalhando em áreas diferentes ao mesmo
tempo.

## Consequências

* **Positivas:**
  * Cada trilha (pessoa) trabalha dentro do seu próprio diretório de domínio
    a maior parte do tempo, reduzindo conflitos de merge entre PRs paralelos.
  * Fica explícito onde uma nova funcionalidade de um domínio deve entrar.
* **Negativas:**
  * Funcionalidades que cruzam vários domínios (ex.: matching, que depende de
    `drivers`, `rides` e `pricing`) exigem decidir onde a lógica compartilhada
    vive, sem uma camada técnica única de "services" para isso.
