import { Consonant, CONSONANT_FEATURES, Manner } from './phonemes';
import { SyllableSpan, analyzeWordWithDetailedSpans, normalizeWord } from './g2p';
import { FUNCTION_WORD_STOPLIST } from './phrases';

/**
 * Detects consonant-cluster echoes -- alliteration at the start of a word,
 * and matching trailing consonants from the stressed syllable on -- that are
 * independent of whether the words involved actually rhyme (e.g. "sink" and
 * "blank" share no vowel, so `rhyme.ts`/`grouping.ts` correctly never group
 * them, but both trail off on a plosive once the shared, low-signal "n" is
 * ignored). This module never reads from or feeds back into rhyme scoring or
 * clustering -- it only reads phoneme data computed by `g2p.ts` and produces
 * its own, entirely separate spans.
 */

export type ConsonanceKind = 'onset' | 'trailing';

export interface ConsonanceSpan extends SyllableSpan {
  kind: ConsonanceKind;
  familyId: number;
}

export interface WordPosition {
  lineIdx: number;
  wordIdx: number;
}

type ConsonanceClass = 'plosive' | 'sibilant' | 'nasal' | 'glide';

/**
 * A coarser, consonance-specific regrouping of `CONSONANT_FEATURES`'
 * manners -- fricatives and affricates are lumped as one "sibilant" class
 * (acoustically adjacent, and keeps this already-coarse system from
 * over-splitting), and liquids (L/R) have no class at all. N is separately
 * excluded below despite sharing 'nasal' manner with M/NG: N, R and L are
 * common enough that matching on them alone is noise, not signal.
 */
const MANNER_TO_CLASS: Partial<Record<Manner, ConsonanceClass>> = {
  stop: 'plosive',
  fricative: 'sibilant',
  affricate: 'sibilant',
  nasal: 'nasal',
  glide: 'glide',
};

const EXCLUDED_CONSONANTS = new Set<Consonant>(['N', 'R', 'L']);

function classify(consonants: Consonant[]): ConsonanceClass[] | null {
  const classes = consonants
    .filter((c) => !EXCLUDED_CONSONANTS.has(c))
    .map((c) => MANNER_TO_CLASS[CONSONANT_FEATURES[c].manner])
    .filter((c): c is ConsonanceClass => c !== undefined);
  return classes.length ? classes : null;
}

