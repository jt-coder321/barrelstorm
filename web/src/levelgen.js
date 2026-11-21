// Procedural level generation.
//
// A stage has a fixed *profile* (environment, modifiers, structure, boss, objective) that is derived from
// the stage number and checked against the two previous stages so consecutive stages never share the same
// mix of mechanics. The *layout* (formations, enemy kinds, events) is rolled fresh from a run seed every
// time the stage is played, so replays play out differently while the stage keeps its identity.
import { mulberry32, rngInt, rngPick, rngShuffle, weightedPick, hashStr, clamp } from './util.js';
import { MODIFIERS, MODIFIER_BY_ID } from './data/modifiers.js';
import { BIOMES, BIOME_IDS, unlockedBiomes } from './data/biomes.js';
import { FORMATIONS, pickFormation } from './data/formations.js';
import { ENEMIES } from './data/enemies.js';
import { DIFFICULTY } from './data/meta.js';
import { FAMILY_IDS } from './data/weapons.js';

export const BOSS_IDS = ['king', 'golem', 'machine', 'siege', 'dragon'];
export const BOSS_NAMES = {
  king: 'The Barrel King', golem: 'The Iron Golem', machine: 'The War Machine', siege: 'The Siege Engine', dragon: 'The Dragon',
};

// Pacing structures. Each beat is a building block: intro, build, twist, major, reward, finale, relief.
export const STRUCTURES = {
  classic: { name: 'Classic Siege', beats: ['intro', 'build', 'twist', 'major', 'reward', 'finale'], weight: 5 },
  gauntlet: { name: 'Gauntlet', beats: ['intro', 'build', 'build', 'major', 'reward', 'major', 'finale'], weight: 4, minStage: 4 },
  rollercoaster: { name: 'Rollercoaster', beats: ['intro', 'twist', 'relief', 'build', 'major', 'reward', 'finale'], weight: 4, minStage: 2 },
  ambush: { name: 'Ambush', beats: ['intro', 'relief', 'major', 'reward', 'build', 'twist', 'finale'], weight: 3, minStage: 3 },
  treasure: { name: 'Treasure Run', beats: ['intro', 'reward', 'build', 'twist', 'relief', 'major', 'finale'], weight: 3, minStage: 2 },
  blitz: { name: 'Blitz', beats: ['intro', 'build', 'twist', 'finale'], weight: 3, minStage: 3, short: true },
};

export const OBJECTIVES = {
  clear: { name: 'Destroy the barrels', weight: 6 },
  survive: { name: 'Hold the line', weight: 2, minStage: 3 },
  hunt: { name: 'Hunt the captains', weight: 2, minStage: 4 },
};

const profileCache = new Map();

function stageThreatBudget(n) {
  return Math.min(7, 1 + Math.floor(n / 3));
}

function modCount(n, rng) {
  if (n <= 2) return 1;
  if (n < 7) return rng() < 0.55 ? 1 : 2;
  return rng() < 0.4 ? 2 : 3;
}

function bossFor(n) {
  // Every 5th stage. The first cycle introduces bosses in a fixed, gentle order; later cycles shuffle
  // but never repeat the previous boss.
  const k = n / 5 - 1;
  if (k < BOSS_IDS.length) return BOSS_IDS[k];
  const cycle = Math.floor(k / BOSS_IDS.length);
  const order = rngShuffle(mulberry32(cycle * 7919 + 3), [...BOSS_IDS]);
  const prev = bossFor(n - 5);
  let b = order[k % BOSS_IDS.length];
  if (b === prev) b = order[(k + 1) % BOSS_IDS.length];
  return b;
}

function biomeFor(n, prevBiome) {
  // The newest environment debuts on its unlock stage; otherwise biomes rotate in blocks of 2-3 stages.
  for (const id of BIOME_IDS) if (BIOMES[id].unlock === n && n > 1) return id;
  const block = Math.floor((n - 1) / 3);
  const rng = mulberry32(block * 2654435761 + 11);
  const pool = unlockedBiomes(n);
  if ((n - 1) % 3 !== 0 && prevBiome && pool.includes(prevBiome)) return prevBiome;
  const choices = pool.filter((b) => b !== prevBiome);
  return choices.length ? rngPick(rng, choices) : pool[0];
}

function signature(p) {
  return `${[...p.mods].sort().join('+')}|${p.structure}`;
}

