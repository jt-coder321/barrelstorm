import { FORGE, TIERS, genStage } from './config.js';
import { fmt } from './util.js';
import { writeSave, resetSave } from './save.js';
import * as Updater from './updater.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game, save, sfx) {
    this.game = game;
    this.save = save;
    this.sfx = sfx;
    this.screen = 'menu';
    this.settingsFrom = 'menu';
    this.release = null;
    this.updating = false;
    this.lastResult = null;
    this.bind();
    this.showMenu();
    this.renderToggles();
    const v = Updater.currentVersion();
    $('menu-version').textContent = `Version ${v.name}`;
    $('upd-current').textContent = v.name;
    if (!Updater.isNative()) {
      this.setUpdateStatus('Updates install from inside the Android app. Checking works here too.', '');
    }
    if (save.settings.autoUpdate) setTimeout(() => this.checkUpdates(true), 1500);
  }

  persist() {
    writeSave(this.save);
  }

  hideAll() {
    for (const id of ['menu', 'forge', 'settings', 'pause', 'victory', 'defeat']) $(`screen-${id}`).classList.add('hidden');
    $('hud').classList.add('hidden');
  }

  show(id) {
    this.hideAll();
    $(`screen-${id}`).classList.remove('hidden');
    if (id === 'pause') $('hud').classList.remove('hidden');
    this.screen = id;
  }

  bind() {
    const click = (id, fn) =>
      $(id).addEventListener('click', () => {
        this.sfx.unlock();
        this.sfx.play('click');
        fn();
      });

    click('btn-play', () => this.play(this.save.stage));
    click('lvl-prev', () => this.setStage(this.save.stage - 1));
    click('lvl-next', () => this.setStage(this.save.stage + 1));
    click('btn-forge', () => this.showForge('menu'));
    click('btn-win-forge', () => this.showForge('victory'));
    click('btn-lose-forge', () => this.showForge('defeat'));
    click('btn-settings', () => this.showSettings('menu'));
    click('btn-pause-settings', () => this.showSettings('pause'));
    click('btn-pause', () => this.pause());
    click('btn-resume', () => this.resume());
    click('btn-restart', () => this.play(this.game.stageNum));
    click('btn-quit', () => this.quitToMenu());
    click('btn-next', () => this.play(this.save.stage));
    click('btn-retry', () => this.play(this.game.stageNum));
    click('btn-win-menu', () => this.quitToMenu());
    click('btn-lose-menu', () => this.quitToMenu());
    for (const b of document.querySelectorAll('[data-close]')) {
      b.addEventListener('click', () => {
        this.sfx.play('click');
        this.back();
      });
    }

    click('set-sound', () => this.toggle('sound'));
    click('set-haptics', () => this.toggle('haptics'));
    click('set-quality', () => this.toggle('quality'));
    click('set-autoupdate', () => this.toggle('autoUpdate'));
    click('upd-check', () => this.checkUpdates(false));
    click('upd-install', () => this.installUpdate());
    click('btn-reset', () => this.confirmReset());

    // Dragging anywhere moves the cannon.
    let last = null;
    const cv = $('game');
    const down = (e) => {
      this.sfx.unlock();
      last = e.clientX;
    };
    const move = (e) => {
      if (last === null) return;
      if (this.game.state === 'playing') this.game.dragBy(e.clientX - last);
      last = e.clientX;
    };
    const up = () => {
      last = null;
    };
    cv.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    const keys = {};
    window.addEventListener('keydown', (e) => {
      keys[e.key] = true;
      if (e.key === 'Escape' || e.key === 'p') this.screen === 'pause' ? this.resume() : this.pause();
    });
    window.addEventListener('keyup', (e) => {
      keys[e.key] = false;
    });
    this.keys = keys;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    window.__onAppPause = () => this.pause();
    window.__onBack = () => this.onBack();
  }

  // Called each frame so held keys work on desktop.
  tick(dt) {
    if (this.game.state !== 'playing') return;
    const k = this.keys;
    const dir = (k.ArrowRight || k.d ? 1 : 0) - (k.ArrowLeft || k.a ? 1 : 0);
    if (dir) this.game.dragBy(dir * dt * 900);
  }

  onBack() {
    if (this.screen === 'settings' || this.screen === 'forge') {
      this.back();
      return true;
    }
    if (this.game.state === 'playing') {
      this.pause();
      return true;
    }
    if (this.screen === 'pause') {
      this.resume();
      return true;
    }
    if (this.screen === 'victory' || this.screen === 'defeat') {
      this.quitToMenu();
      return true;
    }
    return false;
  }

  toast(text, ms = 2600) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }

  // ---------- screens ----------

  showMenu() {
    this.show('menu');
    $('menu-coins').textContent = fmt(this.save.coins);
    $('menu-level').textContent = this.save.stage;
    $('lvl-prev').style.visibility = this.save.stage > 1 ? 'visible' : 'hidden';
    $('lvl-next').style.visibility = this.save.stage < this.save.unlocked ? 'visible' : 'hidden';
    const boss = genStage(this.save.stage).boss;
    $('btn-play').textContent = boss ? 'PLAY  (BOSS)' : 'PLAY';
  }

  setStage(n) {
    this.save.stage = Math.max(1, Math.min(this.save.unlocked, n));
    this.persist();
    this.showMenu();
  }

  play(n) {
    this.hideAll();
    $('hud').classList.remove('hidden');
    this.game.callbacks.onEnd = (r) => this.showResult(r);
    this.game.startStage(n);
    this.sfx.unlock();
  }

  pause() {
    if (this.game.state !== 'playing') return;
    this.game.pause();
    this.show('pause');
  }

  resume() {
    this.hideAll();
    $('hud').classList.remove('hidden');
    this.game.resume();
  }

  quitToMenu() {
    this.game.callbacks.onEnd = null;
    this.game.toMenu();
    this.showMenu();
  }

  back() {
    if (this.screen === 'settings') {
      this.persist();
      if (this.settingsFrom === 'pause') this.show('pause');
      else this.showMenu();
    } else if (this.screen === 'forge') {
      this.persist();
      if (this.forgeFrom === 'victory') this.show('victory');
      else if (this.forgeFrom === 'defeat') this.show('defeat');
      else this.showMenu();
    }
  }

  showResult(r) {
    this.lastResult = r;
    const lines = [];
    const add = (label, val, cls = '') => lines.push(`<div class="result-line ${cls}"><span>${label}</span><span>${val}</span></div>`);
    let total = r.runCoins;
    add('Coins collected', `<span class="coin-icon"></span>${fmt(r.runCoins)}`);
    if (r.win) {
      add(r.boss ? 'Boss defeated' : 'Stage reward', `<span class="coin-icon"></span>${fmt(r.stageBonus)}`);
      total += r.stageBonus;
      if (r.perfect) {
        add('Flawless bonus', `<span class="coin-icon"></span>${fmt(r.perfect)}`);
        total += r.perfect;
      }
    }
    add('Weapon reached', `${TIERS[r.tier].name} Lv ${r.level}`);
    add('Total', `<span class="coin-icon"></span>${fmt(total)}`, 'total');
    this.save.coins += total;
    this.save.totalKills += r.kills;
    this.save.bestTier = Math.max(this.save.bestTier, r.tier);
    if (r.win) {
      this.save.unlocked = Math.max(this.save.unlocked, r.stage + 1);
      this.save.stage = r.stage + 1;
    }
    this.persist();
    if (r.win) {
      $('win-sub').textContent = `Stage ${r.stage} cleared`;
      $('win-lines').innerHTML = lines.join('');
      this.show('victory');
    } else {
      $('lose-sub').textContent = `Stage ${r.stage}: the kegs broke through`;
      $('lose-lines').innerHTML = lines.join('');
      this.show('defeat');
    }
  }

  // ---------- forge ----------

  showForge(from) {
    this.forgeFrom = from;
    this.show('forge');
    this.renderForge();
  }

  renderForge() {
    $('forge-coins').textContent = fmt(this.save.coins);
    const list = $('forge-list');
    list.innerHTML = '';
    for (const item of FORGE) {
      const lv = this.save.forge[item.id];
      const maxed = lv >= item.max;
      const cost = maxed ? 0 : item.cost(lv);
      const can = !maxed && this.save.coins >= cost;
      const row = document.createElement('div');
      row.className = 'forge-item';
      let pips = '';
      const shown = Math.min(item.max, 20);
      for (let i = 0; i < shown; i++) pips += `<i class="${i < lv ? 'on' : ''}"></i>`;
      row.innerHTML = `<div class="forge-icon">${item.icon}</div>
        <div class="forge-info"><b>${item.name}</b><small>${item.desc}</small><div class="forge-pips">${pips}</div></div>`;
      const btn = document.createElement('button');
      btn.className = `btn forge-buy ${can ? 'btn-primary' : ''}`;
      btn.disabled = !can;
      btn.innerHTML = maxed ? 'MAX' : `<span class="coin-icon"></span>${fmt(cost)}`;
      btn.addEventListener('click', () => {
        if (this.save.coins < cost) return;
        this.save.coins -= cost;
        this.save.forge[item.id]++;
        this.sfx.unlock();
        this.sfx.play('buy');
        this.persist();
        this.renderForge();
      });
      row.appendChild(btn);
      list.appendChild(row);
    }
    const arm = $('armory');
    arm.innerHTML = '';
    TIERS.forEach((t, i) => {
      const d = document.createElement('div');
      d.className = `armory-item ${i <= this.save.bestTier ? 'on' : ''}`;
      d.innerHTML = `<span class="ai">${t.icon}</span>${i <= this.save.bestTier ? t.name : '???'}`;
      arm.appendChild(d);
    });
  }

  // ---------- settings ----------

  showSettings(from) {
    this.settingsFrom = from;
    this.show('settings');
    this.renderToggles();
  }

  renderToggles() {
    const s = this.save.settings;
    $('set-sound').classList.toggle('on', s.sound);
    $('set-haptics').classList.toggle('on', s.haptics);
    $('set-quality').classList.toggle('on', s.quality);
    $('set-autoupdate').classList.toggle('on', s.autoUpdate);
    this.sfx.enabled = s.sound;
  }

  toggle(key) {
    this.save.settings[key] = !this.save.settings[key];
    if (key === 'quality') this.game.setQuality(this.save.settings.quality);
    this.renderToggles();
    this.persist();
  }

  confirmReset() {
    const b = $('btn-reset');
    if (b.dataset.armed !== '1') {
      b.dataset.armed = '1';
      b.textContent = 'Tap again to erase everything';
      setTimeout(() => {
        b.dataset.armed = '0';
        b.textContent = 'Reset all progress';
      }, 3500);
      return;
    }
    b.dataset.armed = '0';
    b.textContent = 'Reset all progress';
    const fresh = resetSave();
    Object.assign(this.save, fresh);
    this.persist();
    this.renderToggles();
    this.toast('Progress erased');
  }

  // ---------- updates ----------

  setUpdateStatus(text, cls) {
    const el = $('upd-status');
    el.textContent = text;
    el.className = `update-status ${cls || ''}`;
  }

  async checkUpdates(silent) {
    if (this.updating) return;
    const btn = $('upd-check');
    if (!silent) {
      btn.disabled = true;
      this.setUpdateStatus('Checking GitHub for a newer version...', '');
    }
    try {
      const rel = await Updater.checkLatest();
      this.release = rel;
      this.save.lastUpdateCheck = Date.now();
      if (Updater.isNewer(rel)) {
        $('update-dot').classList.remove('hidden');
        const mb = rel.apk.size ? ` (${(rel.apk.size / 1048576).toFixed(1)} MB)` : '';
        this.setUpdateStatus(`Update available: ${rel.tag}${mb}`, 'warn');
        $('upd-install').classList.remove('hidden');
        $('upd-install').textContent = Updater.isNative() ? 'Download and install' : 'Download (Android app only)';
        $('upd-install').disabled = !Updater.isNative();
        if (rel.notes) {
          $('upd-notes').textContent = rel.notes;
          $('upd-notes').classList.remove('hidden');
        }
        if (silent) this.toast(`Update ${rel.tag} is available. Open Settings to install.`, 4000);
      } else {
        $('update-dot').classList.add('hidden');
        $('upd-install').classList.add('hidden');
        $('upd-notes').classList.add('hidden');
        if (!silent) this.setUpdateStatus(rel.apk ? 'You are on the latest version.' : 'No APK is attached to the latest release yet.', 'ok');
      }
    } catch (e) {
      if (!silent) this.setUpdateStatus(e.message || 'Could not check for updates.', 'err');
    } finally {
      btn.disabled = false;
    }
  }

  installUpdate() {
    if (!this.release || !this.release.apk || this.updating) return;
    this.updating = true;
    $('upd-install').disabled = true;
    $('upd-check').disabled = true;
    const bar = $('upd-progress');
    const fill = $('upd-progress-fill');
    bar.classList.remove('hidden');
    fill.style.width = '0%';
    this.setUpdateStatus('Starting download...', '');
    Updater.installUpdate(this.release, {
      onProgress: (done, total) => {
        const pct = total > 0 ? (done / total) * 100 : 0;
        fill.style.width = `${pct.toFixed(0)}%`;
        this.setUpdateStatus(`Downloading ${(done / 1048576).toFixed(1)} of ${(total / 1048576).toFixed(1)} MB`, '');
      },
      onState: (state, msg) => {
        const done = () => {
          this.updating = false;
          $('upd-install').disabled = false;
          $('upd-check').disabled = false;
        };
        if (state === 'verifying') {
          fill.style.width = '100%';
          this.setUpdateStatus('Verifying download...', '');
        } else if (state === 'installing') {
          this.setUpdateStatus('Opening the Android installer. Tap Install, then reopen the game.', 'ok');
          done();
        } else if (state === 'need_permission') {
          this.setUpdateStatus('Allow Barrelstorm to install apps in the screen that just opened, come back, and tap the button again.', 'warn');
          done();
        } else if (state === 'error') {
          bar.classList.add('hidden');
          this.setUpdateStatus(msg || 'The update failed.', 'err');
          done();
        }
      },
    });
  }
}
