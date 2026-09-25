/*
 * Contra la API de verdad: corre sólo con `npm run test:live` y TYPESEARCH_API_KEY en el entorno (con
 * `npm test` se saltea aunque haya clave, para no gastar sin querer). Gasta muy poco: dos búsquedas `fast`
 * de 3 resultados. TYPESEARCH_BASE_URL apunta a otra API.
 */
import { describe, expect, test } from 'vitest';
import { TypesearchNewsSearch, TypesearchRetriever } from '../src/index.ts';

const key = process.env.TYPESEARCH_LIVE === '1' ? process.env.TYPESEARCH_API_KEY : undefined;

describe.skipIf(!key)('live API', () => {
  test('the tool', async () => {
    const text = await new TypesearchNewsSearch({ apiKey: key, maxResults: 3 }).invoke({ query: 'inflation', days: 7 });
    expect(text).toMatch(/results? for "inflation" · fast|No results for "inflation"/);
  }, 60_000);

  test('the retriever', async () => {
    const docs = await new TypesearchRetriever({ apiKey: key, k: 3 }).invoke('inflation');
    expect(docs.length).toBeLessThanOrEqual(3);
    for (const d of docs) expect(d.metadata.url).toMatch(/^https?:\/\//);
  }, 60_000);
});
