// Permanent progression: forge upgrades, abilities, relics, achievements, difficulty tiers.

export const FORGE = [
  { id: 'damage', icon: '⚔', name: 'Sharpened Tips', desc: '+12% damage per level', max: 20, cost: (l) => Math.round(40 * Math.pow(1.36, l)) },
  { id: 'rate', icon: '\u{1F4A8}', name: 'Quick Hands', desc: '+8% fire rate per level', max: 20, cost: (l) => Math.round(45 * Math.pow(1.36, l)) },
  { id: 'bolts', icon: '\u{1F3AF}', name: 'Twin Shot', desc: '+1 projectile from the start', max: 2, cost: (l) => Math.round(700 * Math.pow(3.2, l)) },
  { id: 'hearts', icon: '❤', name: 'Castle Walls', desc: '+1 heart', max: 4, cost: (l) => Math.round(160 * Math.pow(2.1, l)) },
  { id: 'coin', icon: '\u{1FA99}', name: 'Tax Collector', desc: '+10% coins per level', max: 15, cost: (l) => Math.round(60 * Math.pow(1.4, l)) },
  { id: 'start', icon: '\u{1F6E1}', name: 'Veteran Gear', desc: 'Start stages +1 weapon level', max: 12, cost: (l) => Math.round(90 * Math.pow(1.5, l)) },
  { id: 'luck', icon: '\u{1F340}', name: 'Lucky Charm', desc: 'Better card rarity in drafts', max: 8, cost: (l) => Math.round(150 * Math.pow(1.55, l)) },
  { id: 'reroll', icon: '\u{1F3B2}', name: "Gambler's Dice", desc: '+1 draft reroll per stage', max: 3, cost: (l) => Math.round(400 * Math.pow(2.4, l)) },
];

export const BASE_HEARTS = 3;

export const ABILITIES = {
  bomb: { id: 'bomb', name: 'Powder Bomb', icon: '\u{1F4A3}', desc: 'Huge blast where the enemies are thickest', unlock: 1, charge: 18 },
  volley: { id: 'volley', name: 'Arrow Storm', icon: '\u{1F327}', desc: '3s of arrows raining on every target', unlock: 5, charge: 22 },
  warp: { id: 'warp', name: 'Time Warp', icon: '⏳', desc: 'Enemies crawl at 20% speed for 5s', unlock: 9, charge: 20 },
  aegis: { id: 'aegis', name: 'Aegis Wave', icon: '\u{1F6E1}', desc: 'Shield for 2 hits and shove every enemy back', unlock: 14, charge: 24 },
};
export const ABILITY_IDS = Object.keys(ABILITIES);

export const RELICS = {
  horseshoe: { id: 'horseshoe', name: 'Lucky Horseshoe', icon: '\u{1F340}', desc: '+10% critical chance' },
  powderhorn: { id: 'powderhorn', name: 'Powder Horn', icon: '\u{1F4EF}', desc: 'Explosions 35% bigger' },
  gauntlet: { id: 'gauntlet', name: 'Golden Gauntlet', icon: '\u{1F9E4}', desc: '+25% coins' },
  phoenix: { id: 'phoenix', name: 'Phoenix Feather', icon: '\u{1FAB6}', desc: 'Revive once per stage with 1 heart' },
  ember: { id: 'ember', name: 'Ember Heart', icon: '\u{1F525}', desc: 'Burns deal 60% more damage' },
  rune: { id: 'rune', name: 'Storm Rune', icon: '\u{1F300}', desc: 'Lightning jumps +1 more time' },
  sigil: { id: 'sigil', name: 'Frost Sigil', icon: '\u{1F9CA}', desc: 'Frozen targets take +40% damage' },
  seal: { id: 'seal', name: "Merchant's Seal", icon: '\u{1F4DC}', desc: '+1 reroll in every draft stage' },
  compass: { id: 'compass', name: 'Fate Compass', icon: '\u{1F9ED}', desc: 'Drafts show rarer cards' },
  drum: { id: 'drum', name: 'War Drum', icon: '\u{1F941}', desc: 'Combos last 1.5s longer' },
  // Boss trophies: each boss drops its own relic the first time it falls.
  kingcrown: { id: 'kingcrown', name: "King's Crown", icon: '\u{1F451}', desc: 'Kegs blast 40% wider. Chains pay double coins', boss: 'king' },
  golemheart: { id: 'golemheart', name: 'Golem Heart', icon: '\u{1FAA8}', desc: '+1 heart and a 1-hit shield at the start', boss: 'golem' },
  gearcore: { id: 'gearcore', name: 'War Gear', icon: '⚙', desc: 'Special ability charges 50% faster', boss: 'machine' },
  siegebolt: { id: 'siegebolt', name: 'Siege Bolt', icon: '\u{1F3F9}', desc: 'All shots pierce +1 target', boss: 'siege' },
  dragonscale: { id: 'dragonscale', name: 'Dragon Scale', icon: '\u{1F409}', desc: 'Shots burn. Power frenzies last 30% longer', boss: 'dragon' },
};
export const BOSS_RELIC = { king: 'kingcrown', golem: 'golemheart', machine: 'gearcore', siege: 'siegebolt', dragon: 'dragonscale' };
export const RELIC_IDS = Object.keys(RELICS);

