import { describe, expect, it } from 'vitest';
import { makeTrack, resizePattern, totalSteps } from '../src/audio/types';
import type { Pattern } from '../src/audio/types';

function pattern(bars = 2): Pattern {
  return { bars, stepsPerBar: 16, tracks: [makeTrack('kick', 'Kick', 'kick', bars * 16)] };
}

describe('resizePattern', () => {
  it('grows every track and fills the new steps as empty', () => {
    const grown = resizePattern(pattern(2), 4);
    expect(totalSteps(grown)).toBe(64);
    expect(grown.tracks[0].steps).toHaveLength(64);
    expect(grown.tracks[0].steps.every((s) => typeof s.on === 'boolean')).toBe(true);
  });

  it('truncates without touching the surviving steps', () => {
    const original = pattern(2);
    original.tracks[0].steps[3] = { on: true, velocity: 0.5 };
    const shrunk = resizePattern(original, 1);
    expect(shrunk.tracks[0].steps).toHaveLength(16);
    expect(shrunk.tracks[0].steps[3]).toEqual({ on: true, velocity: 0.5 });
  });

  it('leaves the original pattern alone', () => {
    const original = pattern(2);
    resizePattern(original, 4);
    expect(original.tracks[0].steps).toHaveLength(32);
  });
});
