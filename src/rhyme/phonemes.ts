/**
 * A compact ARPAbet-style phoneme inventory plus the articulatory features the
 * rhyme scorer needs. Vowels are described by height/backness/roundness/tenseness
 * so that "slant" rhymes (cat/cut) can be scored on how far apart the nuclei are
 * rather than as a flat miss. Consonants get manner/place/voicing for the same
 * reason (bad/bat is closer than bad/ball).
 */

export type Vowel =
  | 'AA' | 'AE' | 'AH' | 'AO' | 'AW' | 'AY' | 'EH' | 'ER'
  | 'EY' | 'IH' | 'IY' | 'OW' | 'OY' | 'UH' | 'UW';

export type Consonant =
  | 'B' | 'CH' | 'D' | 'DH' | 'F' | 'G' | 'HH' | 'JH' | 'K' | 'L' | 'M'
  | 'N' | 'NG' | 'P' | 'R' | 'S' | 'SH' | 'T' | 'TH' | 'V' | 'W' | 'Y'
  | 'Z' | 'ZH';

export type Phoneme = Vowel | Consonant;

const VOWEL_SET = new Set<string>([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER',
  'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
]);

export function isVowel(p: string): p is Vowel {
  return VOWEL_SET.has(p);
}

export interface VowelFeatures {
  /** 0 = low, 1 = mid, 2 = high. Diphthongs use their starting position. */
  height: number;
  /** 0 = front, 1 = central, 2 = back. */
  backness: number;
  rounded: boolean;
  tense: boolean;
  /** Where a diphthong glides to, if anywhere. */
  offGlide?: 'front' | 'back';
  rhotic?: boolean;
}

export const VOWEL_FEATURES: Record<Vowel, VowelFeatures> = {
  AA: { height: 0, backness: 2, rounded: false, tense: true },
  AE: { height: 0, backness: 0, rounded: false, tense: false },
  AH: { height: 1, backness: 1, rounded: false, tense: false },
  AO: { height: 1, backness: 2, rounded: true, tense: true },
  AW: { height: 0, backness: 1, rounded: false, tense: true, offGlide: 'back' },
  AY: { height: 0, backness: 1, rounded: false, tense: true, offGlide: 'front' },
  EH: { height: 1, backness: 0, rounded: false, tense: false },
  ER: { height: 1, backness: 1, rounded: false, tense: true, rhotic: true },
  EY: { height: 1, backness: 0, rounded: false, tense: true, offGlide: 'front' },
  IH: { height: 2, backness: 0, rounded: false, tense: false },
  IY: { height: 2, backness: 0, rounded: false, tense: true },
  OW: { height: 1, backness: 2, rounded: true, tense: true, offGlide: 'back' },
  OY: { height: 1, backness: 2, rounded: true, tense: true, offGlide: 'front' },
  UH: { height: 2, backness: 2, rounded: true, tense: false },
  UW: { height: 2, backness: 2, rounded: true, tense: true },
};

export type Manner = 'stop' | 'fricative' | 'affricate' | 'nasal' | 'liquid' | 'glide';
export type Place = 'labial' | 'labiodental' | 'dental' | 'alveolar' | 'postalveolar' | 'velar' | 'glottal';

export interface ConsonantFeatures {
  manner: Manner;
  place: Place;
  voiced: boolean;
}

export const CONSONANT_FEATURES: Record<Consonant, ConsonantFeatures> = {
  B:  { manner: 'stop',      place: 'labial',       voiced: true },
  CH: { manner: 'affricate', place: 'postalveolar', voiced: false },
  D:  { manner: 'stop',      place: 'alveolar',     voiced: true },
  DH: { manner: 'fricative', place: 'dental',       voiced: true },
  F:  { manner: 'fricative', place: 'labiodental',  voiced: false },
  G:  { manner: 'stop',      place: 'velar',        voiced: true },
  HH: { manner: 'fricative', place: 'glottal',      voiced: false },
  JH: { manner: 'affricate', place: 'postalveolar', voiced: true },
  K:  { manner: 'stop',      place: 'velar',        voiced: false },
  L:  { manner: 'liquid',    place: 'alveolar',     voiced: true },
  M:  { manner: 'nasal',     place: 'labial',       voiced: true },
  N:  { manner: 'nasal',     place: 'alveolar',     voiced: true },
  NG: { manner: 'nasal',     place: 'velar',        voiced: true },
  P:  { manner: 'stop',      place: 'labial',       voiced: false },
  R:  { manner: 'liquid',    place: 'alveolar',     voiced: true },
  S:  { manner: 'fricative', place: 'alveolar',     voiced: false },
  SH: { manner: 'fricative', place: 'postalveolar', voiced: false },
  T:  { manner: 'stop',      place: 'alveolar',     voiced: false },
  TH: { manner: 'fricative', place: 'dental',       voiced: false },
  V:  { manner: 'fricative', place: 'labiodental',  voiced: true },
  W:  { manner: 'glide',     place: 'labial',       voiced: true },
  Y:  { manner: 'glide',     place: 'postalveolar', voiced: true },
  Z:  { manner: 'fricative', place: 'alveolar',     voiced: true },
  ZH: { manner: 'fricative', place: 'postalveolar', voiced: true },
};

/** 1 for the same vowel, degrading with articulatory distance. */
export function vowelSimilarity(a: Vowel, b: Vowel): number {
  if (a === b) return 1;
  const fa = VOWEL_FEATURES[a];
  const fb = VOWEL_FEATURES[b];
  let score = 1;
  score -= Math.abs(fa.height - fb.height) * 0.18;
  score -= Math.abs(fa.backness - fb.backness) * 0.18;
  if (fa.rounded !== fb.rounded) score -= 0.1;
  if (fa.tense !== fb.tense) score -= 0.08;
  if (fa.offGlide !== fb.offGlide) score -= 0.14;
  if (fa.rhotic !== fb.rhotic) score -= 0.2;
  // Never let a mismatched vowel read as a perfect nucleus.
  return Math.max(0, Math.min(0.82, score));
}

/** 1 for the same consonant, degrading with articulatory distance. */
export function consonantSimilarity(a: Consonant, b: Consonant): number {
  if (a === b) return 1;
  const fa = CONSONANT_FEATURES[a];
  const fb = CONSONANT_FEATURES[b];
  let score = 0.9;
  if (fa.manner !== fb.manner) score -= 0.32;
  if (fa.place !== fb.place) score -= 0.24;
  if (fa.voiced !== fb.voiced) score -= 0.12;
  return Math.max(0, score);
}
