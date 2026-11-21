const KEY = 'barrelstorm.save.v1';

const DEFAULTS = {
  coins: 0,
  unlocked: 1, // highest stage the player may start
  stage: 1, // stage selected in the menu
  totalKills: 0,
  bestTier: 0,
  forge: { damage: 0, rate: 0, bolts: 0, hearts: 0, coin: 0, start: 0 },
  settings: { sound: true, haptics: true, quality: true, autoUpdate: true },
  lastUpdateCheck: 0,
};

function merge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!extra || typeof extra !== 'object') return out;
  for (const k of Object.keys(base)) {
    if (!(k in extra)) continue;
    const b = base[k];
    const e = extra[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = merge(b, e);
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

export function loadSave() {
  try {
    const raw = readRaw();
    if (raw) return merge(DEFAULTS, JSON.parse(raw));
  } catch (e) {
    /* storage unavailable, use defaults */
  }
  return merge(DEFAULTS, null);
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
  return merge(DEFAULTS, null);
}
