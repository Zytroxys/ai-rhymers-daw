/**
 * PROTOTYPE — not wired into the app. Tests a combined vowel-distance +
 * stress matchScore, fed into local sequence alignment (Smith-Waterman
 * style), against real lines using the actual g2p/phonemes code.
 *
 * Run: npx vite-node scripts/_prototype_alignment.mts
 */
import { analyzeWord } from '../src/rhyme/g2p';
import type { Syllable } from '../src/rhyme/g2p';
import { vowelSimilarity } from '../src/rhyme/phonemes';

interface LabeledSyllable {
  syllable: Syllable;
  word: string;
  syllableIndexInWord: number;
  totalSyllablesInWord: number;
}

// Monosyllabic function words register as lexically "stressed" (a one-syllable
// word is trivially its own stress peak), but they're phrasally reduced in a
// real sentence -- the G2P has no model of that, so we filter them here
// instead of trying to fix it with more scoring math.
const FUNCTION_WORD_STOPLIST = new Set([
  'a', 'an', 'the', 'i', 'my', 'in', 'on', 'of', 'to', 'and', 'or', 'but',
  'it', 'is', 'am', 'are', 'was', 'be', 'as', 'at', 'so', 'for', 'me', 'we',
  'he', 'she', 'you', 'him', 'her', 'us', 'this', 'that',
]);

function labelLine(line: string): LabeledSyllable[] {
  const words = line.trim().split(/\s+/).filter(Boolean);
  const out: LabeledSyllable[] = [];
  for (const word of words) {
    if (FUNCTION_WORD_STOPLIST.has(word.toLowerCase())) continue;
    const { syllables } = analyzeWord(word);
    syllables.forEach((syllable, syllableIndexInWord) => {
      out.push({ syllable, word, syllableIndexInWord, totalSyllablesInWord: syllables.length });
    });
  }
  return out;
}

function syllableLabel(s: LabeledSyllable): string {
  return s.totalSyllablesInWord === 1 ? s.word : `${s.word}[${s.syllableIndexInWord}]`;
}

// ---------------------------------------------------------------------------
// matchScore: vowel distance is the base signal, stress alignment is a bonus
// or penalty layered on top -- never strong enough to promote a poor vowel
// match over a better one (max bonus 0.15, vs vowelSimilarity's 0..1 range).
// ---------------------------------------------------------------------------
const STRESS_BOTH_STRESSED_BONUS = 0.15;
const STRESS_BOTH_UNSTRESSED_BONUS = 0.06;
const STRESS_MISMATCH_PENALTY = 0.12;
const GAP_PENALTY = 0.35;
/** A syllable pair below this never counts as a rhyme step at all -- no
 * "okay-ish" pair gets woven in as connective tissue between two real
 * matches. Matches rhyme.ts's own 'slant' cutoff (0.58) rather than
 * inventing a new number. */
const MATCH_FLOOR = 0.58;

/** Returns null (not -Infinity) below the floor so callers can tell "not a
 * legal rhyme step" apart from "a legal but low-scoring one". */
function matchScore(a: Syllable, b: Syllable): number | null {
  let score = vowelSimilarity(a.nucleus, b.nucleus);
  if (a.stressed && b.stressed) score += STRESS_BOTH_STRESSED_BONUS;
  else if (!a.stressed && !b.stressed) score += STRESS_BOTH_UNSTRESSED_BONUS;
  else score -= STRESS_MISMATCH_PENALTY;
  return score >= MATCH_FLOOR ? score : null;
}

function tierOf(score: number): string {
  if (score >= 0.95) return 'exact ';
  if (score >= 0.65) return 'drift ';
  return 'weak  ';
}

// ---------------------------------------------------------------------------
// Smith-Waterman local alignment. Self-alignment (a === b) excludes cells
// near the diagonal so a syllable doesn't just "match itself".
// ---------------------------------------------------------------------------
interface AlignedPair { i: number; j: number; score: number }
interface AlignmentResult { pairs: AlignedPair[]; totalScore: number }

