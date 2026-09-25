/*
 * El cliente de la API detrás de la herramienta y del retriever. Se crea en la primera llamada, no en el
 * constructor: armar la herramienta en el nivel superior de un módulo no falla sin clave, y el error de
 * la clave faltante le llega al agente como error de la herramienta.
 */
import Typesearch, { APIConnectionError, APIError, APITimeoutError, RateLimitError, VERSION as SDK_VERSION } from 'typesearch-js';
import { VERSION } from './version.ts';

/** Connection settings shared by the tool and the retriever. */
export interface TypesearchClientParams {
  /** Your API key. Defaults to the `TYPESEARCH_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to `TYPESEARCH_BASE_URL`, or `https://api.typesearch.ai`. */
  baseURL?: string;
  /** A `typesearch-js` client you already have, used instead of creating one. */
  client?: Typesearch;
  /** Milliseconds before a request is aborted. Defaults to 70 000 (a `deep` search can take about a minute). */
  timeout?: number;
  /** Retries on connection errors, `429 rate_limited` and `5xx`. Defaults to 2. */
  maxRetries?: number;
}

/** The search filters shared by the tool and the retriever. */
export interface TypesearchSearchParams {
  /**
   * How much is read before ranking: `fast` (default, the cheapest and quickest: headlines and
   * standfirsts), `ultra` (headlines only, same price), `normal` (also reads the best matches) or `deep`
   * (reads more and finds the topic in other words too). See https://typesearch.ai/docs/modes.
   */
  mode?: 'ultra' | 'fast' | 'normal' | 'deep';
  /** The last N days (1–365). The API's default is 7. */
  days?: number;
  /** Only these domains or paths. */
  includeDomains?: string[];
  /** Never these domains or paths. */
  excludeDomains?: string[];
  /** Only sources from these countries (ISO 3166-1 alpha-2). */
  countries?: string[];
  /** Only sources in these languages (ISO 639-1). */
  languages?: string[];
  /** Verbatim excerpts from the articles that were read (`normal` and `deep`). On by default only in `deep`. */
  highlights?: boolean;
  /** IANA time zone that decides what day "today" is in a query such as "news from today". */
  timezone?: string;
}

export const USER_AGENT = `typesearch-langchain-js/${VERSION} typesearch-js/${SDK_VERSION}`;

/** Un cliente perezoso: se crea en la primera llamada y se reusa. */
export function lazyClient(params: TypesearchClientParams): () => Typesearch {
  let client = params.client;
  return () => {
    client ??= new Typesearch({
      ...(params.apiKey !== undefined ? { apiKey: params.apiKey } : {}),
      ...(params.baseURL !== undefined ? { baseURL: params.baseURL } : {}),
      ...(params.timeout !== undefined ? { timeout: params.timeout } : {}),
      ...(params.maxRetries !== undefined ? { maxRetries: params.maxRetries } : {}),
      defaultHeaders: { 'User-Agent': USER_AGENT },
    });
    return client;
  };
}

/**
 * Un error que el agente entiende y sobre el que puede actuar, en inglés y sin la clave. El error original
 * del SDK queda en `cause`, para el código que lo quiera distinguir (`instanceof RateLimitError`…).
 */
export function readableError(e: unknown): Error {
  if (e instanceof APIError) {
    const retry = e instanceof RateLimitError && e.retryAfter ? ` Retry after ${e.retryAfter} s.` : '';
    return new Error(`typesearch error (${e.code}): ${e.message}${retry}${e.requestId ? ` [request ${e.requestId}]` : ''}`, { cause: e });
  }
  if (e instanceof APITimeoutError) return new Error('typesearch error (timeout): the API took too long to answer. Try again, or use a lighter mode.', { cause: e });
  if (e instanceof APIConnectionError) return new Error('typesearch error (connection): could not reach the typesearch API. Try again.', { cause: e });
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) return e;
  return new Error(`typesearch error: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
}

/** Llama a la API con el cliente perezoso y traduce los errores. */
export async function call<T>(client: () => Typesearch, run: (c: Typesearch) => Promise<T>): Promise<T> {
  try {
    return await run(client());
  } catch (e) {
    throw readableError(e);
  }
}

/** Las opciones de búsqueda de la API a partir de los filtros (vacíos fuera). */
export function searchOptions(p: TypesearchSearchParams & { maxResults: number; days?: number }) {
  const list = (key: string, v: string[] | undefined) => (v?.length ? { [key]: v } : {});
  return {
    mode: p.mode ?? 'fast',
    max_results: p.maxResults,
    ...(p.days !== undefined ? { days: p.days } : {}),
    ...list('include_domains', p.includeDomains),
    ...list('exclude_domains', p.excludeDomains),
    ...list('countries', p.countries),
    ...list('languages', p.languages),
    ...(p.highlights !== undefined ? { highlights: p.highlights } : {}),
    ...(p.timezone ? { timezone: p.timezone } : {}),
  };
}

export function checkMaxResults(n: number | undefined, name: string): number | undefined {
  if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 50)) throw new RangeError(`${name} must be a whole number from 1 to 50.`);
  return n;
}
