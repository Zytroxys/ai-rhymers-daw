import { Consonant, Phoneme, Vowel, isVowel } from './phonemes';

/**
 * Rule-based English grapheme-to-phoneme.
 *
 * There is no pronunciation dictionary bundled here on purpose: shipping CMUdict
 * would add ~3MB to the bundle for a tool that only ever needs the tail of a word.
 * Instead this is longest-match spelling rules plus an exception table for the
 * high-frequency irregulars English is full of. It is approximate by design --
 * `addPronunciations()` lets a caller correct or extend it, and the rhyme scorer
 * degrades gracefully (a slightly wrong nucleus scores as a slant rhyme, not a
 * hard miss).
 */

const CONSONANT_LETTERS = 'bcdfghjklmnpqrstvwxyz';

/** Words the spelling rules get wrong, written as space-separated phonemes. */
const EXCEPTIONS: Record<string, string> = {
  a: 'AH', the: 'DH AH', of: 'AH V', to: 'T UW', and: 'AE N D', is: 'IH Z',
  was: 'W AH Z', are: 'AA R', were: 'W ER', been: 'B IH N', have: 'HH AE V',
  has: 'HH AE Z', had: 'HH AE D', do: 'D UW', does: 'D AH Z', done: 'D AH N',
  said: 'S EH D', says: 'S EH Z', they: 'DH EY', their: 'DH EH R',
  there: 'DH EH R', where: 'W EH R', here: 'HH IH R', these: 'DH IY Z',
  those: 'DH OW Z', this: 'DH IH S', that: 'DH AE T', them: 'DH EH M',
  then: 'DH EH N', than: 'DH AE N', though: 'DH OW', through: 'TH R UW',
  thought: 'TH AO T', tough: 'T AH F', rough: 'R AH F', enough: 'IH N AH F',
  cough: 'K AO F', laugh: 'L AE F', one: 'W AH N', once: 'W AH N S',
  two: 'T UW', who: 'HH UW', whose: 'HH UW Z', what: 'W AH T', want: 'W AA N T',
  water: 'W AO T ER', come: 'K AH M', some: 'S AH M', none: 'N AH N',
  love: 'L AH V', above: 'AH B AH V', glove: 'G L AH V', dove: 'D AH V',
  move: 'M UW V', prove: 'P R UW V', lose: 'L UW Z', whole: 'HH OW L',
  gone: 'G AO N', give: 'G IH V', live: 'L IH V', gives: 'G IH V Z',
  many: 'M EH N IY', any: 'EH N IY', money: 'M AH N IY', friend: 'F R EH N D',
  again: 'AH G EH N', against: 'AH G EH N S T', heart: 'HH AA R T',
  hear: 'HH IH R', heard: 'HH ER D', learn: 'L ER N', earth: 'ER TH',
  early: 'ER L IY', great: 'G R EY T', break: 'B R EY K', steak: 'S T EY K',
  bread: 'B R EH D', head: 'HH EH D', dead: 'D EH D', read: 'R IY D',
  ready: 'R EH D IY', death: 'D EH TH', breath: 'B R EH TH', deaf: 'D EH F',
  sweat: 'S W EH T', threat: 'TH R EH T', wealth: 'W EH L TH',
  weather: 'W EH DH ER', feather: 'F EH DH ER', leather: 'L EH DH ER',
  heaven: 'HH EH V AH N', heavy: 'HH EH V IY', bear: 'B EH R', wear: 'W EH R',
  tear: 'T EH R', pear: 'P EH R', swear: 'S W EH R', beard: 'B IH R D',
  book: 'B UH K', look: 'L UH K', took: 'T UH K', good: 'G UH D',
  hood: 'HH UH D', wood: 'W UH D', foot: 'F UH T', stood: 'S T UH D',
  shook: 'SH UH K', cook: 'K UH K', hook: 'HH UH K', crook: 'K R UH K',
  put: 'P UH T', push: 'P UH SH', pull: 'P UH L', full: 'F UH L',
  bull: 'B UH L', could: 'K UH D', would: 'W UH D', should: 'SH UH D',
  eye: 'AY', eyes: 'AY Z', buy: 'B AY', build: 'B IH L D', built: 'B IH L T',
  busy: 'B IH Z IY', business: 'B IH Z N AH S', women: 'W IH M AH N',
  woman: 'W UH M AH N', people: 'P IY P AH L', because: 'B IH K AH Z',
  bought: 'B AO T', brought: 'B R AO T', caught: 'K AO T', taught: 'T AO T',
  fought: 'F AO T', sought: 'S AO T', daughter: 'D AO T ER',
  hour: 'AW ER', our: 'AW ER', your: 'Y AO R', you: 'Y UW',
  house: 'HH AW S', mouse: 'M AW S', use: 'Y UW Z', used: 'Y UW Z D',
  sure: 'SH UH R', sugar: 'SH UH G ER', island: 'AY L AH N D',
  answer: 'AE N S ER', castle: 'K AE S AH L', listen: 'L IH S AH N',
  often: 'AO F AH N', other: 'AH DH ER', another: 'AH N AH DH ER',
  mother: 'M AH DH ER', brother: 'B R AH DH ER', father: 'F AA DH ER',
  over: 'OW V ER', ever: 'EH V ER', never: 'N EH V ER', every: 'EH V R IY',
  clever: 'K L EH V ER', level: 'L EH V AH L', seven: 'S EH V AH N',
  eleven: 'IH L EH V AH N', devil: 'D EH V AH L', river: 'R IH V ER',
  liver: 'L IH V ER', shiver: 'SH IH V ER', deliver: 'D IH L IH V ER',
  city: 'S IH T IY', pretty: 'P R IH T IY', truth: 'T R UW TH',
  truly: 'T R UW L IY', crew: 'K R UW', chew: 'CH UW', view: 'V Y UW',
  new: 'N UW', knew: 'N UW', know: 'N OW', known: 'N OW N',
  gold: 'G OW L D', cold: 'K OW L D', told: 'T OW L D', hold: 'HH OW L D',
  soul: 'S OW L', both: 'B OW TH', most: 'M OW S T', ghost: 'G OW S T',
  post: 'P OW S T', host: 'HH OW S T', lost: 'L AO S T', cost: 'K AO S T',
  wind: 'W IH N D', mind: 'M AY N D', find: 'F AY N D', kind: 'K AY N D',
  child: 'CH AY L D', wild: 'W AY L D', mild: 'M AY L D',
  high: 'HH AY', sign: 'S AY N', design: 'D IH Z AY N', line: 'L AY N',
  machine: 'M AH SH IY N', police: 'P AH L IY S', piece: 'P IY S',
  son: 'S AH N', ton: 'T AH N',
  won: 'W AH N', month: 'M AH N TH', front: 'F R AH N T', touch: 'T AH CH',
  young: 'Y AH NG', country: 'K AH N T R IY', couple: 'K AH P AH L',
  double: 'D AH B AH L', trouble: 'T R AH B AH L', blood: 'B L AH D',
  flood: 'F L AH D', flow: 'F L OW', grow: 'G R OW', show: 'SH OW',
  slow: 'S L OW', snow: 'S N OW', throw: 'TH R OW', below: 'B IH L OW',
  bow: 'B OW', row: 'R OW', low: 'L OW', own: 'OW N', shown: 'SH OW N',
  war: 'W AO R', warm: 'W AO R M', word: 'W ER D', work: 'W ER K',
  world: 'W ER L D', worth: 'W ER TH', worse: 'W ER S', worst: 'W ER S T',
  door: 'D AO R', floor: 'F L AO R', poor: 'P UH R', four: 'F AO R',
  aisle: 'AY L', style: 'S T AY L', fire: 'F AY ER', hire: 'HH AY ER',
  tired: 'T AY ER D', quiet: 'K W AY AH T', science: 'S AY AH N S',
  idea: 'AY D IY AH', area: 'EH R IY AH', real: 'R IY L', really: 'R IY L IY',
  create: 'K R IY EY T', beautiful: 'B Y UW T AH F AH L',
  beauty: 'B Y UW T IY', ocean: 'OW SH AH N', special: 'S P EH SH AH L',
  ancient: 'EY N SH AH N T', patient: 'P EY SH AH N T',
  how: 'HH AW', now: 'N AW', cow: 'K AW', vow: 'V AW', plow: 'P L AW',
  allow: 'AH L AW', somehow: 'S AH M HH AW', brow: 'B R AW',
  into: 'IH N T UW', onto: 'AA N T UW', deny: 'D IH N AY', rely: 'R IH L AY',
  reply: 'R IH P L AY', apply: 'AH P L AY', supply: 'S AH P L AY',
  imply: 'IH M P L AY', defy: 'D IH F AY', july: 'JH UH L AY',
  shoe: 'SH UW', shoes: 'SH UW Z', duty: 'D UW T IY', lady: 'L EY D IY', baby: 'B EY B IY',
  crazy: 'K R EY Z IY', lazy: 'L EY Z IY', tidy: 'T AY D IY',
  holy: 'HH OW L IY', tiny: 'T AY N IY', navy: 'N EY V IY',
  gravy: 'G R EY V IY', ivy: 'AY V IY', cozy: 'K OW Z IY',
  music: 'M Y UW Z IH K', final: 'F AY N AH L', total: 'T OW T AH L',
  local: 'L OW K AH L', legal: 'L IY G AH L', vital: 'V AY T AH L',
  human: 'HH Y UW M AH N', moment: 'M OW M AH N T', open: 'OW P AH N',
  only: 'OW N L IY', basic: 'B EY S IH K', major: 'M EY JH ER',
  minor: 'M AY N ER', model: 'M AA D AH L', cabin: 'K AE B IH N',
  planet: 'P L AE N AH T', promise: 'P R AA M AH S', honest: 'AA N AH S T',
  gym: 'JH IH M', get: 'G EH T', got: 'G AA T', gift: 'G IH F T',
  girl: 'G ER L', begin: 'B IH G IH N', gear: 'G IH R', giggle: 'G IH G AH L',
  finger: 'F IH NG G ER', longer: 'L AO NG G ER', stronger: 'S T R AO NG G ER',
  anger: 'AE NG G ER', hunger: 'HH AH NG G ER', single: 'S IH NG G AH L',
  angle: 'AE NG G AH L', jungle: 'JH AH NG G AH L', england: 'IH NG G L AH N D',
};

