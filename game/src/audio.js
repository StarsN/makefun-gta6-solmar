// audio.js — all sound in Solmar Heat is synthesised with WebAudio: engine hum
// pitched by speed, a two-tone police siren, gunshot noise bursts, pickup chimes,
// mission jingles and a simple bassline music loop. There are no audio files.
export class SoundEngine {
  constructor() { this.ctx = null; this.muted = false; this.musicTimer = 0; this.note = 0; }
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  tone(freq, dur, type = 'sine', vol = 0.12, slideTo = null, when = 0) {
    const ctx = this.ensure(); if (!ctx || this.muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur = 0.12, vol = 0.25) {
    const ctx = this.ensure(); if (!ctx || this.muted) return;
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    src.connect(f).connect(g).connect(ctx.destination); src.start();
  }
  shoot() { this.noise(0.09, 0.3); this.tone(160, 0.07, 'square', 0.08, 60); }
  pickup() { this.tone(660, 0.1, 'sine', 0.14); this.tone(990, 0.16, 'sine', 0.14, null, 0.09); }
  jingle(win = true) { const seq = win ? [523, 659, 784, 1046] : [392, 330, 262, 196]; seq.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.15, null, i * 0.13)); }
  crash() { this.noise(0.22, 0.3); this.tone(90, 0.2, 'sawtooth', 0.1, 40); }
  busted() { this.tone(220, 0.5, 'sawtooth', 0.12, 110); }
  update(dt, speedRatio, sirenOn) {
    if (!this.ctx || this.muted) return;
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 0.24;
      const bass = [55, 55, 65.4, 55, 49, 55, 73.4, 82.4];
      this.tone(bass[this.note % bass.length], 0.22, 'triangle', 0.05);
      this.note++;
    }
    if (sirenOn && Math.random() < dt * 2.2) this.tone(Math.random() < 0.5 ? 720 : 960, 0.18, 'sine', 0.035);
    if (speedRatio > 0.03 && Math.random() < dt * 3) this.tone(50 + speedRatio * 90, 0.09, 'sawtooth', 0.02);
  }
}
