import { useSyncExternalStore } from 'react';
import { Pattern, TransportSettings, makeTrack, resizePattern } from '../audio/types';

export interface ProjectState {
  name: string;
  pattern: Pattern;
  transport: TransportSettings;
  /** The whole verse as text; one line per bar-ish. */
  lyrics: string;
  /** How many bars a written line is meant to occupy. */
  barsPerLine: number;
  /** Word the rhyme panel is currently looking up. */
  focusWord: string | null;
}

const STEPS_PER_BAR = 16;

function defaultPattern(): Pattern {
  const bars = 2;
  const length = bars * STEPS_PER_BAR;
  const pattern: Pattern = {
    bars,
    stepsPerBar: STEPS_PER_BAR,
    tracks: [
      makeTrack('kick', 'Kick', 'kick', length),
      makeTrack('sub', '808', 'sub', length),
      makeTrack('snare', 'Snare', 'snare', length),
      makeTrack('clap', 'Clap', 'clap', length),
      makeTrack('hat', 'Hat', 'hat', length),
      makeTrack('openhat', 'Open Hat', 'openhat', length),
      makeTrack('rim', 'Rim', 'rim', length),
    ],
  };

  // A plain boom-bap starting point, so the app makes music on first load.
  const on = (trackId: string, steps: number[], velocity = 0.9) => {
    const track = pattern.tracks.find((t) => t.id === trackId)!;
    steps.forEach((step) => {
      track.steps[step] = { on: true, velocity };
    });
  };
  on('kick', [0, 10, 16, 22, 26]);
  on('snare', [4, 12, 20, 28]);
  on('hat', [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30], 0.6);
  on('openhat', [14, 30], 0.5);
  return pattern;
}

function defaultTransport(): TransportSettings {
  return { bpm: 88, swing: 0.18, metronome: false, masterGain: 0.85, loop: true };
}

function defaultState(): ProjectState {
  return {
    name: 'Untitled',
    pattern: defaultPattern(),
    transport: defaultTransport(),
    lyrics: [
      'Pen on the paper and the pattern keep looping',
      'Sixteen steps and the metronome moving',
      '',
      '',
    ].join('\n'),
    barsPerLine: 1,
    focusWord: null,
  };
}

const STORAGE_KEY = 'ai-rhymers-daw:project:v1';

function loadState(): ProjectState {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ProjectState>;
    const base = defaultState();
    // Merge rather than trust: a project saved by an older build is still useful.
    return {
      ...base,
      ...parsed,
      pattern: parsed.pattern ?? base.pattern,
      transport: { ...base.transport, ...parsed.transport },
    };
  } catch {
    return defaultState();
  }
}

let state: ProjectState = loadState();
const listeners = new Set<() => void>();

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private-mode browsers throw here; the app works fine without persistence.
  }
}

function set(updater: (current: ProjectState) => ProjectState): void {
  state = updater(state);
  persist();
  listeners.forEach((listener) => listener());
}

export function getState(): ProjectState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useProject<T>(selector: (s: ProjectState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

function mapTrack(id: string, fn: (track: Pattern['tracks'][number]) => Pattern['tracks'][number]) {
  set((s) => ({
    ...s,
    pattern: {
      ...s.pattern,
      tracks: s.pattern.tracks.map((track) => (track.id === id ? fn(track) : track)),
    },
  }));
}

export const actions = {
  toggleStep(trackId: string, index: number): void {
    mapTrack(trackId, (track) => {
      const steps = track.steps.slice();
      const cell = steps[index];
      steps[index] = { ...cell, on: !cell.on };
      return { ...track, steps };
    });
  },

  setStepVelocity(trackId: string, index: number, velocity: number): void {
    mapTrack(trackId, (track) => {
      const steps = track.steps.slice();
      steps[index] = { ...steps[index], velocity: clamp(velocity, 0, 1), on: true };
      return { ...track, steps };
    });
  },

  setStepPitch(trackId: string, index: number, pitch: number): void {
    mapTrack(trackId, (track) => {
      const steps = track.steps.slice();
      steps[index] = { ...steps[index], pitch };
      return { ...track, steps };
    });
  },

  clearTrack(trackId: string): void {
    mapTrack(trackId, (track) => ({
      ...track,
      steps: track.steps.map((cell) => ({ ...cell, on: false })),
    }));
  },

  toggleMute(trackId: string): void {
    mapTrack(trackId, (track) => ({ ...track, muted: !track.muted }));
  },

  toggleSolo(trackId: string): void {
    mapTrack(trackId, (track) => ({ ...track, soloed: !track.soloed }));
  },

  setTrackGain(trackId: string, gain: number): void {
    mapTrack(trackId, (track) => ({ ...track, gain: clamp(gain, 0, 1) }));
  },

  setBars(bars: number): void {
    set((s) => ({ ...s, pattern: resizePattern(s.pattern, clamp(Math.round(bars), 1, 8)) }));
  },

  setBpm(bpm: number): void {
    set((s) => ({ ...s, transport: { ...s.transport, bpm: clamp(Math.round(bpm), 40, 220) } }));
  },

  setSwing(swing: number): void {
    set((s) => ({ ...s, transport: { ...s.transport, swing: clamp(swing, 0, 0.7) } }));
  },

  setMasterGain(gain: number): void {
    set((s) => ({ ...s, transport: { ...s.transport, masterGain: clamp(gain, 0, 1) } }));
  },

  toggleMetronome(): void {
    set((s) => ({ ...s, transport: { ...s.transport, metronome: !s.transport.metronome } }));
  },

  toggleLoop(): void {
    set((s) => ({ ...s, transport: { ...s.transport, loop: !s.transport.loop } }));
  },

  setLyrics(lyrics: string): void {
    set((s) => ({ ...s, lyrics }));
  },

  setBarsPerLine(bars: number): void {
    set((s) => ({ ...s, barsPerLine: clamp(bars, 0.5, 4) }));
  },

  setFocusWord(word: string | null): void {
    set((s) => ({ ...s, focusWord: word }));
  },

  setName(name: string): void {
    set((s) => ({ ...s, name }));
  },

  reset(): void {
    set(() => defaultState());
  },

  load(project: ProjectState): void {
    set(() => project);
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
