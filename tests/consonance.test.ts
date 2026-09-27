import { describe, expect, it } from 'vitest';
import { analyzeConsonance, groupConsonance, groupConsonanceForSelection } from '../src/rhyme/consonance';

describe('analyzeConsonance', () => {
  it('classifies onset and trailing consonants independently', () => {
    const profile = analyzeConsonance('blink');
    expect(profile.onsetSignature).toBe('plosive');
    expect(profile.trailingSignature).toBe('plosive');
  });

  it('returns null for a word whose consonants are all excluded (N/R/L)', () => {
    const profile = analyzeConsonance('run');
    expect(profile.onsetSignature).toBeNull();
    expect(profile.trailingSignature).toBeNull();
  });
});

describe('groupConsonance (auto mode)', () => {
  it('matches trailing consonants independently of vowel rhyme (sink/blank)', () => {
    // "sink" and "blank" share no vowel -- rhyme.ts correctly never groups
    // them -- but both trail off on a plosive once the shared, excluded "n"
    // is dropped. This is the headline case: a real consonance match that
    // rhyme-family clustering must never produce.
    const groups = groupConsonance(['sink', 'blank']);
    expect(groups.get('sink')?.some((s) => s.kind === 'trailing')).toBe(true);
    expect(groups.get('blank')?.some((s) => s.kind === 'trailing')).toBe(true);
  });

  it('matches word-initial alliteration', () => {
    const groups = groupConsonance(['blink', 'brink', 'cat']);
    expect(groups.get('blink')?.some((s) => s.kind === 'onset')).toBe(true);
    expect(groups.get('brink')?.some((s) => s.kind === 'onset')).toBe(true);
  });

  it('does not match onsets of a different consonance class', () => {
    // "think" (TH -> sibilant) vs "blink" (BL -> L excluded, B -> plosive).
    const groups = groupConsonance(['think', 'blink']);
    expect(groups.get('think')?.some((s) => s.kind === 'onset')).toBeFalsy();
  });

  it('never matches on N, R, or L alone', () => {
    const groups = groupConsonance(['run', 'ran']);
    expect(groups.size).toBe(0);
  });

  it('only checks the first syllable for onset, not internal syllable onsets', () => {
    // "napkin" (onset N=excluded) vs a word sharing only the internal "k"
    // onset from napkin's second syllable should not create an onset match,
    // since only the word-initial onset is checked.
    const groups = groupConsonance(['napkin', 'cat']);
    expect(groups.get('napkin')?.some((s) => s.kind === 'onset')).toBeFalsy();
  });

  it('anchors trailing consonants at the stressed syllable, not the whole word', () => {
    // "napkin" is stressed on syllable 0 ("nap"), so its trailing region
    // starts at that syllable's own coda ("p", the second letter of "nap")
    // rather than at the word start or at syllable 1 -- confirmed directly
    // against the span, grounded in the same napkin fixture used for the
    // g2p onset/coda-span test ("nap" occupies characters 0-3, so its coda
    // "p" sits at index 2).
    const profile = analyzeConsonance('napkin');
    expect(profile.trailingSpan?.start).toBe(2);
    expect(profile.trailingSpan?.end).toBe(6);
  });

  it('ignores function words', () => {
    const groups = groupConsonance(['the', 'that', 'blink', 'brink']);
    expect(groups.has('the')).toBe(false);
    expect(groups.has('that')).toBe(false);
  });

  it('produces no matches for a word with neither onset nor trailing in common', () => {
    // "sun" has a sibilant onset (vs. blink/brink's plosive) and no trailing
    // signature at all (its only coda consonant, N, is excluded).
    const groups = groupConsonance(['blink', 'brink', 'sun']);
    expect(groups.get('sun')).toBeUndefined();
  });
});

describe('groupConsonanceForSelection (semi-auto mode)', () => {
  const lineWords = [
    ['blink', 'and', 'wink'],
    ['brink'],
  ];

  it('checks a solo selection against the rest of the verse', () => {
    const groups = groupConsonanceForSelection(lineWords, [{ lineIdx: 0, wordIdx: 0 }]);
    expect(groups.get('blink')).toBeDefined();
    // Only the selected word is ever decorated -- brink is not selected.
    expect(groups.has('brink')).toBe(false);
  });

  it('finds nothing for a solo selection with no match anywhere else', () => {
    const trulyIsolated = [['hope']];
    const empty = groupConsonanceForSelection(trulyIsolated, [{ lineIdx: 0, wordIdx: 0 }]);
    expect(empty.size).toBe(0);
  });

  it('treats back-to-back selected words on the same line as a group', () => {
    const twoWordLine = [['blink', 'brink']];
    const groups = groupConsonanceForSelection(twoWordLine, [
      { lineIdx: 0, wordIdx: 0 },
      { lineIdx: 0, wordIdx: 1 },
    ]);
    expect(groups.get('blink')).toBeDefined();
    expect(groups.get('brink')).toBeDefined();
  });

  it('does not group adjacent selected words with mismatched signatures', () => {
    const mismatched = [['blink', 'think']];
    const groups = groupConsonanceForSelection(mismatched, [
      { lineIdx: 0, wordIdx: 0 },
      { lineIdx: 0, wordIdx: 1 },
    ]);
    // Onsets differ (plosive vs sibilant); trailing matches (both plosive) --
    // so only the trailing kind should appear for the group, never onset.
    expect(groups.get('blink')?.some((s) => s.kind === 'onset')).toBeFalsy();
    expect(groups.get('think')?.some((s) => s.kind === 'onset')).toBeFalsy();
    expect(groups.get('blink')?.some((s) => s.kind === 'trailing')).toBe(true);
  });

  it('a line break splits a run even when selection order suggests one group', () => {
    // blink+brink (both plosive onset, plosive trailing) are selected
    // back-to-back on line 0; sun (sibilant onset, no trailing signature at
    // all -- its only coda consonant, N, is excluded) is selected right
    // after them, but on line 1. If the line break were ignored, all three
    // would form one 3-word group, and group semantics require *unanimous*
    // signature agreement across the whole run for a kind to decorate --
    // sun's mismatched onset would poison the group, so NEITHER blink nor
    // brink would get an onset decoration either. Splitting correctly at the
    // line break instead gives two runs: [blink, brink] (a valid 2-word
    // group, decorated) and [sun] alone (a solo with no match anywhere else
    // in the verse, since it's the only sibilant-onset word and has no
    // trailing signature to match on at all).
    const twoLines = [['blink', 'brink'], ['sun']];
    const groups = groupConsonanceForSelection(twoLines, [
      { lineIdx: 0, wordIdx: 0 },
      { lineIdx: 0, wordIdx: 1 },
      { lineIdx: 1, wordIdx: 0 },
    ]);
    expect(groups.get('blink')?.some((s) => s.kind === 'onset')).toBe(true);
    expect(groups.get('brink')?.some((s) => s.kind === 'onset')).toBe(true);
    expect(groups.has('sun')).toBe(false);
  });
});
