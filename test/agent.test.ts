/*
 * De punta a punta con un agente de LangChain (createAgent) y un modelo simulado que llama la herramienta:
 * el agente ejecuta la búsqueda contra la API falsa y el modelo recibe el texto compacto.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createAgent, FakeToolCallingModel, ToolMessage } from 'langchain';
import { TypesearchNewsSearch } from '../src/index.ts';
import { FakeApi, KEY } from './fake-api.ts';

let api: FakeApi;

beforeAll(async () => {
  api = await new FakeApi().start();
});
afterAll(() => api.close());

test('createAgent: the model calls typesearch_news_search and reads the results', async () => {
  const model = new FakeToolCallingModel({ toolCalls: [[{ name: 'typesearch_news_search', args: { query: 'el dólar', days: 1 }, id: 'call_1' }], []] });
  const agent = createAgent({ model, tools: [new TypesearchNewsSearch({ apiKey: KEY, baseURL: api.url })] });
  const { messages } = await agent.invoke({ messages: [{ role: 'user', content: 'What happened with the peso today?' }] });
  expect(api.last.body).toEqual({ query: 'el dólar', mode: 'fast', max_results: 10, days: 1 });
  const tool = messages.find((m) => ToolMessage.isInstance(m)) as ToolMessage;
  expect(tool.content).toContain('2 results for "el dólar" · fast');
  expect(tool.artifact.results).toHaveLength(2);
});

test('createAgent: an API error reaches the model as a tool message', async () => {
  const model = new FakeToolCallingModel({ toolCalls: [[{ name: 'typesearch_news_search', args: { query: 'el dólar' }, id: 'call_1' }], []] });
  const agent = createAgent({ model, tools: [new TypesearchNewsSearch({ apiKey: 'ts_live_wrong', baseURL: api.url, maxRetries: 0 })] });
  const { messages } = await agent.invoke({ messages: [{ role: 'user', content: 'News about the peso?' }] });
  const tool = messages.find((m) => ToolMessage.isInstance(m)) as ToolMessage;
  expect(String(tool.content)).toContain('typesearch error (invalid_api_key): The API key is not valid.');
  expect(String(tool.content)).not.toContain('ts_live_wrong');
});
