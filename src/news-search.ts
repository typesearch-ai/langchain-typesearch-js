import type { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { StructuredTool, type ToolParams, type ToolRunnableConfig } from '@langchain/core/tools';
import type { SearchOptions } from 'typesearch-js';
import { z } from 'zod/v4';
import { call, checkMaxResults, lazyClient, searchOptions, type TypesearchClientParams, type TypesearchSearchParams } from './client.ts';
import { newsSearchOutput, newsSearchText, type NewsSearchOutput } from './format.ts';

/*
 * Lo que ve el modelo: los mismos nombres, límites y descripciones que `search_news` del MCP de
 * typesearch. Lo que fija quien arma la herramienta (países, idiomas, dominios) no se le ofrece.
 */
const query = z
  .string()
  .trim()
  .min(2, 'query needs at least two letters.')
  .max(200, 'query is too long: 200 characters at most.')
  .describe('What to look for, in any language: a topic, event, person, company or place, such as "inflation in Argentina" or "OpenAI funding".');
const date = (field: string) =>
  z.union([z.iso.date(), z.iso.datetime({ offset: true })], { error: `${field} must be a date (2026-09-25) or a date-time with its offset (2026-09-25T14:00:00Z).` });
const domains = z.array(z.string().max(200)).max(20);

const FIELDS = {
  query,
  days: z.number().int().min(1).max(365).optional().describe('Only the last N days, 1 to 365. Defaults to 7 unless published_after or published_before are given.'),
  published_after: date('published_after').optional().describe('Published on or after this date: 2026-09-25, or a date-time with offset.'),
  published_before: date('published_before').optional().describe('Published on or before this date; a bare date includes that whole day.'),
  include_domains: domains.optional().describe('Only these domains or paths, such as example.com or example.com/sports.'),
  exclude_domains: domains.optional().describe('Never these domains or paths.'),
  countries: z.array(z.string().max(20)).min(1).max(50).optional().describe('Only sources from these countries: ISO 3166-1 alpha-2 codes, such as ["AR"] or ["US", "GB"].'),
  languages: z.array(z.string().max(35)).min(1).max(20).optional().describe('Only sources that publish in these languages: ISO 639-1 codes, such as ["es"] or ["en", "pt"].'),
};

/** What the model can ask for. The filters set in the constructor are not offered to it. */
export interface TypesearchNewsSearchInput {
  query: string;
  days?: number;
  published_after?: string;
  published_before?: string;
  include_domains?: string[];
  exclude_domains?: string[];
  countries?: string[];
  languages?: string[];
}

export interface TypesearchNewsSearchParams extends ToolParams, TypesearchClientParams, TypesearchSearchParams {
  /** Results per search, 1 to 50. Defaults to 10. */
  maxResults?: number;
  /** The tool name the model sees. Defaults to `typesearch_news_search`. */
  name?: string;
  /** Replaces the description the model reads. */
  description?: string;
}

const DESCRIPTION =
  'Search recent news on any topic across a curated index of news outlets worldwide, judged by a relevance model. ' +
  'Returns the matching articles: title, link, source, date, country and language, standfirst, and short excerpts in the modes that read, each with a relevance score from 0 to 1. ' +
  'Use it for current events and for what outlets reported about a company, person, place or topic. It covers the last 7 days unless you set days or a date range. Cite the link of every fact.';

/**
 * News search as a LangChain tool, backed by typesearch.
 *
 * The model reads a compact text list of the results; with a tool call, the `ToolMessage` also carries
 * the structured results as its `artifact`.
 *
 * ```ts
 * import { TypesearchNewsSearch } from '@typesearch/langchain';
 *
 * const search = new TypesearchNewsSearch({ maxResults: 5 }); // reads TYPESEARCH_API_KEY
 * await search.invoke({ query: 'EU AI Act enforcement', days: 7 });
 * ```
 */
export class TypesearchNewsSearch extends StructuredTool<z.ZodType<TypesearchNewsSearchInput>> {
  static lc_name(): string {
    return 'TypesearchNewsSearch';
  }

  name = 'typesearch_news_search';
  description = DESCRIPTION;
  schema: z.ZodType<TypesearchNewsSearchInput>;
  override responseFormat: ToolParams['responseFormat'] = 'content_and_artifact';

  readonly mode: NonNullable<TypesearchSearchParams['mode']>;
  readonly maxResults: number;
  readonly days: number | undefined;
  readonly includeDomains: string[] | undefined;
  readonly excludeDomains: string[] | undefined;
  readonly countries: string[] | undefined;
  readonly languages: string[] | undefined;
  readonly highlights: boolean | undefined;
  readonly timezone: string | undefined;
  #client: ReturnType<typeof lazyClient>;

  constructor(params: TypesearchNewsSearchParams = {}) {
    const { apiKey, baseURL, client, timeout, maxRetries, mode, maxResults, days, includeDomains, excludeDomains, countries, languages, highlights, timezone, name, description, ...toolParams } = params;
    super(toolParams);
    if (params.responseFormat) this.responseFormat = params.responseFormat;
    this.#client = lazyClient({ apiKey, baseURL, client, timeout, maxRetries });
    this.mode = mode ?? 'fast';
    this.maxResults = checkMaxResults(maxResults, 'maxResults') ?? 10;
    this.days = days;
    this.includeDomains = includeDomains;
    this.excludeDomains = excludeDomains;
    this.countries = countries;
    this.languages = languages;
    this.highlights = highlights;
    this.timezone = timezone;
    if (name) this.name = name;

    const shape: Record<string, z.ZodType> = { query: FIELDS.query, days: FIELDS.days, published_after: FIELDS.published_after, published_before: FIELDS.published_before };
    if (!includeDomains) shape.include_domains = FIELDS.include_domains;
    if (!excludeDomains) shape.exclude_domains = FIELDS.exclude_domains;
    if (!countries) shape.countries = FIELDS.countries;
    if (!languages) shape.languages = FIELDS.languages;
    this.schema = z.object(shape) as unknown as z.ZodType<TypesearchNewsSearchInput>;

    const limits = [
      countries?.length ? `sources from ${countries.join(', ')}` : null,
      languages?.length ? `sources in ${languages.join(', ')}` : null,
      includeDomains?.length ? `only ${includeDomains.join(', ')}` : null,
      excludeDomains?.length ? `never ${excludeDomains.join(', ')}` : null,
    ].filter(Boolean);
    this.description = description ?? (limits.length ? `${DESCRIPTION} Searches are limited to ${limits.join('; ')}.` : DESCRIPTION);
  }

  protected async _call(input: TypesearchNewsSearchInput, _runManager?: CallbackManagerForToolRun, config?: ToolRunnableConfig): Promise<[string, NewsSearchOutput] | string> {
    const dated = input.days !== undefined || input.published_after !== undefined || input.published_before !== undefined;
    const options: SearchOptions & { countries?: string[]; languages?: string[] } = {
      ...searchOptions({
        mode: this.mode,
        maxResults: this.maxResults,
        days: input.days ?? (dated ? undefined : this.days),
        includeDomains: this.includeDomains ?? input.include_domains,
        excludeDomains: this.excludeDomains ?? input.exclude_domains,
        countries: this.countries ?? input.countries,
        languages: this.languages ?? input.languages,
        highlights: this.highlights,
        timezone: this.timezone,
      }),
      ...(input.published_after ? { published_after: input.published_after } : {}),
      ...(input.published_before ? { published_before: input.published_before } : {}),
    };
    const res = await call(this.#client, (c) => c.search(input.query, options, config?.signal ? { signal: config.signal } : undefined));
    const output = newsSearchOutput(res, input.query);
    const text = newsSearchText(output);
    return this.responseFormat === 'content_and_artifact' ? [text, output] : text;
  }
}
