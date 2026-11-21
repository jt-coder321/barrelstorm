import { mulberry32 } from './util.js';

// Playfield geometry (world units). The player sits at z = 0 and barrels roll toward +z.
export const FIELD = {
  playerZ: 0,
  spawnZ: -46,
  leakZ: 1.4,
  colSpacing: 1.4,
  cols: 5,
  playerMaxX: 3.05,
};

export const colX = (c) => (c - (FIELD.cols - 1) / 2) * FIELD.colSpacing;

// Weapon tiers. A tier unlocks when the weapon reaches `minLevel`.
export const TIERS = [
  { name: 'Sling', minLevel: 1, rate: 1.0, bolts: 0, pierce: 0, splash: 0, speed: 30, size: [0.2, 0.2, 0.2], color: 0xcfc8b6, icon: '\u{1FAA8}' },
  { name: 'Short Bow', minLevel: 4, rate: 1.25, bolts: 0, pierce: 0, splash: 0, speed: 36, size: [0.07, 0.07, 0.7], color: 0xf1e3b0, icon: '\u{1F3F9}' },
  { name: 'Crossbow', minLevel: 8, rate: 1.45, bolts: 1, pierce: 0, splash: 0, speed: 40, size: [0.09, 0.09, 0.8], color: 0xffe066, icon: '\u{1F3AF}' },
  { name: 'Repeater', minLevel: 13, rate: 2.2, bolts: 1, pierce: 1, splash: 0, speed: 44, size: [0.1, 0.1, 0.9], color: 0xffa94d, icon: '⚡' },
  { name: 'Ballista', minLevel: 19, rate: 2.3, bolts: 2, pierce: 2, splash: 0, speed: 48, size: [0.14, 0.14, 1.3], color: 0x7fd4ff, icon: '\u{1F531}' },
  { name: 'Dragon Cannon', minLevel: 26, rate: 2.8, bolts: 3, pierce: 3, splash: 1.7, speed: 46, size: [0.3, 0.3, 0.55], color: 0xff6a2a, icon: '\u{1F409}' },
];

export const BASE_RATE = 3.0;
export const BASE_DAMAGE = 2.0;
export const MAX_BOLTS = 8;
export const MAX_RATE = 16;

export function tierForLevel(level) {
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (level >= TIERS[i].minLevel) t = i;
  return t;
}

export function xpNeeded(level) {
  return 4 + level * 1.5;
}

// Permanent upgrades bought with coins in the Forge.
export const FORGE = [
  { id: 'damage', icon: '⚔', name: 'Sharpened Tips', desc: '+12% damage per level', max: 20, cost: (l) => Math.round(40 * Math.pow(1.36, l)) },
  { id: 'rate', icon: '\u{1F4A8}', name: 'Quick Hands', desc: '+8% fire rate per level', max: 20, cost: (l) => Math.round(45 * Math.pow(1.36, l)) },
  { id: 'bolts', icon: '\u{1F3AF}', name: 'Twin Shot', desc: '+1 projectile from the start', max: 2, cost: (l) => Math.round(700 * Math.pow(3.2, l)) },
  { id: 'hearts', icon: '❤', name: 'Castle Walls', desc: '+1 heart', max: 4, cost: (l) => Math.round(160 * Math.pow(2.1, l)) },
  { id: 'coin', icon: '\u{1FA99}', name: 'Tax Collector', desc: '+10% coins per level', max: 15, cost: (l) => Math.round(60 * Math.pow(1.4, l)) },
  { id: 'start', icon: '\u{1F6E1}', name: 'Veteran Gear', desc: 'Start stages +1 weapon level', max: 12, cost: (l) => Math.round(90 * Math.pow(1.5, l)) },
];

export const BASE_HEARTS = 3;

// Gate kinds (collected by driving through them, charged by shooting them).
export const GATE_KINDS = {
  bolts: { label: (v) => `+${v} BOLT${v > 1 ? 'S' : ''}`, color: 0x3d8bff, base: [1, 1], step: 14, inc: 1, max: 3 },
  dmg: { label: (v) => `DAMAGE +${v}%`, color: 0xe5483f, base: [20, 30], step: 3, inc: 2, max: 90 },
  rate: { label: (v) => `SPEED +${v}%`, color: 0x35b86a, base: [15, 25], step: 3, inc: 2, max: 70 },
  level: { label: (v) => `LEVEL +${v}`, color: 0xf2b134, base: [2, 3], step: 10, inc: 1, max: 7 },
};

// ---------- Stage generation ----------

export function stageSpeed(n) {
  return Math.min(1.9 + n * 0.07, 4.2);
}