const USER_OVERRIDES = new Map<string, Phoneme[]>();

/** Teach the engine a pronunciation, e.g. addPronunciations({ vibe: 'V AY B' }). */
export function addPronunciations(entries: Record<string, string>): void {
  for (const [word, phones] of Object.entries(entries)) {
    USER_OVERRIDES.set(normalizeWord(word), parsePhonemes(phones));
  }
}

export function parsePhonemes(spec: string): Phoneme[] {
  return spec.trim().split(/\s+/).filter(Boolean) as Phoneme[];
}

/** Lowercase, drop apostrophes ("flowin'" -> "flowin") and any other punctuation. */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z]/g, '');
}

interface Ctx {
  word: string;
  /** Index the match starts at. */
  i: number;
  /** Index just past the match. */
  end: number;
}

interface Rule {
  g: string;
  p: Phoneme[];
  when?: (c: Ctx) => boolean;
}

const isConsonantLetter = (ch: string) => CONSONANT_LETTERS.includes(ch);
const atStart = (c: Ctx) => c.i === 0;
const atEnd = (c: Ctx) => c.end === c.word.length;
const nextLetter = (c: Ctx) => c.word[c.end] ?? '';
const prevLetter = (c: Ctx) => c.word[c.i - 1] ?? '';
const beforeFrontVowel = (c: Ctx) => 'eiy'.includes(nextLetter(c));

