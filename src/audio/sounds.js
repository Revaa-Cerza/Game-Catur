/**
 * sounds.js — Sound effects synthesized with the Web Audio API.
 *
 * No audio files are shipped: every effect is generated procedurally
 * (oscillators + filtered noise + envelopes), which keeps the project fully
 * offline and instant-loading. The AudioContext is created lazily on the
 * first user gesture, as browsers require.
 */

export class SoundManager {
  constructor() {
    this.enabled = true;
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.master = null;
  }

  setEnabled(on) {
    this.enabled = on;
  }

  ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  /** One tone with an exponential decay envelope. */
  tone({ freq = 440, type = "sine", duration = 0.1, gain = 0.5, when = 0, glideTo = null }) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** Short filtered-noise burst (the "wooden" component of a move). */
  thump({ duration = 0.07, gain = 0.4, cutoff = 900, when = 0 }) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const frames = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t0);
  }

  play(name) {
    if (!this.enabled) return;
    switch (name) {
      case "move":
        this.thump({ cutoff: 850, gain: 0.5 });
        this.tone({ freq: 220, type: "triangle", duration: 0.06, gain: 0.15 });
        break;
      case "capture":
        this.thump({ cutoff: 500, gain: 0.7, duration: 0.1 });
        this.tone({ freq: 150, type: "triangle", duration: 0.12, gain: 0.3, glideTo: 90 });
        break;
      case "castle":
        this.thump({ cutoff: 850, gain: 0.45 });
        this.thump({ cutoff: 850, gain: 0.45, when: 0.09 });
        break;
      case "check":
        this.tone({ freq: 660, type: "square", duration: 0.09, gain: 0.12 });
        this.tone({ freq: 880, type: "square", duration: 0.12, gain: 0.12, when: 0.09 });
        break;
      case "promote":
        this.tone({ freq: 523, type: "triangle", duration: 0.1, gain: 0.25 });
        this.tone({ freq: 659, type: "triangle", duration: 0.1, gain: 0.25, when: 0.08 });
        this.tone({ freq: 784, type: "triangle", duration: 0.16, gain: 0.25, when: 0.16 });
        break;
      case "illegal":
        this.tone({ freq: 160, type: "sawtooth", duration: 0.12, gain: 0.15, glideTo: 110 });
        break;
      case "gameEnd":
        this.tone({ freq: 392, type: "triangle", duration: 0.5, gain: 0.2 });
        this.tone({ freq: 494, type: "triangle", duration: 0.5, gain: 0.2, when: 0.02 });
        this.tone({ freq: 587, type: "triangle", duration: 0.6, gain: 0.2, when: 0.04 });
        break;
      case "lowTime":
        this.tone({ freq: 880, type: "sine", duration: 0.06, gain: 0.2 });
        break;
      default:
        break;
    }
  }
}
