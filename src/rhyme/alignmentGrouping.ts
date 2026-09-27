import { Syllable, SyllableSpan, analyzeWordWithSpans, normalizeWord } from './g2p';
import { Vowel, vowelSimilarity } from './phonemes';

/**
 * PREVIEW -- not the live path. `meter.ts` still imports `groupRhymingSyllables`
 * from `./grouping` (complete-linkage clustering). This is the alternative
 * design from scripts/_prototype_alignment.mts, adapted to the same
 * `words -> Map<word, SyllableColor[]>` contract so it can be swapped in for
 * a side-by-side visual comparison by changing one import line in meter.ts.
 *
 * Instead of clustering syllables into families by mutual similarity, this
 * scores every syllable pair on vowel distance plus a stress bonus/penalty,
 * then finds local sequence-alignment runs (Smith-Waterman style) through
 * the verse's syllable stream. A phrase rhyme falls out as one aligned run
 * instead of needing a separate "is this actually a contiguous phrase"
 * pass on top of clustering. See the prototype script for the test history
 * behind the two thresholds below (MATCH_FLOOR, the function-word stoplist).
 */

export const RHYME_GROUP_COLORS = 12;

const STRESS_BOTH_STRESSED_BONUS = 0.15;
const STRESS_BOTH_UNSTRESSED_BONUS = 0.06;
const STRESS_MISMATCH_PENALTY = 0.12;
/** A pair below this never counts as a rhyme step -- it can't be threaded
 * through as connective tissue between two real matches just because the
 * running alignment total still comes out ahead. Matches rhyme.ts's own
 * 'slant' cutoff (0.58). */
const MATCH_FLOOR = 0.58;
const GAP_PENALTY = 0.35;
const SELF_EXCLUDE_RADIUS = 1;
const MAX_ALIGNMENTS = 8;

// Monosyllabic function words come back stressed=true from the G2P (a
// one-syllable word is trivially its own stress peak), but they're
// phrasally reduced in a real sentence -- filtered here rather than with
// more scoring math. See the prototype script's stress-check test.
const FUNCTION_WORD_STOPLIST = new Set([
  'a', 'an', 'the', 'i', 'my', 'in', 'on', 'of', 'to', 'and', 'or', 'but',
  'it', 'is', 'am', 'are', 'was', 'be', 'as', 'at', 'so', 'for', 'me', 'we',
  'he', 'she', 'you', 'him', 'her', 'us', 'this', 'that',
]);

/** Fixed cyclic order, not a hash of membership -- so a vowel's color is the
 * same everywhere in the verse regardless of which alignment run it fell
 * into. Local alignment optimizes for total connected score, not for "these
 * are the same rhyme sound"; it will happily bridge two unrelated vowel
 * families (AE-ish and AA-ish) into one run via a cheap gap whenever that
 * raises the total. Coloring per matched pair by its own vowel, rather than
 * per run, is what keeps genuinely different rhyme sounds visually distinct
 * even when the alignment chained them into the same run. */
const VOWEL_ORDER: Vowel[] = ['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'];
function vowelColor(v: Vowel): number {
  return VOWEL_ORDER.indexOf(v) % RHYME_GROUP_COLORS;
}

function matchScore(a: Syllable, b: Syllable): number | null {
  let score = vowelSimilarity(a.nucleus, b.nucleus);
  if (a.stressed && b.stressed) score += STRESS_BOTH_STRESSED_BONUS;
  else if (!a.stressed && !b.stressed) score += STRESS_BOTH_UNSTRESSED_BONUS;
  else score -= STRESS_MISMATCH_PENALTY;
  return score >= MATCH_FLOOR ? score : null;
}

export interface SyllableColor extends SyllableSpan {
  color: number;
}

interface Unit {
  word: string;
  syllable: Syllable;
  span: SyllableSpan;
}

function buildUnits(words: string[]): Unit[] {
  const units: Unit[] = [];
  for (const raw of words) {
    const word = normalizeWord(raw);
    if (!word || FUNCTION_WORD_STOPLIST.has(word)) continue;
    const { syllables, syllableSpans } = analyzeWordWithSpans(raw);
    syllables.forEach((syllable, index) => {
      units.push({ word, syllable, span: syllableSpans[index] });
    });
  }
  return units;
}

/** Smith-Waterman self-alignment: finds up to MAX_ALIGNMENTS non-overlapping
 * local alignments through the same sequence, masking out spent positions
 * between rounds so the next round finds the next-best distinct run. */
function findAlignments(units: Unit[]): number[][][] {
  const n = units.length;
  const banned = new Set<number>();
  const runs: number[][][] = [];

  for (let round = 0; round < MAX_ALIGNMENTS; round += 1) {
    const H: number[][] = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0));
    const trace: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(n + 1));
    let best = { score: 0, i: 0, j: 0 };

    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        if (Math.abs(i - j) <= SELF_EXCLUDE_RADIUS) continue;
        if (banned.has(i - 1) || banned.has(j - 1)) continue;
        const step = matchScore(units[i - 1].syllable, units[j - 1].syllable);
        const diag = step === null ? -Infinity : H[i - 1][j - 1] + step;
        const up = H[i - 1][j] - GAP_PENALTY;
        const left = H[i][j - 1] - GAP_PENALTY;
        let cell = 0;
        let dir = 0;
        if (diag > cell) { cell = diag; dir = 1; }
        if (up > cell) { cell = up; dir = 2; }
        if (left > cell) { cell = left; dir = 3; }
        H[i][j] = cell;
        trace[i][j] = dir;
        if (cell > best.score) best = { score: cell, i, j };
      }
    }

    if (best.score < MATCH_FLOOR) break;

    const pairs: number[][] = [];
    let { i, j } = best;
    while (i > 0 && j > 0 && trace[i][j] !== 0) {
      if (trace[i][j] === 1) {
        pairs.unshift([i - 1, j - 1]);
        i -= 1; j -= 1;
      } else if (trace[i][j] === 2) {
        i -= 1;
      } else {
        j -= 1;
      }
    }
    if (pairs.length === 0) break;
    pairs.forEach(([a, b]) => { banned.add(a); banned.add(b); });
    runs.push(pairs);
  }
  return runs;
}

/** Same shape as `grouping.ts`'s `groupRhymingSyllables`: word -> matching
 * syllable spans with a palette color, ready for `lyricDecorations.ts` to
 * paint. One color per alignment run (not per hashed family membership). */
export function groupRhymingSyllables(words: string[]): Map<string, SyllableColor[]> {
  const units = buildUnits(words);
  const runs = findAlignments(units);

  const result = new Map<string, SyllableColor[]>();
  const addEntry = (idx: number, color: number) => {
    const unit = units[idx];
    const entry: SyllableColor = { ...unit.span, color };
    const list = result.get(unit.word);
    if (list) list.push(entry);
    else result.set(unit.word, [entry]);
  };
  runs.forEach((pairs) => {
    for (const [a, b] of pairs) {
      const color = vowelColor(units[a].syllable.nucleus);
      addEntry(a, color);
      addEntry(b, color);
    }
  });
  return result;
}
