import { describe, expect, it } from 'vitest';
import indexText from '../public/rhyme-index.tsv?raw';
import { mergeRhymes, RhymeEntry } from '../src/rhyme/datamuse';
import { offlineRhymes, parseIndex, tailOf } from '../src/rhyme/offlineIndex';

const index = parseIndex(indexText);

describe('offline rhyme index', () => {
  it('finds the stressed tail of a word', () => {
    expect(tailOf('night')).toEqual(['AY', 'T']);
    expect(tailOf('tonight')).toEqual(['AY', 'T']);
    expect(tailOf('flowing')).toEqual(['OW', 'IH', 'NG']);
  });

  it('returns perfect rhymes for a word', () => {
    const words = offlineRhymes(index, 'night').filter((r) => r.quality === 'perfect').map((r) => r.word);
    expect(words).toEqual(expect.arrayContaining(['light', 'fight', 'tonight', 'flight']));
    expect(words).not.toContain('night');
  });

  it('adds near rhymes with the same vowel and similar consonants', () => {
    const near = offlineRhymes(index, 'night').filter((r) => r.quality === 'near').map((r) => r.word);
    expect(near.length).toBeGreaterThan(0);
    expect(near).not.toContain('light');
  });

  it('rhymes a phrase on its last word and ignores empty input', () => {
    expect(offlineRhymes(index, 'dark of the night')).toEqual(offlineRhymes(index, 'night'));
    expect(offlineRhymes(index, '  ')).toEqual([]);
  });
});

describe('mergeRhymes', () => {
  const entry = (word: string, quality: RhymeEntry['quality'], source: RhymeEntry['source']): RhymeEntry =>
    ({ word, quality, syllables: 1, score: 0, source });

  it('puts Datamuse first within a tier, dedupes, and keeps the best quality', () => {
    const merged = mergeRhymes(
      [entry('light', 'perfect', 'datamuse'), entry('time', 'near', 'datamuse')],
      [entry('bight', 'perfect', 'offline'), entry('light', 'perfect', 'offline'), entry('time', 'perfect', 'offline')],
    );
    expect(merged.map((m) => m.word)).toEqual(['light', 'time', 'bight']);
    expect(merged.find((m) => m.word === 'time')?.quality).toBe('perfect');
  });
});