export const DIFFICULTY = {
  normal: { id: 'normal', name: 'Normal', hp: 1, speed: 1, coins: 1, elites: 0, unlock: 1 },
  veteran: { id: 'veteran', name: 'Veteran', hp: 1.35, speed: 1.08, coins: 1.5, elites: 1, unlock: 8 },
  nightmare: { id: 'nightmare', name: 'Nightmare', hp: 1.8, speed: 1.16, coins: 2.2, elites: 2, unlock: 16 },
};

// Achievements are checked against save.stats; `goal` is compared with the stat value.
export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Blood', desc: 'Clear stage 1', stat: 'cleared', goal: 1, reward: 50 },
  { id: 'chain5', name: 'Kaboom', desc: 'Chain 5 explosions in one blast', stat: 'bestChain', goal: 5, reward: 100 },
  { id: 'chain12', name: 'Powder Keg Prophet', desc: 'Chain 12 explosions in one blast', stat: 'bestChain', goal: 12, reward: 400 },
  { id: 'combo50', name: 'Unstoppable', desc: 'Reach a 50 combo', stat: 'bestCombo', goal: 50, reward: 150 },
  { id: 'combo150', name: 'Godlike', desc: 'Reach a 150 combo', stat: 'bestCombo', goal: 150, reward: 600 },
  { id: 'boss1', name: 'Giant Killer', desc: 'Defeat a boss', stat: 'bossKills', goal: 1, reward: 150 },
  { id: 'boss5', name: 'Bestiary', desc: 'Defeat all five boss types', stat: 'bossTypes', goal: 5, reward: 800 },
  { id: 'kills1k', name: 'Cooper’s Nightmare', desc: 'Destroy 1,000 targets', stat: 'totalKills', goal: 1000, reward: 300 },
  { id: 'weapons5', name: 'Arsenal', desc: 'Unlock 5 weapons', stat: 'weaponsUnlocked', goal: 5, reward: 500 },
  { id: 'synergy', name: 'Alchemist', desc: 'Trigger a weapon synergy', stat: 'synergies', goal: 1, reward: 120 },
  { id: 'synergy5', name: 'Grand Alchemist', desc: 'Discover 5 different synergies', stat: 'synergyTypes', goal: 5, reward: 700 },
  { id: 'mythic', name: 'Touched by Myth', desc: 'Take a mythic card', stat: 'mythics', goal: 1, reward: 250 },
  { id: 'srank', name: 'Perfectionist', desc: 'Earn an S rank', stat: 'sRanks', goal: 1, reward: 200 },
  { id: 'daily', name: 'Daily Duty', desc: 'Finish a daily challenge', stat: 'dailies', goal: 1, reward: 150 },
  { id: 'endless10', name: 'Iron Will', desc: 'Reach wave 10 in Endless', stat: 'bestWave', goal: 10, reward: 500 },
  { id: 'relics5', name: 'Collector', desc: 'Own 5 relics', stat: 'relicsOwned', goal: 5, reward: 400 },
  { id: 'stage25', name: 'Siege Breaker', desc: 'Clear stage 25', stat: 'cleared', goal: 25, reward: 1000 },
  { id: 'vault', name: 'Secret Keeper', desc: 'Find a secret vault', stat: 'vaults', goal: 1, reward: 200 },
  { id: 'arch5', name: 'Seasoned', desc: 'Win 5 different encounter types', stat: 'archTypes', goal: 5, reward: 300 },
  { id: 'arch10', name: 'Master of War', desc: 'Win all 10 encounter types', stat: 'archTypes', goal: 10, reward: 1200 },
  { id: 'frenzy1', name: 'Overpowered', desc: 'Grab a power frenzy', stat: 'frenzies', goal: 1, reward: 80 },
  { id: 'frenzy8', name: 'Frenzy Collector', desc: 'Trigger all 8 kinds of power frenzy', stat: 'frenzyTypes', goal: 8, reward: 600 },
  { id: 'chain20', name: 'Cataclysm', desc: 'Chain 20 explosions in one blast', stat: 'bestChain', goal: 20, reward: 800 },
  { id: 'tower', name: 'Timber!', desc: 'Topple 10 powder towers', stat: 'towers', goal: 10, reward: 250 },
  { id: 'relicboss', name: 'Trophy Hunter', desc: 'Collect 3 boss relics', stat: 'bossRelics', goal: 3, reward: 700 },
];

export function rankFor(ratio) {
  if (ratio >= 1) return 'S';
  if (ratio >= 0.78) return 'A';
  if (ratio >= 0.55) return 'B';
  return 'C';
}
export const RANK_ORDER = ['C', 'B', 'A', 'S'];
