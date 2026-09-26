import { Syllable, SyllableSpan, analyzeWordWithSpans, normalizeWord } from './g2p';
import { scoreSyllablePair } from './rhyme';

/**
 * Clusters individual syllables -- not whole words -- into rhyme families,
 * purely from computed phonetic similarity. There is no fixed list of
 * rhyming pairs or words anywhere in here: membership is entirely a function
 * of `scoreSyllablePair`, the same nucleus/coda scoring `rhyme.ts` uses for
 * whole-word rhymes, just run on one syllable pair at a time instead of a
 * whole word's trailing syllables (see that function for why it's a
 * separate entry point rather than a call into `scoreRhyme` itself).
 *
 * Working at the syllable level rather than the whole-word level is what
 * lets a single-syllable rhyme ("pen"/"then"), a whole multi-syllable word
 * ("looping"/"moving"), and a multi-word polysyllabic phrase ("pencil lead"
 * next to "pen's still dead", where "pen"~"pen's", "cil"~"still" and
 * "lead"~"dead" are each their own match) all fall out of the same
 * mechanism: a "phrase rhyme" is just what it looks like when several
 * consecutive syllables, possibly spanning a word boundary, each happen to
 * land in a family with some syllable elsewhere in the verse.
 *
 * Each family's palette index is a hash of its own sorted membership, not of
 * where it appears or how many other groups exist -- so a group's color
 * stays put as you keep typing elsewhere in the verse, and only moves if
 * that group's own membership changes.
 */

export const RHYME_GROUP_COLORS = 12;
/** Matches the score bar `LineMeter.internalRhymes` already uses for
 * within-line rhyme detection, so a syllable pair counts as "rhyming" by the
 * same standard everywhere in the app. */
const DEFAULT_THRESHOLD = 0.72;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export interface SyllableColor extends SyllableSpan {
  color: number;
  phraseId?: number;
  isPhraseMember?: boolean;
}

/**
 * Maps each normalized word that appears in `words` to the syllables of that
 * word which rhyme with some syllable elsewhere in the set -- as a list of
 * `{ start, end, color }` character ranges into the word's normalized
 * spelling (see `analyzeWordWithSpans`/`normalizedIndexMap` for converting
 * back to a position in the source text). A word with no matching syllable
 * at all is left out of the map entirely; a word with some matching and some
 * non-matching syllables only lists the matching ones.
 */
export function groupRhymingSyllables(
  words: string[],
  threshold = DEFAULT_THRESHOLD,
): Map<string, SyllableColor[]> {
  const uniqueWords = Array.from(new Set(words.map(normalizeWord).filter(Boolean))).sort();

  interface Unit {
    key: string;
    word: string;
    syllable: Syllable;
    span: SyllableSpan;
  }
  const units: Unit[] = [];
  for (const word of uniqueWords) {
    const { syllables, syllableSpans } = analyzeWordWithSpans(word);
    syllables.forEach((syllable, index) => {
      units.push({ key: `${word}#${index}`, word, syllable, span: syllableSpans[index] });
    });
  }

  // Pairwise scores, cross-word only, strong enough to matter.
  const pairScore = (i: number, j: number): number =>
    units[i].word === units[j].word ? -1 : scoreSyllablePair(units[i].syllable, units[j].syllable).score;

  interface Edge { i: number; j: number; score: number }
  const edges: Edge[] = [];
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      const score = pairScore(i, j);
      if (score >= threshold) edges.push({ i, j, score });
    }
  }
  // Highest-confidence pairs seed a family first, and ties break on unit key
  // so seeding order -- and therefore the resulting families -- doesn't
  // depend on array/iteration order.
  edges.sort((a, b) => b.score - a.score
    || units[a.i].key.localeCompare(units[b.i].key)
    || units[a.j].key.localeCompare(units[b.j].key));

  // Complete-linkage clustering: a syllable only joins a family once it
  // clears the threshold against *every* member already in it, not merely
  // one. Plain single-linkage (union-find over any qualifying pair) chains
  // through weak-but-passing links -- e.g. "pen" and "head" can each pass
  // threshold against "dead" without being much alike themselves -- and
  // ends up merging unrelated syllables into one over-broad family. This
  // is the same clustering choice, just applied bottom-up instead of via
  // union-find.
  const assigned = new Array(units.length).fill(false);
  const families: number[][] = [];
  for (const edge of edges) {
    if (assigned[edge.i] || assigned[edge.j]) continue;
    const group = [edge.i, edge.j];
    assigned[edge.i] = true;
    assigned[edge.j] = true;
    let grew = true;
    while (grew) {
      grew = false;
      for (let k = 0; k < units.length; k += 1) {
        if (assigned[k]) continue;
        if (group.every((m) => pairScore(m, k) >= threshold)) {
          group.push(k);
          assigned[k] = true;
          grew = true;
        }
      }
    }
    families.push(group);
  }

  const result = new Map<string, SyllableColor[]>();
  for (const group of families) {
    const members = group.map((idx) => units[idx]);
    const color = hashString(members.map((m) => m.key).sort().join('|')) % RHYME_GROUP_COLORS;
    for (const { word, span } of members) {
      const list = result.get(word);
      const entry = { ...span, color };
      if (list) list.push(entry);
      else result.set(word, [entry]);
    }
  }
  return result;
}
