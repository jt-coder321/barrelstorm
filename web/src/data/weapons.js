// Weapon families. Each family plays differently; within a stage the weapon gains levels (from kills and
// cards) and evolves through four forms. Stats here are level-1 values.
//
// Projectile traits:
//   splash   radius of an explosion on hit (fraction `splashMul` of the damage)
//   pierce   how many extra targets a shot passes through
//   burn     damage per second of the burn applied on hit (stacks up to 3)
//   chain    number of lightning jumps to nearby targets
//   chill    frost stacks applied per hit (4 stacks freeze the target)
//   homing   turn rate toward the nearest target
//   lob      mortar: shots arc to a target point and explode on landing

export const FORM_LEVELS = [1, 6, 13, 22];

export const FAMILIES = {
  cannon: {
    id: 'cannon', name: 'Cannon', icon: '\u{1F4A3}', color: 0xffa040, accent: 0xff6a2a, blurb: 'Heavy explosive balls',
    dmg: 5.2, rate: 1.45, speed: 30, spread: 0.42, size: [0.32, 0.32, 0.32], splash: 1.0, splashMul: 0.55,
    forms: [
      { name: 'Bombard' },
      { name: 'Great Cannon', bolts: 1, splash: 0.3 },
      { name: 'Thunder Bombard', bolts: 1, splash: 0.6, dmg: 0.15 },
      { name: 'Dragon Cannon', bolts: 2, splash: 0.9, dmg: 0.3 },
    ],
    sound: 'cannon',
  },
  gatling: {
    id: 'gatling', name: 'Gatling', icon: '⚙', color: 0xffe27a, accent: 0xc9a227, blurb: 'Bullet storm, tiny shots',
    dmg: 1.15, rate: 7.2, speed: 48, spread: 0.22, jitter: 0.9, size: [0.08, 0.08, 0.45],
    forms: [
      { name: 'Hand Crank' },
      { name: 'Twin Crank', bolts: 1 },
      { name: 'Storm Organ', bolts: 1, rate: 0.25 },
      { name: 'Hellfire Organ', bolts: 2, rate: 0.45 },
    ],
    sound: 'gatling',
  },
  crossbow: {
    id: 'crossbow', name: 'Crossbow', icon: '\u{1F3F9}', color: 0xf1e3b0, accent: 0x8bd3ff, blurb: 'Bolts pierce whole lines',
    dmg: 3.1, rate: 2.2, speed: 50, spread: 0.36, size: [0.08, 0.08, 0.9], pierce: 2,
    forms: [
      { name: 'Arbalest' },
      { name: 'Repeater', bolts: 1, pierce: 1 },
      { name: 'Ballista', bolts: 1, pierce: 2, dmg: 0.2 },
      { name: 'Skypiercer', bolts: 2, pierce: 4, dmg: 0.35 },
    ],
    sound: 'bow',
  },
  flame: {
    id: 'flame', name: 'Flame Launcher', icon: '\u{1F525}', color: 0xff7b2a, accent: 0xffd23a, blurb: 'Burns that spread',
    dmg: 0.9, rate: 6.0, speed: 30, spread: 0.3, jitter: 1.4, size: [0.34, 0.34, 0.34], burn: 2.2, life: 0.95,
    forms: [
      { name: 'Fire Pot' },
      { name: 'Dragon Tongue', bolts: 1, burn: 0.8 },
      { name: 'Inferno Spout', bolts: 1, burn: 1.8 },
      { name: 'Sunforge', bolts: 2, burn: 3.2 },
    ],
    sound: 'flame',
  },
  lightning: {
    id: 'lightning', name: 'Lightning Cannon', icon: '⚡', color: 0x9fd8ff, accent: 0x5ab4ff, blurb: 'Zaps jump between targets',
    dmg: 2.7, rate: 2.2, speed: 52, spread: 0.36, size: [0.16, 0.16, 0.6], chain: 2,
    forms: [
      { name: 'Spark Coil' },
      { name: 'Tesla Coil', bolts: 1, chain: 1 },
      { name: 'Storm Caller', bolts: 1, chain: 2 },
      { name: "Zeus' Anvil", bolts: 2, chain: 3, dmg: 0.25 },
    ],
    sound: 'zap',
  },
  mortar: {
    id: 'mortar', name: 'Mortar', icon: '\u{1F30B}', color: 0x8b929c, accent: 0xff5a2a, blurb: 'Huge lobbed blasts',
    dmg: 8.5, rate: 0.95, speed: 0, spread: 1.2, size: [0.4, 0.4, 0.4], splash: 2.1, splashMul: 1, lob: 0.62,
    forms: [
      { name: 'Field Mortar' },
      { name: 'Siege Mortar', bolts: 1, splash: 0.3 },
      { name: 'Earthshaker', bolts: 1, splash: 0.6, dmg: 0.2 },
      { name: 'Doom Mortar', bolts: 2, splash: 0.9, dmg: 0.35 },
    ],
    sound: 'mortar',
  },
  frost: {
    id: 'frost', name: 'Frost Cannon', icon: '❄', color: 0xbff0ff, accent: 0x6ad4ff, blurb: 'Slows, then freezes',
    dmg: 2.5, rate: 2.7, speed: 40, spread: 0.36, size: [0.22, 0.22, 0.5], chill: 1,
    forms: [
      { name: 'Rime Tube' },
      { name: 'Glacier Gun', bolts: 1, chill: 0 },
      { name: 'Blizzard Cannon', bolts: 1, chill: 1 },
      { name: 'Winter Throne', bolts: 2, chill: 1, dmg: 0.3 },
    ],
    sound: 'frost',
  },
  rocket: {
    id: 'rocket', name: 'Rocket Launcher', icon: '\u{1F680}', color: 0xff5a4a, accent: 0xffe27a, blurb: 'Homing rockets',
    dmg: 4.6, rate: 1.35, speed: 26, spread: 0.5, size: [0.14, 0.14, 0.55], splash: 0.8, splashMul: 0.5, homing: 5,
    forms: [
      { name: 'Firework Tube' },
      { name: 'Rocket Rack', bolts: 1 },
      { name: 'Swarm Pod', bolts: 2, splash: 0.2 },
      { name: 'Wyrm Battery', bolts: 3, splash: 0.4, dmg: 0.2 },
    ],
    sound: 'rocket',
  },
};

export const FAMILY_IDS = Object.keys(FAMILIES);
export const STARTER_WEAPONS = ['cannon', 'gatling', 'crossbow'];
export const BLUEPRINTS_TO_UNLOCK = 3;

export function formForLevel(level) {
  let f = 0;
  for (let i = 0; i < FORM_LEVELS.length; i++) if (level >= FORM_LEVELS[i]) f = i;
  return f;
}

export function xpNeeded(level) {
  return 4 + level * 1.6;
}

// Mastery: kills with a family raise its mastery level, each level gives +4% damage with it.
export const MASTERY_STEP = (lvl) => Math.round(60 * Math.pow(1.45, lvl));
export const MASTERY_MAX = 10;

export function masteryLevel(xp) {
  let l = 0;
  let need = MASTERY_STEP(0);
  while (xp >= need && l < MASTERY_MAX) {
    xp -= need;
    l++;
    need = MASTERY_STEP(l);
  }
  return { level: l, into: xp, need };
}
