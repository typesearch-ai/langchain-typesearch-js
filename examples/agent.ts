/*
 * A LangChain agent that answers with recent news and cites its sources.
 *
 *   npm install langchain @langchain/core @langchain/anthropic @typesearch/langchain
 *   TYPESEARCH_API_KEY=ts_live_… ANTHROPIC_API_KEY=… npx tsx examples/agent.ts "What changed in EU AI Act enforcement this week?"
 */
import { createAgent } from 'langchain';
import { TypesearchNewsSearch } from '@typesearch/langchain';

const agent = createAgent({
  model: 'anthropic:claude-sonnet-4-5',
  tools: [new TypesearchNewsSearch({ maxResults: 8 })], // reads TYPESEARCH_API_KEY
  systemPrompt: 'Answer with recent news. Cite the source and the link of every fact.',
});

const question = process.argv[2] ?? 'What changed in EU AI Act enforcement this week?';
const result = await agent.invoke({ messages: [{ role: 'user', content: question }] });
console.log(result.messages.at(-1)?.content);
