import { describe, expect, it } from 'vitest';
import { meaningOverlap, soundsLike } from '../src/lexis/wordplay';

describe('soundsLike', () => {
  it('scores a true rhyme highly, as a perfect match', () => {
    const result = soundsLike('night', 'light');
    expect(result.quality).toBe('perfect');
    expect(result.score).toBeGreaterThan(0.8);
  });

  it('is already phrase-capable, since it wraps rhyme.ts scoreRhyme', () => {
    const result = soundsLike('magic dragon', 'tragic wagon');
    expect(result.score).toBeGreaterThan(0.85);
  });

  it('scores unrelated words low', () => {
    const result = soundsLike('cat', 'hope');
    expect(result.score).toBeLessThan(0.5);
  });
});

describe('meaningOverlap', () => {
  it('returns words present in both lists', () => {
    expect(meaningOverlap(['bright', 'shine', 'glow'], ['glow', 'dark'])).toEqual(['glow']);
  });

  it('is case-insensitive', () => {
    expect(meaningOverlap(['Bright'], ['bright'])).toEqual(['bright']);
  });

  it('returns an empty array when there is no overlap', () => {
    expect(meaningOverlap(['a', 'b'], ['c', 'd'])).toEqual([]);
  });

  it('returns an empty array for empty inputs', () => {
    expect(meaningOverlap([], ['a'])).toEqual([]);
    expect(meaningOverlap(['a'], [])).toEqual([]);
  });

  it('dedupes repeated matches', () => {
    expect(meaningOverlap(['glow', 'glow'], ['glow'])).toEqual(['glow']);
  });
});