// The profile of stage n in a given "track" (campaign or a daily seed).
export function stageProfile(n, track = 'campaign') {
  const key = `${track}:${n}`;
  if (profileCache.has(key)) return profileCache.get(key);
  const prev1 = n > 1 ? stageProfile(n - 1, track) : null;
  const prev2 = n > 2 ? stageProfile(n - 2, track) : null;
  const rng = mulberry32(hashStr(key) ^ 0x9e3779b9);
  const boss = track === 'campaign' && n % 5 === 0 ? bossFor(n) : null;
  const biome = track === 'campaign' ? biomeFor(n, prev1 && prev1.biome) : rngPick(rng, BIOME_IDS);
  const sn = track === 'campaign' ? n : Math.max(n, 8);

  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const count = boss ? Math.min(2, modCount(sn, rng)) : modCount(sn, rng);
    const budget = stageThreatBudget(sn);
    const mods = [];
    let threat = 0;
    let pool = MODIFIERS.filter((m) => m.minStage <= sn && !(boss && m.notBoss) && !(m.noBiome && m.noBiome.includes(biome)));
    for (let i = 0; i < count; i++) {
      const m = weightedPick(rng, pool, (x) => {
        if (mods.includes(x.id)) return 0;
        if (mods.some((id) => (MODIFIER_BY_ID[id].conflicts || []).includes(x.id) || (x.conflicts || []).includes(id))) return 0;
        if (threat + x.threat > budget) return 0;
        let w = x.weight;
        if (prev1 && prev1.mods.includes(x.id)) w *= 0.15;
        if (prev2 && prev2.mods.includes(x.id)) w *= 0.5;
        return w;
      });
      if (!m) break;
      mods.push(m.id);
      threat += m.threat;
    }
    const structure = boss ? 'boss' : weightedPick(rng, Object.keys(STRUCTURES), (id) => {
      const s = STRUCTURES[id];
      if ((s.minStage || 1) > sn) return 0;
      return prev1 && prev1.structure === id ? 0 : s.weight;
    });
    const objective = boss ? 'boss' : weightedPick(rng, Object.keys(OBJECTIVES), (id) => {
      const o = OBJECTIVES[id];
      if ((o.minStage || 1) > sn) return 0;
      if (id !== 'clear' && prev1 && prev1.objective === id) return 0;
      if (id === 'survive' && STRUCTURES[structure] && STRUCTURES[structure].short) return 0;
      return o.weight;
    });
    const p = { n, track, biome, mods, structure, objective, boss, threat };
    const sig = signature(p);
    const clash = (q) => q && (signature(q) === sig || (q.mods[0] && q.mods[0] === mods[0]));
    best = p;
    if (!clash(prev1) && !(prev2 && signature(prev2) === sig)) break;
  }
  profileCache.set(key, best);
  return best;
}

// ---------- layout generation ----------

function baseConfig(profile, difficulty, mode) {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const c = {
    kinds: {}, hpMul: diff.hp, speedMul: diff.speed, projSpeedMul: 1, rateMul: 1, coinMul: diff.coins, countMul: 1,
    elites: diff.elites, leakExtra: 0, treasureWaves: 0, mode,
  };
  for (const id of profile.mods) MODIFIER_BY_ID[id].cfg(c);
  const biome = BIOMES[profile.biome];
  if (biome.dark) c.dark = true;
  if (biome.hazard === 'rubble') c.rubble = true;
  if (biome.hazard === 'haunt') c.kinds.ghost = (c.kinds.ghost || 0) + 1.5;
  if (biome.hazard === 'saw') c.kinds.runner = (c.kinds.runner || 0) + 0.8;
  return c;
}

export function hpBase(n) {
  return 3 * (1 + 0.19 * (n - 1)) * (n > 20 ? 1 + (n - 20) * 0.03 : 1);
}

export function stageSpeed(n) {
  return Math.min(1.9 + n * 0.06, 3.8);
}

// The kinds that may be mixed into formations, with weights.
function kindMix(cfg, n) {
  const mix = { normal: 10 };
  if (n >= 2) mix.keg = 1.2;
  if (n >= 3) mix.zigzag = 0.5;
  if (n >= 4) mix.armored = 0.4;
  if (n >= 5) mix.runner = 0.5;
  for (const [k, w] of Object.entries(cfg.kinds)) mix[k] = (mix[k] || 0) + w;
  return mix;
}

const MIX_KINDS_FOR_BIG = new Set(['keg', 'small', 'runner']);

