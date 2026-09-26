import { describe, it, expect } from 'vitest';
import { annotatePhrases } from '../src/rhyme/phrases';
import { SyllableColor } from '../src/rhyme/grouping';

describe('annotatePhrases', () => {
  it('marks contiguous syllable runs as phrase members', () => {
    const groups: Map<string, SyllableColor[]> = new Map([
      ['tragic', [{ start: 0, end: 3, color: 0 }]],
      ['wagon', [{ start: 0, end: 3, color: 1 }]],
      ['magic', [{ start: 0, end: 3, color: 0 }]],
      ['dragon', [{ start: 0, end: 3, color: 0 }]],
    ]);

    const lineWords = [
      ['tragic', 'wagon'],
      ['magic', 'dragon'],
    ];

    const result = annotatePhrases(groups, lineWords);

    const magicResult = result.get('magic')!;
    const dragonResult = result.get('dragon')!;

    expect(magicResult[0].isPhraseMember).toBe(true);
    expect(dragonResult[0].isPhraseMember).toBe(true);
    expect(magicResult[0].phraseId).toBe(dragonResult[0].phraseId);
  });

  it('marks contiguous multi-word runs and ignores truly isolated words', () => {
    const groups: Map<string, SyllableColor[]> = new Map([
      ['magic', [{ start: 0, end: 3, color: 0 }]],
      ['dragon', [{ start: 0, end: 3, color: 0 }]],
      ['cat', [{ start: 0, end: 3, color: 0 }]],
    ]);

    const lineWords = [
      ['magic', 'dragon'],
      ['hello', 'world'],
      ['cat'],
    ];

    const result = annotatePhrases(groups, lineWords);

    const magicResult = result.get('magic')!;
    const dragonResult = result.get('dragon')!;
    const catResult = result.get('cat')!;

    expect(magicResult[0].isPhraseMember).toBe(true);
    expect(dragonResult[0].isPhraseMember).toBe(true);
    expect(magicResult[0].phraseId).toBe(dragonResult[0].phraseId);
    expect(catResult[0].isPhraseMember).toBeUndefined();
  });

  it('filters out function words when detecting contiguity', () => {
    const groups: Map<string, SyllableColor[]> = new Map([
      ['tragic', [{ start: 0, end: 3, color: 0 }]],
      ['wagon', [{ start: 0, end: 3, color: 0 }]],
    ]);

    const lineWords = [
      ['tragic', 'in', 'wagon'],
    ];

    const result = annotatePhrases(groups, lineWords);

    const tragicResult = result.get('tragic')!;
    const wagonResult = result.get('wagon')!;

    expect(tragicResult[0].isPhraseMember).toBe(true);
    expect(wagonResult[0].isPhraseMember).toBe(true);
    expect(tragicResult[0].phraseId).toBe(wagonResult[0].phraseId);
  });

  it('handles empty groups gracefully', () => {
    const groups: Map<string, SyllableColor[]> = new Map();
    const lineWords = [['hello', 'world']];

    const result = annotatePhrases(groups, lineWords);

    expect(result.size).toBe(0);
  });

  it('preserves non-phrase members with no phrase metadata', () => {
    const groups: Map<string, SyllableColor[]> = new Map([
      ['cat', [{ start: 0, end: 2, color: 0 }]],
    ]);

    const lineWords = [['cat']];

    const result = annotatePhrases(groups, lineWords);

    const catResult = result.get('cat')!;

    expect(catResult[0].isPhraseMember).toBeUndefined();
    expect(catResult[0].phraseId).toBeUndefined();
  });

  it('assigns different phraseIds to non-contiguous runs of same family', () => {
    const groups: Map<string, SyllableColor[]> = new Map([
      ['tragic', [{ start: 0, end: 3, color: 0 }]],
      ['wagon', [{ start: 0, end: 3, color: 0 }]],
      ['magic', [{ start: 0, end: 3, color: 0 }]],
      ['dragon', [{ start: 0, end: 3, color: 0 }]],
      ['joy', [{ start: 0, end: 3, color: 0 }]],
      ['peace', [{ start: 0, end: 3, color: 0 }]],
    ]);

    const lineWords = [
      ['tragic', 'wagon'],
      ['hello', 'world'],
      ['magic', 'dragon'],
      ['sad', 'blue'],
      ['joy', 'peace'],
    ];

    const result = annotatePhrases(groups, lineWords);

    const tragicPhrase = result.get('tragic')![0].phraseId;
    const magicPhrase = result.get('magic')![0].phraseId;
    const joyPhrase = result.get('joy')![0].phraseId;

    expect(tragicPhrase).toBeDefined();
    expect(magicPhrase).toBeDefined();
    expect(joyPhrase).toBeDefined();
    expect(tragicPhrase).not.toBe(magicPhrase);
    expect(magicPhrase).not.toBe(joyPhrase);
  });

  it('handles multi-syllable words correctly', () => {
    const groups: Map<string, SyllableColor[]> = new Map([
      ['looping', [{ start: 0, end: 2, color: 0 }, { start: 4, end: 7, color: 0 }]],
      ['moving', [{ start: 0, end: 2, color: 0 }, { start: 4, end: 6, color: 0 }]],
    ]);

    const lineWords = [
      ['looping'],
      ['moving'],
    ];

    const result = annotatePhrases(groups, lineWords);

    const loopingResult = result.get('looping')!;
    const movingResult = result.get('moving')!;

    expect(loopingResult[0].isPhraseMember).toBe(true);
    expect(loopingResult[1].isPhraseMember).toBe(true);
    expect(movingResult[0].isPhraseMember).toBe(true);
    expect(movingResult[1].isPhraseMember).toBe(true);
  });
});
