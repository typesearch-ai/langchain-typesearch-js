import type { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager';
import { Document } from '@langchain/core/documents';
import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers';
import type { SearchOptions } from 'typesearch-js';
import { call, checkMaxResults, lazyClient, searchOptions, type TypesearchClientParams, type TypesearchSearchParams } from './client.ts';
import { newsSearchOutput, type CompactResult } from './format.ts';

export interface TypesearchRetrieverParams extends BaseRetrieverInput, TypesearchClientParams, TypesearchSearchParams {
  /** Documents per query, 1 to 50. Defaults to 10. */
  k?: number;
}

/** The metadata of each document: the article, without the text that is already in `pageContent`. */
export type TypesearchDocumentMetadata = Omit<CompactResult, 'snippet' | 'highlights'>;

/**
 * News articles as LangChain documents, backed by typesearch search. Each document's `pageContent` is
 * the headline, the standfirst and, in the modes that read, short verbatim excerpts — never the full
 * article; `metadata` has the link, the outlet (`source`), the date, the country, the language and the
 * relevance `score`.
 *
 * ```ts
 * import { TypesearchRetriever } from '@typesearch/langchain';
 *
 * const retriever = new TypesearchRetriever({ k: 5, days: 30 }); // reads TYPESEARCH_API_KEY
 * const docs = await retriever.invoke('lithium royalties in Chile');
 * ```
 */
export class TypesearchRetriever extends BaseRetriever {
  static lc_name(): string {
    return 'TypesearchRetriever';
  }

  lc_namespace = ['typesearch', 'retrievers'];

  readonly k: number;
  readonly params: TypesearchSearchParams;
  #client: ReturnType<typeof lazyClient>;

  constructor(params: TypesearchRetrieverParams = {}) {
    const { apiKey, baseURL, client, timeout, maxRetries, k, mode, days, includeDomains, excludeDomains, countries, languages, highlights, timezone, ...retrieverParams } = params;
    super(retrieverParams);
    this.#client = lazyClient({ apiKey, baseURL, client, timeout, maxRetries });
    this.k = checkMaxResults(k, 'k') ?? 10;
    this.params = { mode, days, includeDomains, excludeDomains, countries, languages, highlights, timezone };
  }

  async _getRelevantDocuments(query: string, _runManager?: CallbackManagerForRetrieverRun): Promise<Document<TypesearchDocumentMetadata>[]> {
    const options = searchOptions({ ...this.params, maxResults: this.k }) as SearchOptions;
    const res = await call(this.#client, (c) => c.search(query, options));
    return newsSearchOutput(res, query).results.map((r) => {
      const { snippet, highlights, ...metadata } = r;
      return new Document({ pageContent: [r.title, snippet, ...(highlights ?? [])].filter(Boolean).join('\n\n'), metadata });
    });
  }
}
