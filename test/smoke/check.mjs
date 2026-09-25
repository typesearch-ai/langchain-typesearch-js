// Lo que comprueban las dos pruebas de humo: la herramienta y el retriever buscan en una API mínima con la
// clave y devuelven el texto compacto y los documentos.
import http from 'node:http';

export async function check({ TypesearchNewsSearch, TypesearchRetriever }) {
  const bodies = [];
  const server = http.createServer(async (req, res) => {
    let text = '';
    for await (const c of req) text += c;
    bodies.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(text) });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'req_smoke',
        mode: 'fast',
        results: [{ url: 'https://diarioejemplo.example/a', title: 'Una nota', source: 'Diario Ejemplo', published_at: null, snippet: null, score: 0.9, highlights: [], found_in: 'index' }],
        near_misses: [],
        warnings: [],
        incomplete: false,
        cached_at: null,
        usage: { cost_usd: 0 },
      }),
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    const tool = new TypesearchNewsSearch({ apiKey: 'ts_test_smoke', baseURL });
    const text = await tool.invoke({ query: 'el dólar' });
    if (!text.startsWith('1 result for "el dólar" · fast') || bodies[0].auth !== 'Bearer ts_test_smoke' || bodies[0].body.mode !== 'fast') throw new Error(JSON.stringify({ text, bodies }));
    const docs = await new TypesearchRetriever({ apiKey: 'ts_test_smoke', baseURL, k: 3 }).invoke('el dólar');
    if (docs[0].metadata.url !== 'https://diarioejemplo.example/a' || bodies[1].body.max_results !== 3) throw new Error(JSON.stringify({ docs, bodies }));
  } finally {
    server.close();
  }
}
