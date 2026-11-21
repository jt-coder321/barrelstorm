// Draft cards. Picking one of three is the core in-stage decision. Cards change how the weapon behaves
// (elements, piercing, multishot), not only numbers, and some combinations unlock synergies.
import { FAMILIES, FAMILY_IDS } from './weapons.js';
import { weightedPick } from '../util.js';

export const RARITY = {
  common: { name: 'Common', color: '#d9d2c3', weight: 52 },
  rare: { name: 'Rare', color: '#4aa8ff', weight: 30 },
  epic: { name: 'Epic', color: '#b46bff', weight: 13 },
  legendary: { name: 'Legendary', color: '#ffcf4a', weight: 4.2 },
  mythic: { name: 'Mythic', color: '#ff4d6d', weight: 0.8 },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

// Every card: id, name, icon, rarity, desc, max (stack limit), tags (granted), when (ctx => offerable), apply(g)
export const CARDS = [
  // ---------- common: numbers ----------
  { id: 'dmg', name: 'Sharpened Shot', icon: '⚔', rarity: 'common', desc: '+25% damage', max: 6, apply: (g) => { g.mods.dmgMul += 0.25; } },
  { id: 'rate', name: 'Oiled Gears', icon: '\u{1F4A8}', rarity: 'common', desc: '+18% fire rate', max: 6, apply: (g) => { g.mods.rateMul += 0.18; } },
  { id: 'crit', name: 'Keen Eye', icon: '\u{1F441}', rarity: 'common', desc: '+8% critical chance', max: 5, apply: (g) => { g.mods.crit += 0.08; } },
  { id: 'levels', name: 'Fresh Recruits', icon: '\u{1F6E1}', rarity: 'common', desc: 'Weapon +3 levels', max: 9, apply: (g) => { g.addLevels(3, true); } },
  { id: 'purse', name: 'Fat Purse', icon: '\u{1FA99}', rarity: 'common', desc: '+30% coins this stage', max: 4, apply: (g) => { g.mods.coinMul += 0.3; } },
  { id: 'mend', name: 'Field Medic', icon: '❤', rarity: 'common', desc: 'Heal 1 heart', max: 9, when: (c) => c.hearts < c.maxHearts, apply: (g) => { g.heal(1); } },
  { id: 'combo', name: 'Battle Rhythm', icon: '\u{1F941}', rarity: 'common', desc: 'Combo lasts 1s longer, +10% combo coins', max: 3, apply: (g) => { g.mods.comboTime += 1; g.mods.comboBonus += 0.1; } },

  // ---------- rare: behaviour ----------
  { id: 'fire', name: 'Incendiary Rounds', icon: '\u{1F525}', rarity: 'rare', desc: 'Shots set targets ablaze', max: 3, tags: ['fire'], apply: (g) => { g.mods.burn += 1.6; } },
  { id: 'frost', name: 'Frost Tips', icon: '❄', rarity: 'rare', desc: 'Shots chill: 4 chills freeze', max: 3, tags: ['frost'], apply: (g) => { g.mods.chill += 1; } },
  { id: 'spark', name: 'Spark Coils', icon: '⚡', rarity: 'rare', desc: 'Hits arc to +1 nearby target', max: 3, tags: ['lightning'], apply: (g) => { g.mods.chain += 1; } },
  { id: 'powder', name: 'Powder Rounds', icon: '\u{1F4A5}', rarity: 'rare', desc: 'Shots explode on impact', max: 3, tags: ['explosive'], apply: (g) => { g.mods.splash += 0.8; } },
  { id: 'pierce', name: 'Bodkin Points', icon: '\u{1F4CC}', rarity: 'rare', desc: 'Shots pierce +1 target', max: 4, tags: ['pierce'], apply: (g) => { g.mods.pierce += 1; } },
  { id: 'twin', name: 'Twin Shot', icon: '\u{1F3AF}', rarity: 'rare', desc: '+1 projectile', max: 4, tags: ['multishot'], apply: (g) => { g.mods.bolts += 1; } },
  { id: 'rapid', name: 'Rapid Loader', icon: '⏩', rarity: 'rare', desc: '+35% fire rate', max: 3, tags: ['rapid'], apply: (g) => { g.mods.rateMul += 0.35; } },
  { id: 'seek', name: 'Seeker Fins', icon: '\u{1F9ED}', rarity: 'rare', desc: 'Shots curve toward targets', max: 2, tags: ['homing'], apply: (g) => { g.mods.homing += 3.5; } },
  { id: 'heavy', name: 'Heavy Shot', icon: '\u{1F528}', rarity: 'rare', desc: '+55% damage, -12% fire rate', max: 3, apply: (g) => { g.mods.dmgMul += 0.55; g.mods.rateMul -= 0.12; } },
  { id: 'critdmg', name: 'Assassin Oil', icon: '\u{1F5E1}', rarity: 'rare', desc: 'Critical hits deal 3x instead of 2x', max: 1, apply: (g) => { g.mods.critMul = 3; g.mods.crit += 0.04; } },

  // ---------- epic: build defining ----------
  { id: 'volley', name: 'Volley', icon: '\u{1F386}', rarity: 'epic', desc: '+2 projectiles, -15% damage', max: 2, tags: ['multishot'], apply: (g) => { g.mods.bolts += 2; g.mods.dmgMul -= 0.15; } },
  { id: 'chainkill', name: 'Chain Reaction', icon: '\u{1F9E8}', rarity: 'epic', desc: 'Destroyed targets have a 30% chance to explode', max: 2, tags: ['explosive'], apply: (g) => { g.mods.deathBlast += 0.3; } },
  { id: 'exec', name: 'Executioner', icon: '\u{1FA93}', rarity: 'epic', desc: 'Triple damage to targets under 25% health', max: 1, apply: (g) => { g.mods.execute = 0.25; } },
  { id: 'glass', name: 'Glass Cannon', icon: '\u{1F48E}', rarity: 'epic', desc: '+80% damage, lose 1 max heart', max: 1, when: (c) => c.maxHearts > 2, apply: (g) => { g.mods.dmgMul += 0.8; g.loseMaxHeart(); } },
  { id: 'overcharge', name: 'Overcharge', icon: '\u{1F50B}', rarity: 'epic', desc: 'Ability charges 70% faster', max: 2, apply: (g) => { g.mods.abilityCharge += 0.7; } },
  { id: 'giant', name: 'Giant Slayer', icon: '\u{1F479}', rarity: 'epic', desc: '+80% damage to bosses, elites and big targets', max: 2, apply: (g) => { g.mods.bigDmg += 0.8; } },
  { id: 'golden', name: 'Golden Touch', icon: '\u{1F451}', rarity: 'epic', desc: '+70% coins, crits drop extra gold', max: 1, apply: (g) => { g.mods.coinMul += 0.7; g.mods.critGold = true; } },
  { id: 'ricochet', name: 'Ricochet', icon: '\u{1F501}', rarity: 'epic', desc: 'Shots bounce to a second target', max: 1, tags: ['pierce'], apply: (g) => { g.mods.ricochet = true; } },

  // ---------- legendary ----------
  { id: 'triple', name: 'Triple Barrel', icon: '\u{1F531}', rarity: 'legendary', desc: '+3 projectiles', max: 1, tags: ['multishot'], apply: (g) => { g.mods.bolts += 3; } },
  { id: 'thunderhead', name: 'Thunderhead', icon: '\u{1F329}', rarity: 'legendary', desc: 'Every 2s lightning strikes the 3 toughest targets', max: 1, tags: ['lightning'], apply: (g) => { g.mods.thunder = true; } },
  { id: 'phoenix', name: 'Phoenix Rounds', icon: '\u{1F985}', rarity: 'legendary', desc: 'Shots burn and explode', max: 1, tags: ['fire', 'explosive'], apply: (g) => { g.mods.burn += 2; g.mods.splash += 1; } },
  { id: 'frenzy', name: 'Berserker', icon: '\u{1F621}', rarity: 'legendary', desc: '+4% fire rate per 10 combo (max +60%)', max: 1, apply: (g) => { g.mods.comboRate = true; } },

  // ---------- mythic ----------
  { id: 'dual', name: 'Dual Wield', icon: '\u{1F91D}', rarity: 'mythic', desc: 'Mount a second weapon that fires alongside', max: 1, apply: (g) => { g.mountSecondary(); } },
  { id: 'dragonheart', name: "Dragon's Heart", icon: '\u{1F432}', rarity: 'mythic', desc: '+50% damage, shots burn, chill, arc and explode', max: 1, tags: ['fire', 'frost', 'lightning', 'explosive'], apply: (g) => { g.mods.dmgMul += 0.5; g.mods.burn += 1.5; g.mods.chill += 1; g.mods.chain += 1; g.mods.splash += 0.8; } },
];

// Weapon swap cards are generated per family. A locked family can be tried for one stage, which also
// earns a blueprint toward unlocking it.
export function weaponCard(fid, locked) {
  const f = FAMILIES[fid];
  return {
    id: `weapon:${fid}`, name: f.name, icon: f.icon, rarity: locked ? 'legendary' : 'epic', weapon: fid,
    desc: locked ? `Swap to it for this stage. ${f.blurb}. +1 blueprint` : `Swap weapon, keep level. ${f.blurb}`,
    max: 1, apply: (g) => { g.swapWeapon(fid, locked); },
  };
}

// Synergies switch on when the right tags meet (tags come from the weapon family and from cards).
export const SYNERGIES = [
  { id: 'napalm', name: 'Napalm', icon: '\u{1F30B}', needs: ['fire', 'explosive'], desc: 'Explosions leave burning ground' },
  { id: 'barrage', name: 'Chain Barrage', icon: '\u{1F329}', needs: ['lightning', 'rapid'], desc: 'Every 6th shot fires a lightning barrage' },
  { id: 'cryoblast', name: 'Cryoblast', icon: '\u{1F9CA}', needs: ['frost', 'explosive'], desc: 'Frozen targets shatter in an icy blast' },
  { id: 'skewer', name: 'Skewer', icon: '\u{1F362}', needs: ['pierce', 'multishot'], desc: 'Each target pierced adds +40% damage' },
  { id: 'wildfire', name: 'Wildfire', icon: '\u{1F386}', needs: ['fire', 'lightning'], desc: 'Lightning arcs ignite targets' },
  { id: 'swarm', name: 'Hunter Swarm', icon: '\u{1F41D}', needs: ['homing', 'multishot'], desc: '+1 projectile, sharper homing' },
  { id: 'shatter', name: 'Shatter Lance', icon: '\u{1F48E}', needs: ['frost', 'pierce'], desc: 'Piercing shots deal +100% to chilled targets' },
];

export const FAMILY_TAGS = {
  cannon: ['explosive'], gatling: ['rapid'], crossbow: ['pierce'], flame: ['fire'],
  lightning: ['lightning'], mortar: ['explosive'], frost: ['frost'], rocket: ['homing', 'explosive'],
};

// Blessings are offered right before a boss: a temporary edge for that fight.
export const BLESSINGS = [
  { id: 'b-weak', name: 'Weakspot Hunter', icon: '\u{1F3AF}', rarity: 'epic', desc: 'Weak points take +120% damage', apply: (g) => { g.mods.weakMul += 1.2; } },
  { id: 'b-aegis', name: 'Aegis', icon: '\u{1F6E1}', rarity: 'epic', desc: 'A shield blocks the next 2 hits', apply: (g) => { g.addShield(2); } },
  { id: 'b-charge', name: 'Full Charge', icon: '\u{1F50B}', rarity: 'rare', desc: 'Ability fully charged, charges 50% faster', apply: (g) => { g.ability.charge = 1; g.mods.abilityCharge += 0.5; } },
  { id: 'b-fury', name: 'Battle Fury', icon: '\u{1F525}', rarity: 'rare', desc: '+40% fire rate for this fight', apply: (g) => { g.mods.rateMul += 0.4; } },
  { id: 'b-chest', name: 'War Chest', icon: '\u{1F4B0}', rarity: 'rare', desc: 'Boss reward doubled', apply: (g) => { g.mods.bossReward += 1; } },
  { id: 'b-heart', name: 'Second Wind', icon: '❤', rarity: 'rare', desc: 'Heal 2 hearts', when: (c) => c.hearts < c.maxHearts, apply: (g) => { g.heal(2); } },
  { id: 'b-giant', name: 'Kingslayer', icon: '\u{1F451}', rarity: 'epic', desc: '+60% damage to the boss', apply: (g) => { g.mods.bigDmg += 0.6; } },
];

// Blood altar: pay a heart for a short, overwhelming power spike.
export const ALTAR = [
  { id: 'a-dragon', name: 'Dragonfire Overdrive', icon: '\u{1F409}', rarity: 'mythic', desc: '20s: triple fire rate, shots burn and explode. Costs 1 heart', apply: (g) => { g.addTemp('overdrive', 20); } },
  { id: 'a-storm', name: 'Wrath of Storms', icon: '\u{1F329}', rarity: 'mythic', desc: '20s: lightning strikes everything on screen. Costs 1 heart', apply: (g) => { g.addTemp('storm', 20); } },
  { id: 'a-blood', name: 'Blood Pact', icon: '\u{1FA78}', rarity: 'legendary', desc: 'Permanently +60% damage this stage. Costs 1 heart', apply: (g) => { g.mods.dmgMul += 0.6; } },
];

export function cardCtx(g) {
  return {
    hearts: g.hearts, maxHearts: g.maxHearts, taken: g.cardsTaken, family: g.family, secondary: g.secondary,
    unlocked: g.save.weapons.unlocked, stage: g.stageNum,
  };
}

function offerable(card, ctx) {
  const n = ctx.taken[card.id] || 0;
  if (n >= (card.max || 1)) return false;
  if (card.when && !card.when(ctx)) return false;
  if (card.id === 'dual' && ctx.secondary) return false;
  return true;
}

// Rolls `count` distinct cards. `luck` shifts weight toward higher rarities. Each draft gets at least one
// card that changes how the weapon behaves (tags or a weapon swap) so choices never feel like pure math.
export function rollDraft(rng, ctx, { count = 3, luck = 0, minRarity = 'common', weapons = true } = {}) {
  const minIdx = RARITY_ORDER.indexOf(minRarity);
  const pool = CARDS.filter((c) => offerable(c, ctx) && RARITY_ORDER.indexOf(c.rarity) >= minIdx);
  if (weapons && ctx.stage >= 2) {
    for (const fid of FAMILY_IDS) {
      if (fid === ctx.family || fid === ctx.secondary) continue;
      const c = weaponCard(fid, !ctx.unlocked.includes(fid));
      if (offerable(c, ctx)) pool.push(c);
    }
  }
  const out = [];
  const rw = (r) => {
    const i = RARITY_ORDER.indexOf(r);
    return RARITY[r].weight * Math.pow(1 + luck, i);
  };
  let guard = 0;
  while (out.length < count && guard++ < 60) {
    const needBehaviour = out.length === count - 1 && !out.some((c) => c.tags || c.weapon);
    const c = weightedPick(rng, pool, (it) => {
      if (out.includes(it)) return 0;
      if (needBehaviour && !(it.tags || it.weapon)) return 0;
      const base = rw(it.rarity);
      return it.weapon ? base * 0.35 : base;
    });
    if (!c) break;
    out.push(c);
  }
  return out;
}

export function rollFrom(rng, list, ctx, count = 3) {
  const pool = list.filter((c) => offerable(c, ctx));
  const out = [];
  while (out.length < count && pool.length) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
