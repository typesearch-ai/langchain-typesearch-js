// Prueba de humo del paquete construido, como ESM: node test/smoke/esm.mjs
import { TypesearchNewsSearch, TypesearchRetriever, VERSION } from '../../dist/esm/index.js';
import { check } from './check.mjs';

await check({ TypesearchNewsSearch, TypesearchRetriever });
console.log(`ok: @typesearch/langchain ${VERSION} (ESM) en Node ${process.version}`);
