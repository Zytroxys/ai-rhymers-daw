/**
 * The two concrete, computable "wordplay" connector types shown between
 * neighboring comma-separated branches in the word graph. Deliberately scoped
 * down from the open-ended "any literary device" ask to what's actually
 * buildable without an LLM call or a curated analogy database: phonetic
 * similarity (reusing the existing offline rhyme engine) and meaning overlap
 * (derived from Datamuse's `ml=` results, already fetched per branch).
 */

import { RhymeQuality, scoreRhyme } from '../rhyme/rhyme';

export interface SoundsLikeResult {
  score: number;
  quality: RhymeQuality;
}

/** Phonetic-similarity connector between two words/phrases. `scoreRhyme` is
 * already phrase-agnostic (see rhyme.ts's `syllablesOf`), so this needs no
 * new phonetic logic -- just the same scorer the Rhymes panel already uses. */
export function soundsLike(a: string, b: string): SoundsLikeResult {
  const result = scoreRhyme(a, b);
  return { score: result.score, quality: result.quality };
}

/** Meaning-overlap connector: the words two branches' Datamuse "means like"
 * results have in common. An empty array means no connector should be drawn. */
export function meaningOverlap(relatedA: string[], relatedB: string[]): string[] {
  const setB = new Set(relatedB.map((w) => w.toLowerCase()));
  const seen = new Set<string>();
  const overlap: string[] = [];
  for (const word of relatedA) {
    const normalized = word.toLowerCase();
    if (setB.has(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      overlap.push(normalized);
    }
  }
  return overlap;
}
