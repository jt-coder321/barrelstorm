// Formation library. Each formation returns slots { c: column 0..4 (fractional ok), dz: depth offset,
// kind?: forced kind, hp?: health multiplier, fixed?: kind must not be replaced } plus its total depth.
// Formations are picked by weight with a recency penalty so the same shape rarely repeats back to back.
import { rngInt, rngPick, rngShuffle } from '../util.js';

const ALL = [0, 1, 2, 3, 4];

export const FORMATIONS = {
  line: {
    weight: 6, minStage: 1, tier: 0,
    make(rng, ctx) {
      const cnt = Math.min(5, rngInt(rng, 2, 2 + Math.floor(ctx.n / 3)) + (ctx.dense ? 1 : 0));
      const cols = rngShuffle(rng, [...ALL]).slice(0, cnt);
      return { slots: cols.map((c, i) => ({ c, dz: (i % 2) * 1.0 })), depth: 2 };
    },
  },
  wedge: {
    weight: 5, minStage: 1, tier: 1,
    make(rng) {
      const flip = rng() < 0.3;
      const d = [2, 1, 0, 1, 2].map((v) => (flip ? 2 - v : v));
      return { slots: ALL.map((c) => ({ c, dz: d[c] * 1.6 })), depth: 4 };
    },
  },
  columns: {
    weight: 5, minStage: 2, tier: 1, tags: ['pierceable'],
    make(rng) {
      const a = rngInt(rng, 0, 1);
      const b = rngInt(rng, 3, 4);
      const depth = rngInt(rng, 3, 4);
      const slots = [];
      for (let i = 0; i < depth; i++) for (const c of [a, b]) slots.push({ c, dz: i * 1.5, hp: 0.8 });
      return { slots, depth: depth * 1.5 };
    },
  },
  checker: {
    weight: 4, minStage: 2, tier: 1,
    make() {
      const slots = [];
      for (let r = 0; r < 3; r++) for (const c of ALL) if ((c + r) % 2 === 0) slots.push({ c, dz: r * 1.6, hp: 0.75 });
      return { slots, depth: 4.8 };
    },
  },
  wallgap: {
    weight: 4, minStage: 3, tier: 2,
    make(rng) {
      const gap = rngInt(rng, 0, 4);
      const slots = ALL.filter((c) => c !== gap).map((c) => ({ c, dz: 0, hp: 1.1 }));
      slots.push({ c: gap, dz: 2.2, kind: rng() < 0.5 ? 'keg' : 'gift', fixed: true });
      return { slots, depth: 3 };
    },
  },
  diamond: {
    weight: 4, minStage: 2, tier: 1,
    make(rng) {
      const cx = rngInt(rng, 1, 3);
      const core = rng() < 0.55 ? 'keg' : 'gift';
      return {
        slots: [
          { c: cx, dz: 0 }, { c: cx - 1, dz: 1.5 }, { c: cx + 1, dz: 1.5 }, { c: cx, dz: 1.5, kind: core, fixed: true }, { c: cx, dz: 3 },
        ],
        depth: 3.5,
      };
    },
  },
  snake: {
    weight: 4, minStage: 2, tier: 1,
    make(rng) {
      const len = rngInt(rng, 6, 9);
      let c = rngInt(rng, 0, 4);
      let dir = c < 2 ? 1 : -1;
      const slots = [];
      for (let i = 0; i < len; i++) {
        slots.push({ c, dz: i * 1.25, hp: 0.6 });
        if (c + dir < 0 || c + dir > 4) dir = -dir;
        c += dir;
      }
      return { slots, depth: len * 1.25 };
    },
  },
  kegcluster: {
    weight: 4, minStage: 1, tier: 0, tags: ['chain'],
    make(rng) {
      const cx = rngInt(rng, 1, 3);
      const slots = [];
      for (const dc of [-1, 0, 1]) for (const dz of [0, 1.4]) {
        const isKeg = (dc === 0 && dz === 0) || rng() < 0.3;
        slots.push({ c: cx + dc, dz, kind: isKeg ? 'keg' : undefined, fixed: isKeg, hp: 1.2 });
      }
      return { slots, depth: 3 };
    },
  },
  shieldblock: {
    weight: 4, minStage: 4, tier: 2, needs: 'shieldFormations',
    make(rng) {
      const cx = rngInt(rng, 1, 3);
      return {
        slots: [
          { c: cx, dz: 1.2, kind: 'shielder', fixed: true }, { c: cx - 1, dz: 0.4, hp: 1.3 }, { c: cx + 1, dz: 0.4, hp: 1.3 },
          { c: cx, dz: 0, hp: 1.3 }, { c: cx - 1, dz: 2.2 }, { c: cx + 1, dz: 2.2 },
        ],
        depth: 3.4,
      };
    },
  },
  pincer: {
    weight: 4, minStage: 3, tier: 1,
    make() {
      const slots = [];
      for (let i = 0; i < 3; i++) slots.push({ c: 0, dz: i * 1.3 }, { c: 4, dz: i * 1.3 }, { c: i === 1 ? 2 : 2, dz: 4.5, kind: i === 1 ? 'gift' : undefined, fixed: i === 1 });
      return { slots: slots.filter((s, i, a) => a.findIndex((o) => o.c === s.c && o.dz === s.dz) === i), depth: 5 };
    },
  },
  escort: {
    weight: 3, minStage: 4, tier: 2,
    make(rng) {
      const cx = rngInt(rng, 1, 3);
      const slots = [{ c: cx, dz: 1.2, kind: 'big', fixed: true }];
      for (const dc of [-1.4, 1.4]) slots.push({ c: cx + dc, dz: 0, kind: 'small', hp: 1 }, { c: cx + dc, dz: 2.4, kind: 'small', hp: 1 });
      return { slots: slots.filter((s) => s.c >= -0.2 && s.c <= 4.2), depth: 3.5 };
    },
  },
  swarmburst: {
    weight: 3, minStage: 2, tier: 1, needs: 'swarm',
    make(rng) {
      const slots = [];
      const n = rngInt(rng, 9, 14);
      for (let i = 0; i < n; i++) slots.push({ c: rng() * 4, dz: rng() * 5, kind: 'small', hp: 0.9 });
      return { slots, depth: 5.5 };
    },
  },
  stagger: {
    weight: 4, minStage: 1, tier: 0,
    make(rng) {
      const rev = rng() < 0.5;
      return { slots: ALL.map((c) => ({ c: rev ? 4 - c : c, dz: c * 1.3 })), depth: 6.5 };
    },
  },
  fortress: {
    weight: 3, minStage: 5, tier: 2,
    make(rng) {
      const gap = rngInt(rng, 0, 4);
      const slots = [];
      for (const c of ALL) if (c !== gap) slots.push({ c, dz: 0, kind: 'wall', fixed: true, hp: 1 });
      for (const c of ALL) slots.push({ c, dz: 2.2, kind: c === gap ? undefined : rng() < 0.4 ? 'keg' : undefined, fixed: c !== gap });
      return { slots, depth: 3 };
    },
  },
  temptation: {
    weight: 3, minStage: 4, tier: 2,
    make(rng) {
      const left = rng() < 0.5;
      const danger = rng() < 0.5 ? 'bomber' : 'elite';
      return {
        slots: [
          { c: left ? 0 : 4, dz: 0, kind: 'treasure', fixed: true },
          { c: left ? 3.5 : 0.5, dz: 0.5, kind: danger, fixed: true },
          { c: 2, dz: 2.5 },
        ],
        depth: 3,
        cue: { title: 'CHOOSE!', sub: 'Gold cart or the threat?' },
      };
    },
  },
  ring: {
    weight: 3, minStage: 3, tier: 2,
    make(rng) {
      const cx = 2;
      const slots = [{ c: cx, dz: 1.6, kind: rng() < 0.5 ? 'gift' : 'keg', fixed: true }];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        slots.push({ c: cx + Math.cos(a) * 1.6, dz: 1.6 + Math.sin(a) * 1.6, hp: 0.9 });
      }
      return { slots, depth: 3.6 };
    },
  },
  gauntlet: {
    weight: 3, minStage: 5, tier: 3,
    make(rng) {
      const slots = [];
      for (let r = 0; r < 4; r++) {
        const gap = (r * 2 + rngInt(rng, 0, 1)) % 5;
        for (const c of ALL) if (c !== gap) slots.push({ c, dz: r * 2.2, hp: 0.7 });
      }
      return { slots, depth: 9 };
    },
  },
};

export const FORMATION_IDS = Object.keys(FORMATIONS);

export function pickFormation(rng, ctx, recent, tierMax) {
  const ids = FORMATION_IDS.filter((id) => {
    const f = FORMATIONS[id];
    if (f.minStage > ctx.n) return false;
    if (f.tier > tierMax) return false;
    if (f.needs && !ctx.cfg[f.needs]) return false;
    return true;
  });
  let best = null;
  let total = 0;
  const ws = ids.map((id) => {
    const f = FORMATIONS[id];
    let w = f.weight;
    const k = recent.lastIndexOf(id);
    if (k >= 0) w *= recent.length - k <= 2 ? 0.05 : 0.4;
    if (f.needs) w *= 2.2;
    if (f.tags && f.tags.includes('chain') && ctx.cfg.kegClusters) w *= 2.5;
    total += w;
    return w;
  });
  let r = rng() * total;
  for (let i = 0; i < ids.length; i++) {
    r -= ws[i];
    if (r <= 0) {
      best = ids[i];
      break;
    }
  }
  return best || rngPick(rng, ids);
}
