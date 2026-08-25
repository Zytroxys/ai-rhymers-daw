import { describe, expect, it } from 'vitest';
import { analyzeLine, analyzeVerse, syllablePositions } from '../src/lyrics/meter';

describe('analyzeLine', () => {
  it('counts syllables across the line', () => {
    const line = analyzeLine('pen on the paper');
    expect(line.words).toHaveLength(4);
    expect(line.syllables).toBe(5);
    expect(line.lastWord).toBe('paper');
  });

  it('reports density per bar', () => {
    expect(analyzeLine('pen on the paper', 2).density).toBeCloseTo(2.5);
  });

  it('finds internal rhymes', () => {
    const line = analyzeLine('the flow that I know is gold');
    expect(line.internalRhymes.length).toBeGreaterThan(0);
  });

  it('handles an empty line', () => {
    const line = analyzeLine('');
    expect(line.syllables).toBe(0);
    expect(line.words).toEqual([]);
  });
});

describe('analyzeVerse', () => {
  const lines = [
    'stepping in the booth with the pen and the light',
    'sixteen bars and I write them every night',
    'yes',
  ];

  it('returns a scheme alongside the metrics', () => {
    const verse = analyzeVerse(lines);
    expect(verse.scheme[0]).toBe(verse.scheme[1]);
    expect(verse.totalSyllables).toBeGreaterThan(20);
  });

  it('flags lines that drift from the average length', () => {
    expect(analyzeVerse(lines).outliers).toContain(2);
  });

  it('ignores blank lines when averaging', () => {
    const verse = analyzeVerse(['cat hat', '', '']);
    expect(verse.averageSyllables).toBe(2);
  });
});

describe('syllablePositions', () => {
  it('spreads syllables evenly across the bar', () => {
    const positions = syllablePositions(analyzeLine('cat hat mat bat'), 1);
    expect(positions).toEqual([0, 1, 2, 3]);
  });

  it('returns nothing for an empty line', () => {
    expect(syllablePositions(analyzeLine(''), 1)).toEqual([]);
  });
});