function signatureKey(classes: ConsonanceClass[]): string {
  return classes.join('-');
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export interface ConsonanceProfile {
  onsetSignature: string | null;
  onsetSpan: SyllableSpan | null;
  trailingSignature: string | null;
  trailingSpan: SyllableSpan | null;
}

/**
 * Builds a word's consonance profile: its first syllable's onset cluster
 * (alliteration) and the consonants from its stressed syllable's coda
 * through the end of the word (trailing echo) -- each classified and
 * span-located independently. Either half can be `null` (empty onset, or an
 * open-ended stressed syllable with nothing but excluded consonants after
 * it).
 */
export function analyzeConsonance(word: string): ConsonanceProfile {
  const { syllables, syllableSpans, onsetSpans, codaSpans } = analyzeWordWithDetailedSpans(word);
  if (syllables.length === 0) {
    return { onsetSignature: null, onsetSpan: null, trailingSignature: null, trailingSpan: null };
  }

  const onsetClasses = classify(syllables[0].onset);
  const onsetSignature = onsetClasses ? signatureKey(onsetClasses) : null;
  const onsetSpan = onsetSignature ? onsetSpans[0] : null;

  let stressedIdx = syllables.findIndex((s) => s.stressed);
  if (stressedIdx === -1) stressedIdx = 0;

  const tailConsonants: Consonant[] = [];
  let tailStart: number | null = null;
  for (let i = stressedIdx; i < syllables.length; i += 1) {
    if (i === stressedIdx) {
      tailConsonants.push(...syllables[i].coda);
      if (syllables[i].coda.length && tailStart === null) tailStart = codaSpans[i]?.start ?? null;
    } else {
      tailConsonants.push(...syllables[i].onset, ...syllables[i].coda);
      if (tailStart === null) tailStart = onsetSpans[i]?.start ?? codaSpans[i]?.start ?? syllableSpans[i].start;
    }
  }
  const trailingClasses = classify(tailConsonants);
  const trailingSignature = trailingClasses ? signatureKey(trailingClasses) : null;
  const trailingSpan =
    trailingSignature && tailStart !== null
      ? { start: tailStart, end: syllableSpans[syllables.length - 1].end }
      : null;

  return { onsetSignature, onsetSpan, trailingSignature, trailingSpan };
}

function addSpan(
  result: Map<string, ConsonanceSpan[]>,
  word: string,
  span: SyllableSpan,
  kind: ConsonanceKind,
  familyId: number,
): void {
  const entry: ConsonanceSpan = { ...span, kind, familyId };
  const list = result.get(word);
  if (list) list.push(entry);
  else result.set(word, [entry]);
}

/**
 * Auto ("on" mode): every content word in the verse is checked against every
 * other for a shared onset or trailing signature. Mirrors
 * `groupRhymingSyllables`'s `Map<normalizedWord, T[]>` contract so
 * `lyricDecorations.ts` can consume it the same way.
 */
export function groupConsonance(words: string[]): Map<string, ConsonanceSpan[]> {
  const uniqueWords = Array.from(
    new Set(words.map(normalizeWord).filter((w) => w && !FUNCTION_WORD_STOPLIST.has(w))),
  ).sort();

  const profiles = new Map<string, ConsonanceProfile>();
  for (const word of uniqueWords) profiles.set(word, analyzeConsonance(word));

  const result = new Map<string, ConsonanceSpan[]>();
  for (const kind of ['onset', 'trailing'] as const) {
    const buckets = new Map<string, string[]>();
    for (const [word, profile] of profiles) {
      const signature = kind === 'onset' ? profile.onsetSignature : profile.trailingSignature;
      if (!signature) continue;
      const list = buckets.get(signature);
      if (list) list.push(word);
      else buckets.set(signature, [word]);
    }
    for (const [signature, members] of buckets) {
      if (members.length < 2) continue;
      const familyId = hashString(`${kind}:${signature}`);
      for (const word of members) {
        const profile = profiles.get(word)!;
        const span = kind === 'onset' ? profile.onsetSpan : profile.trailingSpan;
        if (span) addSpan(result, word, span, kind, familyId);
      }
    }
  }
  return result;
}

interface PositionedWord extends WordPosition {
  normalized: string;
  profile: ConsonanceProfile;
}

/**
 * Semi-auto mode: only `selected` words are ever decorated. A selected word
 * with no adjacent selected neighbor ("solo") is checked against every other
 * word in the verse, selected or not. Consecutively selected words on the
 * same line ("group") are instead checked for mutual consistency among
 * themselves -- a line break always ends a run, even if both neighboring
 * words are selected, since a run is defined purely by reading-order
 * adjacency (mirrors `phrases.ts`'s `detectPhraseRuns`).
 */
export function groupConsonanceForSelection(
  lineWords: string[][],
  selected: WordPosition[],
): Map<string, ConsonanceSpan[]> {
  const allWords: PositionedWord[] = [];
  for (let lineIdx = 0; lineIdx < lineWords.length; lineIdx += 1) {
    for (let wordIdx = 0; wordIdx < lineWords[lineIdx].length; wordIdx += 1) {
      const normalized = normalizeWord(lineWords[lineIdx][wordIdx]);
      if (!normalized || FUNCTION_WORD_STOPLIST.has(normalized)) continue;
      allWords.push({ lineIdx, wordIdx, normalized, profile: analyzeConsonance(normalized) });
    }
  }

  const selectedSet = new Set(selected.map((p) => `${p.lineIdx}:${p.wordIdx}`));
  const selectedWords = allWords
    .filter((w) => selectedSet.has(`${w.lineIdx}:${w.wordIdx}`))
    .sort((a, b) => a.lineIdx - b.lineIdx || a.wordIdx - b.wordIdx);

  const runs: PositionedWord[][] = [];
  let current: PositionedWord[] = [];
  for (const w of selectedWords) {
    const prev = current[current.length - 1];
    const isConsecutive = !!prev && prev.lineIdx === w.lineIdx && w.wordIdx === prev.wordIdx + 1;
    if (!isConsecutive && current.length) {
      runs.push(current);
      current = [];
    }
    current.push(w);
  }
  if (current.length) runs.push(current);

  const result = new Map<string, ConsonanceSpan[]>();
  const signatureOf = (profile: ConsonanceProfile, kind: ConsonanceKind) =>
    kind === 'onset' ? profile.onsetSignature : profile.trailingSignature;
  const spanOf = (profile: ConsonanceProfile, kind: ConsonanceKind) =>
    kind === 'onset' ? profile.onsetSpan : profile.trailingSpan;

  for (const run of runs) {
    if (run.length === 1) {
      const [w] = run;
      for (const kind of ['onset', 'trailing'] as const) {
        const signature = signatureOf(w.profile, kind);
        if (!signature) continue;
        const matchesElsewhere = allWords.some(
          (other) => other.normalized !== w.normalized && signatureOf(other.profile, kind) === signature,
        );
        if (!matchesElsewhere) continue;
        const span = spanOf(w.profile, kind);
        if (span) addSpan(result, w.normalized, span, kind, hashString(`${kind}:${signature}`));
      }
    } else {
      for (const kind of ['onset', 'trailing'] as const) {
        const first = signatureOf(run[0].profile, kind);
        if (!first || !run.every((w) => signatureOf(w.profile, kind) === first)) continue;
        const familyId = hashString(`${kind}:${first}`);
        for (const w of run) {
          const span = spanOf(w.profile, kind);
          if (span) addSpan(result, w.normalized, span, kind, familyId);
        }
      }
    }
  }

  return result;
}