/**
 * True when a single vowel letter should take its "long" value: an open final
 * syllable (go, hi) or the magic-e family (made, hoping, tables). A doubled
 * consonant blocks it, which is exactly what keeps `running` short and
 * `hoping` long.
 */
function isOpenSyllable(c: Ctx): boolean {
  const rest = c.word.slice(c.end);
  if (rest === '') return c.word.length > 1;
  const single = `[${CONSONANT_LETTERS}]`;
  // A single consonant plus a silent-e/inflection/vowel-initial suffix: made,
  // hoping, later, nation. Two consonants (hopping, action) block it.
  return new RegExp(`^${single}(e|ed|ing|er|le|i(on|ous|al|ent|ence|um))s?$`).test(rest);
}

/** A final `e` that is there to lengthen the vowel, not to be spoken. */
function isSilentFinalE(c: Ctx): boolean {
  if (!atEnd(c)) return false;
  if (c.word.length < 3) return false;
  if (!isConsonantLetter(prevLetter(c))) return false;
  // Needs another vowel earlier in the word, or there'd be nothing to say.
  return /[aeiouy]/.test(c.word.slice(0, c.i - 1));
}

/**
 * Ordered longest-match first. Within the same length, earlier rules win, so
 * context-restricted rules are listed above their unrestricted fallbacks.
 */
