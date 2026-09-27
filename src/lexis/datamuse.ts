/**
 * Thin client for the free, keyless Datamuse API (https://api.datamuse.com) --
 * the app's only source of synonym/antonym/related-word data. Everything else
 * in this app (rhyme, meter, consonance) runs offline against a bundled
 * lexicon; this is deliberately the one feature that needs a network call, so
 * failures are swallowed rather than thrown -- a missing connection should
 * degrade the word graph, not crash it.
 */

export interface DatamuseResult {
  words: string[];
  /** True when the request itself failed (offline, CORS, timeout, non-2xx) --
   * lets the caller distinguish "nothing found" from "couldn't ask". */
  failed: boolean;
}

const cache = new Map<string, DatamuseResult>();

async function fetchWords(param: 'rel_syn' | 'rel_ant' | 'ml', word: string): Promise<DatamuseResult> {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return { words: [], failed: false };

  const cacheKey = `${param}:${normalized}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let result: DatamuseResult;
  try {
    const url = `https://api.datamuse.com/words?${param}=${encodeURIComponent(normalized)}&max=10`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Datamuse responded ${response.status}`);
    const data: Array<{ word: string }> = await response.json();
    result = { words: data.map((entry) => entry.word), failed: false };
  } catch {
    result = { words: [], failed: true };
  }

  cache.set(cacheKey, result);
  return result;
}

/** Words that mean the opposite of `word` (Datamuse `rel_ant`). */
export function fetchAntonyms(word: string): Promise<DatamuseResult> {
  return fetchWords('rel_ant', word);
}

/** Words that mean the same as `word` (Datamuse `rel_syn`). */
export function fetchSynonyms(word: string): Promise<DatamuseResult> {
  return fetchWords('rel_syn', word);
}

/** Words "means like" `word` (Datamuse `ml`) -- used both as the general
 * "Related words" bucket for single-word mode and as the input to the
 * meaning-overlap wordplay signal (see lexis/wordplay.ts). */
export function fetchRelated(word: string): Promise<DatamuseResult> {
  return fetchWords('ml', word);
}
