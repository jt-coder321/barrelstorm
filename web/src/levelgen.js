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
import { ENEMIES, KIND_LABEL } from './data/enemies.js';
import { DIFFICULTY } from './data/meta.js';
import { FAMILY_IDS } from './data/weapons.js';
import { ARCHETYPES, ARCHETYPE_IDS, INTRO_ORDER, LATE_DEBUT, CHALLENGE_IDS } from './data/encounters.js';

export const BOSS_IDS = ['king', 'golem', 'machine', 'siege', 'dragon'];
// Bosses differ in how much of the fight their weak points are exposed, so their health pools are tuned to
// land each fight around 30 to 60 seconds.
const BOSS_HP_MUL = { king: 1.5, golem: 1.6, machine: 1, siege: 0.35, dragon: 1.5 };
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
  return `${p.arch}|${[...p.mods].sort().join('+')}|${p.structure}`;
}

// Which archetype a stage uses. Stages 1-10 introduce one archetype each; afterwards they are picked by
// weight, never repeating either of the two previous stages. Boss stages stay on every 5th stage.
function archFor(n, track, rng, prev1, prev2) {
  if (track === 'campaign') {
    if (n <= INTRO_ORDER.length) return INTRO_ORDER[n - 1];
    if (LATE_DEBUT[n]) return LATE_DEBUT[n];
    if (n % 5 === 0) return 'boss';
  }
  const sn = track === 'campaign' ? n : Math.max(n, 12);
  const pick = weightedPick(rng, ARCHETYPE_IDS, (id) => {
    const a = ARCHETYPES[id];
    if (id === 'boss' || a.minStage > sn) return 0;
    if (prev1 && prev1.arch === id) return 0;
    if (prev2 && prev2.arch === id) return a.weight * 0.2;
    return a.weight;
  });
  return pick || 'demolition';
}