const RULES: Rule[] = [
  // --- multi-letter vowel + suffix chunks -------------------------------
  { g: 'ought', p: ['AO', 'T'] },
  { g: 'aught', p: ['AO', 'T'] },
  { g: 'eigh', p: ['EY'] },
  { g: 'ough', p: ['AO'] },
  { g: 'augh', p: ['AO'] },
  { g: 'tion', p: ['SH', 'AH', 'N'] },
  { g: 'sion', p: ['ZH', 'AH', 'N'] },
  { g: 'cian', p: ['SH', 'AH', 'N'] },
  { g: 'cious', p: ['SH', 'AH', 'S'] },
  { g: 'tious', p: ['SH', 'AH', 'S'] },
  { g: 'ious', p: ['IY', 'AH', 'S'] },
  { g: 'eous', p: ['IY', 'AH', 'S'] },
  { g: 'ssure', p: ['SH', 'ER'], when: atEnd },
  { g: 'ture', p: ['CH', 'ER'], when: atEnd },
  { g: 'sure', p: ['ZH', 'ER'], when: atEnd },
  { g: 'ight', p: ['AY', 'T'] },
  { g: 'igh', p: ['AY'] },
  { g: 'dge', p: ['JH'] },
  { g: 'tch', p: ['CH'] },
  { g: 'air', p: ['EH', 'R'] },
  { g: 'are', p: ['EH', 'R'], when: atEnd },
  { g: 'ere', p: ['IH', 'R'], when: atEnd },
  { g: 'ear', p: ['IH', 'R'] },
  { g: 'eer', p: ['IH', 'R'] },
  { g: 'ire', p: ['AY', 'ER'], when: atEnd },
  { g: 'ure', p: ['Y', 'UH', 'R'], when: atEnd },
  { g: 'oor', p: ['AO', 'R'] },
  { g: 'our', p: ['AW', 'ER'] },
  { g: 'ar', p: ['AA', 'R'] },
  { g: 'er', p: ['ER'] },
  { g: 'ir', p: ['ER'] },
  { g: 'ur', p: ['ER'] },
  { g: 'yr', p: ['ER'] },
  { g: 'or', p: ['AO', 'R'] },
  { g: 'ai', p: ['EY'] },
  { g: 'ay', p: ['EY'] },
  { g: 'ea', p: ['IY'] },
  { g: 'ee', p: ['IY'] },
  { g: 'ei', p: ['IY'] },
  // die/lie/tie end in AY; movie/cookie end in IY. Length is the cheap tell.
  { g: 'ie', p: ['AY'], when: (c) => atEnd(c) && c.i <= 1 },
  { g: 'ie', p: ['IY'] },
  { g: 'ey', p: ['IY'] },
  { g: 'oa', p: ['OW'] },
  { g: 'oe', p: ['OW'] },
  { g: 'oo', p: ['UW'] },
  { g: 'oi', p: ['OY'] },
  { g: 'oy', p: ['OY'] },
  // `ow` closes a word as a long o (know, below) but sits inside one as a
  // diphthong (down, crown) -- the split that keeps show/now apart.
  { g: 'ow', p: ['OW'], when: atEnd },
  { g: 'ow', p: ['AW'] },
  { g: 'ou', p: ['AW'] },
  { g: 'au', p: ['AO'] },
  { g: 'aw', p: ['AO'] },
  { g: 'ew', p: ['UW'] },
  { g: 'ue', p: ['UW'] },
  { g: 'ui', p: ['UW'] },
  { g: 'uy', p: ['AY'] },
  { g: 'fy', p: ['F', 'AY'], when: atEnd },

  // --- consonant digraphs and clusters ----------------------------------
  { g: 'kn', p: ['N'], when: atStart },
  { g: 'gn', p: ['N'], when: atStart },
  { g: 'wr', p: ['R'], when: atStart },
  { g: 'ps', p: ['S'], when: atStart },
  { g: 'mb', p: ['M'], when: atEnd },
  { g: 'mn', p: ['M'], when: atEnd },
  { g: 'gh', p: [], when: (c) => !atStart(c) },
  { g: 'gh', p: ['G'] },
  { g: 'ph', p: ['F'] },
  { g: 'ch', p: ['CH'] },
  { g: 'sh', p: ['SH'] },
  { g: 'th', p: ['TH'] },
  { g: 'wh', p: ['W'] },
  { g: 'ck', p: ['K'] },
  { g: 'qu', p: ['K', 'W'] },
  { g: 'ng', p: ['NG'] },
  { g: 'le', p: ['AH', 'L'], when: (c) => atEnd(c) && isConsonantLetter(prevLetter(c)) },
  // doubled consonants collapse
  { g: 'bb', p: ['B'] }, { g: 'cc', p: ['K'] }, { g: 'dd', p: ['D'] },
  { g: 'ff', p: ['F'] }, { g: 'gg', p: ['G'] }, { g: 'll', p: ['L'] },
  { g: 'mm', p: ['M'] }, { g: 'nn', p: ['N'] }, { g: 'pp', p: ['P'] },
  { g: 'rr', p: ['R'] }, { g: 'ss', p: ['S'] }, { g: 'tt', p: ['T'] },
  { g: 'zz', p: ['Z'] },

  // --- single letters ---------------------------------------------------
  { g: 'a', p: ['EY'], when: isOpenSyllable },
  { g: 'a', p: ['AH'], when: (c) => atEnd(c) && c.word.length > 2 },
  { g: 'a', p: ['AE'] },
  { g: 'e', p: [], when: isSilentFinalE },
  { g: 'e', p: ['IY'], when: isOpenSyllable },
  { g: 'e', p: ['EH'] },
  { g: 'i', p: ['AY'], when: isOpenSyllable },
  { g: 'i', p: ['IH'] },
  { g: 'o', p: ['OW'], when: isOpenSyllable },
  { g: 'o', p: ['AA'] },
  { g: 'u', p: ['UW'], when: isOpenSyllable },
  { g: 'u', p: ['AH'] },
  { g: 'y', p: ['Y'], when: (c) => atStart(c) && 'aeiou'.includes(nextLetter(c)) },
  { g: 'y', p: ['AY'], when: (c) => atEnd(c) && !/[aeiou]/.test(c.word.slice(0, c.i)) },
  { g: 'y', p: ['IY'], when: atEnd },
  { g: 'y', p: ['AY'], when: isOpenSyllable },
  { g: 'y', p: ['IH'] },
  { g: 'c', p: ['S'], when: beforeFrontVowel },
  { g: 'c', p: ['K'] },
  { g: 'g', p: ['JH'], when: beforeFrontVowel },
  { g: 'g', p: ['G'] },
  { g: 'x', p: ['K', 'S'] },
  { g: 's', p: ['Z'], when: (c) => atEnd(c) && 'aeioubdglmnrvwyz'.includes(prevLetter(c)) },
  { g: 's', p: ['S'] },
  { g: 'j', p: ['JH'] },
  { g: 'b', p: ['B'] }, { g: 'd', p: ['D'] }, { g: 'f', p: ['F'] },
  { g: 'h', p: ['HH'] }, { g: 'k', p: ['K'] }, { g: 'l', p: ['L'] },
  { g: 'm', p: ['M'] }, { g: 'n', p: ['N'] }, { g: 'p', p: ['P'] },
  { g: 'r', p: ['R'] }, { g: 't', p: ['T'] }, { g: 'v', p: ['V'] },
  { g: 'w', p: ['W'] }, { g: 'z', p: ['Z'] },
];

