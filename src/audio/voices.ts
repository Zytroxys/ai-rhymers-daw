/**
 * Synthesized drum voices. Everything here is oscillators and filtered noise, so
 * the app makes sound with no samples to load, no licensing, and no bundle
 * weight -- swap in a Sampler later without touching the scheduler.
 */

export type VoiceId = 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'rim' | 'sub';

export interface VoiceDescriptor {
  id: VoiceId;
  name: string;
  /** Colour hint for the step grid. */
  hue: number;
}

export const VOICES: VoiceDescriptor[] = [
  { id: 'kick', name: 'Kick', hue: 6 },
  { id: 'sub', name: '808', hue: 275 },
  { id: 'snare', name: 'Snare', hue: 42 },
  { id: 'clap', name: 'Clap', hue: 20 },
  { id: 'hat', name: 'Hat', hue: 190 },
  { id: 'openhat', name: 'Open Hat', hue: 165 },
  { id: 'rim', name: 'Rim', hue: 300 },
];

let noiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 1.5);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

interface VoiceParams {
  ctx: BaseAudioContext;
  destination: AudioNode;
  time: number;
  velocity: number;
  /** Semitone offset, used by the 808 to play a bassline. */
  pitch?: number;
}

function envelope(ctx: BaseAudioContext, time: number, peak: number, decay: number, attack = 0.001) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  return gain;
}

function noiseSource(ctx: BaseAudioContext, time: number, duration: number) {
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  source.loop = true;
  source.start(time);
  source.stop(time + duration + 0.05);
  return source;
}

function kick({ ctx, destination, time, velocity }: VoiceParams) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
  const gain = envelope(ctx, time, velocity, 0.38);
  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 0.5);

  // A short noise transient gives the attack something to cut through with.
  const click = noiseSource(ctx, time, 0.02);
  const clickFilter = ctx.createBiquadFilter();
  clickFilter.type = 'bandpass';
  clickFilter.frequency.value = 1800;
  const clickGain = envelope(ctx, time, velocity * 0.25, 0.02);
  click.connect(clickFilter).connect(clickGain).connect(destination);
}

function sub({ ctx, destination, time, velocity, pitch = 0 }: VoiceParams) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const base = 55 * Math.pow(2, pitch / 12);
  osc.frequency.setValueAtTime(base * 3, time);
  osc.frequency.exponentialRampToValueAtTime(base, time + 0.06);
  const gain = envelope(ctx, time, velocity * 0.9, 0.9, 0.004);
  const drive = ctx.createWaveShaper();
  drive.curve = saturationCurve(6);
  osc.connect(drive).connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 1.2);
}

function snare({ ctx, destination, time, velocity }: VoiceParams) {
  const noise = noiseSource(ctx, time, 0.2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1400;
  const noiseGain = envelope(ctx, time, velocity * 0.7, 0.18);
  noise.connect(filter).connect(noiseGain).connect(destination);

  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(190, time);
  body.frequency.exponentialRampToValueAtTime(120, time + 0.1);
  const bodyGain = envelope(ctx, time, velocity * 0.4, 0.11);
  body.connect(bodyGain).connect(destination);
  body.start(time);
  body.stop(time + 0.3);
}

function clap({ ctx, destination, time, velocity }: VoiceParams) {
  // Four fast bursts is what makes a clap read as a clap and not as noise.
  const offsets = [0, 0.011, 0.022, 0.035];
  offsets.forEach((offset, index) => {
    const at = time + offset;
    const noise = noiseSource(ctx, at, 0.12);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 1.1;
    const decay = index === offsets.length - 1 ? 0.16 : 0.02;
    const gain = envelope(ctx, at, velocity * 0.55, decay);
    noise.connect(filter).connect(gain).connect(destination);
  });
}

function hihat(decay: number) {
  return ({ ctx, destination, time, velocity }: VoiceParams) => {
    const noise = noiseSource(ctx, time, decay + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7200;
    const gain = envelope(ctx, time, velocity * 0.35, decay);
    noise.connect(filter).connect(gain).connect(destination);
  };
}

function rim({ ctx, destination, time, velocity }: VoiceParams) {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1700, time);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2100;
  filter.Q.value = 6;
  const gain = envelope(ctx, time, velocity * 0.4, 0.05);
  osc.connect(filter).connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 0.12);
}

function saturationCurve(amount: number) {
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

const VOICE_IMPLS: Record<VoiceId, (params: VoiceParams) => void> = {
  kick,
  sub,
  snare,
  clap,
  hat: hihat(0.045),
  openhat: hihat(0.3),
  rim,
};

/** Schedule one hit at an absolute AudioContext time. */
export function triggerVoice(voice: VoiceId, params: VoiceParams): void {
  VOICE_IMPLS[voice](params);
}

/** The metronome, kept separate from the kit so it never lands in a bounce. */
export function triggerClick(ctx: BaseAudioContext, destination: AudioNode, time: number, accent: boolean): void {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = accent ? 1600 : 1000;
  const gain = envelope(ctx, time, accent ? 0.22 : 0.12, 0.04);
  osc.connect(gain).connect(destination);
  osc.start(time);
  osc.stop(time + 0.1);
}
