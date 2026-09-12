# 0010. Padronizar o envelope de resposta HTTP

* **Status:** Aceito
* **Data:** 2026-09-06

## Contexto

O app Flutter (repositório e equipe separados) precisa de um único formato de
resposta para toda a API, tanto no sucesso quanto no erro, para poder tratar
toda chamada HTTP com um só parser no cliente, sem casos especiais por rota.

## Decisão

Toda resposta da API, sucesso ou erro, usa o mesmo envelope de três chaves:

```ts
type ApiResponse<T = unknown> = {
  status_code: number;   // igual ao status HTTP da resposta
  message: string;       // texto curto legível por humano, em pt-BR
  data: T | null;        // payload no sucesso, null no erro
};
```

Erro de validação (Zod) coloca o detalhe dos campos dentro de `data`, mantendo
as três chaves: `data.errors = [{ path, message }]`. Implementado com helpers
decorados no Fastify (`reply.ok()` / `reply.fail()`), um `setErrorHandler`
central e uma classe base `AppError(statusCode, message, data?)`.

## Alternativas Consideradas

Não há registro de alternativas avaliadas formalmente (ex.: seguir o formato
de erro padrão do RFC 7807, ou não usar envelope nenhum e deixar o corpo da
resposta ser o próprio payload, com status HTTP carregando todo o significado
de erro). O envelope de três chaves foi decidido diretamente para dar um
contrato único e previsível ao app desde o primeiro mock.

## Consequências

* **Positivas:**
  * O app pode assumir o envelope de três chaves desde o primeiro mock,
    mesmo antes do backend estar pronto.
  * Um único parser de resposta no cliente cobre toda a API, sucesso e erro.
* **Negativas:**
  * Toda rota nova precisa passar pelos helpers `reply.ok()`/`reply.fail()`
    para manter o contrato; um `return` direto do Fastify quebraria o
    envelope.