export class Layout {
  constructor(profile, opts) {
    this.profile = profile;
    this.n = opts.stage;
    this.seed = opts.seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.cfg = baseConfig(profile, opts.difficulty || 'normal', opts.mode || 'campaign');
    this.items = [];
    this.recent = [];
    this.par = 0;
    this.barrels = 0;
    this.at = 0;
    this.speed = stageSpeed(this.n) * this.cfg.speedMul;
    this.seenEvents = opts.seenEvents || [];
    this.events = [];
    this.flags = {};
  }

  hp(progress, mul = 1) {
    const ramp = 1 + Math.pow(progress, 1.1) * (1.5 + 0.07 * Math.min(this.n, 30));
    const jitter = 0.88 + this.rng() * 0.28;
    return Math.max(2, Math.round(hpBase(this.n) * this.cfg.hpMul * ramp * jitter * mul));
  }

  push(it) {
    this.items.push(it);
    return it;
  }

  enemy(kind, x, dz, progress, hpMul = 1, extra = {}) {
    const def = ENEMIES[kind];
    const hp = this.hp(progress, def.hp * hpMul);
    this.push({ at: this.at + dz, type: 'enemy', kind, x, hp, ...extra });
    if (def.weight) this.barrels += def.weight;
    this.par += (1 + hp / 8) * (def.coins || 1) * 1.5;
    return hp;
  }

  pickKind(mix, slot, density) {
    if (slot.kind) return slot.kind;
    // Mix in special kinds at a rate that grows with the stage.
    const rate = clamp(0.18 + this.n * 0.025 + density * 0.1, 0.18, 0.6);
    if (this.rng() > rate) return 'normal';
    return weightedPick(this.rng, Object.keys(mix), (k) => (k === 'normal' ? 0 : mix[k])) || 'normal';
  }

  formation(progress, tierMax, opts = {}) {
    const ctx = { n: this.n, cfg: this.cfg, dense: opts.dense };
    const id = opts.id || pickFormation(this.rng, ctx, this.recent, tierMax);
    this.recent.push(id);
    const f = FORMATIONS[id].make(this.rng, ctx);
    const mix = kindMix(this.cfg, this.n);
    if (f.cue) this.push({ at: this.at - 6, type: 'cue', title: f.cue.title, sub: f.cue.sub });
    const used = new Set();
    for (const s of f.slots) {
      let kind = this.pickKind(mix, s, opts.density || 0);
      if (!s.fixed && kind === 'treasure') kind = 'normal';
      const x = (clamp(s.c, 0, 4) - 2) * 1.4;
      const k = `${Math.round(x * 4)}:${Math.round(s.dz * 2)}`;
      if (used.has(k)) continue;
      used.add(k);
      if (ENEMIES[kind].scale > 1.3 && !s.fixed && this.rng() < 0.6) kind = 'normal';
      if (kind === 'big' && !s.fixed) kind = 'normal';
      this.enemy(kind, x, s.dz, progress, s.hp || 1);
      if (kind === 'big' || kind === 'elite') {
        // big targets occupy more space: skip close neighbors
        for (const o of [-1, 1]) used.add(`${Math.round((x + o * 1.4) * 4)}:${Math.round(s.dz * 2)}`);
      }
      void MIX_KINDS_FOR_BIG;
    }
    this.at += f.depth + this.gap();
    return id;
  }

  gap() {
    return Math.max(4.2, 6.6 - this.n * 0.05) * (this.cfg.swarm ? 0.85 : 1) / Math.sqrt(this.cfg.countMul);
  }

  gates(progress) {
    const kinds = rngShuffle(this.rng, ['bolts', 'dmg', 'rate', 'level']);
    const a = this.flags.firstGate ? kinds[0] : 'level';
    const b = kinds.find((k) => k !== a);
    this.flags.firstGate = true;
    for (const [side, kind] of [[-1, a], [1, b]]) this.push({ at: this.at, type: 'gate', kind, side, value: gateValue(kind, this.rng, progress) });
    this.at += 7;
  }

  route() {
    this.push({ at: this.at, type: 'route' });
    this.at += 8;
  }

  event(id, extra = {}) {
    this.events.push(id);
    this.push({ at: this.at, type: 'event', id, ...extra });
  }

  // ---------- beats ----------

