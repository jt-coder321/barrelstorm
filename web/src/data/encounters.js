// Encounter archetypes. An archetype decides WHAT the player is doing in a stage: its win rule, its pacing
// script, the enemies that make sense in it and the kind of reward it pays out. Modifiers, realms and
// formations are layered on top by the generator in levelgen.js.
//
//   objective   win rule read by the game loop (see Game.checkEnd)
//   leakHurts   whether targets reaching the castle line cost hearts
//   collide     which targets hurt the cart when they run into it: 'heavy' (rams, walls) or 'all'
//   maxMods     cap on stacked modifiers, so busy archetypes stay readable
//   banMods     modifiers that clash with the archetype's rules
//   kinds       extra enemy weights mixed into formations
//   reward      what the archetype pays out, shown before the stage
//   minStage    first campaign stage it may appear on (stages 1-10 introduce them in a fixed order)

export const ARCHETYPES = {
  demolition: {
    id: 'demolition', name: 'Demolition', icon: '\u{1F9E8}', objective: 'clear', leakHurts: true, collide: 'heavy',
    goal: 'Blow it all up. Kegs and powder towers chain together', tip: 'Shoot the red kegs inside a crowd',
    reward: 'Chain bonuses', maxMods: 2, banMods: ['giants'], kinds: { keg: 5, megakeg: 0.8 }, minStage: 1, weight: 6,
  },
  treasure: {
    id: 'treasure', name: 'Treasure Hunt', icon: '\u{1F4B0}', objective: 'loot', leakHurts: false, collide: 'heavy',
    goal: 'Grab the gold. Drive over coin piles, catch the carts', tip: 'Gold on the road only counts if you drive over it',
    reward: 'Lots of coins', maxMods: 1, banMods: ['goldrush', 'double', 'ambush', 'giants'], kinds: { cache: 1.2, small: 2 }, minStage: 2, weight: 5,
  },
  siege: {
    id: 'siege', name: 'Siege', icon: '\u{1F3F0}', objective: 'siege', leakHurts: false, collide: 'heavy',
    goal: 'Hold the gate for three waves. Rams hit the gate hard', tip: 'Rams and runners first: they do the most gate damage',
    reward: 'Big stage reward', maxMods: 1, banMods: ['goldrush', 'treasure', 'ambush'], kinds: { ram: 0.8, archer: 0.6, runner: 1 }, minStage: 3, weight: 5,
  },
  gauntlet: {
    id: 'gauntlet', name: 'Gauntlet', icon: '\u{1F6A7}', objective: 'distance', leakHurts: false, collide: 'all',
    goal: 'Reach the end of the road. Anything that hits your cart hurts', tip: 'You do not have to destroy everything: weave through',
    reward: 'Relic chance', maxMods: 1, banMods: ['regen', 'giants', 'swarm', 'goldrush', 'ambush', 'double', 'treasure'], kinds: { ram: 1.5, charger: 1.5, wall: 0.6 }, minStage: 4, weight: 4,
  },
  boss: {
    id: 'boss', name: 'Boss Battle', icon: '\u{1F479}', objective: 'boss', leakHurts: true, collide: 'heavy',
    goal: 'Learn its pattern, hit its weak points', tip: '', reward: 'Boss relic and blueprint', maxMods: 2, banMods: [], kinds: {}, minStage: 5, weight: 0,
  },
  elite: {
    id: 'elite', name: 'Elite Hunt', icon: '\u{1F451}', objective: 'hunt', leakHurts: true, collide: 'heavy',
    goal: 'Hunt down the crowned captains. Each one fights differently', tip: 'Captains slam their lane: step aside when it glows',
    reward: 'Rare upgrades', maxMods: 2, banMods: ['double', 'ambush'], kinds: { healer: 0.6, shielder: 0.6 }, minStage: 6, weight: 5,
  },
  ambush: {
    id: 'ambush', name: 'Ambush', icon: '⚔', objective: 'clear', leakHurts: true, collide: 'heavy',
    goal: 'A quiet supply run... or is it?', tip: 'Enemies drop in where the red circles glow',
    reward: 'Mini-boss loot', maxMods: 1, banMods: ['ambush', 'double'], kinds: {}, minStage: 7, weight: 4,
  },
  jackpot: {
    id: 'jackpot', name: 'Jackpot', icon: '\u{1F3B0}', objective: 'jackpot', leakHurts: false, collide: 'heavy',
    goal: '45 seconds to smash as much gold as you can', tip: 'Pinatas spill coins every time you hit them',
    reward: 'Huge coins', maxMods: 1, banMods: ['goldrush', 'regen', 'double', 'ambush', 'treasure', 'dark'], kinds: {}, minStage: 8, weight: 3,
  },
  challenge: {
    id: 'challenge', name: 'Challenge', icon: '\u{1F3AF}', objective: 'challenge', leakHurts: true, collide: 'heavy',
    goal: 'One special rule. Meet it to win', tip: '', reward: 'Relic or blueprint', maxMods: 1, banMods: ['ambush', 'double'], kinds: {}, minStage: 9, weight: 3,
  },
  survival: {
    id: 'survival', name: 'Survival', icon: '⏱', objective: 'survive', leakHurts: true, collide: 'heavy',
    goal: 'Hold out until the timer runs out. It gets worse every 15 seconds', tip: 'Save your special for the last wave',
    reward: 'Coins per wave', maxMods: 2, banMods: ['giants', 'ambush', 'double'], kinds: { runner: 1, archer: 0.5 }, minStage: 3, weight: 5,
  },
};

export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);

// The first ten campaign stages introduce one archetype each so new players see the whole variety quickly.
export const INTRO_ORDER = ['demolition', 'treasure', 'survival', 'siege', 'boss', 'elite', 'ambush', 'jackpot', 'challenge', 'boss'];
// Gauntlet debuts on 11 (after the player has learned to dodge archer arrows and rams in Siege).
export const LATE_DEBUT = { 11: 'gauntlet' };

// Challenge rules (picked inside the Challenge archetype).
export const CHALLENGES = {
  marked: { id: 'marked', name: 'Marked for Death', icon: '\u{1F3AF}', desc: 'Destroy every marked target. If one escapes, you lose' },
  untouchable: { id: 'untouchable', name: 'Untouchable', icon: '\u{1F47C}', desc: 'Take one hit and it is over. Survive to the end' },
  chainmaster: { id: 'chainmaster', name: 'Chain Master', icon: '\u{1F4A5}', desc: 'Set off a chain of 8 explosions before time runs out' },
  powderonly: { id: 'powderonly', name: 'Powder Only', icon: '\u{1F9E8}', desc: 'Your shots cannot hurt armored barrels. Blow them up with kegs' },
};
export const CHALLENGE_IDS = Object.keys(CHALLENGES);