const RULES_BY_LETTER = new Map<string, Rule[]>();
for (const rule of RULES) {
  const key = rule.g[0];
  const bucket = RULES_BY_LETTER.get(key);
  if (bucket) bucket.push(rule);
  else RULES_BY_LETTER.set(key, [rule]);
}
// Longest grapheme first; ties keep declaration order (stable sort).
for (const bucket of RULES_BY_LETTER.values()) {
  bucket.sort((a, b) => b.g.length - a.g.length);
}

/** Regular inflections we can peel off before consulting the exception table. */
const SUFFIXES: Array<{ ending: string; phones: Phoneme[] }> = [
  { ending: 'ing', phones: ['IH', 'NG'] },
  { ending: 'ed', phones: ['D'] },
  { ending: 's', phones: ['Z'] },
];

const cache = new Map<string, Phoneme[]>();

/** Phonemes for a single word. Unknown/empty input yields an empty array. */
export function pronounce(word: string): Phoneme[] {
  const clean = normalizeWord(word);
  if (!clean) return [];
  const cached = cache.get(clean);
  if (cached) return cached;
  const result = computePronunciation(clean);
  cache.set(clean, result);
  return result;
}

function lookupKnown(clean: string): Phoneme[] | undefined {
  const user = USER_OVERRIDES.get(clean);
  if (user) return user;
  const builtin = EXCEPTIONS[clean];
  if (builtin) return parsePhonemes(builtin);
  return undefined;
}

