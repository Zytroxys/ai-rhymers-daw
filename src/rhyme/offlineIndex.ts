import { Consonant, Phoneme, Vowel, consonantSimilarity, isVowel } from './phonemes';
import { analyzeWord, cmuEntry, normalizeWord } from './g2p';
import type { RhymeEntry } from './datamuse';

/**
 * Offline rhyme search. `public/rhyme-index.tsv` (generated from CMUdict by
 * scripts/build_rhyme_index.py) lists every word with its rhyme tail. The file is
 * fetched once, kept in Cache Storage, and read from there on every later visit,
 * so lookups work with no network.
 */

const CACHE_NAME = 'rhyme-index-v1';
const NEAR_LIMIT = 300;
const NEAR_MIN_SIMILARITY = 0.5;

interface IndexedWord {
  word: string;
  tail: Phoneme[];
  syllables: number;
}

export interface OfflineIndex {
  byTail: Map<string, IndexedWord[]>;
  byNucleus: Map<string, IndexedWord[]>;
  size: number;
}

const indexUrl = () => `${import.meta.env.BASE_URL}rhyme-index.tsv`;

/** Cache Storage first, network second (and then store it). Null if neither works. */
async function readIndexText(): Promise<string | null> {
  const url = indexUrl();
  const cache = 'caches' in globalThis ? await caches.open(CACHE_NAME).catch(() => null) : null;
  const hit = cache ? await cache.match(url).catch(() => undefined) : undefined;
  if (hit) return hit.text();
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    await cache?.put(url, response.clone()).catch(() => undefined);
    return await response.text();
  } catch {
    return null;
  }
}

export function parseIndex(text: string): OfflineIndex {
  const byTail = new Map<string, IndexedWord[]>();
  const byNucleus = new Map<string, IndexedWord[]>();
  let size = 0;
  for (const line of text.split('\n')) {
    const [word, tailText, syllables] = line.split('\t');
    if (!word || !tailText) continue;
    const entry: IndexedWord = { word, tail: tailText.split(' ') as Phoneme[], syllables: Number(syllables) || 0 };
    const push = (map: Map<string, IndexedWord[]>, key: string) => {
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    };
    push(byTail, tailText);
    push(byNucleus, entry.tail[0]);
    size += 1;
  }
  return { byTail, byNucleus, size };
}

let loading: Promise<OfflineIndex | null> | undefined;

/** Loads (once) and returns the offline index, or null if it couldn't be read. */
export function loadOfflineIndex(): Promise<OfflineIndex | null> {
  loading ??= readIndexText().then((text) => (text ? parseIndex(text) : null));
  return loading;
}

/** Phonemes from the last stressed vowel on. Mirrors tail_of() in the Python script. */
export function tailOf(word: string): Phoneme[] {
  const raw = cmuEntry(word);
  if (raw) {
    const phones = raw.split(' ');
    let start = -1;
    for (const wanted of ['1', '2']) {
      phones.forEach((p, i) => {
        if (p.endsWith(wanted) && /[AEIOU]/.test(p[0])) start = i;
      });
      if (start >= 0) break;
    }
    if (start < 0) phones.forEach((p, i) => { if (/\d$/.test(p)) start = i; });
    if (start >= 0) return phones.slice(start).map((p) => p.replace(/\d$/, '')) as Phoneme[];
  }
  // Not in CMUdict: use the spelling-rule guess, from its last vowel.
  const guess = analyzeWord(word).phonemes;
  let last = -1;
  guess.forEach((p, i) => { if (isVowel(p)) last = i; });
  return last >= 0 ? guess.slice(last) : [];
}

function nearTail(a: Phoneme[], b: Phoneme[]): boolean {
  if (a.length !== b.length || a[0] !== b[0]) return false;
  for (let i = 1; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    if (isVowel(a[i]) || isVowel(b[i])) return false;
    if (consonantSimilarity(a[i] as Consonant, b[i] as Consonant) < NEAR_MIN_SIMILARITY) return false;
  }
  return true;
}

/** Perfect (identical tail) then near (same vowel, similar consonants) rhymes. */
export function offlineRhymes(index: OfflineIndex, input: string): RhymeEntry[] {
  const word = normalizeWord(input.trim().split(/\s+/).pop() ?? '');
  if (!word) return [];
  const tail = tailOf(word);
  if (tail.length === 0) return [];

  const order = (a: IndexedWord, b: IndexedWord) => a.syllables - b.syllables || a.word.localeCompare(b.word);
  const toEntry = (w: IndexedWord, quality: RhymeEntry['quality']): RhymeEntry => ({
    word: w.word, quality, syllables: w.syllables, score: 0, source: 'offline',
  });

  const key = tail.join(' ');
  const perfect = (index.byTail.get(key) ?? []).filter((w) => w.word !== word).sort(order);
  const near = (index.byNucleus.get(tail[0] as Vowel) ?? [])
    .filter((w) => w.word !== word && w.tail.join(' ') !== key && nearTail(tail, w.tail))
    .sort(order)
    .slice(0, NEAR_LIMIT);

  return [...perfect.map((w) => toEntry(w, 'perfect')), ...near.map((w) => toEntry(w, 'near'))];
}
