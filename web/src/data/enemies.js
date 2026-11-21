// Enemy (target) types. Behaviour flags are read by the game loop; visuals are built in gfx.js by `kind`.
//   hp       health multiplier relative to the row health of the stage
//   speed    speed multiplier relative to the stage scroll speed
//   leak     hearts lost if it reaches the castle line (0 = harmless, it just escapes)
//   coins    coin multiplier when destroyed
//   xp       weapon xp when destroyed
//   weight   counts toward stage progress
export const ENEMIES = {
  normal: { hp: 1, speed: 1, leak: 1, coins: 1, xp: 1, weight: 1 },
  small: { hp: 0.45, speed: 1.15, leak: 1, coins: 0.5, xp: 0.5, weight: 0.5, scale: 0.7 },
  keg: { hp: 0.8, speed: 1, leak: 1, coins: 1, xp: 1, weight: 1, explode: { r: 2.9, dmg: 0.8 } },
  big: { hp: 2.8, speed: 0.9, leak: 2, coins: 3, xp: 2, weight: 2, scale: 1.55, big: true },
  gift: { hp: 1.15, speed: 1, leak: 0, coins: 1.5, xp: 1, weight: 1, gift: 2 },
  armored: { hp: 1.3, speed: 0.95, leak: 1, coins: 2, xp: 1.5, weight: 1, armor: 0.65 },
  shielder: { hp: 1.2, speed: 0.9, leak: 1, coins: 2, xp: 1.5, weight: 1, shieldAura: 2.6 },
  regen: { hp: 1.4, speed: 0.95, leak: 1, coins: 1.5, xp: 1, weight: 1, regen: 0.3 },
  runner: { hp: 0.5, speed: 1.8, leak: 1, coins: 1.5, xp: 1, weight: 1, scale: 0.82 },
  zigzag: { hp: 1, speed: 1, leak: 1, coins: 1.2, xp: 1, weight: 1, sway: 1.4 },
  splitter: { hp: 1.3, speed: 0.95, leak: 1, coins: 1.2, xp: 1, weight: 1, split: 2 },
  ghost: { hp: 0.9, speed: 1, leak: 1, coins: 1.6, xp: 1, weight: 1, ghost: true },
  bomber: { hp: 1.1, speed: 0.8, leak: 1, coins: 2, xp: 1.5, weight: 1, bomber: true },
  elite: { hp: 4.5, speed: 0.75, leak: 2, coins: 6, xp: 3, weight: 3, scale: 1.7, big: true, armor: 0.35, elite: true },
  treasure: { hp: 2.2, speed: 1.6, leak: 0, coins: 14, xp: 2, weight: 0, scale: 1.1, treasure: true },
  chest: { hp: 3.2, speed: 0.85, leak: 0, coins: 6, xp: 2, weight: 0, chest: true },
  anvil: { hp: 2.2, speed: 0.85, leak: 0, coins: 2, xp: 1, weight: 0, anvil: true },
  altar: { hp: 1.6, speed: 0.85, leak: 0, coins: 0, xp: 0, weight: 0, altar: true },
  wall: { hp: 3.5, speed: 1, leak: 0, coins: 1, xp: 1, weight: 0, wall: true, blocks: true },
  minion: { hp: 1, speed: 1.1, leak: 1, coins: 0.3, xp: 0.3, weight: 0, scale: 0.8 },
  bossKeg: { hp: 1, speed: 1, leak: 1, coins: 0.5, xp: 0.5, weight: 0, explode: { r: 3.2, dmg: 1.2 } },
};

export const KIND_LABEL = {
  armored: 'Armored', shielder: 'Shield Bearer', regen: 'Regenerating', runner: 'Runner', zigzag: 'Swaying',
  splitter: 'Splitter', ghost: 'Ghost', bomber: 'Bomber', elite: 'Elite', treasure: 'Treasure Cart', keg: 'Powder Keg',
};

export function radiusFor(kind) {
  return 0.62 * (ENEMIES[kind].scale || 1);
}
