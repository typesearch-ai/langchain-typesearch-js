# Changelog

All notable changes to `@typesearch/langchain` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

First release.

- `TypesearchNewsSearch`: a LangChain tool (`typesearch_news_search`) with the parameters, limits and
  description of the typesearch MCP `search_news` tool. The model reads a compact text list; the
  `ToolMessage` carries the structured results as its `artifact`.
- `TypesearchRetriever`: news articles as documents, with the link, outlet, date, country, language and
  relevance score as metadata.
- Filters fixed in the constructor are always applied and hidden from the model.
- The client is created on the first call: building the tool never fails without a key.
- Errors are readable for the agent, with the `typesearch-js` error as `cause`.
- ESM and CommonJS, fully typed. `@langchain/core` 1.x.