function findAlignments(
  a: LabeledSyllable[],
  b: LabeledSyllable[],
  { count = 3, selfExcludeRadius = 1, minScore = 0.4 }: { count?: number; selfExcludeRadius?: number; minScore?: number } = {},
): AlignmentResult[] {
  const isSelf = a === b;
  // One shared banned set for self-alignment -- a position used on either
  // side of a pair is spent, full stop. Two separate sets (one per side)
  // let the same syllable get reused across rounds, since a===b means
  // "side" is arbitrary, not a real distinction.
  const bannedA = new Set<number>();
  const bannedB = isSelf ? bannedA : new Set<number>();
  const results: AlignmentResult[] = [];

  for (let round = 0; round < count; round += 1) {
    const n = a.length;
    const m = b.length;
    const H: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    const trace: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 0 stop, 1 diag, 2 up, 3 left
    let best = { score: 0, i: 0, j: 0 };

    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= m; j += 1) {
        if (isSelf && Math.abs(i - j) <= selfExcludeRadius) continue;
        if (bannedA.has(i - 1) || bannedB.has(j - 1)) continue;
        // A pair below MATCH_FLOOR is not a legal rhyme step -- it can only
        // be skipped over (gap), never used as connective tissue between
        // two real matches just because the sum still comes out ahead.
        const step = matchScore(a[i - 1].syllable, b[j - 1].syllable);
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

    if (best.score < minScore) break;

    const pairs: AlignedPair[] = [];
    let { i, j } = best;
    while (i > 0 && j > 0 && trace[i][j] !== 0) {
      if (trace[i][j] === 1) {
        const step = matchScore(a[i - 1].syllable, b[j - 1].syllable)!;
        pairs.unshift({ i: i - 1, j: j - 1, score: step });
        i -= 1; j -= 1;
      } else if (trace[i][j] === 2) {
        i -= 1;
      } else {
        j -= 1;
      }
    }
    if (pairs.length === 0) break;
    pairs.forEach((p) => { bannedA.add(p.i); bannedB.add(p.j); });
    results.push({ pairs, totalScore: best.score });
  }
  return results;
}

function printAlignment(a: LabeledSyllable[], b: LabeledSyllable[], result: AlignmentResult, label: string) {
  console.log(`\n${label} (total score ${result.totalScore.toFixed(2)})`);
  for (const pair of result.pairs) {
    const sa = a[pair.i];
    const sb = b[pair.j];
    console.log(
      `  ${tierOf(pair.score)} ${pair.score.toFixed(2)}   ` +
      `${syllableLabel(sa).padEnd(14)} /${sa.syllable.nucleus}${sa.syllable.stressed ? '1' : '0'}/  <->  ` +
      `${syllableLabel(sb).padEnd(14)} /${sb.syllable.nucleus}${sb.syllable.stressed ? '1' : '0'}/`,
    );
  }
}

// ===========================================================================
// Test 1: self-alignment within one line -- the phrase-multi case
// ===========================================================================
{
  const line = 'Tragic wagon rolling through the magic dragon fog';
  const seq = labelLine(line);
  console.log('='.repeat(70));
  console.log('TEST 1 (self-alignment): ' + line);
  const alignments = findAlignments(seq, seq, { count: 3, selfExcludeRadius: 1, minScore: 0.4 });
  if (alignments.length === 0) console.log('  (no alignment found)');
  alignments.forEach((r, idx) => printAlignment(seq, seq, r, `Alignment ${idx + 1}`));
}

// ===========================================================================
// Test 2: cross-line end rhyme
// ===========================================================================
{
  const lineA = 'Tragic wagon rolling through the magic dragon fog';
  const lineB = 'Money over heavy nights I never lost my log';
  const seqA = labelLine(lineA);
  const seqB = labelLine(lineB);
  console.log('\n' + '='.repeat(70));
  console.log('TEST 2 (cross-line):\n  A: ' + lineA + '\n  B: ' + lineB);
  const alignments = findAlignments(seqA, seqB, { count: 3, minScore: 0.4 });
  if (alignments.length === 0) console.log('  (no alignment found)');
  alignments.forEach((r, idx) => printAlignment(seqA, seqB, r, `Alignment ${idx + 1}`));
}

// ===========================================================================
// Test 3: stress mismatch should demote, not zero out
// ===========================================================================
{
  console.log('\n' + '='.repeat(70));
  console.log('TEST 3 (stress mismatch, same vowel): money vs degree');
  const seqA = labelLine('money');
  const seqB = labelLine('degree');
  const alignments = findAlignments(seqA, seqB, { count: 1, minScore: 0 });
  if (alignments.length === 0) console.log('  (no alignment found -- score fell below 0, i.e. treated as unrelated)');
  alignments.forEach((r, idx) => printAlignment(seqA, seqB, r, `Alignment ${idx + 1}`));
}

// ===========================================================================
// Test 4: buried internal rhyme, not at line-end
// ===========================================================================
{
  const line = 'I light a candle in the night for a delight';
  const seq = labelLine(line);
  console.log('\n' + '='.repeat(70));
  console.log('TEST 4 (self-alignment, buried internal rhyme): ' + line);
  const alignments = findAlignments(seq, seq, { count: 3, selfExcludeRadius: 1, minScore: 0.4 });
  if (alignments.length === 0) console.log('  (no alignment found)');
  alignments.forEach((r, idx) => printAlignment(seq, seq, r, `Alignment ${idx + 1}`));
}

console.log('\n' + '='.repeat(70));
console.log('STRESS CHECK on function words vs content words:');
for (const w of ['a', 'the', 'I', 'my', 'in', 'money', 'wagon']) {
  const { syllables } = analyzeWord(w);
  console.log(' ', w.padEnd(8), syllables.map((s) => `${s.nucleus}${s.stressed ? '(stressed)' : '(unstressed)'}`).join(' '));
}
