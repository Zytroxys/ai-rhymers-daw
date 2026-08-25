import { Consonant, consonantSimilarity, vowelSimilarity } from './phonemes';
import { Syllable, analyzeWord, normalizeWord } from './g2p';

/**
 * Rhyme scoring works on trailing syllables rather than on a single "rhyme tail"
 * cut at the last stressed vowel. Stress detection is heuristic (see g2p.ts), and
 * comparing the last N syllables gets multisyllabic rhymes -- the ones rap
 * actually runs on -- for free: `tragic wagon` / `magic dragon` scores as a
 * 2-syllable match without anyone having to mark the stress correctly.
 */

export type RhymeQuality =
  | 'identity'   // the same word (or a homophone) -- not a rhyme
  | 'perfect'    // vowels and codas match exactly from the last nucleus on
  | 'near'       // one small consonant difference
  | 'slant'      // same vowel colour, different consonants
  | 'assonance'  // vowels rhyme, consonants don't
  | 'weak';

export interface RhymeScore {
  score: number;
  quality: RhymeQuality;
  /** How many trailing syllables were compared. */
  comparedSyllables: number;
  /** How many of those matched closely enough to read as a multi. */
  matchedSyllables: number;
}

export interface RhymeOptions {
  /** Cap on trailing syllables to compare. Default 3. */
  maxSyllables?: number;
}

/** Per-syllable weights, last syllable first. */
const SYLLABLE_WEIGHTS = [1, 0.72, 0.5, 0.34];
const NUCLEUS_WEIGHT = 0.62;
const CODA_WEIGHT = 0.38;
/** Floor for an exactly matching final syllable, leaving headroom for multis. */
const PERFECT_BASE = 0.86;
/** Added per extra trailing syllable that lands, up to three. */
const MULTI_BONUS = 0.05;
const STRESS_MISMATCH_PENALTY = 0.86;

/** Syllables for a word or a multi-word phrase ("want it" -> 2 syllables). */
export function syllablesOf(text: string): Syllable[] {
  return text
    .split(/[\s-]+/)
    .filter(Boolean)
    .flatMap((word) => analyzeWord(word).syllables);
}

