import type { VoiceId } from './voices';

export interface StepCell {
  on: boolean;
  /** 0..1 */
  velocity: number;
  /** Semitone offset, only meaningful for pitched voices like the 808. */
  pitch?: number;
}

export interface Track {
  id: string;
  name: string;
  voice: VoiceId;
  muted: boolean;
  soloed: boolean;
  /** 0..1 */
  gain: number;
  steps: StepCell[];
}

export interface Pattern {
  bars: number;
  stepsPerBar: number;
  tracks: Track[];
}

export interface TransportSettings {
  bpm: number;
  /** 0 = straight, 0.6 = heavily swung 16ths. */
  swing: number;
  metronome: boolean;
  masterGain: number;
  loop: boolean;
}

export interface EngineSnapshot {
  pattern: Pattern;
  transport: TransportSettings;
}

export const totalSteps = (pattern: Pattern): number => pattern.bars * pattern.stepsPerBar;

export function emptyStep(): StepCell {
  return { on: false, velocity: 0.85 };
}

export function makeTrack(id: string, name: string, voice: VoiceId, steps: number): Track {
  return {
    id,
    name,
    voice,
    muted: false,
    soloed: false,
    gain: 0.8,
    steps: Array.from({ length: steps }, emptyStep),
  };
}

/** Grow or shrink every track's step array to match the pattern length. */
export function resizePattern(pattern: Pattern, bars: number): Pattern {
  const length = bars * pattern.stepsPerBar;
  return {
    ...pattern,
    bars,
    tracks: pattern.tracks.map((track) => ({
      ...track,
      steps: Array.from({ length }, (_, i) => track.steps[i] ?? emptyStep()),
    })),
  };
}
