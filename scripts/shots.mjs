// Captures screenshots of bosses, environments and UI screens for visual review.
// Usage: node scripts/shots.mjs   (run `npm run build` first). Output: test-shots/
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'android/app/src/main/assets/game');
const out = resolve(root, 'test-shots');
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = resolve(dir, '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!p.startsWith(dir) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 404, body: '{}' }));
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForFunction(() => window.__bs && window.__bs.game);
const shot = (n) => page.screenshot({ path: resolve(out, `${n}.png`) });
await page.evaluate(() => {
  const { save } = window.__bs;
  save.settings.sound = false; save.unlocked = 40;
  save.weapons.unlocked = ['cannon', 'gatling', 'crossbow', 'flame', 'lightning', 'mortar', 'frost', 'rocket'];
  window.__step = (secs, x) => {
    const { game, ui } = window.__bs;
    for (let t = 0; t < secs; t += 0.033) {
      if (x !== undefined) game.targetX = x;
      if (game.draftOpen && ui.screen === 'draft') { ui.draftShownAt = 0; ui.pickDraft(0); }
      game.update(0.033);
    }
  };
});
await shot('menu');
const play = async (stage, name, secs, weapon) => {
  await page.evaluate(({ stage, weapon }) => {
    const { ui, save } = window.__bs;
    save.loadout.weapon = weapon || 'cannon';
    ui.play('campaign', stage);
  }, { stage, weapon });
  await page.waitForTimeout(500);
  await page.evaluate((s) => { window.__bs.game.hurt = () => {}; window.__step(s, 0); }, secs);
  await shot(name);
};
await page.evaluate(() => window.__bs.ui.quitToMenu());
// 2.0 encounter types (stage number -> archetype in the campaign intro order).
for (const [st, nm, secs, w] of [[1, 'arch-demolition', 16], [2, 'arch-treasure', 14, 'gatling'], [3, 'arch-survival', 22, 'flame'], [4, 'arch-siege', 20, 'crossbow'],
  [6, 'arch-elite', 20, 'lightning'], [7, 'arch-ambush', 22, 'rocket'], [8, 'arch-jackpot', 12, 'mortar'], [9, 'arch-challenge', 16, 'frost'], [11, 'arch-gauntlet', 18, 'cannon']]) {
  await play(st, nm, secs, w);
}
// A power frenzy in action.
await page.evaluate(() => { const { ui, save } = window.__bs; save.loadout.weapon = 'gatling'; ui.play('campaign', 3); });
await page.waitForTimeout(400);
await page.evaluate(() => { window.__bs.game.hurt = () => {}; window.__step(8, 0); window.__bs.game.activateFrenzy('barrage'); window.__step(1.2, 0); });
await shot('frenzy-barrage');
await page.evaluate(() => { window.__bs.game.dropOrb(0, -12, true); window.__step(0.4, 0); });
await shot('power-orb');
await play(5, 'boss-king', 14);
await play(10, 'boss-golem', 16, 'gatling');
await play(15, 'boss-machine', 16, 'lightning');
await play(20, 'boss-siege', 18, 'crossbow');
await play(25, 'boss-dragon', 16, 'rocket');
const biomes = [[4, 'volcano', 'flame'], [7, 'frozen', 'frost'], [10, 'desert-x'], [13, 'dungeon', 'mortar'], [16, 'ruins'], [19, 'forest'], [22, 'factory']];
for (const [st, nm, w] of biomes) await play(st, `biome-${nm}-s${st}`, 9, w);
await page.evaluate(() => { window.__bs.ui.play('campaign', 8); });
await page.waitForTimeout(700);
await shot('draft');
await page.evaluate(() => window.__bs.ui.quitToMenu());
for (const [k, fn] of [['loadout', 'showLoadout'], ['trophies', 'showTrophies'], ['forge', 'showForge']]) {
  await page.evaluate((f) => window.__bs.ui[f]('menu'), fn);
  await shot(`screen-${k}`);
}
await page.evaluate(() => { window.__bs.ui.mode = 'daily'; window.__bs.ui.showMenu(); });
await shot('menu-daily');
console.log('errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log(e);
await browser.close();
server.close();