  beat(type, progress) {
    const r = this.rng;
    switch (type) {
      case 'intro':
        this.push({ at: this.at, type: 'cue', title: '', sub: '' });
        this.formation(progress, 0, {});
        this.formation(progress, 1, {});
        break;
      case 'build': {
        const n = rngInt(r, 2, 3);
        for (let i = 0; i < n; i++) this.formation(progress + i * 0.04, 2, { density: 0.3 });
        if (this.cfg.treasureWaves > 0) this.treasureWave(progress);
        break;
      }
      case 'relief':
        this.formation(progress * 0.8, 0, { id: r() < 0.5 ? 'kegcluster' : 'line' });
        this.gates(progress);
        break;
      case 'twist':
        this.twist(progress);
        break;
      case 'major':
        this.major(progress);
        break;
      case 'reward':
        this.reward(progress);
        break;
      case 'finale':
        this.formation(progress, 3, { density: 0.5, dense: true });
        if (this.cfg.treasureWaves > 0) this.treasureWave(progress);
        this.formation(progress + 0.05, 3, { density: 0.6, dense: true });
        break;
      default:
        this.formation(progress, 1);
    }
  }

  treasureWave(progress) {
    this.cfg.treasureWaves--;
    this.push({ at: this.at - 4, type: 'cue', title: 'TREASURE!', sub: 'Catch the gold carts', gold: true });
    const fromLeft = this.rng() < 0.5;
    for (let i = 0; i < 3; i++) {
      this.enemy('treasure', (fromLeft ? -1 : 1) * 2.8, i * 2.2, progress, 0.8, { cross: fromLeft ? 1 : -1 });
    }
    this.at += 6;
  }

  // A twist bends the rules of the stage for a moment.
  twist(progress) {
    const options = [
      { id: 'kegmountain', w: this.cfg.kegClusters ? 6 : 2 },
      { id: 'frenzy', w: 3 },
      { id: 'transform', w: this.n >= 4 ? 2 : 0 },
      { id: 'rush', w: 3 },
      { id: 'vault', w: 1.4 },
      { id: 'altar', w: this.n >= 3 ? 1.6 : 0 },
      { id: 'temptation', w: this.n >= 4 ? 2 : 0 },
    ];
    const pick = weightedPick(this.rng, options, (o) => {
      let w = o.w;
      if (this.events.includes(o.id)) w *= 0.1;
      if (!this.seenEvents.includes(o.id)) w *= 1.8; // something new, sooner
      return w;
    });
    const id = pick ? pick.id : 'rush';
    if (id === 'kegmountain') {
      this.event('kegmountain', { warn: 'KEG MOUNTAIN', sub: 'One spark sets them all off' });
      this.at += 4;
      for (let row = 0; row < 3; row++) {
        for (let c = 0; c < 5; c++) {
          const keg = (c + row) % 2 === 0 || this.rng() < 0.25;
          this.enemy(keg ? 'keg' : 'normal', (c - 2) * 1.4, row * 1.5, progress, keg ? 1.4 : 1.6);
        }
      }
      this.at += 4.5 + this.gap();
    } else if (id === 'frenzy') {
      this.event('frenzy', { warn: 'GOLDEN FRENZY', sub: 'Unlimited firepower for 7 seconds!', gold: true });
      this.at += 6;
      for (let i = 0; i < 18; i++) this.enemy(this.rng() < 0.3 ? 'gift' : 'small', (this.rng() * 4 - 2) * 1.4, i * 0.7, progress, 1.6, { gold: true });
      this.at += 14 + this.gap();
    } else if (id === 'transform') {
      const others = BIOME_IDS.filter((b) => b !== this.profile.biome && BIOMES[b].unlock <= Math.max(this.n, 4));
      const to = rngPick(this.rng, others.length ? others : BIOME_IDS);
      this.event('transform', { to, warn: 'THE LAND SHIFTS', sub: BIOMES[to].name });
      this.at += 6;
      this.formation(progress, 2, { density: 0.4 });
    } else if (id === 'rush') {
      this.event('rush', { warn: 'RUSH!', sub: 'A charge is coming. Hold firm!' });
      this.at += 3;
      for (let i = 0; i < 8; i++) this.enemy(i % 3 === 2 ? 'runner' : 'small', (rngInt(this.rng, 0, 4) - 2) * 1.4, i * 1.1, progress, 1);
      this.at += 9 + this.gap();
    } else if (id === 'vault') {
      this.event('vault', { warn: '', sub: '' });
      this.at += 2;
      this.formation(progress, 1);
    } else if (id === 'altar') {
      this.event('altar', { warn: 'BLOOD ALTAR', sub: 'Shoot it to bargain: power for a heart' });
      this.enemy('altar', (this.rng() < 0.5 ? -1 : 1) * 1.4, 0, progress, 1);
      this.at += 3;
      this.formation(progress, 1);
    } else if (id === 'temptation') {
      this.formation(progress, 2, { id: 'temptation' });
    }
  }

