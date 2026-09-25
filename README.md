# @typesearch/langchain

[typesearch](https://typesearch.ai) news search for [LangChain.js](https://js.langchain.com): a tool for
agents and a retriever for chains. Recent news on any topic from outlets worldwide, by country and language,
with a calibrated relevance score on every result.

```bash
npm install @typesearch/langchain @langchain/core
```

Node 20+, `@langchain/core` 1.x. ESM and CommonJS.

Create a key in the [dashboard](https://app.typesearch.ai) and set it as `TYPESEARCH_API_KEY`.

## Tool: TypesearchNewsSearch

```ts
import { TypesearchNewsSearch } from '@typesearch/langchain';

const search = new TypesearchNewsSearch({ maxResults: 5 }); // reads TYPESEARCH_API_KEY

await search.invoke({ query: 'EU AI Act enforcement', days: 7 });
// '5 results for "EU AI Act enforcement" · fast · US$0.0014\n\n1. …'
```

### In an agent

```ts
import { createAgent } from 'langchain';
import { TypesearchNewsSearch } from '@typesearch/langchain';

const agent = createAgent({
  model: 'anthropic:claude-sonnet-4-5',
  tools: [new TypesearchNewsSearch({ maxResults: 8 })],
  systemPrompt: 'Answer with recent news. Cite the source and the link of every fact.',
});

await agent.invoke({ messages: [{ role: 'user', content: 'What changed in EU AI Act enforcement this week?' }] });
```

The tool is named `typesearch_news_search`. The model can set `query`, `days`, `published_after`,
`published_before`, `include_domains`, `exclude_domains`, `countries` (ISO 3166-1 alpha-2) and `languages`
(ISO 639-1) — the same parameters, limits and descriptions as `search_news` in the
[typesearch MCP server](https://typesearch.ai/docs/integrations/mcp).

The model reads a compact text list: title, outlet, date, country and language, link, standfirst and
excerpts. Invoked with a tool call, the `ToolMessage` also carries the structured results as its
`artifact`:

```ts
const msg = await search.invoke({ id: 'call_1', name: 'typesearch_news_search', args: { query: 'el dólar' }, type: 'tool_call' });
msg.artifact.results; // [{ title, url, source, published_at, country, language, snippet, highlights, score }]
```

Pass `responseFormat: 'content'` to get only the text.

| Option | Default | |
| --- | --- | --- |
| `apiKey` | `TYPESEARCH_API_KEY` | Your key. |
| `baseURL` | `https://api.typesearch.ai` | Or `TYPESEARCH_BASE_URL`. |
| `client` | — | A [`typesearch-js`](https://www.npmjs.com/package/typesearch-js) client you already have. |
| `mode` | `'fast'` | `ultra`, `fast`, `normal` or `deep`: how much is read before ranking. See [modes](https://typesearch.ai/docs/modes). |
| `maxResults` | `10` | 1 to 50. |
| `days` | — | The window when the model asks for none. The API's default is the last 7 days. |
| `includeDomains` · `excludeDomains` | — | Fixed domain filters. |
| `countries` · `languages` | — | Fixed country and language filters of the sources. |
| `highlights` | — | Verbatim excerpts from the articles read (`normal` and `deep`). |
| `timezone` | — | IANA time zone that decides what day "today" is. |
| `name` · `description` | — | Replace what the model sees. |

A filter you set in the constructor is always applied and is no longer offered to the model; the
description tells the model about it.

## Retriever: TypesearchRetriever

```ts
import { TypesearchRetriever } from '@typesearch/langchain';

const retriever = new TypesearchRetriever({ k: 5, days: 30 });
const docs = await retriever.invoke('lithium royalties in Chile');
// Document { pageContent: 'headline\n\nstandfirst\n\nexcerpt…', metadata: { title, url, source, published_at, country, language, score } }
```

`pageContent` is the headline, the standfirst and, in `normal` and `deep` modes, short verbatim excerpts —
never the full article: cite `metadata.url`. `metadata.source` is the outlet and `metadata.score` the
calibrated probability that the article is about the query. It takes the same options as the tool, with
`k` (1–50, default 10) instead of `maxResults`.

## Errors

API errors are thrown with a message the agent can read and act on — `typesearch error (rate_limited): …
Retry after 12 s.` — without the key; LangChain agents hand it to the model as the tool result. The
original [`typesearch-js`](https://www.npmjs.com/package/typesearch-js) error is its `cause`. The key is
read on the first call, so building the tool never fails without it.

## Pricing

Each search is billed to your key like the API request it makes, by its mode. Identical searches within
10 minutes come from the cache and cost nothing. Prices: [typesearch.ai/pricing](https://typesearch.ai/pricing).

## Examples

[`examples/agent.ts`](examples/agent.ts) (an agent that cites its sources) and
[`examples/retriever.ts`](examples/retriever.ts).

## Development

```bash
npm ci
npm run lint        # types
npm test            # the tool and the retriever against a fake API that validates every request against
                    # the API schema, and createAgent end to end with a fake tool-calling model
npm run test:live   # against the real API: needs TYPESEARCH_API_KEY (spends less than a cent)
npm run build && npm run smoke
```

## License

[MIT](LICENSE)
