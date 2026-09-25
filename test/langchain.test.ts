/*
 * La herramienta y el retriever contra la API falsa. Las primeras pruebas de cada bloque son las mismas
 * que los "standard tests" de LangChain (nombre, esquema, ToolMessage con artifact, documentos), que en
 * JavaScript no están publicados como paquete.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { Document } from '@langchain/core/documents';
import { ToolMessage } from '@langchain/core/messages';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import Typesearch, { RateLimitError } from 'typesearch-js';
import { TypesearchNewsSearch, TypesearchRetriever, VERSION } from '../src/index.ts';
import pkg from '../package.json' with { type: 'json' };
import { FakeApi, KEY, problem, searchResponse } from './fake-api.ts';

let api: FakeApi;

beforeAll(async () => {
  api = await new FakeApi().start();
});
afterAll(() => api.close());
afterEach(() => api.reset());

const cfg = () => ({ apiKey: KEY, baseURL: api.url, maxRetries: 0 });
const params = (t: TypesearchNewsSearch) => {
  const f = convertToOpenAITool(t).function as { name: string; description?: string; parameters: { properties: Record<string, unknown>; required?: string[] } };
  return { name: f.name, description: f.description ?? '', names: Object.keys(f.parameters.properties), required: f.parameters.required ?? [] };
};

describe('TypesearchNewsSearch: LangChain tool contract', () => {
  test('a valid name, a description and a JSON schema a model can call', () => {
    const t = new TypesearchNewsSearch(cfg());
    const p = params(t);
    expect(p.name).toBe('typesearch_news_search');
    expect(p.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(p.description.length).toBeGreaterThan(200);
    expect(p.names).toEqual(['query', 'days', 'published_after', 'published_before', 'include_domains', 'exclude_domains', 'countries', 'languages']);
    expect(p.required).toEqual(['query']);
    expect(TypesearchNewsSearch.lc_name()).toBe('TypesearchNewsSearch');
  });

  test('invoke with arguments returns the compact text', async () => {
    const out = await new TypesearchNewsSearch(cfg()).invoke({ query: 'el dólar' });
    expect(typeof out).toBe('string');
    expect(out).toMatch(/^2 results for "el dólar" · fast · US\$0\.0014/);
    expect(out).toContain('1. El dólar cerró estable por 1ª rueda\nDiario Ejemplo · 2026-09-21 18:05 UTC · AR/es\nhttps://diarioejemplo.example/economia/nota-1');
  });

  test('invoke with a tool call returns a ToolMessage with the results as its artifact', async () => {
    const msg = (await new TypesearchNewsSearch(cfg()).invoke({ id: 'call_1', name: 'typesearch_news_search', args: { query: 'el dólar', days: 2 }, type: 'tool_call' })) as ToolMessage;
    expect(msg).toBeInstanceOf(ToolMessage);
    expect(msg.tool_call_id).toBe('call_1');
    expect(msg.content).toContain('2 results for "el dólar"');
    expect(msg.artifact).toMatchObject({ query: 'el dólar', mode: 'fast', cost_usd: 0.0014, request_id: 'req_fakelc' });
    expect(msg.artifact.results[0]).toEqual({
      title: 'El dólar cerró estable por 1ª rueda',
      url: 'https://diarioejemplo.example/economia/nota-1',
      source: 'Diario Ejemplo',
      published_at: '2026-09-21T18:05Z',
      country: 'AR',
      language: 'es',
      snippet: 'La divisa se mantuvo sin cambios frente al cierre anterior.',
      score: 0.95,
    });
  });

  test('responseFormat content: only the text', async () => {
    const msg = (await new TypesearchNewsSearch({ ...cfg(), responseFormat: 'content' }).invoke({ id: 'c', name: 'typesearch_news_search', args: { query: 'el dólar' }, type: 'tool_call' })) as ToolMessage;
    expect(msg.content).toContain('2 results for "el dólar"');
    expect(msg.artifact).toBeUndefined();
  });

  test('invalid input is rejected before calling the API', async () => {
    const t = new TypesearchNewsSearch(cfg());
    await expect(t.invoke({ query: 'x' })).rejects.toThrow();
    await expect(t.invoke({ query: 'el dólar', days: 400 })).rejects.toThrow();
    await expect(t.invoke({ query: 'el dólar', published_after: 'last week' } as never)).rejects.toThrow();
    expect(api.requests).toHaveLength(0);
    expect(() => new TypesearchNewsSearch({ maxResults: 0 })).toThrow(RangeError);
  });
});

describe('TypesearchNewsSearch: what it sends', () => {
  test('mode fast and 10 results by default, with the key and the user agent', async () => {
    await new TypesearchNewsSearch(cfg()).invoke({ query: 'el dólar' });
    expect(api.last.path).toBe('/v1/search');
    expect(api.last.body).toEqual({ query: 'el dólar', mode: 'fast', max_results: 10 });
    expect(api.last.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(api.last.headers['user-agent']).toBe(`typesearch-langchain-js/${VERSION} typesearch-js/0.1.0`);
  });

  test('what the model asks for', async () => {
    await new TypesearchNewsSearch(cfg()).invoke({
      query: 'lithium royalties',
      days: 3,
      include_domains: ['diarioejemplo.example'],
      exclude_domains: ['examplewire.example'],
      countries: ['AR', 'CL'],
      languages: ['es'],
    });
    expect(api.last.body).toEqual({
      query: 'lithium royalties',
      mode: 'fast',
      max_results: 10,
      days: 3,
      include_domains: ['diarioejemplo.example'],
      exclude_domains: ['examplewire.example'],
      countries: ['AR', 'CL'],
      languages: ['es'],
    });
    await new TypesearchNewsSearch(cfg()).invoke({ query: 'lithium royalties', published_after: '2026-09-01', published_before: '2026-09-20T12:00:00Z' });
    expect(api.last.body).toMatchObject({ published_after: '2026-09-01', published_before: '2026-09-20T12:00:00Z' });
  });

  test('what the constructor fixes is hidden from the model and always applied', async () => {
    const t = new TypesearchNewsSearch({ ...cfg(), mode: 'normal', maxResults: 5, countries: ['AR'], languages: ['es'], highlights: true, timezone: 'America/Argentina/Buenos_Aires' });
    expect(params(t).names).toEqual(['query', 'days', 'published_after', 'published_before', 'include_domains', 'exclude_domains']);
    expect(t.description).toContain('Searches are limited to sources from AR; sources in es.');
    await t.invoke({ query: 'inflación', countries: ['US'] } as never);
    expect(api.last.body).toEqual({ query: 'inflación', mode: 'normal', max_results: 5, countries: ['AR'], languages: ['es'], highlights: true, timezone: 'America/Argentina/Buenos_Aires' });
  });

  test('days in the constructor is the window when the model asks for none', async () => {
    const t = new TypesearchNewsSearch({ ...cfg(), days: 1 });
    await t.invoke({ query: 'el dólar' });
    expect(api.last.body.days).toBe(1);
    await t.invoke({ query: 'el dólar', days: 30 });
    expect(api.last.body.days).toBe(30);
    await t.invoke({ query: 'el dólar', published_after: '2026-09-01' });
    expect(api.last.body.days).toBeUndefined();
  });

  test('a name and a description of your own', () => {
    const t = new TypesearchNewsSearch({ name: 'news', description: 'Latest news.' });
    expect(params(t)).toMatchObject({ name: 'news', description: 'Latest news.' });
  });

  test('nothing found: the closest articles, warnings, cached and incomplete', async () => {
    api.next({ status: 200, body: searchResponse({ found: false, total: 0, results: [], near_misses: [{ ...searchResponse().results[0], score: 0.31 }], cached_at: '2026-09-25T10:00:00Z', incomplete: true, warnings: [{ code: 'country_not_indexed', message: 'No source from XX.' }] }) });
    const msg = (await new TypesearchNewsSearch(cfg()).invoke({ id: 'c', name: 'typesearch_news_search', args: { query: 'el dólar' }, type: 'tool_call' })) as ToolMessage;
    expect(msg.content).toMatch(/^No results for "el dólar" · fast · cached, free/);
    expect(msg.content).toContain('Closest articles, which may not be about it:');
    expect(msg.content).toContain('Incomplete:');
    expect(msg.content).toContain('Note (country_not_indexed): No source from XX.');
    expect(msg.artifact).toMatchObject({ results: [], cached: true, incomplete: true });
  });
});

describe('errors: readable for the agent, with the SDK error as cause', () => {
  test('invalid key, no credit, rate limit', async () => {
    const e = await new TypesearchNewsSearch({ ...cfg(), apiKey: 'ts_live_wrong' }).invoke({ query: 'el dólar' }).catch((x) => x);
    expect(e.message).toBe('typesearch error (invalid_api_key): The API key is not valid. [request req_fakeerr1]');
    expect(e.message).not.toContain('ts_live_wrong');
    api.next({ status: 402, body: problem(402, 'insufficient_credits', 'No credit left.') });
    await expect(new TypesearchNewsSearch(cfg()).invoke({ query: 'el dólar' })).rejects.toThrow('typesearch error (insufficient_credits): No credit left.');
    api.next({ status: 429, body: problem(429, 'rate_limited', 'Too many requests.'), headers: { 'retry-after': '9' } });
    const r = await new TypesearchNewsSearch(cfg()).invoke({ query: 'el dólar' }).catch((x) => x);
    expect(r.message).toContain('Retry after 9 s.');
    expect(r.cause).toBeInstanceOf(RateLimitError);
  });

  test('a missing key fails the call, not the constructor', async () => {
    const previous = process.env.TYPESEARCH_API_KEY;
    delete process.env.TYPESEARCH_API_KEY;
    try {
      const t = new TypesearchNewsSearch({ baseURL: api.url });
      await expect(t.invoke({ query: 'el dólar' })).rejects.toThrow(/typesearch error: Missing API key/);
      await expect(new TypesearchRetriever({ baseURL: api.url }).invoke('el dólar')).rejects.toThrow(/Missing API key/);
      expect(api.requests).toHaveLength(0);
    } finally {
      if (previous !== undefined) process.env.TYPESEARCH_API_KEY = previous;
    }
  });

  test('a client of your own is used as is', async () => {
    const client = new Typesearch({ apiKey: KEY, baseURL: api.url, defaultHeaders: { 'X-Trace': 'abc' } });
    await new TypesearchNewsSearch({ client }).invoke({ query: 'el dólar' });
    expect(api.last.headers['x-trace']).toBe('abc');
  });

  test('an aborted call is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(new TypesearchNewsSearch(cfg()).invoke({ query: 'el dólar' }, { signal: controller.signal })).rejects.toThrow();
  });
});

describe('TypesearchRetriever', () => {
  test('returns documents: headline, standfirst and excerpts as content; the article as metadata', async () => {
    const docs = await new TypesearchRetriever(cfg()).invoke('el dólar');
    expect(api.last.body).toEqual({ query: 'el dólar', mode: 'fast', max_results: 10 });
    expect(docs).toHaveLength(2);
    expect(docs[0]).toBeInstanceOf(Document);
    expect(docs[0]!.pageContent).toBe('El dólar cerró estable por 1ª rueda\n\nLa divisa se mantuvo sin cambios frente al cierre anterior.');
    expect(docs[0]!.metadata).toEqual({
      title: 'El dólar cerró estable por 1ª rueda',
      url: 'https://diarioejemplo.example/economia/nota-1',
      source: 'Diario Ejemplo',
      published_at: '2026-09-21T18:05Z',
      country: 'AR',
      language: 'es',
      score: 0.95,
    });
    expect(docs[1]!.pageContent).toContain('The peso ended the session unchanged');
    expect(docs[1]!.metadata).toMatchObject({ source: 'Example Wire', found_in: 'discovery' });
  });

  test('k and the filters', async () => {
    const r = new TypesearchRetriever({ ...cfg(), k: 3, mode: 'deep', days: 30, countries: ['AR'], languages: ['es'], includeDomains: ['diarioejemplo.example'], excludeDomains: ['examplewire.example'], highlights: true, timezone: 'Europe/Madrid' });
    await r.invoke('inflación');
    expect(api.last.body).toEqual({
      query: 'inflación',
      mode: 'deep',
      max_results: 3,
      days: 30,
      include_domains: ['diarioejemplo.example'],
      exclude_domains: ['examplewire.example'],
      countries: ['AR'],
      languages: ['es'],
      highlights: true,
      timezone: 'Europe/Madrid',
    });
    expect(() => new TypesearchRetriever({ k: 51 })).toThrow(RangeError);
    expect(TypesearchRetriever.lc_name()).toBe('TypesearchRetriever');
  });

  test('nothing found: no documents', async () => {
    api.next({ status: 200, body: searchResponse({ found: false, total: 0, results: [], near_misses: [searchResponse().results[0]] }) });
    expect(await new TypesearchRetriever(cfg()).invoke('el dólar')).toEqual([]);
  });

  test('works in a chain', async () => {
    const retriever = new TypesearchRetriever(cfg());
    const chain = retriever.pipe((docs: Document[]) => docs.map((d) => `${d.metadata.source}: ${d.metadata.url}`).join('\n'));
    expect(await chain.invoke('el dólar')).toBe('Diario Ejemplo: https://diarioejemplo.example/economia/nota-1\nExample Wire: https://examplewire.example/markets/peso');
  });
});

test('VERSION matches package.json', () => {
  expect(VERSION).toBe(pkg.version);
});
