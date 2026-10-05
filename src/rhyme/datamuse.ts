/** Rhyme lookup against the Datamuse API (https://www.datamuse.com/api/). */

export type DatamuseQuality = 'perfect' | 'near';

export interface DatamuseRhyme {
  word: string;
  quality: DatamuseQuality;
  syllables: number;
  score: number;
}

interface RawEntry {
  word: string;
  score?: number;
  numSyllables?: number;
}

const ENDPOINT = 'https://api.datamuse.com/words';
const MAX_RESULTS = 1000;

async function fetchRelation(
  relation: 'rel_rhy' | 'rel_nry',
  word: string,
  signal?: AbortSignal,
): Promise<RawEntry[]> {
  const url = `${ENDPOINT}?${relation}=${encodeURIComponent(word)}&md=s&max=${MAX_RESULTS}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Datamuse responded ${response.status}`);
  return (await response.json()) as RawEntry[];
}

/** Perfect rhymes first, then near rhymes, each in Datamuse's own ranking. Multi-word input rhymes on its last word. */
export async function fetchRhymes(input: string, signal?: AbortSignal): Promise<DatamuseRhyme[]> {
  const word = input.trim().split(/\s+/).pop() ?? '';
  if (!word) return [];

  const [perfect, near] = await Promise.all([
    fetchRelation('rel_rhy', word, signal),
    fetchRelation('rel_nry', word, signal),
  ]);

  const seen = new Set<string>([word.toLowerCase()]);
  const out: DatamuseRhyme[] = [];
  const add = (entries: RawEntry[], quality: DatamuseQuality) => {
    for (const entry of entries) {
      const key = entry.word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ word: entry.word, quality, syllables: entry.numSyllables ?? 0, score: entry.score ?? 0 });
    }
  };
  add(perfect, 'perfect');
  add(near, 'near');
  return out;
}
