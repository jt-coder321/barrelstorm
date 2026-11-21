import { FORGE, ABILITIES, ABILITY_IDS, RELICS, RELIC_IDS, DIFFICULTY, ACHIEVEMENTS, RANK_ORDER } from './data/meta.js';
import { FAMILIES, FAMILY_IDS, BLUEPRINTS_TO_UNLOCK, masteryLevel } from './data/weapons.js';
import { RARITY, SYNERGIES } from './data/cards.js';
import { BIOMES, BIOME_IDS } from './data/biomes.js';
import { MODIFIER_BY_ID, MODIFIERS } from './data/modifiers.js';
import { stageProfile, dailySetup, BOSS_NAMES, STRUCTURES, BOSS_IDS } from './levelgen.js';
import { fmt, dateKey } from './util.js';
import { writeSave, resetSave } from './save.js';
import * as Updater from './updater.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'forge', 'settings', 'pause', 'victory', 'defeat', 'loadout', 'trophies', 'draft'];

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
    this.mode = 'campaign';
    this.bind();
    this.checkAchievements(true);
    this.showMenu();
    this.renderToggles();
    const v = Updater.currentVersion();
    $('menu-version').textContent = `Version ${v.name}`;
    $('upd-current').textContent = v.name;
    if (!Updater.isNative()) {
      this.setUpdateStatus('Updates install from inside the Android app. Checking works here too.', '');
    }
    if (save.settings.autoUpdate) setTimeout(() => this.checkUpdates(true), 1500);
    game.callbacks.onDraft = (d) => this.showDraft(d);
  }

  persist() {
    writeSave(this.save);
  }

  hideAll() {
    for (const id of SCREENS) $(`screen-${id}`).classList.add('hidden');
    $('hud').classList.add('hidden');
  }

  show(id) {
    this.hideAll();
    $(`screen-${id}`).classList.remove('hidden');
    if (id === 'pause' || id === 'draft') $('hud').classList.remove('hidden');
    this.screen = id;
  }

  bind() {
    const click = (id, fn) =>
      $(id).addEventListener('click', () => {
        this.sfx.unlock();
        this.sfx.play('click');
        fn();
      });

    click('btn-play', () => this.play());
    click('lvl-prev', () => this.setStage(this.save.stage - 1));
    click('lvl-next', () => this.setStage(this.save.stage + 1));
    click('btn-forge', () => this.showForge('menu'));
    click('btn-loadout', () => this.showLoadout());
    click('btn-trophies', () => this.showTrophies());
    click('btn-win-forge', () => this.showForge('victory'));
    click('btn-lose-forge', () => this.showForge('defeat'));
    click('btn-settings', () => this.showSettings('menu'));
    click('btn-pause-settings', () => this.showSettings('pause'));
    click('btn-pause', () => this.pause());
    click('btn-resume', () => this.resume());
    click('btn-restart', () => this.replay());
    click('btn-quit', () => this.quitToMenu());
    click('btn-next', () => this.next());
    click('btn-retry', () => this.replay());
    click('btn-win-replay', () => this.replay());
    click('btn-win-menu', () => this.quitToMenu());
    click('btn-lose-menu', () => this.quitToMenu());
    click('draft-reroll', () => this.game.rerollDraft());
    click('draft-skip', () => this.pickDraft(-1));
    for (const b of document.querySelectorAll('[data-close]')) {
      b.addEventListener('click', () => {
        this.sfx.play('click');
        this.back();
      });
    }
    for (const t of document.querySelectorAll('.mode-tabs .tab')) {
      t.addEventListener('click', () => {
        this.sfx.unlock();
        this.sfx.play('click');
        this.mode = t.dataset.mode;
        this.showMenu();
      });
    }
    const ab = $('hud-ability');
    ab.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.sfx.unlock();
      if (!this.game.useAbility()) this.sfx.play('click');
    });

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
      if (this.game.state === 'playing' && !this.game.draftOpen) this.game.dragBy(e.clientX - last);
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
      if (e.key === ' ' || e.key === 'e') this.game.useAbility();
      if (this.screen === 'draft' && ['1', '2', '3', '4'].includes(e.key)) this.pickDraft(Number(e.key) - 1);
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
    if (this.game.state !== 'playing' || this.game.draftOpen) return;
    const k = this.keys;
    const dir = (k.ArrowRight || k.d ? 1 : 0) - (k.ArrowLeft || k.a ? 1 : 0);
    if (dir) this.game.dragBy(dir * dt * 900);
  }

  onBack() {
    if (['settings', 'forge', 'loadout', 'trophies'].includes(this.screen)) {
      this.back();
      return true;
    }
    if (this.screen === 'draft') return true;
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

  // ---------- menu ----------

  stars(n, max = 3) {
    let s = '';
    for (let i = 0; i < max; i++) s += `<i class="${i < n ? 'on' : ''}">★</i>`;
    return s;
  }

  showMenu() {
    this.show('menu');
    $('menu-coins').textContent = fmt(this.save.coins);
    for (const t of document.querySelectorAll('.mode-tabs .tab')) t.classList.toggle('on', t.dataset.mode === this.mode);
    const info = $('stage-info');
    const chip = (m) => `<span class="chip" title="${m.desc}">${m.icon} ${m.name}</span>`;
    const w = this.save.loadout.weapon;
    $('level-select').classList.toggle('hidden', this.mode !== 'campaign');
    if (this.mode === 'campaign') {
      const n = this.save.stage;
      $('menu-level').textContent = n;
      $('lvl-prev').style.visibility = n > 1 ? 'visible' : 'hidden';
      $('lvl-next').style.visibility = n < this.save.unlocked ? 'visible' : 'hidden';
      const r = this.save.ranks[n];
      $('menu-stars').innerHTML = r ? `${this.stars(r.stars)} <span class="rank-mini">${r.rank}</span>` : '<small class="new">NEW</small>';
      const p = stageProfile(n);
      const b = BIOMES[p.biome];
      const lines = [`<div class="si-biome">${b.icon} ${b.name}<small>${b.hazardName}</small></div>`];
      if (p.boss) lines.push(`<div class="si-boss">&#9760; BOSS: ${BOSS_NAMES[p.boss]}</div>`);
      else lines.push(`<div class="si-obj">${p.objective === 'survive' ? '⏱ Hold the line' : p.objective === 'hunt' ? '\u{1F451} Hunt the captains' : '\u{1F4A5} Destroy the barrels'} · ${STRUCTURES[p.structure].name}</div>`);
      lines.push(`<div class="chips">${p.mods.map((id) => chip(MODIFIER_BY_ID[id])).join('')}</div>`);
      info.innerHTML = lines.join('');
      $('btn-play').textContent = p.boss ? 'FIGHT THE BOSS' : 'PLAY';
      this.renderDifficulty();
    } else if (this.mode === 'daily') {
      const d = dailySetup(dateKey());
      const done = this.save.daily.date === dateKey() && this.save.daily.done;
      const f = FAMILIES[d.weapon];
      info.innerHTML = `<div class="si-biome">\u{1F4C5} Today's challenge<small>Same stage for everyone today. Random weapon, three modifiers.</small></div>
        <div class="si-obj">${BIOMES[d.profile.biome].icon} ${BIOMES[d.profile.biome].name} · ${f.icon} ${f.name}</div>
        <div class="chips">${d.profile.mods.map((id) => chip(MODIFIER_BY_ID[id])).join('')}</div>
        <div class="si-best">${done ? `Cleared today · best score ${fmt(this.save.daily.best)}` : 'First clear today: +300 coins and a blueprint'}</div>`;
      $('diff-row').innerHTML = '';
      $('btn-play').textContent = done ? 'PLAY AGAIN' : 'PLAY DAILY';
    } else {
      info.innerHTML = `<div class="si-biome">♾ Endless siege<small>Waves never stop. Every wave a new realm and new modifiers. Bosses every 4th wave.</small></div>
        <div class="si-best">Best wave ${this.save.endless.bestWave || 0} · best score ${fmt(this.save.endless.bestScore || 0)}</div>
        <div class="si-obj">Weapon: ${FAMILIES[w].icon} ${FAMILIES[w].name}</div>`;
      $('diff-row').innerHTML = '';
      $('btn-play').textContent = 'START ENDLESS';
    }
    $('trophy-dot').classList.toggle('hidden', !this.newTrophy);
  }

  renderDifficulty() {
    const row = $('diff-row');
    row.innerHTML = '';
    for (const d of Object.values(DIFFICULTY)) {
      const unlocked = this.save.unlocked >= d.unlock;
      const b = document.createElement('button');
      b.className = `diff ${this.save.difficulty === d.id ? 'on' : ''}`;
      b.disabled = !unlocked;
      b.innerHTML = unlocked ? `${d.name}<small>${d.coins > 1 ? `coins x${d.coins}` : 'standard'}</small>` : `\u{1F512} ${d.name}<small>stage ${d.unlock}</small>`;
      b.addEventListener('click', () => {
        this.sfx.play('click');
        this.save.difficulty = d.id;
        this.persist();
        this.renderDifficulty();
      });
      row.appendChild(b);
    }
  }

  setStage(n) {
    this.save.stage = Math.max(1, Math.min(this.save.unlocked, n));
    this.persist();
    this.showMenu();
  }

  play(mode = this.mode, stage = this.save.stage) {
    this.hideAll();
    $('hud').classList.remove('hidden');
    this.game.callbacks.onEnd = (r) => this.showResult(r);
    this.lastPlay = { mode, stage };
    this.game.startStage({ mode, stage });
    this.sfx.unlock();
  }

  replay() {
    const lp = this.lastPlay || { mode: 'campaign', stage: this.save.stage };
    this.play(lp.mode, lp.stage);
  }

  next() {
    const lp = this.lastPlay || { mode: 'campaign' };
    if (lp.mode === 'campaign') this.play('campaign', this.save.stage);
    else this.play(lp.mode, lp.stage);
  }

  pause() {
    if (this.game.state !== 'playing' || this.screen === 'draft') return;
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
    this.persist();
    if (this.screen === 'settings') {
      if (this.settingsFrom === 'pause') this.show('pause');
      else this.showMenu();
    } else if (this.screen === 'forge') {
      if (this.forgeFrom === 'victory') this.show('victory');
      else if (this.forgeFrom === 'defeat') this.show('defeat');
      else this.showMenu();
    } else {
      this.showMenu();
    }
  }

  // ---------- draft ----------

  showDraft(d) {
    this.show('draft');
    $('banner').classList.add('hidden');
    $('draft-title').textContent = d.title;
    $('draft-sub').textContent = d.sub || '';
    const wrap = $('draft-cards');
    wrap.innerHTML = '';
    wrap.classList.toggle('four', d.cards.length > 3);
    d.cards.forEach((c, i) => {
      const r = RARITY[c.rarity];
      const el = document.createElement('button');
      el.className = `card r-${c.rarity}`;
      el.style.setProperty('--rc', r.color);
      el.style.animationDelay = `${i * 0.09}s`;
      const tag = c.weapon ? 'WEAPON' : c.tags ? c.tags.map((t) => t.toUpperCase()).join(' · ') : '';
      el.innerHTML = `<div class="card-rarity">${r.name}</div><div class="card-icon">${c.icon}</div><div class="card-name">${c.name}</div>
        <div class="card-desc">${c.desc}</div>${tag ? `<div class="card-tag">${tag}</div>` : ''}`;
      el.disabled = !d.canAfford;
      el.addEventListener('click', () => this.pickDraft(i));
      wrap.appendChild(el);
    });
    $('draft-reroll').classList.toggle('hidden', !(d.rerolls > 0));
    $('draft-reroll').textContent = `\u{1F3B2} Reroll (${d.rerolls})`;
    $('draft-skip').classList.toggle('hidden', !d.canSkip);
    this.draftShownAt = performance.now();
  }

  pickDraft(i) {
    if (this.screen !== 'draft') return;
    if (performance.now() - (this.draftShownAt || 0) < 350) return; // avoid accidental taps
    this.sfx.unlock();
    this.hideAll();
    $('hud').classList.remove('hidden');
    this.screen = 'game';
    this.game.pickCard(i);
  }

  // ---------- results ----------

  showResult(r) {
    this.lastResult = r;
    const lines = [];
    const add = (label, val, cls = '') => lines.push(`<div class="result-line ${cls}"><span>${label}</span><span>${val}</span></div>`);
    const coin = (v) => `<span class="coin-icon"></span>${fmt(v)}`;
    let total = r.runCoins;
    add('Coins collected', coin(r.runCoins));
    if (r.win) {
      add(r.boss ? 'Boss defeated' : 'Stage reward', coin(r.stageBonus));
      total += r.stageBonus;
      if (r.objBonus) {
        add('Objectives', coin(r.objBonus));
        total += r.objBonus;
      }
    }
    if (r.mode === 'daily' && r.win && !(this.save.daily.date === r.daily && this.save.daily.done)) {
      add('Daily first clear', coin(300));
      total += 300;
      const locked = FAMILY_IDS.filter((f) => !this.save.weapons.unlocked.includes(f));
      if (locked.length) this.game.addBlueprint(locked[Math.floor(Math.random() * locked.length)]);
    }
    add('Score', fmt(r.score));
    add('Best combo / chain', `${r.bestCombo} / ${r.bestChain}`);
    const f = FAMILIES[r.family];
    add('Weapon', `${f.icon} ${f.forms[r.form].name} Lv ${r.level}`);
    for (const bp of r.drops.blueprints) add('Blueprint', `${FAMILIES[bp].icon} ${FAMILIES[bp].name} ${Math.min(BLUEPRINTS_TO_UNLOCK, this.save.weapons.blueprints[bp] || 0)}/${BLUEPRINTS_TO_UNLOCK}`, 'drop');
    if (r.drops.unlockedWeapon) add('Unlocked!', `${FAMILIES[r.drops.unlockedWeapon].icon} ${FAMILIES[r.drops.unlockedWeapon].name}`, 'drop');
    if (r.drops.relic) add('Relic', `${RELICS[r.drops.relic].icon} ${RELICS[r.drops.relic].name}`, 'drop');
    for (const s of r.synergies) {
      const sy = SYNERGIES.find((x) => x.id === s);
      add('Synergy', `${sy.icon} ${sy.name}`);
    }
    add('Total', coin(total), 'total');

    const sv = this.save;
    sv.coins += total;
    sv.totalKills += r.kills;
    const st = sv.stats;
    st.totalKills = (st.totalKills || 0) + r.kills;
    st.bestCombo = Math.max(st.bestCombo || 0, r.bestCombo);
    st.bestChain = Math.max(st.bestChain || 0, r.bestChain);
    if (r.mode === 'campaign' && r.win) {
      sv.unlocked = Math.max(sv.unlocked, r.stage + 1);
      sv.stage = r.stage + 1;
      st.cleared = Math.max(st.cleared || 0, r.stage);
      const prev = sv.ranks[r.stage];
      const better = !prev || RANK_ORDER.indexOf(r.rank) > RANK_ORDER.indexOf(prev.rank);
      sv.ranks[r.stage] = {
        rank: better ? r.rank : prev.rank, stars: Math.max(prev ? prev.stars : 0, r.stars), score: Math.max(prev ? prev.score : 0, r.score),
      };
      for (const id of ABILITY_IDS) if (ABILITIES[id].unlock <= sv.unlocked && !sv.abilitiesSeen) sv.abilitiesSeen = true;
    }
    if (r.rank === 'S') st.sRanks = (st.sRanks || 0) + 1;
    if (r.mode === 'daily' && r.win) {
      if (sv.daily.date !== r.daily) sv.daily = { date: r.daily, best: 0, done: false };
      sv.daily.done = true;
      sv.daily.best = Math.max(sv.daily.best, r.score);
      st.dailies = (st.dailies || 0) + 1;
    }
    if (r.mode === 'endless') {
      sv.endless.bestWave = Math.max(sv.endless.bestWave || 0, r.wave);
      sv.endless.bestScore = Math.max(sv.endless.bestScore || 0, r.score);
      st.bestWave = Math.max(st.bestWave || 0, r.wave);
    }
    this.checkAchievements(false);
    this.persist();
    const objs = r.objectives.map((o) => `<div class="robj ${o.done ? 'done' : ''}">${o.done ? '★' : '☆'} ${o.text}</div>`).join('');
    if (r.win) {
      $('win-sub').textContent = r.mode === 'daily' ? 'Daily challenge cleared' : `Stage ${r.stage} cleared`;
      $('win-rank').textContent = r.rank;
      $('win-rank').className = `rank rank-${r.rank}`;
      $('win-stars').innerHTML = this.stars(r.stars);
      $('win-objs').innerHTML = objs;
      $('win-lines').innerHTML = lines.join('');
      $('btn-next').textContent = r.mode === 'campaign' ? 'Next stage' : 'Play again';
      this.show('victory');
    } else {
      $('lose-sub').textContent = r.mode === 'endless' ? `Fell on wave ${r.wave}` : `Stage ${r.stage}: the siege broke through`;
      $('lose-rank-row').classList.toggle('hidden', r.mode !== 'endless');
      $('lose-rank').textContent = r.rank;
      $('lose-lines').innerHTML = lines.join('');
      $('lose-hint').textContent = this.tip(r);
      this.show('defeat');
    }
  }

  tip(r) {
    if (r.boss) return `Boss tip: ${({ king: 'shoot his kegs while they are next to him', golem: 'stand in the shockwave gap, then hit the glowing cores', machine: 'destroy both generators to drop the shield', siege: 'break the planks first, then watch for the safe lane', dragon: 'move out of the fire lane, strike when it lands' })[r.boss]}.`;
    const tips = [
      'Combine card tags: fire + explosive makes Napalm, frost + explosive makes Cryoblast.',
      'Your ability button (bottom right) charges with every kill.',
      'Kill shield bearers first; they protect everything around them.',
      'Shoot powder kegs inside a crowd for chain bonuses.',
      'Try another weapon in the Loadout: each one plays differently.',
      'The Forge makes every run stronger.',
    ];
    return `Tip: ${tips[Math.floor(Math.random() * tips.length)]}`;
  }

  // ---------- achievements ----------

  checkAchievements(silent) {
    const st = this.save.stats;
    st.weaponsUnlocked = this.save.weapons.unlocked.length;
    st.relicsOwned = this.save.relics.length;
    for (const a of ACHIEVEMENTS) {
      if (this.save.achievements[a.id]) continue;
      if ((st[a.stat] || 0) >= a.goal) {
        this.save.achievements[a.id] = true;
        this.save.coins += a.reward;
        this.newTrophy = true;
        if (!silent) setTimeout(() => this.toast(`\u{1F3C6} ${a.name}: +${a.reward} coins`, 3200), 600);
      }
    }
  }

  showTrophies() {
    this.newTrophy = false;
    this.show('trophies');
    const st = this.save.stats;
    const stat = (label, v) => `<div><b>${v}</b><small>${label}</small></div>`;
    const stars = Object.values(this.save.ranks).reduce((a, r) => a + r.stars, 0);
    $('trophy-stats').innerHTML = [
      stat('Stages cleared', st.cleared || 0), stat('Stars', stars), stat('Targets destroyed', fmt(st.totalKills || 0)),
      stat('Best combo', st.bestCombo || 0), stat('Best chain', st.bestChain || 0), stat('Bosses slain', st.bossKills || 0),
      stat('Endless best', `W${this.save.endless.bestWave || 0}`), stat('S ranks', st.sRanks || 0), stat('Vaults found', st.vaults || 0),
    ].join('');
    $('trophy-list').innerHTML = ACHIEVEMENTS.map((a) => {
      const done = this.save.achievements[a.id];
      const prog = Math.min(a.goal, st[a.stat] || 0);
      return `<div class="ach ${done ? 'done' : ''}"><div class="ach-i">${done ? '\u{1F3C6}' : '\u{1F512}'}</div><div class="ach-t"><b>${a.name}</b><small>${a.desc}</small>
        ${done ? '' : `<div class="ach-bar"><i style="width:${(prog / a.goal) * 100}%"></i></div>`}</div><div class="ach-r"><span class="coin-icon"></span>${a.reward}</div></div>`;
    }).join('');
    const seen = (on, label) => `<span class="chip ${on ? '' : 'off'}">${on ? label : '???'}</span>`;
    const realms = BIOME_IDS.map((id) => seen(BIOMES[id].unlock <= this.save.unlocked, `${BIOMES[id].icon} ${BIOMES[id].name}`)).join('');
    const bosses = BOSS_IDS.map((id) => seen(this.save.bossesBeaten.includes(id), BOSS_NAMES[id])).join('');
    const syn = SYNERGIES.map((s) => seen(this.save.synergiesSeen.includes(s.id), `${s.icon} ${s.name}`)).join('');
    $('trophy-codex').innerHTML = `<div class="codex"><small>Realms</small>${realms}</div><div class="codex"><small>Bosses slain</small>${bosses}</div>
      <div class="codex"><small>Synergies</small>${syn}</div><div class="codex"><small>Modifiers</small>${MODIFIERS.length} in the rotation</div>`;
  }

  // ---------- loadout ----------

  showLoadout() {
    this.show('loadout');
    this.renderLoadout();
  }

  renderLoadout() {
    const sv = this.save;
    const wrap = $('loadout-weapons');
    wrap.innerHTML = '';
    for (const fid of FAMILY_IDS) {
      const f = FAMILIES[fid];
      const unlocked = sv.weapons.unlocked.includes(fid);
      const m = masteryLevel(sv.weapons.mastery[fid] || 0);
      const b = document.createElement('button');
      b.className = `pick ${sv.loadout.weapon === fid ? 'on' : ''} ${unlocked ? '' : 'locked'}`;
      b.innerHTML = `<span class="pi">${f.icon}</span><b>${f.name}</b><small>${unlocked ? f.blurb : `Blueprints ${sv.weapons.blueprints[fid] || 0}/${BLUEPRINTS_TO_UNLOCK}`}</small>
        ${unlocked ? `<div class="mastery">Mastery ${m.level}<i style="width:${m.level >= 10 ? 100 : (m.into / m.need) * 100}%"></i></div>` : ''}`;
      b.disabled = !unlocked;
      b.addEventListener('click', () => {
        sv.loadout.weapon = fid;
        this.sfx.play('click');
        this.persist();
        this.renderLoadout();
      });
      wrap.appendChild(b);
    }
    const ab = $('loadout-abilities');
    ab.innerHTML = '';
    for (const id of ABILITY_IDS) {
      const a = ABILITIES[id];
      const unlocked = sv.unlocked >= a.unlock;
      const b = document.createElement('button');
      b.className = `pick ${sv.loadout.ability === id ? 'on' : ''} ${unlocked ? '' : 'locked'}`;
      b.innerHTML = `<span class="pi">${a.icon}</span><b>${a.name}</b><small>${unlocked ? a.desc : `Reach stage ${a.unlock}`}</small>`;
      b.disabled = !unlocked;
      b.addEventListener('click', () => {
        sv.loadout.ability = id;
        this.sfx.play('click');
        this.persist();
        this.renderLoadout();
      });
      ab.appendChild(b);
    }
    const rl = $('loadout-relics');
    rl.innerHTML = '';
    const none = document.createElement('button');
    none.className = `pick ${!sv.loadout.relic ? 'on' : ''}`;
    none.innerHTML = '<span class="pi">∅</span><b>None</b><small>Find relics in chests and from bosses</small>';
    none.addEventListener('click', () => {
      sv.loadout.relic = '';
      this.persist();
      this.renderLoadout();
    });
    rl.appendChild(none);
    for (const id of RELIC_IDS) {
      const r = RELICS[id];
      const owned = sv.relics.includes(id);
      const b = document.createElement('button');
      b.className = `pick ${sv.loadout.relic === id ? 'on' : ''} ${owned ? '' : 'locked'}`;
      b.innerHTML = owned ? `<span class="pi">${r.icon}</span><b>${r.name}</b><small>${r.desc}</small>` : '<span class="pi">?</span><b>???</b><small>Not found yet</small>';
      b.disabled = !owned;
      b.addEventListener('click', () => {
        sv.loadout.relic = id;
        this.sfx.play('click');
        this.persist();
        this.renderLoadout();
      });
      rl.appendChild(b);
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
      const lv = this.save.forge[item.id] || 0;
      const maxed = lv >= item.max;
      const cost = maxed ? 0 : item.cost(lv);
      const can = !maxed && this.save.coins >= cost;
      const row = document.createElement('div');
      row.className = 'forge-item';
      let pips = '';
      for (let i = 0; i < Math.min(item.max, 20); i++) pips += `<i class="${i < lv ? 'on' : ''}"></i>`;
      row.innerHTML = `<div class="forge-icon">${item.icon}</div>
        <div class="forge-info"><b>${item.name}</b><small>${item.desc}</small><div class="forge-pips">${pips}</div></div>`;
      const btn = document.createElement('button');
      btn.className = `btn forge-buy ${can ? 'btn-primary' : ''}`;
      btn.disabled = !can;
      btn.innerHTML = maxed ? 'MAX' : `<span class="coin-icon"></span>${fmt(cost)}`;
      btn.addEventListener('click', () => {
        if (this.save.coins < cost) return;
        this.save.coins -= cost;
        this.save.forge[item.id] = lv + 1;
        this.sfx.unlock();
        this.sfx.play('buy');
        this.persist();
        this.renderForge();
      });
      row.appendChild(btn);
      list.appendChild(row);
    }
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
          this.setUpdateStatus('Allow the game to install apps in the screen that just opened, come back, and tap the button again.', 'warn');
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
