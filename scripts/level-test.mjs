// Checks the level generator without a browser: consecutive stages must differ, modifier combos must be
// legal, layouts must be fair (always a way through) and daily/endless profiles must be deterministic.
import { stageProfile, genLayout, dailySetup, endlessProfile } from '../web/src/levelgen.js';
import { MODIFIER_BY_ID } from '../web/src/data/modifiers.js';
import { ARCHETYPES, ARCHETYPE_IDS } from '../web/src/data/encounters.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
const sig = (p) => p.arch + '|' + [...p.mods].sort().join('+') + '|' + p.structure + '|' + p.biome;
const N = 60;
for (let n = 1; n <= N; n++) {
  const p = stageProfile(n);
  const prev = n > 1 ? stageProfile(n - 1) : null;
  if (prev) {
    check(sig(p) !== sig(prev), `stage ${n} repeats stage ${n - 1}: ${sig(p)}`);
    check(!(p.mods.length && prev.mods.length && p.mods.join() === prev.mods.join()), `stage ${n} same modifiers as previous`);
  }
  for (const a of p.mods) for (const b of p.mods) check(!(MODIFIER_BY_ID[a].conflicts || []).includes(b), `stage ${n} conflicting mods ${a}/${b}`);
  check(p.mods.every((id) => MODIFIER_BY_ID[id].minStage <= n), `stage ${n} uses a modifier before its minimum stage`);
  check(n % 5 !== 0 || !!p.boss, `stage ${n} should be a boss stage`);
  if (prev) check(p.arch !== prev.arch, `stage ${n} repeats the encounter type of stage ${n - 1} (${p.arch})`);
  const A = ARCHETYPES[p.arch];
  check(!!A, `stage ${n} unknown archetype ${p.arch}`);
  check(p.mods.length <= A.maxMods, `stage ${n} (${p.arch}) stacks too many modifiers`);
  check(!p.mods.some((m) => A.banMods.includes(m)), `stage ${n} (${p.arch}) uses a banned modifier: ${p.mods}`);
  for (const seed of [1, 2, 3]) {
    const L = genLayout(p, { stage: n, seed, difficulty: 'normal', mode: 'campaign' });
    const enemies = L.items.filter((i) => i.type === 'enemy');
    check(enemies.length > 4 || p.boss, `stage ${n} seed ${seed} too empty`);
    // Fairness: no row of "blocking" enemies may cover every column at the same depth without a gap.
    const rows = new Map();
    for (const it of L.items.filter((i) => i.type === 'enemy' && i.kind === 'wall')) {
      const k = Math.round(it.at);
      rows.set(k, (rows.get(k) || 0) + 1);
    }
    for (const [k, c] of rows) check(c <= 4, `stage ${n} wall row at ${k} has no gap`);
    check(L.items.every((i) => i.type !== 'enemy' || Math.abs(i.x) <= 3.7), `stage ${n} enemy off the road`);
    // Archetype-specific sanity.
    if (p.arch === 'treasure') check(L.lootGoal > 0 && L.lootGoal <= L.loot * 0.6, `stage ${n} treasure goal unfair ${L.lootGoal}/${L.loot}`);
    if (p.arch === 'siege') check(L.items.filter((i) => i.wave).length === 3, `stage ${n} siege needs 3 waves`);
    if (p.arch === 'elite') check(L.items.filter((i) => i.captain).length === 3, `stage ${n} elite hunt needs 3 captains`);
    if (p.arch === 'challenge' && p.challenge === 'marked') check(L.marked >= 6, `stage ${n} too few marked targets`);
    if (p.arch === 'ambush') check(L.items.some((i) => i.type === 'drop'), `stage ${n} ambush has no drop-ins`);
    if (p.arch !== 'boss') {
      const secs = (L.length || 0) / L.speed;
      check(secs >= 30 && secs <= 125, `stage ${n} (${p.arch}) length ${secs.toFixed(0)}s outside 30-125s`);
    }
  }
}
const a = JSON.stringify(dailySetup('2026-11-21'));
check(a === JSON.stringify(dailySetup('2026-11-21')), 'daily not deterministic');
check(a !== JSON.stringify(dailySetup('2026-11-22')), 'daily does not change by date');
const e1 = endlessProfile(5, endlessProfile(4, null));
check(e1.mods.length > 0, 'endless wave has no modifiers');
// The first ten stages introduce ten encounter types... the first 11 cover all of them.
const first = new Set(Array.from({ length: 11 }, (_, i) => stageProfile(i + 1).arch));
check(first.size === ARCHETYPE_IDS.length, `stages 1-11 should cover all ${ARCHETYPE_IDS.length} encounter types, got ${[...first]}`);
for (const start of [11, 21, 31, 41]) {
  const archs = new Set(Array.from({ length: 10 }, (_, i) => stageProfile(start + i).arch));
  console.log(`stages ${start}-${start + 9}: ${archs.size} encounter types`);
  check(archs.size >= 5, `window ${start} has only ${archs.size} encounter types`);
}
// Endless chooses: a chosen archetype is honoured, bosses every 4th wave.
check(endlessProfile(3, endlessProfile(2, null), 'siege').arch === 'siege', 'endless ignores the chosen path');
check(endlessProfile(4, endlessProfile(3, null), 'siege').arch === 'boss', 'endless wave 4 should be a boss');
// Variety across a window of ten stages.
for (const start of [1, 11, 21, 31]) {
  const win = Array.from({ length: 10 }, (_, i) => stageProfile(start + i));
  const uniq = new Set(win.map(sig)).size;
  const biomes = new Set(win.map((p) => p.biome)).size;
  const mods = new Set(win.flatMap((p) => p.mods)).size;
  console.log(`stages ${start}-${start + 9}: ${uniq} unique combos, ${biomes} realms, ${mods} different modifiers`);
  check(uniq === 10, `window ${start} has duplicate combos`);
}
console.log(fail ? `${fail} failures` : 'level generator checks passed');
process.exit(fail ? 1 : 0);
