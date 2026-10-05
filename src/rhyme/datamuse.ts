/** Rhyme lookup against the Datamuse API (https://www.datamuse.com/api/). */

export type DatamuseQuality = 'perfect' | 'near';

export interface RhymeEntry {
  word: string;
  quality: DatamuseQuality;
  syllables: number;
  score: number;
  source: 'datamuse' | 'offline';
}

/**
 * Combine both sources. Datamuse (ranked by how common a word is) leads each
 * quality tier; offline-only words follow it. A word keeps its best quality.
 */
export function mergeRhymes(online: RhymeEntry[], offline: RhymeEntry[]): RhymeEntry[] {
  const best = new Map<string, RhymeEntry>();
  for (const entry of [...online, ...offline]) {
    const key = entry.word.toLowerCase();
    const prior = best.get(key);
    if (!prior || (prior.quality === 'near' && entry.quality === 'perfect')) best.set(key, entry);
  }
  const all = [...best.values()];
  const tier = (q: DatamuseQuality) => all.filter((e) => e.quality === q);
  const lead = (e: RhymeEntry) => (e.source === 'datamuse' ? 0 : 1);
  return (['perfect', 'near'] as const).flatMap((q) => tier(q).sort((a, b) => lead(a) - lead(b)));
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
export async function fetchRhymes(input: string, signal?: AbortSignal): Promise<RhymeEntry[]> {
  const word = input.trim().split(/\s+/).pop() ?? '';
  if (!word) return [];

  const [perfect, near] = await Promise.all([
    fetchRelation('rel_rhy', word, signal),
    fetchRelation('rel_nry', word, signal),
  ]);

  const seen = new Set<string>([word.toLowerCase()]);
  const out: RhymeEntry[] = [];
  const add = (entries: RawEntry[], quality: DatamuseQuality) => {
    for (const entry of entries) {
      const key = entry.word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ word: entry.word, quality, syllables: entry.numSyllables ?? 0, score: entry.score ?? 0, source: 'datamuse' });
    }
  };
  add(perfect, 'perfect');
  add(near, 'near');
  return out;
}
