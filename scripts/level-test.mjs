// Checks the level generator without a browser: consecutive stages must differ, modifier combos must be
// legal, layouts must be fair (always a way through) and daily/endless profiles must be deterministic.
import { stageProfile, genLayout, dailySetup, endlessProfile } from '../web/src/levelgen.js';
import { MODIFIER_BY_ID } from '../web/src/data/modifiers.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
const sig = (p) => [...p.mods].sort().join('+') + '|' + p.structure + '|' + p.biome;
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
  }
}
const a = JSON.stringify(dailySetup('2026-11-21'));
check(a === JSON.stringify(dailySetup('2026-11-21')), 'daily not deterministic');
check(a !== JSON.stringify(dailySetup('2026-11-22')), 'daily does not change by date');
const e1 = endlessProfile(5, endlessProfile(4, null));
check(e1.mods.length > 0, 'endless wave has no modifiers');
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