  // A major encounter is the peak of tension in a stage.
  major(progress) {
    const options = [
      { id: 'miniboss', w: this.cfg.ambush ? 30 : this.n >= 4 ? 2 : 0 },
      { id: 'elites', w: this.cfg.doubleElites ? 30 : this.n >= 3 ? 3 : 1 },
      { id: 'chest', w: 3 },
      { id: 'storm', w: this.n >= 3 ? 2 : 0 },
    ];
    const pick = weightedPick(this.rng, options, (o) => {
      let w = o.w;
      if (this.events.includes(o.id)) w *= 0.15;
      if (!this.seenEvents.includes(o.id)) w *= 1.6;
      return w;
    });
    const id = pick ? pick.id : 'elites';
    if (id === 'miniboss') {
      this.cfg.ambush = false;
      const boss = rngPick(this.rng, BOSS_IDS);
      this.event('miniboss', { boss, warn: 'AMBUSH!', sub: `A lesser ${BOSS_NAMES[boss].replace('The ', '')} attacks` });
      this.push({ at: this.at + 4, type: 'boss', boss, mini: true, hp: this.bossHp(progress, 0.32) });
      this.par += 60;
      this.at += 30;
    } else if (id === 'elites') {
      const two = this.cfg.doubleElites || this.cfg.elites > 0 || this.rng() < 0.3;
      this.cfg.doubleElites = false;
      this.event('elites', { warn: two ? 'DOUBLE TROUBLE' : 'ELITE INCOMING', sub: two ? 'Two elites at once!' : 'A heavy brute approaches' });
      this.at += 3;
      const xs = two ? [-1.75, 1.75] : [0];
      for (const x of xs) this.enemy('elite', x, 0, progress, 1, { captain: this.profile.objective === 'hunt' });
      for (const x of [-2.8, 0, 2.8]) if (two || x !== 0) this.enemy('small', x, 3, progress, 1.2);
      this.at += 5 + this.gap();
    } else if (id === 'chest') {
      this.event('chest', { warn: 'TREASURE CHEST', sub: 'Break it before it slips away' });
      this.at += 3;
      const side = this.rng() < 0.5 ? -1 : 1;
      this.enemy('chest', side * 1.4, 1.5, progress, 1.1);
      for (const x of [side * 2.8, 0, -side * 1.4]) this.enemy(this.rng() < 0.4 ? 'armored' : 'normal', x, 0, progress, 1);
      this.at += 4 + this.gap();
    } else if (id === 'storm') {
      this.event('storm', { warn: 'SURVIVE THE STORM', sub: 'Bombs and barrels for 12 seconds' });
      this.at += 3;
      for (let i = 0; i < 10; i++) this.enemy(i % 4 === 0 ? 'keg' : 'normal', (rngInt(this.rng, 0, 4) - 2) * 1.4, i * 1.9, progress, 0.8);
      this.at += 20 + this.gap();
    }
  }

  bossHp(progress, mul) {
    return Math.round(hpBase(this.n) * this.cfg.hpMul * (1 + progress * 1.5) * (60 + this.n * 3.5) * mul);
  }

  reward(progress) {
    const r = this.rng;
    const roll = r();
    if (roll < 0.45 || this.n < 3) {
      this.push({ at: this.at - 3, type: 'cue', title: 'UPGRADE ANVIL', sub: 'Shoot the anvil to pick an upgrade', gold: true });
      this.enemy('anvil', (rngInt(r, 1, 3) - 2) * 1.4, 0, progress, 0.7);
      this.at += 2 + this.gap();
      this.gates(progress);
    } else if (roll < 0.7) {
      this.route();
      this.enemy('anvil', 0, 0, progress, 0.8);
      this.at += 2 + this.gap();
    } else {
      this.event('jackpot', { warn: 'JACKPOT ANVIL', sub: 'Four rare upgrades. Pick one!', gold: true });
      this.enemy('anvil', 0, 2, progress, 1.1, { jackpot: true });
      this.at += 4 + this.gap();
    }
  }

  // ---------- whole stage ----------

