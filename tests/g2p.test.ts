import { describe, expect, it } from 'vitest';
import {
  addPronunciations,
  analyzeWord,
  analyzeWordWithDetailedSpans,
  countSyllables,
  pronounce,
  syllabify,
} from '../src/rhyme/g2p';

describe('pronounce', () => {
  it('handles common one-syllable spellings', () => {
    expect(pronounce('cat')).toEqual(['K', 'AE', 'T']);
    expect(pronounce('light')).toEqual(['L', 'AY', 'T']);
    expect(pronounce('flow')).toEqual(['F', 'L', 'OW']);
    expect(pronounce('down')).toEqual(['D', 'AW', 'N']);
  });

  it('applies the magic-e rule and its blockers', () => {
    expect(pronounce('made')).toEqual(['M', 'EY', 'D']);
    expect(pronounce('hope')).toEqual(['HH', 'OW', 'P']);
    // A doubled consonant blocks lengthening: hoping vs hopping.
    expect(pronounce('hoping')).toEqual(['HH', 'OW', 'P', 'IH', 'NG']);
    expect(pronounce('hopping')).toEqual(['HH', 'AA', 'P', 'IH', 'NG']);
  });

  it('keeps final -ow long but medial -ow a diphthong', () => {
    expect(pronounce('know')).toEqual(['N', 'OW']);
    expect(pronounce('crown')).toEqual(['K', 'R', 'AW', 'N']);
  });

  it('reads -tion as one SH AH N chunk', () => {
    expect(pronounce('nation')).toEqual(['N', 'EY', 'SH', 'AH', 'N']);
    expect(pronounce('station')).toEqual(['S', 'T', 'EY', 'SH', 'AH', 'N']);
  });

  it('falls back to the exception table for irregulars', () => {
    expect(pronounce('through')).toEqual(['TH', 'R', 'UW']);
    expect(pronounce('bought')).toEqual(['B', 'AO', 'T']);
    expect(pronounce('women')).toEqual(['W', 'IH', 'M', 'AH', 'N']);
  });

  it('inherits irregular stems through regular inflections', () => {
    expect(pronounce('thoughts')).toEqual(['TH', 'AO', 'T', 'S']);
    expect(pronounce('looking')).toEqual(['L', 'UH', 'K', 'IH', 'NG']);
  });

  it('ignores apostrophes so slang spellings still resolve', () => {
    expect(pronounce("flowin'")).toEqual(pronounce('flowin'));
  });

  it('lets callers correct it', () => {
    addPronunciations({ zzyzx: 'Z AY Z IH K S' });
    expect(pronounce('zzyzx')).toEqual(['Z', 'AY', 'Z', 'IH', 'K', 'S']);
  });
});

describe('syllabify', () => {
  it('counts syllables from the phonemes, not the spelling', () => {
    expect(countSyllables('rhythm')).toBeGreaterThan(0);
    expect(countSyllables('cat')).toBe(1);
    expect(countSyllables('paper')).toBe(2);
    expect(countSyllables('beautiful')).toBe(3);
  });

  it('gives the following syllable every consonant it can legally start with', () => {
    const syllables = syllabify(pronounce('apron'));
    expect(syllables).toHaveLength(2);
    // "pr" is a legal onset, so it belongs to the second syllable.
    expect(syllables[1].onset).toEqual(['P', 'R']);
    expect(syllables[0].coda).toEqual([]);
  });

  it('splits clusters that cannot start a syllable', () => {
    const syllables = syllabify(pronounce('napkin'));
    expect(syllables).toHaveLength(2);
    expect(syllables[0].coda).toEqual(['P']);
    expect(syllables[1].onset).toEqual(['K']);
  });

  it('exposes onset/coda-only sub-spans alongside the whole-syllable spans', () => {
    // Ground truth from the same napkin fixture as the syllabify test above:
    // "nap" (0-3) / "kin" (3-6), onset "n" (0-1) + coda "p" (2-3) for
    // syllable 0, onset "k" (3-4) + coda "n" (5-6) for syllable 1.
    const { syllableSpans, onsetSpans, codaSpans } = analyzeWordWithDetailedSpans('napkin');
    expect(syllableSpans).toEqual([{ start: 0, end: 3 }, { start: 3, end: 6 }]);
    expect(onsetSpans[0]).toEqual({ start: 0, end: 1 });
    expect(codaSpans[0]).toEqual({ start: 2, end: 3 });
    expect(onsetSpans[1]).toEqual({ start: 3, end: 4 });
    expect(codaSpans[1]).toEqual({ start: 5, end: 6 });
  });

  it('reports null for an empty onset or coda', () => {
    // "apron" -- from the legal-onset test above -- has an empty first-syllable
    // coda (the "pr" cluster all goes to syllable 1's onset).
    const { syllables, codaSpans } = analyzeWordWithDetailedSpans('apron');
    expect(syllables[0].coda).toEqual([]);
    expect(codaSpans[0]).toBeNull();
  });

  it('marks exactly one syllable as stressed', () => {
    const analysis = analyzeWord('rhyming');
    expect(analysis.syllables.filter((s) => s.stressed)).toHaveLength(1);
  });
});
