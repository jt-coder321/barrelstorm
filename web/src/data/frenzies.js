// Power frenzies: short bursts where the player becomes overwhelming. They drop as glowing orbs from big
// moments (multi-kills, long chains, elites, hidden caches) and are collected by driving over them, so
// grabbing one is a positioning decision. Effects are read in Game.stats(), Game.damage() and Game.hurt().
export const FRENZIES = {
  rapid: { id: 'rapid', name: 'RAPID FIRE', icon: '\u{1F525}', color: 0xff8a2a, css: '#ff8a2a', t: 7, sub: 'Fire rate x2.5' },
  barrage: { id: 'barrage', name: 'BARRAGE', icon: '\u{1F386}', color: 0xffe27a, css: '#ffe27a', t: 7, sub: '+5 projectiles' },
  storm: { id: 'storm', name: 'LIGHTNING STORM', icon: '\u{1F329}', color: 0x7fd4ff, css: '#7fd4ff', t: 7, sub: 'Lightning strikes everything' },
  overdrive: { id: 'overdrive', name: 'EXPLOSIVE OVERDRIVE', icon: '\u{1F4A5}', color: 0xff4d1a, css: '#ff4d1a', t: 7, sub: 'Every shot explodes and burns' },
  gold: { id: 'gold', name: 'GOLD RUSH', icon: '\u{1F4B0}', color: 0xffc83a, css: '#ffc83a', t: 8, sub: 'Triple coins, gold rains' },
  crit: { id: 'crit', name: 'CRITICAL FRENZY', icon: '\u{1F5E1}', color: 0xff4d6d, css: '#ff4d6d', t: 7, sub: 'Every hit is critical' },
  shield: { id: 'shield', name: 'INVULNERABLE', icon: '\u{1F6E1}', color: 0x5ab4ff, css: '#5ab4ff', t: 7, sub: 'Nothing can hurt you. Ram them!' },
  nuke: { id: 'nuke', name: 'CATACLYSM', icon: '☢', color: 0xffffff, css: '#ffffff', t: 0, sub: 'Everything on screen explodes' },
};
export const FRENZY_IDS = Object.keys(FRENZIES);
// Relative drop weights. The nuke is the rare jackpot.
export const FRENZY_WEIGHT = { rapid: 5, barrage: 5, storm: 4, overdrive: 4, gold: 3, crit: 4, shield: 3, nuke: 1.2 };
