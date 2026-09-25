// Prueba de humo del paquete construido, como CommonJS: node test/smoke/cjs.cjs
const { TypesearchNewsSearch, TypesearchRetriever, VERSION } = require('../../dist/cjs/index.js');

(async () => {
  const { check } = await import('./check.mjs');
  await check({ TypesearchNewsSearch, TypesearchRetriever });
  console.log(`ok: @typesearch/langchain ${VERSION} (CommonJS) en Node ${process.version}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