function computePronunciation(clean: string): Phoneme[] {
  const known = lookupKnown(clean);
  if (known) return known;

  // "thoughts" should inherit "thought", not re-derive it.
  for (const { ending, phones } of SUFFIXES) {
    if (!clean.endsWith(ending) || clean.length <= ending.length + 1) continue;
    const stem = clean.slice(0, -ending.length);
    const stemPhones = lookupKnown(stem);
    if (stemPhones) return [...stemPhones, ...inflect(stemPhones, ending, phones)];
  }

  return applyRules(clean);
}

/** Voicing assimilation for the -s and -ed endings. */
function inflect(stem: Phoneme[], ending: string, phones: Phoneme[]): Phoneme[] {
  const last = stem[stem.length - 1];
  if (ending === 's') {
    if (last && ['S', 'Z', 'SH', 'ZH', 'CH', 'JH'].includes(last)) return ['IH', 'Z'];
    if (last && ['P', 'T', 'K', 'F', 'TH'].includes(last)) return ['S'];
    return ['Z'];
  }
  if (ending === 'ed') {
    if (last === 'T' || last === 'D') return ['IH', 'D'];
    if (last && ['P', 'K', 'F', 'S', 'SH', 'CH', 'TH'].includes(last)) return ['T'];
    return ['D'];
  }
  return phones;
}

function applyRules(word: string): Phoneme[] {
  const out: Phoneme[] = [];
  let i = 0;
  while (i < word.length) {
    const bucket = RULES_BY_LETTER.get(word[i]);
    let matched = false;
    if (bucket) {
      for (const rule of bucket) {
        const end = i + rule.g.length;
        if (end > word.length) continue;
        if (word.slice(i, end) !== rule.g) continue;
        const ctx: Ctx = { word, i, end };
        if (rule.when && !rule.when(ctx)) continue;
        out.push(...rule.p);
        i = end;
        matched = true;
        break;
      }
    }
    if (!matched) i += 1; // unknown letter: skip it rather than emit noise
  }
  return out;
}

export interface Syllable {
  onset: Consonant[];
  nucleus: Vowel;
  coda: Consonant[];
  stressed: boolean;
}

const LEGAL_ONSET_CLUSTERS = new Set([
  'B R', 'B L', 'D R', 'F L', 'F R', 'G L', 'G R', 'K L', 'K R', 'K W',
  'P L', 'P R', 'S K', 'S L', 'S M', 'S N', 'S P', 'S T', 'S W', 'T R',
  'TH R', 'SH R', 'HH Y', 'B Y', 'F Y', 'K Y', 'M Y', 'P Y', 'V Y',
  'S K R', 'S P R', 'S T R', 'S K W', 'S P L',
]);

function legalOnset(cluster: Consonant[]): boolean {
  if (cluster.length <= 1) return true;
  if (cluster.length > 3) return false;
  return LEGAL_ONSET_CLUSTERS.has(cluster.join(' '));
}

/**
 * Split phonemes into syllables by the maximal onset principle: give the
 * following syllable as many of the intervening consonants as English lets it
 * start with, and leave the rest as the previous coda.
 */
