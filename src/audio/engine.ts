import { EngineSnapshot, totalSteps } from './types';
import { triggerClick, triggerVoice } from './voices';

/**
 * Lookahead step sequencer.
 *
 * setTimeout/rAF are far too jittery to place drum hits with, so the engine runs
 * a coarse timer that schedules every hit that falls inside the next
 * LOOKAHEAD_S onto the AudioContext clock, sample-accurately. The UI playhead is
 * derived from that clock rather than driving it, which keeps the visuals honest
 * even when the main thread stalls.
 */

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_S = 0.12;

type StepListener = (step: number, time: number) => void;

interface ScheduledStep {
  step: number;
  time: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private clickBus: GainNode | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private nextStep = 0;
  private queue: ScheduledStep[] = [];
  private listeners = new Set<StepListener>();
  private snapshotProvider: (() => EngineSnapshot) | null = null;

  playing = false;
  private lastFiredStep = -1;

  /** React state stays the source of truth; the engine pulls from it. */
  setSnapshotProvider(provider: () => EngineSnapshot): void {
    this.snapshotProvider = provider;
  }

  onStep(listener: StepListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Browsers only allow an AudioContext to start inside a user gesture, so the
   * context is created on first play rather than at module load.
   */
  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    master.connect(limiter).connect(ctx.destination);

    const clickBus = ctx.createGain();
    clickBus.gain.value = 1;
    clickBus.connect(limiter);

    this.ctx = ctx;
    this.master = master;
    this.clickBus = clickBus;
    return ctx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  async start(): Promise<void> {
    if (this.playing) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();

    this.playing = true;
    this.nextStep = 0;
    this.queue = [];
    this.nextStepTime = ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
    this.schedule();
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.queue = [];
    this.nextStep = 0;
    this.lastFiredStep = -1;
  }

  async toggle(): Promise<void> {
    if (this.playing) this.stop();
    else await this.start();
  }

  /** Play one hit immediately, for auditioning a voice from the UI. */
  async audition(trackId: string): Promise<void> {
    const snapshot = this.snapshotProvider?.();
    if (!snapshot) return;
    const track = snapshot.pattern.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
    this.applyMasterGain(snapshot.transport.masterGain);
    triggerVoice(track.voice, {
      ctx,
      destination: this.master!,
      time: ctx.currentTime + 0.01,
      velocity: track.gain,
    });
  }

  private stepDuration(bpm: number, stepsPerBar: number): number {
    const beatsPerBar = 4;
    const secondsPerBeat = 60 / bpm;
    return (secondsPerBeat * beatsPerBar) / stepsPerBar;
  }

  private applyMasterGain(value: number): void {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  private schedule(): void {
    const ctx = this.ctx;
    const snapshot = this.snapshotProvider?.();
    if (!ctx || !snapshot || !this.playing) return;

    const { pattern, transport } = snapshot;
    const steps = totalSteps(pattern);
    if (steps === 0) return;

    this.applyMasterGain(transport.masterGain);
    if (this.clickBus) this.clickBus.gain.value = transport.metronome ? 1 : 0;

    const stepDur = this.stepDuration(transport.bpm, pattern.stepsPerBar);
    const anySoloed = pattern.tracks.some((t) => t.soloed);

    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD_S) {
      // Swing pushes every other 16th late, which is the whole feel of the groove.
      const swung = this.nextStep % 2 === 1 ? transport.swing * stepDur * 0.5 : 0;
      const time = this.nextStepTime + swung;

      for (const track of pattern.tracks) {
        if (track.muted) continue;
        if (anySoloed && !track.soloed) continue;
        const cell = track.steps[this.nextStep];
        if (!cell?.on) continue;
        triggerVoice(track.voice, {
          ctx,
          destination: this.master!,
          time,
          velocity: cell.velocity * track.gain,
          pitch: cell.pitch,
        });
      }

      if (transport.metronome && this.nextStep % pattern.stepsPerBar === 0) {
        triggerClick(ctx, this.clickBus!, this.nextStepTime, true);
      } else if (transport.metronome && this.nextStep % (pattern.stepsPerBar / 4) === 0) {
        triggerClick(ctx, this.clickBus!, this.nextStepTime, false);
      }

      this.queue.push({ step: this.nextStep, time: this.nextStepTime });
      this.nextStepTime += stepDur;
      this.nextStep = (this.nextStep + 1) % steps;

      if (this.nextStep === 0 && !transport.loop) {
        this.stop();
        return;
      }
    }

    this.drainQueue(ctx.currentTime);
  }

  /** Fire step callbacks once their audio time has actually arrived. */
  private drainQueue(now: number): void {
    while (this.queue.length && this.queue[0].time <= now) {
      const entry = this.queue.shift()!;
      this.lastFiredStep = entry.step;
      for (const listener of this.listeners) listener(entry.step, entry.time);
    }
  }

  /** The step the listener is hearing right now, or -1 when stopped. */
  currentStep(): number {
    if (!this.playing || !this.ctx) return -1;
    this.drainQueue(this.ctx.currentTime);
    return this.lastFiredStep;
  }

}

let engine: AudioEngine | null = null;

export function getEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine();
  return engine;
}
