/*
 * The retriever in a chain: the latest articles on a topic, as documents with their link and outlet.
 *
 *   npm install @langchain/core @typesearch/langchain
 *   TYPESEARCH_API_KEY=ts_live_… npx tsx examples/retriever.ts "lithium royalties in Chile"
 */
import { TypesearchRetriever } from '@typesearch/langchain';

const retriever = new TypesearchRetriever({ k: 5, days: 30, languages: ['es', 'en'] });
const docs = await retriever.invoke(process.argv[2] ?? 'lithium royalties in Chile');

for (const doc of docs) {
  console.log(`${doc.metadata.score.toFixed(2)}  ${doc.metadata.title} — ${doc.metadata.source}\n      ${doc.metadata.url}`);
}
