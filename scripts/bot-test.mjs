// Headless play test. Builds nothing itself: run `npm run build` first.
// Usage: node scripts/bot-test.mjs [--stages 1-12] [--mode campaign|daily|endless] [--speed 6] [--shots]
// A bot steers away from telegraphed hazards, chases targets, picks cards and uses abilities.
// The game is fast-forwarded by stepping the simulation several times per frame.
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright is not a project dependency; use the copy installed on the machine (CI image or global).
const { chromium } = createRequire(import.meta.url)('playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'android/app/src/main/assets/game');
const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const [s0, s1] = arg('stages', '1-10').split('-').map(Number);
const mode = arg('mode', 'campaign');
const speed = Number(arg('speed', '6'));
const shots = args.includes('--shots');
const forge = arg('forge', '0');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = resolve(dir, '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!p.startsWith(dir) || !existsSync(p)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 404, body: '{}' }));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.__bs && window.__bs.game);

// Bot + fast-forward installed in the page.
await page.evaluate(({ speed, forge }) => {
  const { game, ui, save } = window.__bs;
  save.settings.sound = false;
  const lv = Number(forge);
  for (const k of ['damage', 'rate']) save.forge[k] = lv;
  const lanes = [-2.8, -2.1, -1.4, -0.7, 0, 0.7, 1.4, 2.1, 2.8];
  window.__log = [];
  function danger(x) {
    let d = 0;
    for (const h of game.hazards.list) {
      if (h.type === 'zone') {
        const left = h.delay - h.t;
        if (left < 1.2 && Math.abs(h.x - x) < h.r + 0.7 && h.z > -2.5 - h.r && h.z < 2 + h.r) d += 10;
      } else if (h.type === 'lane') {
        if (h.t < h.delay + h.active && Math.abs(h.x - x) < h.w / 2 + 0.6 && h.z0 < 1 && h.z1 > -1) d += 10;
      } else if (h.type === 'wave') {
        const z = h.obj.position.z;
        if (z > -14 && z < 1 && Math.abs(x - h.gapX) > h.gapW / 2 - 0.4) d += 12;
      }
    }
    for (const b of game.barrels) {
      if (b.dead || b.part || !game.collides(b)) continue;
      if (b.z > -5 && b.z < 1 && Math.abs(b.x - x) < b.r + 0.6) d += 8;
    }
    return d;
  }
  function bot() {
    if (ui.screen === 'draft') {
      if (performance.now() - ui.draftShownAt > 400) {
        const cards = [...document.querySelectorAll('#draft-cards .card')].filter((c) => !c.disabled);
        if (cards.length) cards[Math.floor(Math.random() * cards.length)].click();
        else document.getElementById('draft-skip').click();
      }
      return;
    }
    if (game.state !== 'playing') return;
    if (game.ability.charge >= 1) game.useAbility();
    // target: the threatening enemy nearest the castle
    let want = 0;
    let best = -1e9;
    for (const b of game.barrels) {
      if (b.dead) continue;
      const harmless = b.def && b.def.leak === 0 && !b.def.anvil && !b.def.chest && !b.def.treasure && !b.def.altar;
      if (harmless && !b.part) continue;
      const score = b.z + (b.part ? -10 : 0) + (b.def && (b.def.anvil || b.def.chest) ? 6 : 0);
      if (score > best) {
        best = score;
        want = b.x;
      }
    }
    // gates: prefer the side of a close gate
    for (const g of game.gates) if (!g.taken && g.z > -8 && g.z < 0 && g.kind !== 'risky') want = g.x;
    // pickups: drive into orbs, gold and hearts that are close
    let pz = -1e9;
    for (const p of game.pickups || []) if (p.z > -9 && p.z < 0.5 && p.z > pz) { pz = p.z; want = p.x; }
    let pick = want;
    let pd = 1e9;
    for (const x of lanes) {
      const c = danger(x) * 3 + Math.abs(x - want) + Math.abs(x - game.player.root.position.x) * 0.3;
      if (c < pd) {
        pd = c;
        pick = x;
      }
    }
    game.targetX = pick;
  }
  window.__bot = bot;
  game.dragged = true;
  setInterval(() => {
    for (let i = 0; i < speed; i++) {
      bot();
      ui.tick(0.033);
      game.update(0.033);
    }
  }, 16);
}, { speed, forge });

const results = [];
const run = async (stage) => {
  const t0 = Date.now();
  const r = await page.evaluate(({ mode, stage }) => new Promise((res) => {
    const { ui, game } = window.__bs;
    const seen = { events: new Set(), kinds: new Set(), drafts: 0, bosses: [] };
    const iv = setInterval(() => {
      for (const b of game.barrels) seen.kinds.add(b.part ? `boss:${b.boss.id}` : b.kind);
      for (const e of game.eventsSeen || []) seen.events.add(e);
      if (game.elapsed > 260 && game.state === 'playing') {
        // Watchdog: report a stuck stage instead of hanging forever.
        clearInterval(iv);
        ui.showResult = orig;
        res({ stuck: true, win: false, rank: '-', stars: 0, hearts: game.hearts, elapsed: game.elapsed, biome: game.profile.biome, mods: game.profile.mods, boss: game.profile.boss,
          arch: game.profile.arch, kindsSeen: [...seen.kinds], eventsSeen: [], cards: [], synergies: [], hurtLog: [], bestCombo: 0, bestChain: 0,
          loseReason: `STUCK items ${game.nextItem}/${game.items.length} live ${game.barrels.filter((b) => !b.dead).map((b) => b.kind + '@' + b.z.toFixed(0)).join(',')} draft ${game.draftOpen} q ${game.draftQueue.length} pk ${game.pickups.length} boss ${!!game.bossRef}` });
      }
    }, 100);
    var orig = ui.showResult.bind(ui);
    ui.showResult = (r) => {
      orig(r);
      ui.showResult = orig;
      clearInterval(iv);
      res({ ...r, kindsSeen: [...seen.kinds], eventsSeen: [...seen.events], hearts: game.hearts, cards: Object.keys(game.cardsTaken), elapsed: game.elapsed });
    };
    ui.save.unlocked = Math.max(ui.save.unlocked, stage);
    ui.play(mode, stage);
  }), { mode, stage });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  results.push(r);
  console.log(`${mode} ${stage}: ${r.win ? 'WIN ' : 'LOSE'} rank ${r.rank} stars ${r.stars} hearts ${r.hearts} game ${r.elapsed.toFixed(0)}s real ${secs}s | ${r.biome} [${r.mods.join(',')}] boss=${r.boss || '-'}`);
  console.log(`   arch: ${r.arch}${r.challenge ? '/' + r.challenge : ''} ${r.loseReason || ''} frenzies ${r.frenzies} bossfight ${(r.bossFightT || 0).toFixed(0)}s loot ${r.loot}/${r.lootGoal} gate ${r.gate}`);
  console.log(`   kinds: ${r.kindsSeen.join(' ')}`);
  console.log(`   events: ${r.eventsSeen.join(' ')} | cards: ${r.cards.join(' ')} | synergies: ${r.synergies.join(' ')} | combo ${r.bestCombo} chain ${r.bestChain}`);
  console.log(`   hurt: ${r.hurtLog.join(' ')}`);
  if (shots) {
    mkdirSync(resolve(root, 'test-shots'), { recursive: true });
    await page.screenshot({ path: resolve(root, `test-shots/${mode}-${stage}.png`) });
  }
};

const shotDuring = async (name) => {
  if (!shots) return;
  mkdirSync(resolve(root, 'test-shots'), { recursive: true });
  await page.screenshot({ path: resolve(root, `test-shots/${name}.png`) });
};

if (mode === 'campaign') {
  for (let s = s0; s <= s1; s++) await run(s);
} else {
  await run(1);
}
await shotDuring('end');
const wins = results.filter((r) => r.win).length;
console.log(`\n${wins}/${results.length} won. Errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('ERROR', e);
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