export function genStage(n) {
  const rng = mulberry32(n * 104729 + 17);
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const boss = n % 5 === 0;
  const speed = stageSpeed(n);
  const rows = Math.min(10 + Math.floor(n * 0.8), 26);
  const spacing = Math.max(5.2, 7.4 - n * 0.05);
  const hpBase = 3 * (1 + 0.25 * (n - 1));
  const items = [];
  let barrels = 0;

  const rowHp = (i, mul = 1) => {
    const ramp = 1 + 0.2 * i;
    const jitter = 0.85 + rng() * 0.35;
    return Math.max(2, Math.round(hpBase * ramp * jitter * mul));
  };

  const freeCols = () => [0, 1, 2, 3, 4];
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const kindsPool = ['bolts', 'dmg', 'rate', 'level'];
  let gateCount = 0;

  for (let i = 0; i < rows; i++) {
    const at = i * spacing;
    const last = i === rows - 1;

    // Gate rows: two choices side by side.
    if (!last && i >= 2 && i % 4 === 2) {
      const pool = shuffle([...kindsPool]);
      // Make sure the first gate row offers something simple to understand.
      const a = gateCount === 0 ? 'level' : pool[0];
      const b = a === pool[1] ? pool[2] : pool[1];
      for (const [side, kind] of [[-1, a], [1, b]]) {
        const def = GATE_KINDS[kind];
        const base = ri(def.base[0], def.base[1]);
        items.push({ at, type: 'gate', kind, side, value: base });
      }
      gateCount++;
      continue;
    }

    if (last && boss) {
      items.push({ at: at + 6, type: 'barrel', kind: 'boss', col: 2, hp: Math.round(hpBase * (1 + 0.2 * i) * (9 + n * 0.6)) });
      continue;
    }

    const cols = shuffle(freeCols());
    const roll = rng();

    // Spike log obstacles (stage 3+): block two columns.
    if (n >= 3 && roll < 0.2 && !last) {
      const c0 = ri(0, 3);
      items.push({ at, type: 'spikes', col: c0 + 0.5, width: 2 });
      const rest = [0, 1, 2, 3, 4].filter((c) => c !== c0 && c !== c0 + 1);
      shuffle(rest);
      const cnt = Math.min(rest.length, ri(1, 2));
      for (let k = 0; k < cnt; k++) {
        items.push({ at: at + 1.5, type: 'barrel', kind: 'normal', col: rest[k], hp: rowHp(i) });
        barrels++;
      }
      continue;
    }

    // Powder keg: explodes and hurts neighbors.
    if (n >= 2 && roll >= 0.2 && roll < 0.34) {
      const c = cols[0];
      items.push({ at, type: 'barrel', kind: 'powder', col: c, hp: Math.round(rowHp(i, 0.8)) });
      barrels++;
      for (let k = 1; k <= 2; k++) {
        items.push({ at, type: 'barrel', kind: 'normal', col: cols[k], hp: rowHp(i) });
        barrels++;
      }
      continue;
    }

    // Golden gift barrel: drops weapon levels.
    if (roll >= 0.34 && roll < 0.44 && i >= 1) {
      items.push({ at, type: 'barrel', kind: 'gift', col: cols[0], hp: rowHp(i, 1.1) });
      barrels++;
      for (let k = 1; k <= 2; k++) {
        items.push({ at, type: 'barrel', kind: 'normal', col: cols[k], hp: rowHp(i) });
        barrels++;
      }
      continue;
    }

    // Big barrel (stage 4+): two columns wide.
    if (n >= 4 && roll >= 0.44 && roll < 0.58) {
      const c0 = ri(0, 3);
      items.push({ at, type: 'barrel', kind: 'big', col: c0 + 0.5, hp: rowHp(i, 2.6) });
      barrels++;
      const rest = [0, 1, 2, 3, 4].filter((c) => c !== c0 && c !== c0 + 1);
      shuffle(rest);
      items.push({ at: at + 1, type: 'barrel', kind: 'normal', col: rest[0], hp: rowHp(i) });
      barrels++;
      continue;
    }

    // Plain row.
    const maxCnt = Math.min(5, 2 + Math.floor(n / 3));
    const cnt = last ? Math.min(5, maxCnt + 1) : ri(2, maxCnt);
    for (let k = 0; k < cnt; k++) {
      items.push({ at: at + (k % 2) * 1.2, type: 'barrel', kind: 'normal', col: cols[k], hp: rowHp(i, last ? 1.25 : 1) });
      barrels++;
    }
  }

  return { n, boss, speed, items, barrels, rows, length: rows * spacing };
}

export function stageReward(n, boss) {
  return Math.round(30 + n * 14 + (boss ? 120 + n * 10 : 0));
}