  build() {
    const p = this.profile;
    this.at = 0;
    if (p.boss) return this.buildBoss();
    if (p.objective === 'survive') return this.buildSurvive();
    const beats = STRUCTURES[p.structure].beats;
    beats.forEach((b, i) => this.beat(b, i / Math.max(1, beats.length - 1)));
    if (p.objective === 'hunt' && !this.items.some((it) => it.captain)) {
      this.event('elites', { warn: 'CAPTAINS', sub: 'Hunt them down' });
      this.at += 3;
      this.enemy('elite', 0, 0, 1, 1, { captain: true });
      this.at += 6;
    }
    this.finish();
    return this;
  }

  buildBoss() {
    this.beat('intro', 0);
    this.beat('build', 0.25);
    this.push({ at: this.at, type: 'event', id: 'blessing', warn: 'THE BOSS APPROACHES', sub: 'Choose a blessing for the fight' });
    this.at += 6;
    this.push({ at: this.at, type: 'boss', boss: p0(this.profile.boss), hp: this.bossHp(0.5, 1) });
    this.par += 160;
    this.at += 10;
    this.finish();
    return this;
  }

  buildSurvive() {
    // A stream of formations for a fixed time. The level ends when the timer runs out.
    this.duration = 40 + Math.min(this.n, 20);
    const dist = this.duration * this.speed + 30;
    let i = 0;
    this.beat('intro', 0);
    while (this.at < dist) {
      const prog = clamp(this.at / dist, 0, 1);
      if (i === 3) this.reward(prog);
      else if (i === 5) this.twist(prog);
      else this.formation(prog, 3, { density: 0.4 + prog * 0.3 });
      i++;
    }
    this.finish();
    return this;
  }

  finish() {
    this.items.sort((a, b) => a.at - b.at);
    this.length = this.at;
    return this;
  }
}

function p0(b) {
  return b;
}

function gateValue(kind, rng, progress) {
  const base = { bolts: [1, 1], dmg: [20, 35], rate: [15, 28], level: [2, 3] }[kind];
  let v = rngInt(rng, base[0], base[1]);
  if (kind === 'dmg' || kind === 'rate') v += Math.round(progress * 10);
  return v;
}

export function genLayout(profile, opts) {
  return new Layout(profile, opts).build();
}

// ---------- Endless mode ----------

// Each wave is a fresh short stage built on its own profile with a rising effective stage number.
export function endlessProfile(wave, prev) {
  const n = 2 + Math.floor(wave * 1.6);
  const rng = mulberry32(wave * 48271 + (prev ? hashStr(prev.biome + prev.mods.join()) : 1));
  const boss = wave % 4 === 0 ? BOSS_IDS[(wave / 4 - 1) % BOSS_IDS.length] : null;
  const biome = rngPick(rng, BIOME_IDS.filter((b) => !prev || b !== prev.biome));
  const pool = MODIFIERS.filter((m) => m.minStage <= n && !(boss && m.notBoss));
  const mods = [];
  const count = Math.min(3, 1 + Math.floor(wave / 3));
  for (let i = 0; i < count; i++) {
    const m = weightedPick(rng, pool, (x) => {
      if (mods.includes(x.id) || (prev && prev.mods.includes(x.id))) return 0;
      if (mods.some((id) => (MODIFIER_BY_ID[id].conflicts || []).includes(x.id))) return 0;
      return x.weight;
    });
    if (m) mods.push(m.id);
  }
  return { n, track: 'endless', biome, mods, structure: boss ? 'boss' : rngPick(rng, ['classic', 'blitz', 'rollercoaster']), objective: boss ? 'boss' : 'clear', boss, wave };
}

// ---------- Daily challenge ----------

export function dailySetup(dateStr) {
  const seed = hashStr(`daily:${dateStr}`);
  const rng = mulberry32(seed);
  const n = 8 + rngInt(rng, 0, 6);
  const profile = { ...stageProfile(n, `daily:${dateStr}`) };
  // Daily stages always stack three modifiers and give a random weapon, locked or not.
  const extra = MODIFIERS.filter((m) => !profile.mods.includes(m.id) && !(m.conflicts || []).some((c) => profile.mods.includes(c)) && !profile.mods.some((id) => (MODIFIER_BY_ID[id].conflicts || []).includes(m.id)));
  while (profile.mods.length < 3 && extra.length) profile.mods = [...profile.mods, extra.splice(Math.floor(rng() * extra.length), 1)[0].id];
  const weapon = rngPick(rng, FAMILY_IDS);
  return { n, seed, profile, weapon };
}
