import { describe, expect, it } from 'vitest';
import { findRhymes, rhymeKey, rhymeScheme, scoreRhyme } from '../src/rhyme/rhyme';
import '../src/rhyme/lexicon';

describe('scoreRhyme', () => {
  it('calls exact tails perfect', () => {
    expect(scoreRhyme('cat', 'hat').quality).toBe('perfect');
    expect(scoreRhyme('light', 'night').quality).toBe('perfect');
    expect(scoreRhyme('nation', 'station').quality).toBe('perfect');
  });

  it('flags a word against itself as identity, not a rhyme', () => {
    expect(scoreRhyme('flow', 'flow').quality).toBe('identity');
  });

  it('ranks a perfect rhyme above a slant one above nothing', () => {
    const perfect = scoreRhyme('bright', 'night').score;
    const slant = scoreRhyme('bright', 'bride').score;
    const unrelated = scoreRhyme('bright', 'sofa').score;
    expect(perfect).toBeGreaterThan(slant);
    expect(slant).toBeGreaterThan(unrelated);
  });

  it('hears vowel-only matches as assonance', () => {
    const result = scoreRhyme('cake', 'plane');
    expect(['assonance', 'slant']).toContain(result.quality);
    expect(result.score).toBeLessThan(0.85);
  });

  it('scores multisyllabic rhymes across word boundaries', () => {
    const multi = scoreRhyme('tragic wagon', 'magic dragon');
    expect(multi.matchedSyllables).toBeGreaterThanOrEqual(2);
    expect(multi.score).toBeGreaterThan(0.85);
  });

  it('is symmetric', () => {
    expect(scoreRhyme('money', 'honey').score).toBeCloseTo(scoreRhyme('honey', 'money').score, 10);
  });

  it('returns zero when a side has no pronounceable content', () => {
    expect(scoreRhyme('', 'cat').score).toBe(0);
    expect(scoreRhyme('!!!', 'cat').score).toBe(0);
  });
});

describe('findRhymes', () => {
  it('finds perfect rhymes from the bundled lexicon', () => {
    const words = findRhymes('night').map((m) => m.word);
    expect(words).toContain('light');
    expect(words).toContain('right');
    expect(words).not.toContain('night');
  });

  it('respects the syllable filter', () => {
    const matches = findRhymes('day', { syllables: 2 });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.syllableCount === 2)).toBe(true);
  });

  it('returns results sorted by score', () => {
    const scores = findRhymes('time').map((m) => m.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('honours the limit', () => {
    expect(findRhymes('day', { limit: 5 })).toHaveLength(5);
  });
});

describe('rhymeKey', () => {
  it('groups perfect rhymes under one key', () => {
    expect(rhymeKey('night')).toBe(rhymeKey('light'));
    expect(rhymeKey('night')).not.toBe(rhymeKey('nine'));
  });
});

describe('rhymeScheme', () => {
  it('labels an AABB couplet', () => {
    expect(rhymeScheme([
      'stepping in the booth with the pen and the light',
      'sixteen bars and I write them every night',
      'hit the metronome and let the pattern flow',
      'nothing on the beat that the engine let go',
    ])).toEqual(['A', 'A', 'B', 'B']);
  });

  it('marks blank lines', () => {
    expect(rhymeScheme(['cat', '', 'hat'])).toEqual(['A', '-', 'A']);
  });
});
