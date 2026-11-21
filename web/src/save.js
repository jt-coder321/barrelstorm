const KEY = 'barrelstorm.save.v1';

const DEFAULTS = {
  coins: 0,
  unlocked: 1, // highest stage the player may start
  stage: 1, // stage selected in the menu
  totalKills: 0,
  bestTier: 0,
  forge: { damage: 0, rate: 0, bolts: 0, hearts: 0, coin: 0, start: 0, luck: 0, reroll: 0 },
  settings: { sound: true, haptics: true, quality: true, autoUpdate: true },
  lastUpdateCheck: 0,
  // Added in the gameplay overhaul (older saves get these defaults merged in).
  version: 2,
  weapons: { unlocked: ['cannon', 'gatling', 'crossbow'], blueprints: {}, mastery: {} },
  loadout: { weapon: 'cannon', ability: 'bomb', relic: '' },
  relics: [],
  difficulty: 'normal',
  ranks: {}, // stage -> { rank, stars, score }
  achievements: {}, // id -> true once claimed
  stats: {},
  seenEvents: [],
  synergiesSeen: [],
  bossesBeaten: [],
  daily: { date: '', best: 0, done: false },
  endless: { bestWave: 0, bestScore: 0 },
};

// Keys whose value is a free-form map (any keys allowed), merged as a whole instead of key by key.
const MAPS = new Set(['blueprints', 'mastery', 'ranks', 'achievements', 'stats']);

function merge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!extra || typeof extra !== 'object') return out;
  for (const k of Object.keys(base)) {
    if (!(k in extra)) continue;
    const b = base[k];
    const e = extra[k];
    if (MAPS.has(k)) {
      if (e && typeof e === 'object' && !Array.isArray(e)) out[k] = { ...e };
    } else if (Array.isArray(b)) {
      if (Array.isArray(e)) out[k] = [...e];
    } else if (b && typeof b === 'object') out[k] = merge(b, e);
    else if (typeof e === typeof b) out[k] = e;
  }
  return out;
}

function readRaw() {
  try {
    const b = window.AndroidBridge;
    if (b && b.loadSave) {
      const v = b.loadSave();
      if (v) return v;
    }
  } catch (e) { /* fall through */ }
  try {
    return localStorage.getItem(KEY);
  } catch (e) {
    return null;
  }
}

function fresh() {
  return merge(DEFAULTS, JSON.parse(JSON.stringify(DEFAULTS)));
}

// Saves from before the overhaul (no `version`) keep coins, stages and forge levels. Their old weapon
// tier progress turns into weapon unlocks so nobody starts over.
function migrate(save, raw) {
  if (!raw || raw.version >= 2) return save;
  const extra = { 3: 'lightning', 4: 'rocket', 5: 'mortar' };
  for (const [tier, fid] of Object.entries(extra)) {
    if ((raw.bestTier || 0) >= Number(tier) && !save.weapons.unlocked.includes(fid)) save.weapons.unlocked.push(fid);
  }
  save.stats.totalKills = raw.totalKills || 0;
  save.stats.cleared = Math.max(0, (raw.unlocked || 1) - 1);
  save.version = 2;
  return save;
}

export function loadSave() {
  try {
    const raw = readRaw();
    if (raw) {
      const parsed = JSON.parse(raw);
      return migrate(merge(fresh(), parsed), parsed);
    }
  } catch (e) {
    /* storage unavailable, use defaults */
  }
  return fresh();
}

export function writeSave(save) {
  const json = JSON.stringify(save);
  try {
    localStorage.setItem(KEY, json);
  } catch (e) {
    /* ignore */
  }
  try {
    if (window.AndroidBridge && window.AndroidBridge.saveData) window.AndroidBridge.saveData(json);
  } catch (e) {
    /* ignore */
  }
}

export function resetSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    /* ignore */
  }
  try {
    if (window.AndroidBridge && window.AndroidBridge.saveData) window.AndroidBridge.saveData('');
  } catch (e) {
    /* ignore */
  }
  return fresh();
}
