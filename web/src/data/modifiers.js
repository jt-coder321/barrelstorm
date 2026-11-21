// Level modifiers. The generator combines one to three of these per stage (weighted, never the same set
// twice in a row). `threat` is spent from a difficulty budget so combinations stay fair; `conflicts` keeps
// unfair or muddy pairs apart. `cfg` mutates the level config used by the generator and the game loop.
export const MODIFIERS = [
  {
    id: 'explosive', name: 'Explosive Barrels', icon: '\u{1F9E8}', desc: 'Kegs everywhere. Chain them!', minStage: 1, weight: 10, threat: 0,
    cfg: (c) => { c.kinds.keg = (c.kinds.keg || 0) + 4; c.kegClusters = true; },
  },
  {
    id: 'armored', name: 'Armored Foes', icon: '\u{1F6E1}', desc: 'Armor shrugs off plain hits. Explosions, fire and lightning ignore it', minStage: 3, weight: 8, threat: 2,
    cfg: (c) => { c.kinds.armored = (c.kinds.armored || 0) + 3; },
  },
  {
    id: 'frenzy', name: 'Speed Frenzy', icon: '⚡', desc: 'Everything moves faster, including your shots', minStage: 2, weight: 7, threat: 2,
    conflicts: ['regen'],
    cfg: (c) => { c.speedMul *= 1.3; c.projSpeedMul *= 1.45; c.rateMul *= 1.25; c.hpMul *= 0.85; },
  },
  {
    id: 'treasure', name: 'Treasure Wave', icon: '\u{1F4B0}', desc: 'Gold carts dash past. Catch them before they escape', minStage: 1, weight: 8, threat: 0,
    cfg: (c) => { c.treasureWaves = 3; },
  },
  {
    id: 'regen', name: 'Regenerating', icon: '\u{1F33F}', desc: 'Barrels heal unless you finish them fast', minStage: 4, weight: 7, threat: 2,
    cfg: (c) => { c.kinds.regen = (c.kinds.regen || 0) + 4; },
  },
  {
    id: 'rain', name: 'Explosive Rain', icon: '☄', desc: 'Bombs fall from the sky. They hit barrels too', minStage: 3, weight: 7, threat: 2,
    conflicts: ['dark'],
    cfg: (c) => { c.rain = true; },
  },
  {
    id: 'dark', name: 'Dark Battlefield', icon: '\u{1F311}', desc: 'Night falls. Only lit targets glow', minStage: 5, weight: 5, threat: 1,
    conflicts: ['rain'], noBiome: ['dungeon'],
    cfg: (c) => { c.dark = true; },
  },
  {
    id: 'shielded', name: 'Shielded Formation', icon: '\u{1F535}', desc: 'Shield bearers protect their neighbors. Break them first', minStage: 4, weight: 7, threat: 2,
    cfg: (c) => { c.kinds.shielder = (c.kinds.shielder || 0) + 2.5; c.shieldFormations = true; },
  },
  {
    id: 'ambush', name: 'Boss Ambush', icon: '\u{1F479}', desc: 'Something big is hiding in this stage', minStage: 6, weight: 5, threat: 3, notBoss: true,
    conflicts: ['double'],
    cfg: (c) => { c.ambush = true; },
  },
  {
    id: 'double', name: 'Double Trouble', icon: '\u{1F46F}', desc: 'Elites come in pairs', minStage: 5, weight: 5, threat: 3, notBoss: true,
    conflicts: ['ambush'],
    cfg: (c) => { c.doubleElites = true; },
  },
  {
    id: 'splitters', name: 'Splitters', icon: '\u{1F9EB}', desc: 'Barrels split into two when destroyed', minStage: 3, weight: 7, threat: 1,
    cfg: (c) => { c.kinds.splitter = (c.kinds.splitter || 0) + 4; },
  },
  {
    id: 'swarm', name: 'Swarm', icon: '\u{1F41C}', desc: 'Huge numbers of tiny barrels', minStage: 2, weight: 6, threat: 1,
    cfg: (c) => { c.swarm = true; c.kinds.small = (c.kinds.small || 0) + 6; },
  },
  {
    id: 'runners', name: 'Stampede', icon: '\u{1F3C3}', desc: 'Fast runners charge your line', minStage: 3, weight: 6, threat: 2,
    cfg: (c) => { c.kinds.runner = (c.kinds.runner || 0) + 3; },
  },
  {
    id: 'sway', name: 'Drunken March', icon: '\u{1F37A}', desc: 'Barrels sway from lane to lane', minStage: 2, weight: 6, threat: 1,
    cfg: (c) => { c.kinds.zigzag = (c.kinds.zigzag || 0) + 4; },
  },
  {
    id: 'bombers', name: 'Bombardiers', icon: '\u{1F4A3}', desc: 'Bomber barrels lob bombs at you. Kill them first', minStage: 5, weight: 5, threat: 2,
    cfg: (c) => { c.kinds.bomber = (c.kinds.bomber || 0) + 1.6; },
  },
  {
    id: 'goldrush', name: 'Gold Rush', icon: '\u{1F911}', desc: 'Double coins, but every leak costs an extra heart', minStage: 4, weight: 4, threat: 1,
    cfg: (c) => { c.coinMul *= 2; c.leakExtra = 1; },
  },
  {
    id: 'giants', name: 'Giants', icon: '\u{1F5FF}', desc: 'Fewer targets, but huge ones', minStage: 4, weight: 5, threat: 1, conflicts: ['swarm'],
    cfg: (c) => { c.kinds.big = (c.kinds.big || 0) + 5; c.countMul *= 0.7; },
  },
  {
    id: 'ghosts', name: 'Phantom Kegs', icon: '\u{1F47B}', desc: 'Ghost barrels can only be hit while solid', minStage: 6, weight: 5, threat: 2,
    cfg: (c) => { c.kinds.ghost = (c.kinds.ghost || 0) + 3; },
  },
];

export const MODIFIER_BY_ID = Object.fromEntries(MODIFIERS.map((m) => [m.id, m]));
