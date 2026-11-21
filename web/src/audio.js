// Tiny synthesized sound effects. No audio files needed.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.last = {};
    this.noiseBuf = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.6;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

  throttle(name, ms) {
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < ms) return true;
    this.last[name] = now;
    return false;
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.4, freq = 1200, q = 0.8, type = 'lowpass', delay = 0, sweep = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.2);
    s.stop(t + dur + 0.02);
  }

  play(name, tier = 0) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'shoot':
        if (this.throttle('shoot', 70)) return;
        if (tier >= 4) this.noise(0.12, { vol: 0.12, freq: 900, sweep: 0.3 });
        else this.tone(520 + tier * 60 + Math.random() * 40, 0.07, { type: 'triangle', vol: 0.06, slide: 0.5 });
        break;
      case 'hit':
        if (this.throttle('hit', 45)) return;
        this.noise(0.06, { vol: 0.16, freq: 700 + Math.random() * 400, type: 'bandpass', q: 2 });
        break;
      case 'clank':
        if (this.throttle('clank', 60)) return;
        this.tone(1400 + Math.random() * 300, 0.08, { type: 'square', vol: 0.04, slide: 0.7 });
        break;
      case 'break':
        if (this.throttle('break', 40)) return;
        this.noise(0.25, { vol: 0.35, freq: 900, sweep: 0.25 });
        this.tone(140, 0.18, { type: 'triangle', vol: 0.25, slide: 0.5 });
        break;
      case 'boom':
        this.noise(0.7, { vol: 0.6, freq: 600, sweep: 0.1, q: 0.5 });
        this.tone(80, 0.5, { type: 'sine', vol: 0.5, slide: 0.4 });
        break;
      case 'coin':
        if (this.throttle('coin', 60)) return;
        this.tone(1320, 0.07, { type: 'square', vol: 0.05 });
        this.tone(1760, 0.1, { type: 'square', vol: 0.05, delay: 0.05 });
        break;
      case 'gate':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.15, { type: 'triangle', vol: 0.15, delay: i * 0.06 }));
        break;
      case 'gateBad':
        this.tone(300, 0.3, { type: 'sawtooth', vol: 0.1, slide: 0.5 });
        break;
      case 'evolve':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.16, delay: i * 0.07 }));
        this.noise(0.6, { vol: 0.15, freq: 3000, type: 'highpass', delay: 0.3 });
        break;
      case 'hurt':
        this.tone(220, 0.3, { type: 'sawtooth', vol: 0.22, slide: 0.4 });
        this.noise(0.3, { vol: 0.3, freq: 500 });
        break;
      case 'boss':
        [110, 98, 82].forEach((f, i) => this.tone(f, 0.5, { type: 'sawtooth', vol: 0.18, delay: i * 0.35 }));
        break;
      case 'win':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.18, delay: i * 0.11 }));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.18, delay: i * 0.18 }));
        break;
      case 'click':
        this.tone(900, 0.04, { type: 'square', vol: 0.05 });
        break;
      case 'buy':
        this.tone(660, 0.08, { type: 'square', vol: 0.07 });
        this.tone(990, 0.12, { type: 'square', vol: 0.07, delay: 0.07 });
        break;
      default:
        break;
    }
  }
}