export function syllabify(phonemes: Phoneme[], spelling?: string): Syllable[] {
  const nuclei: number[] = [];
  phonemes.forEach((p, idx) => {
    if (isVowel(p)) nuclei.push(idx);
  });
  if (nuclei.length === 0) return [];

  const syllables: Syllable[] = [];
  for (let n = 0; n < nuclei.length; n += 1) {
    const nucleusIdx = nuclei[n];
    const prevNucleus = n === 0 ? -1 : nuclei[n - 1];

    // Consonants between the previous nucleus and this one.
    const between = phonemes.slice(prevNucleus + 1, nucleusIdx) as Consonant[];
    let onset: Consonant[] = between;
    if (n > 0) {
      onset = [];
      for (let take = Math.min(between.length, 3); take >= 0; take -= 1) {
        const candidate = between.slice(between.length - take) as Consonant[];
        if (legalOnset(candidate)) {
          onset = candidate;
          break;
        }
      }
      const carried = between.slice(0, between.length - onset.length) as Consonant[];
      if (carried.length) syllables[syllables.length - 1].coda.push(...carried);
    }

    const coda = n === nuclei.length - 1
      ? (phonemes.slice(nucleusIdx + 1) as Consonant[])
      : [];

    syllables.push({
      onset,
      nucleus: phonemes[nucleusIdx] as Vowel,
      coda,
      stressed: false,
    });
  }

  assignStress(syllables, spelling);
  return syllables;
}

/** Suffixes that pull primary stress to a fixed distance from the end. */
const STRESS_SUFFIXES: Array<{ test: RegExp; fromEnd: number }> = [
  { test: /(tion|sion|cian|cious|tious|ic|ical|ity|ify|ogy|graphy)$/, fromEnd: 2 },
  { test: /(ee|eer|ese|ette|oon)$/, fromEnd: 1 },
];

const UNSTRESSED_PREFIXES = [
  'a', 'be', 'de', 're', 'in', 'im', 'en', 'em', 'con', 'com', 'ob',
  'per', 'pre', 'pro', 'sur', 'to', 'ac', 'ad', 'sub', 'ex', 'dis', 'ap',
];

/**
 * Heuristic primary stress. Real stress needs a dictionary; the rhyme scorer
 * therefore treats this as a hint (a bonus when tails align) rather than the
 * basis for comparison.
 */
function assignStress(syllables: Syllable[], spelling?: string): void {
  if (syllables.length === 0) return;
  let idx = 0;
  if (syllables.length > 1) {
    const word = spelling ?? '';
    const suffix = STRESS_SUFFIXES.find((s) => s.test.test(word));
    if (suffix) {
      idx = Math.max(0, syllables.length - suffix.fromEnd);
    } else if (
      UNSTRESSED_PREFIXES.some((p) => word.startsWith(p)) &&
      // A second syllable on ER is the -er/-or/-ure ending, which never takes
      // the stress -- without this, `pressure` and `proper` look prefixed.
      syllables[1].nucleus !== 'ER'
    ) {
      idx = 1;
    }
  }
  syllables[Math.min(idx, syllables.length - 1)].stressed = true;
}

export interface WordPronunciation {
  word: string;
  normalized: string;
  phonemes: Phoneme[];
  syllables: Syllable[];
  syllableCount: number;
}

const analysisCache = new Map<string, WordPronunciation>();

/** Full phonetic analysis of one word, memoized. */
export function analyzeWord(word: string): WordPronunciation {
  const normalized = normalizeWord(word);
  const cached = analysisCache.get(normalized);
  if (cached) return cached;

  const phonemes = pronounce(normalized);
  const syllables = syllabify(phonemes, normalized);
  const result: WordPronunciation = {
    word,
    normalized,
    phonemes,
    syllables,
    syllableCount: syllables.length,
  };
  analysisCache.set(normalized, result);
  return result;
}

/** Syllables in a word. Falls back to a vowel-group count for unpronounceable input. */
export function countSyllables(word: string): number {
  const analysis = analyzeWord(word);
  if (analysis.syllableCount > 0) return analysis.syllableCount;
  const groups = analysis.normalized.match(/[aeiouy]+/g);
  return groups ? groups.length : 0;
}
