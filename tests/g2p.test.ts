import { describe, expect, it } from 'vitest';
import { addPronunciations, analyzeWord, countSyllables, pronounce, syllabify } from '../src/rhyme/g2p';

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

  it('marks exactly one syllable as stressed', () => {
    const analysis = analyzeWord('rhyming');
    expect(analysis.syllables.filter((s) => s.stressed)).toHaveLength(1);
  });
});