// The profile of stage n in a given "track" (campaign or a daily seed).
export function stageProfile(n, track = 'campaign') {
  const key = `${track}:${n}`;
  if (profileCache.has(key)) return profileCache.get(key);
  const prev1 = n > 1 ? stageProfile(n - 1, track) : null;
  const prev2 = n > 2 ? stageProfile(n - 2, track) : null;
  const rng = mulberry32(hashStr(key) ^ 0x9e3779b9);
  const arch = archFor(n, track, rng, prev1, prev2);
  const A = ARCHETYPES[arch];
  const boss = arch === 'boss' ? (track === 'campaign' ? bossFor(n) : rngPick(rng, BOSS_IDS)) : null;
  const biome = track === 'campaign' ? biomeFor(n, prev1 && prev1.biome) : rngPick(rng, BIOME_IDS);
  const sn = track === 'campaign' ? n : Math.max(n, 8);
  const challenge = arch === 'challenge' ? rngPick(rng, CHALLENGE_IDS) : null;

  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const count = Math.min(A.maxMods, modCount(sn, rng));
    const budget = stageThreatBudget(sn) - (arch === 'gauntlet' || arch === 'siege' ? 2 : 0);
    const mods = [];
    let threat = 0;
    const pool = MODIFIERS.filter((m) => m.minStage <= sn && !(boss && m.notBoss) && !(m.noBiome && m.noBiome.includes(biome)) && !A.banMods.includes(m.id)
      && !(challenge === 'untouchable' && (m.id === 'rain' || m.id === 'bombers')));
    for (let i = 0; i < count; i++) {
      const m = weightedPick(rng, pool, (x) => {
        if (mods.includes(x.id)) return 0;
        if (mods.some((id) => (MODIFIER_BY_ID[id].conflicts || []).includes(x.id) || (x.conflicts || []).includes(id))) return 0;
        if (threat + x.threat > Math.max(0, budget) && x.threat > 0) return 0;
        let w = x.weight;
        if (arch === 'demolition' && x.id === 'explosive') w *= 3;
        if (prev1 && prev1.mods.includes(x.id)) w *= 0.15;
        if (prev2 && prev2.mods.includes(x.id)) w *= 0.5;
        return w;
      });
      if (!m) break;
      mods.push(m.id);
      threat += m.threat;
    }
    // Ordinary clears pick one of the classic pacing structures; every other archetype brings its own script.
    const structure = arch === 'demolition' || arch === 'ambush' ? weightedPick(rng, Object.keys(STRUCTURES), (id) => {
      const s = STRUCTURES[id];
      if ((s.minStage || 1) > sn) return 0;
      if (arch === 'ambush' && id === 'ambush') return 0;
      return prev1 && prev1.structure === id ? 0 : s.weight;
    }) : arch;
    const p = { n, track, biome, mods, structure, arch, objective: A.objective, boss, threat, challenge };
    const sig = signature(p);
    best = p;
    if (!(prev1 && signature(prev1) === sig) && !(prev2 && signature(prev2) === sig)) break;
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
  const A = ARCHETYPES[profile.arch] || ARCHETYPES.demolition;
  for (const [k, w] of Object.entries(A.kinds)) c.kinds[k] = (c.kinds[k] || 0) + w;
  c.arch = A.id;
  c.leakHurts = A.leakHurts;
  c.collide = A.collide;
  if (A.id === 'demolition') c.kegClusters = true;
  if (A.id === 'gauntlet') c.hpMul *= 0.7;
  if (A.id === 'jackpot') c.coinMul *= 1.5;
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
  // 2.0 roster joins gradually so each new behaviour gets noticed.
  if (n >= 2) mix.megakeg = 0.2;
  if (n >= 2) mix.cache = 0.12;
  if (n >= 3) mix.archer = 0.35;
  if (n >= 4) mix.charger = 0.4;
  if (n >= 6) mix.healer = 0.3;
  if (n >= 8) mix.flyer = 0.3;
  for (const [k, w] of Object.entries(cfg.kinds)) mix[k] = (mix[k] || 0) + w;
  return mix;
}


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
      if (!s.fixed && (kind === 'treasure' || kind === 'tower' || kind === 'pinata')) kind = 'normal';
      if (!s.fixed && kind === 'ram' && this.rng() < 0.7) kind = 'normal';
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
      this.push({ at: this.at + 4, type: 'boss', boss, mini: true, hp: this.bossHp(progress, 0.42) });
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
    return Math.round(hpBase(this.n) * this.cfg.hpMul * (1 + progress * 1.5) * (60 + this.n * 2) * mul);
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
    const fn = {
      boss: this.buildBoss, survival: this.buildSurvive, treasure: this.buildTreasure, siege: this.buildSiege,
      gauntlet: this.buildGauntlet, elite: this.buildElite, ambush: this.buildAmbush, jackpot: this.buildJackpot,
      challenge: this.buildChallenge, demolition: this.buildDemolition,
    }[p.arch] || this.buildDemolition;
    fn.call(this);
    // Late stages scroll faster; pad distance-based encounters so they still last long enough to build up.
    if (['demolition', 'elite', 'ambush', 'challenge', 'treasure', 'gauntlet', 'siege'].includes(p.arch) && !this.duration) {
      let guard = 0;
      while (this.at / this.speed < 42 && guard++ < 12) this.formation(0.9, 3, { density: 0.5 });
    }
    this.finish();
    return this;
  }

  // Length roll: some encounters are short sprints, some are long hauls.
  lengthRoll() {
    const r = this.rng();
    return r < 0.25 ? 'short' : r > 0.8 ? 'long' : 'normal';
  }

  pickup(kind, x, extra = {}) {
    return this.push({ at: this.at, type: 'pickup', kind, x, ...extra });
  }

  // A "power moment": a glowing frenzy orb in a lane, usually flanked by something to shoot.
  powerMoment(progress) {
    this.push({ at: this.at - 3, type: 'cue', title: 'POWER ORB!', sub: 'Drive into it', gold: true });
    this.pickup('orb', (rngInt(this.rng, 0, 4) - 2) * 1.4);
    this.at += 3;
    this.formation(progress, 1, { density: 0.4 });
  }

  // ---------- Demolition: chains, kegs and powder towers ----------
  buildDemolition() {
    const len = this.lengthRoll();
    const beats = STRUCTURES[this.profile.structure] ? [...STRUCTURES[this.profile.structure].beats] : ['intro', 'build', 'twist', 'major', 'reward', 'finale'];
    if (len === 'short') beats.splice(2, 1);
    beats.forEach((b, i) => {
      const prog = i / Math.max(1, beats.length - 1);
      this.beat(b, prog);
      if (i === 1) this.formation(prog, 2, { id: this.n >= 2 ? 'towers' : 'kegcluster' });
      if (i === Math.floor(beats.length / 2)) this.powerMoment(prog);
      if (len === 'long' && i === beats.length - 2) this.formation(prog, 2, { id: 'megacrowd' });
    });
  }

  // ---------- Survival: escalate every segment until the timer ends ----------
  buildSurvive() {
    this.duration = clamp(45 + this.n * 0.8, 45, 75);
    const dist = this.duration * this.speed + 20;
    const joiners = rngShuffle(this.rng, ['runner', 'archer', 'charger', 'flyer', 'healer', 'shielder'].filter((k) => this.n >= 3 || k === 'runner'));
    const segLen = dist / 4;
    this.beat('intro', 0);
    let seg = 0;
    let i = 0;
    while (this.at < dist) {
      const prog = clamp(this.at / dist, 0, 1);
      const s = Math.min(3, Math.floor(this.at / segLen));
      if (s > seg) {
        seg = s;
        const k = joiners[(s - 1) % joiners.length];
        this.cfg.kinds[k] = (this.cfg.kinds[k] || 0) + 3;
        this.push({ at: this.at - 4, type: 'cue', title: `WAVE ${s + 1}`, sub: `${KIND_LABEL[k] || 'Runners'} join the fight` });
        if (s === 2) this.powerMoment(prog);
        if (s === 3) this.twist(prog);
      }
      if (i === 3) this.reward(prog);
      else this.formation(prog, 3, { density: 0.35 + prog * 0.4, dense: s >= 2 });
      i++;
    }
  }

  // ---------- Treasure Hunt: drive over gold while dodging ----------
  buildTreasure() {
    this.loot = 0;
    const segs = this.lengthRoll() === 'long' ? 8 : 6;
    this.beat('intro', 0);
    for (let s = 0; s < segs; s++) {
      const prog = s / segs;
      // A ribbon of gold that weaves across lanes.
      let lane = rngInt(this.rng, 0, 4);
      for (let k = 0; k < 4; k++) {
        this.pickup('gold', (lane - 2) * 1.4);
        this.loot += 1;
        this.at += 2.2;
        lane = clamp(lane + rngInt(this.rng, -1, 1), 0, 4);
      }
      if (s % 2 === 0) this.formation(prog, 2, { density: 0.3 });
      else {
        // Archers or flyers guard the gold.
        const k = this.n >= 6 && this.rng() < 0.5 ? 'flyer' : 'archer';
        for (const x of rngShuffle(this.rng, [-2.8, 0, 2.8]).slice(0, 2)) this.enemy(k, x, 0, prog, 0.8);
        this.enemy('cache', (rngInt(this.rng, 0, 4) - 2) * 1.4, 2, prog, 1);
        this.loot += 2;
        this.at += 4 + this.gap();
      }
      if (s === 2) {
        this.push({ at: this.at - 4, type: 'cue', title: 'GOLD CARTS!', sub: 'Catch them before they cross', gold: true });
        const fromLeft = this.rng() < 0.5;
        for (let i = 0; i < 3; i++) this.enemy('treasure', (fromLeft ? -1 : 1) * 2.8, i * 2.2, prog, 0.7, { cross: fromLeft ? 1 : -1 });
        this.loot += 9;
        this.at += 7;
      }
      if (s === 3) this.reward(prog);
      if (s === 4) this.powerMoment(prog);
    }
    this.lootGoal = Math.max(8, Math.round(this.loot * 0.5));
  }

  // ---------- Siege: three waves against the gate ----------
  buildSiege() {
    for (let w = 1; w <= 3; w++) {
      const prog = (w - 1) / 3;
      this.push({ at: this.at, type: 'cue', title: `WAVE ${w} OF 3`, sub: w === 3 ? 'The final assault!' : 'Protect the gate', wave: w });
      this.at += 4;
      const n = 2 + w;
      for (let i = 0; i < n; i++) {
        this.formation(prog + i * 0.04, w + 1, { density: 0.3 + w * 0.15 });
        if (i === 1 || (w === 3 && i === 3)) {
          this.push({ at: this.at - 3, type: 'cue', title: 'BATTERING RAM', sub: 'Stop it before it hits the gate' });
          this.enemy('ram', (rngInt(this.rng, 0, 4) - 2) * 1.4, 0, prog, 1);
          this.at += 3 + this.gap();
        }
      }
      if (w === 1) {
        this.at += 4;
        this.reward(prog);
      } else if (w === 2) {
        this.at += 4;
        this.powerMoment(prog);
        this.pickup('heart', (rngInt(this.rng, 0, 4) - 2) * 1.4);
        this.at += 4;
      }
    }
  }

  // ---------- Gauntlet: reach the end; obstacles hit the cart ----------
  buildGauntlet() {
    const segs = this.lengthRoll() === 'short' ? 6 : 8;
    this.beat('intro', 0);
    for (let s = 0; s < segs; s++) {
      const prog = s / segs;
      const kind = s % 4;
      if (kind === 0) this.formation(prog, 3, { id: 'wallgap' });
      else if (kind === 1) {
        this.push({ at: this.at - 3, type: 'cue', title: 'RAMS!', sub: 'Dodge or smash them' });
        const lanes = rngShuffle(this.rng, [0, 1, 2, 3, 4]).slice(0, 2 + (s > 3 ? 1 : 0));
        lanes.forEach((l, i) => this.enemy('ram', (l - 2) * 1.4, i * 3, prog, 0.6));
        this.at += 8 + this.gap();
      } else if (kind === 2) {
        this.push({ at: this.at, type: 'hazard', id: 'sawwave' });
        this.at += 10;
        for (let i = 0; i < 4; i++) this.enemy('charger', (rngInt(this.rng, 0, 4) - 2) * 1.4, i * 2.5, prog, 0.7);
        this.at += 10 + this.gap();
      } else {
        for (const x of [-2.8, 2.8]) this.enemy('archer', x, 0, prog, 0.8);
        this.formation(prog, 2, { id: 'columns' });
      }
      if (s === 2) this.powerMoment(prog);
      if (s === 4) this.pickup('heart', 0);
      if (s === 5) this.reward(prog);
    }
    this.formation(1, 3, { id: 'fortress' });
  }

  // ---------- Elite Hunt: three captains, each with a different guard ----------
  buildElite() {
    this.beat('intro', 0);
    const guards = rngShuffle(this.rng, ['healer', 'shielder', 'archer', 'charger']);
    for (let c = 0; c < 3; c++) {
      const prog = 0.2 + c * 0.3;
      this.formation(prog, 2, { density: 0.3 });
      const g = guards[c];
      this.push({ at: this.at, type: 'cue', title: `CAPTAIN ${c + 1} OF 3`, sub: `Guarded by ${(KIND_LABEL[g] || g).toLowerCase()}s` });
      this.at += 4;
      const x = (rngInt(this.rng, 1, 3) - 2) * 1.4;
      this.enemy('elite', x, 1.5, prog, c === 2 ? 1.25 : 0.9, { captain: true });
      for (const dx of [-1.4, 1.4]) if (Math.abs(x + dx) <= 2.8) this.enemy(g, x + dx, 0, prog, 1);
      this.enemy(g, clamp(-x, -2.8, 2.8), 3, prog, 1);
      this.at += 5 + this.gap();
      if (c === 0) this.reward(prog);
      if (c === 1) this.powerMoment(prog);
    }
  }

  // ---------- Ambush: a calm supply run that turns violent ----------
  buildAmbush() {
    this.beat('intro', 0);
    // Calm: gifts, gold and an anvil. Nothing seems wrong.
    for (let i = 0; i < 3; i++) this.pickup('gold', (rngInt(this.rng, 0, 4) - 2) * 1.4), (this.at += 2.5);
    this.enemy('gift', 0, 0, 0.1, 1);
    this.at += 3 + this.gap();
    this.reward(0.2);
    // Then: the ambush. Enemies drop in from the sky where red circles glow, chargers hit the flanks.
    this.event('ambush', { warn: 'AMBUSH!', sub: 'They were waiting for you' });
    this.at += 2;
    const drops = 6 + Math.min(4, Math.floor(this.n / 6));
    for (let i = 0; i < drops; i++) {
      const kind = weightedPick(this.rng, ['normal', 'armored', 'archer', 'keg', 'healer'], (k) => ({ normal: 4, armored: this.n >= 4 ? 2 : 0, archer: 2, keg: 1.5, healer: this.n >= 6 ? 1 : 0 })[k]);
      this.push({ at: this.at + i * 0.9, type: 'drop', kind, x: (rngInt(this.rng, 0, 4) - 2) * 1.4, z: -12 - this.rng() * 8, hp: this.hp(0.5, ENEMIES[kind].hp) });
      if (ENEMIES[kind].weight) this.barrels += ENEMIES[kind].weight;
    }
    this.at += drops * 0.9 + 4;
    for (let i = 0; i < 4; i++) this.enemy('charger', i % 2 ? 2.8 : -2.8, i * 1.6, 0.5, 1);
    this.at += 6 + this.gap();
    this.powerMoment(0.55);
    if (this.n >= 7) this.major(0.7);
    else this.formation(0.7, 3, { dense: true, density: 0.5 });
    this.beat('finale', 0.9);
  }

  // ---------- Jackpot: 45 seconds of gold ----------
  buildJackpot() {
    this.duration = 45;
    const dist = this.duration * this.speed + 10;
    this.push({ at: 0, type: 'pickup', kind: 'orb', x: 0, frenzy: 'gold' });
    this.at += 6;
    let i = 0;
    while (this.at < dist) {
      const prog = clamp(this.at / dist, 0, 1);
      const r = i % 4;
      if (r === 0) {
        this.enemy('pinata', (rngInt(this.rng, 1, 3) - 2) * 1.4, 0, prog, 1);
        this.at += 3;
      } else if (r === 1) {
        for (let k = 0; k < 6; k++) this.enemy(this.rng() < 0.3 ? 'gift' : 'small', (this.rng() * 4 - 2) * 1.4, k * 0.8, prog, 1.2, { gold: true });
        this.at += 6;
      } else if (r === 2) {
        this.formation(prog, 2, { id: 'megacrowd' });
      } else {
        const fromLeft = this.rng() < 0.5;
        for (let k = 0; k < 3; k++) this.enemy('treasure', (fromLeft ? -1 : 1) * 2.8, k * 2, prog, 0.7, { cross: fromLeft ? 1 : -1 });
        if (this.n >= 10) this.enemy('flyer', 0, 2, prog, 0.8);
        this.at += 6;
      }
      if (i === 5) this.powerMoment(prog);
      this.at += this.gap() * 0.7;
      i++;
    }
  }

  // ---------- Challenge: one rule ----------
  buildChallenge() {
    const c = this.profile.challenge;
    if (c === 'chainmaster') {
      this.duration = 75;
      this.chainGoal = 8;
      const dist = this.duration * this.speed + 10;
      this.cfg.kinds.keg = (this.cfg.kinds.keg || 0) + 6;
      this.cfg.kinds.megakeg = (this.cfg.kinds.megakeg || 0) + 1;
      let i = 0;
      while (this.at < dist) {
        const prog = clamp(this.at / dist, 0, 1);
        this.formation(prog, 2, { id: ['kegcluster', 'megacrowd', 'towers', 'wedge'][i % 4] });
        i++;
      }
      return;
    }
    if (c === 'marked') {
      this.marked = 0;
      const beats = ['intro', 'build', 'build', 'major', 'reward', 'finale'];
      beats.forEach((b, i) => {
        const before = this.items.length;
        this.beat(b, i / (beats.length - 1));
        // Mark two ordinary targets from each beat.
        const cand = this.items.slice(before).filter((it) => it.type === 'enemy' && ENEMIES[it.kind].leak > 0 && !it.captain);
        for (const it of rngShuffle(this.rng, cand).slice(0, 2)) {
          it.marked = true;
          this.marked++;
        }
      });
      return;
    }
    if (c === 'powderonly') {
      this.cfg.kinds.armored = (this.cfg.kinds.armored || 0) + 6;
      this.cfg.kinds.keg = (this.cfg.kinds.keg || 0) + 5;
      const beats = ['intro', 'build', 'twist', 'build', 'reward', 'finale'];
      beats.forEach((b, i) => {
        this.beat(b, i / (beats.length - 1));
        this.formation(i / beats.length, 2, { id: 'kegcluster' });
      });
      return;
    }
    // untouchable
    const beats = ['intro', 'build', 'relief', 'twist', 'reward', 'build', 'finale'];
    beats.forEach((b, i) => this.beat(b, i / (beats.length - 1)));
  }

  buildBoss() {
    this.beat('intro', 0);
    this.beat('build', 0.25);
    this.push({ at: this.at, type: 'event', id: 'blessing', warn: 'THE BOSS APPROACHES', sub: 'Choose a blessing for the fight' });
    this.at += 6;
    this.push({ at: this.at, type: 'boss', boss: this.profile.boss, hp: this.bossHp(0.5, 3.6 * (BOSS_HP_MUL[this.profile.boss] || 1)) });
    this.par += 160;
    this.at += 10;
  }

  finish() {
    if (this.profile.objective === 'hunt' && !this.items.some((it) => it.captain)) {
      this.enemy('elite', 0, 0, 1, 1, { captain: true });
      this.at += 6;
    }
    this.items.sort((a, b) => a.at - b.at);
    this.length = this.at;
    return this;
  }
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
export function endlessProfile(wave, prev, chosen) {
  const n = 2 + Math.floor(wave * 1.6);
  const rng = mulberry32(wave * 48271 + (prev ? hashStr(prev.biome + prev.mods.join()) : 1));
  const boss = wave % 4 === 0 ? BOSS_IDS[(wave / 4 - 1) % BOSS_IDS.length] : null;
  const arch = boss ? 'boss' : chosen && chosen !== 'boss' ? chosen : wave === 1 ? 'demolition'
    : weightedPick(rng, ARCHETYPE_IDS, (id) => (id === 'boss' || id === 'challenge' || (prev && prev.arch === id) ? 0 : ARCHETYPES[id].weight));
  const A = ARCHETYPES[arch];
  const biome = rngPick(rng, BIOME_IDS.filter((b) => !prev || b !== prev.biome));
  const pool = MODIFIERS.filter((m) => m.minStage <= n && !(boss && m.notBoss) && !A.banMods.includes(m.id));
  const mods = [];
  const count = Math.min(A.maxMods, 3, 1 + Math.floor(wave / 3));
  for (let i = 0; i < count; i++) {
    const m = weightedPick(rng, pool, (x) => {
      if (mods.includes(x.id) || (prev && prev.mods.includes(x.id))) return 0;
      if (mods.some((id) => (MODIFIER_BY_ID[id].conflicts || []).includes(x.id))) return 0;
      return x.weight;
    });
    if (m) mods.push(m.id);
  }
  const structure = arch === 'demolition' || arch === 'ambush' ? rngPick(rng, ['classic', 'blitz', 'rollercoaster']) : arch;
  return { n, track: 'endless', biome, mods, structure, arch, objective: A.objective, boss, wave, challenge: null };
}

// ---------- Daily challenge ----------

export function dailySetup(dateStr) {
  const seed = hashStr(`daily:${dateStr}`);
  const rng = mulberry32(seed);
  const n = 8 + rngInt(rng, 0, 6);
  const profile = { ...stageProfile(n, `daily:${dateStr}`) };
  // Daily stages always stack three modifiers and give a random weapon, locked or not.
  const A = ARCHETYPES[profile.arch] || ARCHETYPES.demolition;
  const extra = MODIFIERS.filter((m) => !profile.mods.includes(m.id) && !A.banMods.includes(m.id) && !(profile.boss && m.notBoss) && !(m.conflicts || []).some((c) => profile.mods.includes(c)) && !profile.mods.some((id) => (MODIFIER_BY_ID[id].conflicts || []).includes(m.id)));
  const target = Math.min(3, A.maxMods + 1);
  while (profile.mods.length < target && extra.length) profile.mods = [...profile.mods, extra.splice(Math.floor(rng() * extra.length), 1)[0].id];
  const weapon = rngPick(rng, FAMILY_IDS);
  return { n, seed, profile, weapon };
}
