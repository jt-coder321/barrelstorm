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
    s.loop = true;
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
      case 'cannon':
        if (this.throttle('w', 90)) return;
        this.noise(0.18, { vol: 0.22, freq: 500, sweep: 0.3 });
        this.tone(110 - tier * 8, 0.16, { type: 'sine', vol: 0.22, slide: 0.5 });
        break;
      case 'gatling':
        if (this.throttle('w', 55)) return;
        this.noise(0.04, { vol: 0.09, freq: 2200 + Math.random() * 600, type: 'bandpass', q: 3 });
        break;
      case 'bow':
        if (this.throttle('w', 80)) return;
        this.tone(700 + tier * 60, 0.08, { type: 'triangle', vol: 0.08, slide: 0.45 });
        this.noise(0.06, { vol: 0.05, freq: 3000, type: 'highpass' });
        break;
      case 'flame':
        if (this.throttle('w', 110)) return;
        this.noise(0.22, { vol: 0.1, freq: 700, sweep: 1.6, type: 'bandpass', q: 0.7 });
        break;
      case 'zap':
        if (this.throttle('zap', 70)) return;
        this.tone(1800 + Math.random() * 900, 0.07, { type: 'sawtooth', vol: 0.05, slide: 0.3 });
        this.noise(0.08, { vol: 0.07, freq: 4000, type: 'highpass' });
        break;
      case 'mortar':
        if (this.throttle('mortar', 120)) return;
        this.tone(160, 0.2, { type: 'sine', vol: 0.25, slide: 0.4 });
        this.noise(0.1, { vol: 0.1, freq: 400 });
        break;
      case 'frost':
        if (this.throttle('w', 90)) return;
        this.tone(1500 + Math.random() * 300, 0.1, { type: 'sine', vol: 0.06, slide: 1.4 });
        this.noise(0.08, { vol: 0.05, freq: 5000, type: 'highpass' });
        break;
      case 'rocket':
        if (this.throttle('w', 100)) return;
        this.noise(0.3, { vol: 0.1, freq: 1500, sweep: 0.4, type: 'bandpass', q: 1.5 });
        break;
      case 'crit':
        if (this.throttle('crit', 70)) return;
        this.tone(1900, 0.05, { type: 'square', vol: 0.05 });
        break;
      case 'freeze':
        if (this.throttle('freeze', 90)) return;
        [1800, 2400].forEach((f, i) => this.tone(f, 0.12, { type: 'sine', vol: 0.06, delay: i * 0.04 }));
        break;
      case 'shatter':
        this.noise(0.3, { vol: 0.25, freq: 5000, type: 'highpass' });
        [2600, 2000, 3100].forEach((f, i) => this.tone(f, 0.1, { type: 'triangle', vol: 0.05, delay: i * 0.03 }));
        break;
      case 'shield':
        if (this.throttle('shield', 120)) return;
        this.tone(600, 0.15, { type: 'sine', vol: 0.08, slide: 1.5 });
        break;
      case 'thunder':
        this.noise(0.5, { vol: 0.3, freq: 1600, sweep: 0.15 });
        this.tone(60, 0.4, { type: 'sawtooth', vol: 0.1, slide: 0.6 });
        break;
      case 'warn':
        if (this.throttle('warn', 300)) return;
        [880, 660].forEach((f, i) => this.tone(f, 0.12, { type: 'square', vol: 0.06, delay: i * 0.13 }));
        break;
      case 'horn':
        [196, 196, 233].forEach((f, i) => this.tone(f, 0.32, { type: 'sawtooth', vol: 0.12, delay: i * 0.28 }));
        for (let i = 0; i < 6; i++) this.noise(0.08, { vol: 0.18, freq: 220, delay: i * 0.1 });
        break;
      case 'fanfare':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.15, delay: i * 0.08 }));
        break;
      case 'secret':
        [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', vol: 0.08, delay: i * 0.1 }));
        break;
      case 'synergy':
        [440, 554, 659, 880, 1108].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.14, delay: i * 0.06 }));
        this.noise(0.8, { vol: 0.12, freq: 4000, type: 'highpass', delay: 0.2 });
        break;
      case 'draft':
        [392, 523].forEach((f, i) => this.tone(f, 0.15, { type: 'triangle', vol: 0.12, delay: i * 0.08 }));
        break;
      case 'rareCard':
        if (this.throttle('rare', 200)) return;
        [1318, 1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.18, { type: 'sine', vol: 0.08, delay: 0.25 + i * 0.07 }));
        break;
      case 'ability':
        this.noise(0.4, { vol: 0.25, freq: 300, sweep: 4, type: 'bandpass', q: 1 });
        this.tone(220, 0.4, { type: 'sawtooth', vol: 0.12, slide: 2.5 });
        break;
      case 'multi':
        [784, 988, 1175].forEach((f, i) => this.tone(f, 0.12, { type: 'square', vol: 0.06, delay: i * 0.05 }));
        break;
      case 'combo':
        [659, 784, 988, 1318].forEach((f, i) => this.tone(f, 0.12, { type: 'square', vol: 0.06, delay: i * 0.05 }));
        break;
      case 'roar':
        this.noise(0.9, { vol: 0.3, freq: 300, sweep: 0.5, type: 'bandpass', q: 0.8 });
        this.tone(90, 0.8, { type: 'sawtooth', vol: 0.15, slide: 0.6 });
        break;
      case 'bossdie':
        this.noise(1.4, { vol: 0.6, freq: 500, sweep: 0.08, q: 0.5 });
        [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.14, delay: 0.5 + i * 0.1 }));
        break;
      case 'rubble':
        if (this.throttle('rubble', 60)) return;
        this.noise(0.3, { vol: 0.3, freq: 400, sweep: 0.3 });
        break;
      case 'wind':
        this.noise(2.2, { vol: 0.18, freq: 600, sweep: 1.8, type: 'bandpass', q: 0.6 });
        break;
      default:
        break;
    }
  }
}
