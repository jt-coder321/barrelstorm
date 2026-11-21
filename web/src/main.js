import { Game } from './game.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.enabled = save.settings.sound;
const canvas = document.getElementById('game');
const bridge = window.AndroidBridge || null;

const game = new Game(canvas, save, sfx, bridge);
const ui = new UI(game, save, sfx);

window.addEventListener('resize', () => game.resize());
window.addEventListener('orientationchange', () => setTimeout(() => game.resize(), 150));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  ui.tick(dt);
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for tests and debugging in a desktop browser.
window.__bs = { game, ui, save, sfx };