function codaSimilarity(a: Consonant[], b: Consonant[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const n = Math.max(a.length, b.length);
  let total = 0;
  let weightSum = 0;
  for (let k = 0; k < n; k += 1) {
    const weight = k === 0 ? 1 : 0.7;
    weightSum += weight;
    const ca = a[a.length - 1 - k];
    const cb = b[b.length - 1 - k];
    // A consonant with nothing opposite it is a real mismatch (day/date), but
    // not a total one -- English ears forgive a trailing stop.
    total += (ca && cb ? consonantSimilarity(ca, cb) : 0.15) * weight;
  }
  return total / weightSum;
}

/**
 * The consonants that count for one syllable of the rhyme: its own coda plus the
 * onset of whatever follows. In `money` / `heavy` the difference is entirely in
 * that following onset (N vs V) -- ignore it and the two look like a perfect
 * two-syllable rhyme, which they very much are not.
 */
function rhymeUnit(syllables: Syllable[], index: number): { nucleus: Syllable['nucleus']; tail: Consonant[] } {
  const syllable = syllables[index];
  const next = syllables[index + 1];
  return {
    nucleus: syllable.nucleus,
    tail: next ? [...syllable.coda, ...next.onset] : syllable.coda,
  };
}

function unitSimilarity(
  a: { nucleus: Syllable['nucleus']; tail: Consonant[] },
  b: { nucleus: Syllable['nucleus']; tail: Consonant[] },
): number {
  const nucleus = vowelSimilarity(a.nucleus, b.nucleus);
  // Two open syllables have nothing else to compare, so the vowel carries it all
  // rather than the coda term handing out a free 0.38.
  if (a.tail.length === 0 && b.tail.length === 0) return nucleus;
  return nucleus * NUCLEUS_WEIGHT + codaSimilarity(a.tail, b.tail) * CODA_WEIGHT;
}

function sameTail(
  a: { nucleus: Syllable['nucleus']; tail: Consonant[] },
  b: { nucleus: Syllable['nucleus']; tail: Consonant[] },
): boolean {
  return (
    a.nucleus === b.nucleus &&
    a.tail.length === b.tail.length &&
    a.tail.every((c, i) => c === b.tail[i])
  );
}

const EMPTY_SCORE: RhymeScore = {
  score: 0,
  quality: 'weak',
  comparedSyllables: 0,
  matchedSyllables: 0,
};

/** Score how well two words or phrases rhyme, from 0 (not at all) to 1. */
export function scoreRhyme(a: string, b: string, options: RhymeOptions = {}): RhymeScore {
  const maxSyllables = options.maxSyllables ?? 3;
  const sylA = syllablesOf(a);
  const sylB = syllablesOf(b);
  if (sylA.length === 0 || sylB.length === 0) return EMPTY_SCORE;

  const normA = normalizeWord(a.replace(/\s+/g, ''));
  const normB = normalizeWord(b.replace(/\s+/g, ''));
  if (normA === normB) {
    const n = Math.min(sylA.length, sylB.length, maxSyllables);
    return { score: 1, quality: 'identity', comparedSyllables: n, matchedSyllables: n };
  }

  const k = Math.min(sylA.length, sylB.length, maxSyllables);
  let weighted = 0;
  let weightSum = 0;
  let matched = 0;
  let exactTail = true;

  for (let j = 0; j < k; j += 1) {
    const left = rhymeUnit(sylA, sylA.length - 1 - j);
    const right = rhymeUnit(sylB, sylB.length - 1 - j);
    const weight = SYLLABLE_WEIGHTS[Math.min(j, SYLLABLE_WEIGHTS.length - 1)];
    const sim = unitSimilarity(left, right);
    weighted += sim * weight;
    weightSum += weight;
    if (sim >= 0.82) matched += 1;
    if (j === 0 && !sameTail(left, right)) exactTail = false;
  }

  const lastA = sylA[sylA.length - 1];
  const lastB = sylB[sylB.length - 1];

  let score = weighted / weightSum;
  if (exactTail) score = Math.max(score, PERFECT_BASE);

  /*
   * Scale by how much of the rhyme actually lands. A multi is a richer rhyme
   * than a single, so `night`/`light` tops out below `magic dragon`/`tragic
   * wagon` instead of both pinning at 1.
   */
  const landed = Math.min(Math.max(matched, 1), 3);
  score *= 0.9 + MULTI_BONUS * (landed - 1);

  /*
   * "money" and "degree" both end in IY, but one ends unstressed and the other
   * carries the stress, which is why the pair reads as a weak rhyme rather than
   * a clean one. Stress here is heuristic (see g2p.ts), so this demotes rather
   * than disqualifies.
   */
  const stressAligned = lastA.stressed === lastB.stressed;
  if (!stressAligned) score *= STRESS_MISMATCH_PENALTY;

  let quality: RhymeQuality;
  if (exactTail && stressAligned) {
    quality = 'perfect';
  } else if (score >= 0.75) {
    quality = 'near';
  } else if (score >= 0.58) {
    quality = 'slant';
  } else if (vowelSimilarity(lastA.nucleus, lastB.nucleus) >= 0.8) {
    quality = 'assonance';
  } else {
    quality = 'weak';
  }

  return { score, quality, comparedSyllables: k, matchedSyllables: matched };
}

export interface RhymeMatch extends RhymeScore {
  word: string;
  syllableCount: number;
}

export interface FindRhymesOptions extends RhymeOptions {
  /** Candidate words to search. Defaults to the bundled lexicon. */
  dictionary?: readonly string[];
  limit?: number;
  minScore?: number;
  /** Only return candidates with this many syllables. */
  syllables?: number;
  /** Include the query word itself and homophones. */
  includeIdentity?: boolean;
}

/** Rank a dictionary by how well each entry rhymes with `word`. */
export function findRhymes(word: string, options: FindRhymesOptions = {}): RhymeMatch[] {
  const {
    dictionary,
    limit = 40,
    minScore = 0.55,
    syllables,
    includeIdentity = false,
    maxSyllables,
  } = options;
  const words = dictionary ?? LEXICON_REF.current;
  const query = normalizeWord(word);
  if (!query) return [];

  const matches: RhymeMatch[] = [];
  for (const candidate of words) {
    if (!includeIdentity && normalizeWord(candidate) === query) continue;
    const analysis = analyzeWord(candidate);
    if (analysis.syllableCount === 0) continue;
    if (syllables !== undefined && analysis.syllableCount !== syllables) continue;
    const result = scoreRhyme(word, candidate, { maxSyllables });
    if (result.quality === 'identity' && !includeIdentity) continue;
    if (result.score < minScore) continue;
    matches.push({ ...result, word: candidate, syllableCount: analysis.syllableCount });
  }

  matches.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
  return matches.slice(0, limit);
}

/**
 * A coarse key for grouping rhyming words: the nucleus and coda of the last
 * `syllables` syllables. Words sharing a key are at least near rhymes.
 */
export function rhymeKey(text: string, syllables = 1): string {
  const syls = syllablesOf(text);
  if (syls.length === 0) return '';
  return syls
    .slice(Math.max(0, syls.length - syllables))
    .map((s) => [s.nucleus, ...s.coda].join('-'))
    .join('|');
}

/**
 * Label lines A/B/C... by which of them rhyme, the way you'd mark up a verse.
 * Lines that rhyme with nothing else get their own letter.
 */
export function rhymeScheme(lines: string[], threshold = 0.62): string[] {
  const endings = lines.map((line) => {
    const words = line.trim().split(/\s+/).filter(Boolean);
    return words.length ? words[words.length - 1] : '';
  });

  const labels: string[] = new Array(lines.length).fill('');
  let next = 0;
  for (let i = 0; i < endings.length; i += 1) {
    if (!endings[i]) { labels[i] = '-'; continue; }
    if (labels[i]) continue;
    const label = String.fromCharCode(65 + (next % 26));
    next += 1;
    labels[i] = label;
    for (let j = i + 1; j < endings.length; j += 1) {
      if (labels[j] || !endings[j]) continue;
      const result = scoreRhyme(endings[i], endings[j]);
      if (result.quality !== 'identity' && result.score >= threshold) labels[j] = label;
    }
  }
  return labels;
}

/**
 * Indirection so `findRhymes` can default to the bundled lexicon without
 * lexicon.ts and rhyme.ts importing each other in a cycle.
 */
export const LEXICON_REF: { current: readonly string[] } = { current: [] };
