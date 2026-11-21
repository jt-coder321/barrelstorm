import {
  THREE, M, initMaterials, initGeometry, buildBarrel, disposeBarrel, drawLabel, barrelRadius, barrelHeight,
  buildPlayer, setPlayerWeapon, buildGate, drawGateLabel, disposeGate, buildSpikes, ParticleSystem, ProjectileRenderer,
  RingFx, CoinFx, buildEnvironment, updateEnvironment,
} from './gfx.js';
import {
  FIELD, colX, TIERS, BASE_RATE, BASE_DAMAGE, MAX_BOLTS, MAX_RATE, tierForLevel, xpNeeded, GATE_KINDS,
  BASE_HEARTS, genStage, stageReward,
} from './config.js';
import { clamp, lerp, rand, fmt, fmtStat } from './util.js';

const WOOD = [0x8a5a2b, 0xa06a33, 0x5a3a1e, 0xc08a4a];
const SPARK = [0xffe27a, 0xffb347, 0xffffff];
const BLAST = [0xffd23a, 0xff8a1f, 0xff4d1a, 0x5a3a1e];

export class Game {
  constructor(canvas, save, sfx, bridge) {
    this.canvas = canvas;
    this.save = save;
    this.sfx = sfx;
    this.bridge = bridge;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 160);
    initMaterials();
    initGeometry();
    this.env = buildEnvironment(this.scene);
    this.player = buildPlayer();
    this.scene.add(this.player.root);
    setPlayerWeapon(this.player, 0);
    this.particles = new ParticleSystem(this.scene, 800);
    this.projR = new ProjectileRenderer(this.scene, 320);
    this.rings = new RingFx(this.scene);
    this.coinFx = new CoinFx(this.scene, 40);

    this.pool = { normal: [], powder: [], gift: [], big: [], boss: [] };
    this.barrels = [];
    this.gates = [];
    this.spikes = [];
    this.projs = [];
    this.stage = null;
    this.state = 'menu';
    this.time = 0;
    this.shake = 0;
    this.targetX = 0;
    this.scroll = 1.2;
    this.callbacks = {};
    this.hudCache = {};
    this.timeScale = 1;
    this.slowT = 0;
    this.popups = [];
    this.hud = {};
    for (const id of [
      'hud-level', 'hud-progress-fill', 'hud-coins', 'hud-hearts', 'hud-combo', 'hud-boss', 'hud-boss-fill', 'hud-weapon',
      'hud-wlv', 'hud-wxp', 'hud-dmg', 'hud-rate', 'hud-bolts', 'popups', 'banner', 'banner-title', 'banner-sub', 'flash', 'drag-hint',
    ]) this.hud[id] = document.getElementById(id);

    this.hud['flash'].style.opacity = '0';
    this.setQuality(save.settings.quality);
    this.resize();
    this.vec = new THREE.Vector3();
    this.resetRun(1);
  }

  setQuality(high) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(high ? Math.min(dpr, 2.5) : Math.min(dpr, 1.4));
    this.particles.budget = high ? 1 : 0.5;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    const half = Math.atan(4.6 / 14.6 / aspect);
    this.camera.fov = clamp((half * 2 * 180) / Math.PI, 48, 72);
    this.camera.updateProjectionMatrix();
    this.canvasW = w;
  }

  // ---------- weapon stats ----------

  stats() {
    const f = this.save.forge;
    const tier = TIERS[this.tier];
    const dmg = BASE_DAMAGE * (1 + 0.22 * (this.level - 1)) * (1 + 0.12 * f.damage) * (1 + this.gateDmg);
    const rate = Math.min(MAX_RATE, BASE_RATE * tier.rate * (1 + 0.08 * f.rate) * (1 + this.gateRate));
    const bolts = Math.min(MAX_BOLTS, 1 + tier.bolts + this.gateBolts + f.bolts);
    return { dmg: Math.max(1, Math.round(dmg)), rate, bolts, tier };
  }

  // ---------- stage lifecycle ----------

  resetRun(n) {
    this.stageNum = n;
    this.level = 1 + this.save.forge.start;
    this.tier = tierForLevel(this.level);
    this.xp = 0;
    this.gateBolts = 0;
    this.gateDmg = 0;
    this.gateRate = 0;
    this.maxHearts = BASE_HEARTS + this.save.forge.hearts;
    this.hearts = this.maxHearts;
    this.runCoins = 0;
    this.kills = 0;
    this.killWeight = 0;
    this.combo = 0;
    this.comboT = 0;
    this.invuln = 0;
    this.fireT = 0.3;
    this.recoil = 0;
    this.hurtCount = 0;
    this.player.root.position.x = 0;
    this.targetX = 0;
    setPlayerWeapon(this.player, this.tier);
  }

  clearStage() {
    for (const b of this.barrels) this.releaseBarrel(b);
    this.barrels.length = 0;
    for (const g of this.gates) {
      this.scene.remove(g.view.group);
      disposeGate(g.view);
    }
    this.gates.length = 0;
    for (const s of this.spikes) this.scene.remove(s.view.group);
    this.spikes.length = 0;
    this.projs.length = 0;
    this.particles.clear();
    this.rings.clear();
    this.coinFx.clear();
    for (const p of this.popups) p.el.remove();
    this.popups.length = 0;
  }

  startStage(n) {
    this.clearStage();
    this.resetRun(n);
    this.stage = genStage(n);
    this.items = [...this.stage.items].sort((a, b) => a.at - b.at);
    this.nextItem = 0;
    this.D = 22;
    this.totalWeight = this.stage.barrels + (this.stage.boss ? 5 : 0);
    this.bossRef = null;
    this.bossTimer = 0;
    this.endT = 0;
    this.state = 'playing';
    this.timeScale = 1;
    this.slowT = 0;
    this.scroll = this.stage.speed;
    this.hud['hud-boss'].classList.add('hidden');
    this.hud['hud-combo'].classList.add('hidden');
    this.hud['flash'].style.opacity = 0;
    this.hudCache = {};
    this.updateHud(true);
    this.showBanner(`STAGE ${n}`, this.stage.boss ? 'Boss ahead!' : 'Destroy the barrels', this.stage.boss);
    this.sfx.play('gate');
    this.spawnDue();
  }

  toMenu() {
    this.clearStage();
    this.resetRun(this.save.stage);
    this.state = 'menu';
    this.scroll = 1.2;
  }

  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.sfx.suspend();
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.sfx.unlock();
    }
  }

  // ---------- spawning ----------

  acquireBarrel(kind) {
    const list = this.pool[kind];
    let b = list.pop();
    if (!b) {
      b = buildBarrel(kind);
      b.kind = kind;
    }
    b.group.visible = true;
    this.scene.add(b.group);
    return b;
  }

  releaseBarrel(b) {
    this.scene.remove(b.view.group);
    b.view.bodyMat.emissive.setHex(0x000000);
    b.view.inner.scale.setScalar(b.view.inner.userData.base || b.view.inner.scale.x);
    if (this.pool[b.kind].length < 14) this.pool[b.kind].push(b.view);
    else disposeBarrel(b.view);
  }

  spawnBarrel(it, z, minion = false) {
    const view = this.acquireBarrel(it.kind);
    if (!view.inner.userData.base) view.inner.userData.base = view.inner.scale.x;
    const r = barrelRadius(it.kind);
    const x = it.x !== undefined ? it.x : colX(it.col);
    const b = {
      view, kind: it.kind, x, z, r, hp: it.hp, maxHp: it.hp, flash: 0, minion,
      h: barrelHeight(it.kind), phase: Math.random() * 6, mul: it.kind === 'boss' ? 0.5 : 1, dead: false,
    };
    view.group.position.set(x, 0, z);
    view.group.rotation.set(0, 0, 0);
    this.updateBarrelLabel(b);
    this.barrels.push(b);
    if (it.kind === 'boss') {
      this.bossRef = b;
      this.hud['hud-boss'].classList.remove('hidden');
      this.showBanner('BOSS', 'Ironbound Keg approaches!', true);
      this.sfx.play('boss');
    }
    return b;
  }

  spawnDue() {
    while (this.nextItem < this.items.length && this.items[this.nextItem].at <= this.D) {
      const it = this.items[this.nextItem++];
      const z = FIELD.spawnZ + (this.D - it.at);
      if (it.type === 'barrel') this.spawnBarrel(it, z);
      else if (it.type === 'gate') this.spawnGate(it, z);
      else if (it.type === 'spikes') this.spawnSpikes(it, z);
    }
  }

  spawnGate(it, z) {
    const def = GATE_KINDS[it.kind];
    const view = buildGate(it.kind, def.color);
    const x = it.side * 1.78;
    view.group.position.set(x, 0, z);
    this.scene.add(view.group);
    const g = { view, kind: it.kind, side: it.side, x, z, value: it.value, base: it.value, hits: 0, taken: false, fade: 0 };
    drawGateLabel(view.label, def.label(g.value));
    this.gates.push(g);
  }

  spawnSpikes(it, z) {
    const view = buildSpikes(it.width);
    const x = colX(0) + (it.col) * FIELD.colSpacing;
    view.group.position.set(x, 0, z);
    this.scene.add(view.group);
    this.spikes.push({ view, x, z, hw: view.halfWidth });
  }

  updateBarrelLabel(b) {
    const hp = Math.ceil(b.hp);
    const frac = b.hp / b.maxHp;
    const color = frac > 0.66 ? '#ffffff' : frac > 0.33 ? '#ffe27a' : '#ff9c7a';
    drawLabel(b.view.label, fmt(hp), color);
  }

  // ---------- input ----------

  dragBy(dxPx) {
    this.targetX = clamp(this.targetX + dxPx * (7.4 / this.canvasW) * 1.5, -FIELD.playerMaxX, FIELD.playerMaxX);
    if (this.hud['drag-hint'] && !this.hud['drag-hint'].classList.contains('hidden') && Math.abs(dxPx) > 0) {
      this.hud['drag-hint'].style.opacity = 0;
      this.dragged = true;
    }
  }

  // ---------- combat ----------

  fire() {
    const s = this.stats();
    const n = s.bolts;
    const spread = n > 6 ? 0.26 : 0.34;
    const px = this.player.root.position.x;
    const mz = this.player.muzzle ? this.player.muzzle.z + this.player.weaponHolder.position.z * 0 : -1.2;
    for (let i = 0; i < n; i++) {
      const o = i - (n - 1) / 2;
      const vx = o * 0.9;
      const speed = s.tier.speed;
      this.projs.push({
        x: px + o * spread, z: mz - 0.2, prevZ: mz, vx, vz: -speed,
        dmg: s.dmg, tier: this.tier, pierce: s.tier.pierce, hit: null,
        angle: Math.atan2(vx, -speed),
      });
    }
    this.recoil = 0.18;
    this.particles.emit(px, 1.0, mz, 3, { color: s.tier.color, speed: 1.5, up: 1.2, life: 0.18, size: 0.12, gravity: 0, vz: -4, spread: 0.1 });
    this.sfx.play('shoot', this.tier);
  }

  hitBarrel(b, dmg, p) {
    if (b.dead) return;
    b.hp -= dmg;
    b.flash = 0.08;
    this.sfx.play('hit');
    const wy = Math.min(b.h, 1.0);
    this.particles.emit(b.x + rand(-0.3, 0.3), wy, b.z + b.r * 0.8, 2, { colors: SPARK, speed: 2.5, up: 2, life: 0.3, size: 0.09, vz: 2 });
    if (b.kind === 'boss') this.hud['hud-boss-fill'].style.width = `${clamp((b.hp / b.maxHp) * 100, 0, 100)}%`;
    if (b.hp <= 0) this.killBarrel(b, true);
    else this.updateBarrelLabel(b);
    if (p && p.tier >= 5) {
      // Dragon cannon splash
      for (const o of [...this.barrels]) {
        if (o === b || o.dead) continue;
        const dx = o.x - b.x;
        const dz = o.z - b.z;
        if (dx * dx + dz * dz < TIERS[5].splash * TIERS[5].splash) {
          o.hp -= dmg * 0.5;
          o.flash = 0.08;
          if (o.hp <= 0) this.killBarrel(o, true);
          else this.updateBarrelLabel(o);
        }
      }
      this.rings.add(b.x, 0.2, b.z, 0xff8a2a, 1.6, 0.25);
    }
  }

  killBarrel(b, reward) {
    if (b.dead) return;
    b.dead = true;
    const boom = b.kind === 'powder';
    const big = b.kind === 'big' || b.kind === 'boss';
    this.particles.emit(b.x, 0.7 * (b.kind === 'boss' ? 2 : 1), b.z, big ? 40 : 16, {
      colors: boom ? BLAST : WOOD, speed: big ? 7 : 4.5, up: big ? 9 : 6, size: big ? 0.34 : 0.22, life: 0.9, spread: b.r * 0.6,
    });
    this.sfx.play(boom || b.kind === 'boss' ? 'boom' : 'break');
    if (boom) {
      this.rings.add(b.x, 0.3, b.z, 0xffa23a, 3.2, 0.4);
      this.particles.emit(b.x, 0.8, b.z, 26, { colors: BLAST, speed: 6, up: 5, size: 0.3, life: 0.5, gravity: 2, spread: 0.5 });
      this.addShake(0.35);
      // chain reaction
      const dmg = Math.max(10, b.maxHp * 0.8);
      for (const o of [...this.barrels]) {
        if (o === b || o.dead) continue;
        const dx = o.x - b.x;
        const dz = o.z - b.z;
        if (dx * dx + dz * dz < 2.9 * 2.9) {
          o.hp -= dmg;
          o.flash = 0.12;
          if (o.hp <= 0) this.killBarrel(o, true);
          else this.updateBarrelLabel(o);
        }
      }
    }
    if (b.kind === 'boss') {
      this.rings.add(b.x, 0.3, b.z, 0xffd23a, 7, 0.7);
      this.addShake(0.9);
      this.slowT = 0.9;
      for (const o of [...this.barrels]) if (o !== b && !o.dead) this.killBarrel(o, false);
    }
    if (reward) {
      this.kills++;
      this.killWeight += b.minion ? 0 : b.kind === 'boss' ? 5 : 1;
      this.combo++;
      this.comboT = 2.4;
      const mult = this.comboMult();
      const coinBonus = 1 + 0.1 * this.save.forge.coin;
      const val = Math.max(1, Math.round((1 + b.maxHp / 8) * mult * coinBonus * (b.kind === 'boss' ? 6 : 1)));
      this.runCoins += val;
      this.popup(b.x, 1.8, b.z, `+${val}`, 'coin');
      const nCoins = b.kind === 'boss' ? 14 : b.kind === 'big' ? 5 : Math.min(3, 1 + Math.floor(val / 15));
      for (let i = 0; i < nCoins; i++) this.coinFx.spawn(b.x, 1, b.z);
      this.sfx.play('coin');
      if (b.kind === 'gift') {
        this.addLevels(2, true);
        this.popup(b.x, 2.6, b.z, 'LEVEL +2!', 'coin big');
        this.rings.add(b.x, 0.3, b.z, 0xfff2a0, 3, 0.5);
      }
      if (b.kind !== 'boss') this.addXp(b.kind === 'big' ? 2 : 1);
      this.bumpCombo();
    }
    const i = this.barrels.indexOf(b);
    if (i >= 0) this.barrels.splice(i, 1);
    this.releaseBarrel(b);
  }

  comboMult() {
    return 1 + Math.min(Math.floor(this.combo / 3), 8) * 0.25;
  }

  bumpCombo() {
    const el = this.hud['hud-combo'];
    if (this.combo >= 3) {
      el.textContent = `${this.combo} COMBO  x${this.comboMult().toFixed(2).replace(/0$/, '')}`;
      el.classList.remove('hidden');
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  addXp(n) {
    this.xp += n;
    let need = xpNeeded(this.level);
    let leveled = 0;
    while (this.xp >= need) {
      this.xp -= need;
      leveled++;
      this.level++;
      need = xpNeeded(this.level);
    }
    if (leveled) this.afterLevel(false);
  }

  addLevels(n, announce) {
    this.level += n;
    this.afterLevel(announce);
  }

  afterLevel() {
    const nt = tierForLevel(this.level);
    if (nt !== this.tier) {
      this.tier = nt;
      setPlayerWeapon(this.player, nt);
      this.evolveFx();
      this.save.bestTier = Math.max(this.save.bestTier, nt);
      this.showBanner('WEAPON EVOLVED!', TIERS[nt].name, false);
      this.sfx.play('evolve');
      this.flashStat('hud-weapon');
    } else {
      const p = this.player.root.position;
      this.rings.add(p.x, 0.2, p.z, 0xffe27a, 2.4, 0.4);
      this.popup(p.x, 2.6, p.z, 'LEVEL UP', 'coin');
      this.sfx.play('gate');
    }
    this.flashStat('hud-dmg');
  }

  evolveFx() {
    const p = this.player.root.position;
    this.rings.add(p.x, 0.3, p.z, 0xfff2a0, 6.5, 0.8);
    this.rings.add(p.x, 0.6, p.z, 0x7fd4ff, 4.5, 0.6);
    this.particles.emit(p.x, 1.2, p.z, 50, { colors: [0xfff2a0, 0xffd23a, 0x7fd4ff, 0xffffff], speed: 6, up: 8, size: 0.2, life: 1.0, gravity: 6 });
    this.addShake(0.35);
    this.player.weaponHolder.scale.setScalar(1.5);
    this.vibrate(40);
  }

  flashStat(id) {
    const el = this.hud[id];
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  collectGate(g) {
    g.taken = true;
    const def = GATE_KINDS[g.kind];
    const p = this.player.root.position;
    if (g.kind === 'bolts') this.gateBolts += g.value;
    else if (g.kind === 'dmg') this.gateDmg += g.value / 100;
    else if (g.kind === 'rate') this.gateRate += g.value / 100;
    else if (g.kind === 'level') this.addLevels(g.value, true);
    this.popup(p.x, 3, p.z, def.label(g.value), 'coin big');
    this.rings.add(p.x, 0.3, p.z, def.color, 3, 0.5);
    this.particles.emit(p.x, 1.2, p.z, 24, { color: def.color, speed: 4, up: 5, size: 0.16, life: 0.6, gravity: 4 });
    this.sfx.play('gate');
    this.flashStat(g.kind === 'bolts' ? 'hud-bolts' : g.kind === 'rate' ? 'hud-rate' : 'hud-dmg');
    this.vibrate(15);
    for (const o of this.gates) if (o.z === g.z && o !== g) o.taken = true;
  }

  hurt(amount, why) {
    if (this.invuln > 0 || this.state !== 'playing') return;
    this.hearts -= amount;
    this.hurtCount++;
    this.invuln = 0.9;
    this.combo = 0;
    this.comboT = 0;
    this.hud['hud-combo'].classList.add('hidden');
    this.addShake(0.6);
    this.hud['flash'].style.opacity = 0.75;
    this.sfx.play('hurt');
    this.vibrate(80);
    const p = this.player.root.position;
    this.particles.emit(p.x, 1, p.z, 18, { colors: [0xff5a4a, 0xffb0a0], speed: 5, up: 5, size: 0.18, life: 0.6 });
    this.popup(p.x, 2.8, p.z, why === 'spikes' ? 'OUCH!' : '-HEART', 'big');
    if (this.hearts <= 0) {
      this.hearts = 0;
      this.finish(false);
    }
  }

  finish(win) {
    if (this.state !== 'playing') return;
    this.state = 'ending';
    this.endWin = win;
    this.endT = win ? 1.1 : 1.0;
    if (win) {
      this.slowT = Math.max(this.slowT, 0.6);
      this.sfx.play('win');
    } else {
      this.sfx.play('lose');
    }
  }

  buildResult() {
    const win = this.endWin;
    const n = this.stageNum;
    const stageBonus = win ? stageReward(n, this.stage.boss) : 0;
    const perfect = win && this.hurtCount === 0 ? Math.round(stageBonus * 0.5) : 0;
    return { win, stage: n, boss: this.stage.boss, runCoins: this.runCoins, stageBonus, perfect, kills: this.kills, level: this.level, tier: this.tier };
  }

  // ---------- fx helpers ----------

  addShake(v) {
    this.shake = Math.min(1, Math.max(this.shake, v));
  }

  vibrate(ms) {
    if (!this.save.settings.haptics) return;
    try {
      if (this.bridge && this.bridge.vibrate) this.bridge.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* ignore */ }
  }

  showBanner(title, sub, danger) {
    const b = this.hud['banner'];
    this.hud['banner-title'].textContent = title;
    this.hud['banner-sub'].textContent = sub;
    b.classList.toggle('danger', !!danger);
    b.classList.remove('hidden');
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), 2200);
  }

  popup(x, y, z, text, cls = '') {
    if (this.popups.length > 14) return;
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    this.hud['popups'].appendChild(el);
    this.popups.push({ el, x, y, z, t: 0 });
  }

  updatePopups(dt) {
    const w = this.canvasW;
    const h = window.innerHeight;
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      if (p.t > 1.0) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      this.vec.set(p.x, p.y + p.t * 1.6, p.z);
      this.vec.project(this.camera);
      const sx = (this.vec.x * 0.5 + 0.5) * w;
      const sy = (-this.vec.y * 0.5 + 0.5) * h;
      p.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${1 + Math.min(p.t * 4, 0.3) - p.t * 0.3})`;
      p.el.style.opacity = String(clamp(1.6 - p.t * 1.5, 0, 1));
      p.el.style.left = '0';
      p.el.style.top = '0';
    }
  }

  // ---------- HUD ----------

  setText(id, text) {
    if (this.hudCache[id] === text) return;
    this.hudCache[id] = text;
    this.hud[id].textContent = text;
  }

  updateHud(force) {
    if (!this.stage) return;
    const s = this.stats();
    this.setText('hud-level', `Stage ${this.stageNum}`);
    this.setText('hud-coins', fmt(this.runCoins));
    this.setText('hud-weapon', s.tier.name);
    this.setText('hud-wlv', String(this.level));
    this.setText('hud-dmg', fmt(s.dmg));
    this.setText('hud-rate', s.rate.toFixed(1));
    this.setText('hud-bolts', String(s.bolts));
    const need = xpNeeded(this.level);
    const xpw = `${clamp((this.xp / need) * 100, 0, 100).toFixed(0)}%`;
    if (this.hudCache.xpw !== xpw) {
      this.hudCache.xpw = xpw;
      this.hud['hud-wxp'].style.width = xpw;
    }
    let prog = this.killWeight;
    if (this.bossRef) prog = this.stage.barrels + 5 * (1 - clamp(this.bossRef.hp / this.bossRef.maxHp, 0, 1));
    const pw = `${clamp((prog / this.totalWeight) * 100, 0, 100).toFixed(1)}%`;
    if (this.hudCache.pw !== pw) {
      this.hudCache.pw = pw;
      this.hud['hud-progress-fill'].style.width = pw;
    }
    const hk = `${this.hearts}/${this.maxHearts}`;
    if (this.hudCache.hearts !== hk) {
      this.hudCache.hearts = hk;
      let html = '';
      for (let i = 0; i < this.maxHearts; i++) html += i < this.hearts ? '❤️' : '<span class="lost">❤️</span>';
      this.hud['hud-hearts'].innerHTML = html;
    }
    if (force) this.hud['drag-hint'].style.opacity = this.dragged ? 0 : 1;
  }

  // ---------- main loop ----------

  update(rawDt) {
    let dt = Math.min(rawDt, 0.05);
    if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= 0.3;
    }
    this.time += dt;
    const playing = this.state === 'playing' || this.state === 'ending';
    const paused = this.state === 'paused';

    if (!paused) {
      const speed = playing ? this.stage.speed : this.scroll;
      updateEnvironment(this.env, dt, speed, this.time);
      this.updatePlayer(dt, playing, speed);
      if (playing) this.updatePlaying(dt, speed);
      this.particles.update(dt, speed);
      this.rings.update(dt, speed);
      this.coinFx.update(dt, this.player.root.position, speed);
      this.updatePopups(dt);
    }
    this.updateCamera(dt);
  }

  updatePlayer(dt, playing, speed) {
    const p = this.player;
    const x = p.root.position.x;
    const nx = lerp(x, this.targetX, 1 - Math.exp(-18 * dt));
    p.root.position.x = nx;
    p.root.rotation.y = clamp((x - nx) * -2.5, -0.35, 0.35) * 0.5;
    for (const w of p.wheels) w.rotation.x += (speed * dt) / 0.42;
    p.bob.position.y = Math.sin(this.time * 9) * 0.02;
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 1.4);
    p.weapon.position.z = this.recoil;
    const s = p.weaponHolder.scale.x;
    if (s > 1) p.weaponHolder.scale.setScalar(Math.max(1, s - dt * 2));
    p.root.visible = true;
    if (this.invuln > 0) {
      this.invuln -= dt;
      p.root.visible = Math.floor(this.time * 20) % 2 === 0 || this.invuln <= 0;
    }
    const fl = this.hud['flash'];
    if (fl && fl.style.opacity !== '0') fl.style.opacity = String(Math.max(0, parseFloat(fl.style.opacity) - dt * 2.5));
  }

  updatePlaying(dt, speed) {
    this.D += speed * dt;
    if (this.state === 'playing') this.spawnDue();
    const px = this.player.root.position.x;

    // combo decay
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        this.combo = 0;
        this.hud['hud-combo'].classList.add('hidden');
      }
    }

    // firing
    if (this.state === 'playing') {
      const s = this.stats();
      this.fireT -= dt;
      let guard = 0;
      while (this.fireT <= 0 && guard++ < 4) {
        this.fire();
        this.fireT += 1 / s.rate;
      }
    }

    // barrels
    for (let i = this.barrels.length - 1; i >= 0; i--) {
      const b = this.barrels[i];
      if (b.dead) continue;
      let mul = b.mul;
      if (b.kind === 'boss') {
        mul = b.z < -14 ? 0.55 : 0.28;
        b.x = Math.sin(this.time * 0.7) * 1.5;
        this.bossTimer += dt;
        if (this.bossTimer > 5.5) {
          this.bossTimer = 0;
          for (const dx of [-2.2, 2.2]) {
            const hp = Math.max(3, Math.round(b.maxHp * 0.03));
            this.spawnBarrel({ kind: 'normal', x: clamp(b.x + dx, -2.8, 2.8), hp }, b.z + 2.6, true);
          }
        }
      }
      b.z += speed * mul * dt;
      b.phase += dt;
      const v = b.view;
      v.group.position.set(b.x, 0, b.z);
      v.inner.rotation.z = Math.sin(b.phase * 3) * 0.025;
      if (v.spark) v.spark.scale.setScalar(0.8 + Math.sin(b.phase * 25) * 0.4);
      if (v.star) {
        v.star.rotation.y += dt * 3;
        v.star.position.y = 1.5 + Math.sin(b.phase * 4) * 0.12;
      }
      if (b.flash > 0) {
        b.flash -= dt;
        v.bodyMat.emissive.setHex(b.flash > 0 ? 0x884422 : 0x000000);
        const base = v.inner.userData.base;
        v.inner.scale.setScalar(base * (b.flash > 0 ? 1.07 : 1));
      }
      if (b.z > FIELD.leakZ) {
        const dmg = b.kind === 'boss' ? 3 : b.kind === 'big' ? 2 : 1;
        this.particles.emit(b.x, 0.8, b.z, 14, { colors: WOOD, speed: 4, up: 5, size: 0.2, life: 0.7 });
        this.sfx.play('break');
        const idx = this.barrels.indexOf(b);
        if (idx >= 0) this.barrels.splice(idx, 1);
        b.dead = true;
        this.releaseBarrel(b);
        this.killWeight += b.minion ? 0 : 1;
        this.hurt(dmg, 'leak');
      }
    }

    // spikes
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i];
      s.z += speed * dt;
      s.view.group.position.z = s.z;
      if (s.z > -0.8 && s.z < 1.0 && Math.abs(s.x - px) < s.hw + 0.55) {
        this.particles.emit(s.x, 0.6, s.z, 20, { colors: WOOD, speed: 5, up: 6, size: 0.22, life: 0.8, spread: s.hw * 0.6 });
        this.scene.remove(s.view.group);
        this.spikes.splice(i, 1);
        this.hurt(1, 'spikes');
      } else if (s.z > 8) {
        this.scene.remove(s.view.group);
        this.spikes.splice(i, 1);
      }
    }

    // gates
    for (let i = this.gates.length - 1; i >= 0; i--) {
      const g = this.gates[i];
      g.z += speed * dt;
      g.view.group.position.z = g.z;
      if (g.taken) {
        g.fade += dt * 3;
        g.view.panelMat.opacity = Math.max(0, 0.55 - g.fade * 0.55);
        g.view.label.sprite.material.opacity = Math.max(0, 1 - g.fade);
      }
      if (!g.taken && g.z > -0.2 && g.z < 1.0) {
        const side = px < 0 ? -1 : 1;
        if (side === g.side) this.collectGate(g);
      }
      if (g.z > 7) {
        this.scene.remove(g.view.group);
        disposeGate(g.view);
        this.gates.splice(i, 1);
      }
    }

    this.updateProjectiles(dt);
    this.updateHud(false);


    // win check
    if (this.state === 'playing' && this.nextItem >= this.items.length && this.barrels.length === 0) {
      this.finish(true);
    }
    if (this.state === 'ending') {
      this.endT -= dt;
      if (this.endT <= 0 && this.callbacks.onEnd) {
        const cb = this.callbacks.onEnd;
        this.callbacks.onEnd = null;
        this.state = 'over';
        cb(this.buildResult());
      }
    }
  }

  updateProjectiles(dt) {
    const list = this.projs;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.prevZ = p.z;
      p.z += p.vz * dt;
      p.x += p.vx * dt;
      let remove = p.z < -56 || Math.abs(p.x) > 7;

      if (!remove) {
        // gates get charged by crossing shots
        for (const g of this.gates) {
          if (g.taken) continue;
          if (p.prevZ >= g.z && p.z < g.z && Math.abs(p.x - g.x) < 1.65) {
            g.hits++;
            const def = GATE_KINDS[g.kind];
            if (g.hits % def.step === 0 && g.value < g.base + def.max) {
              g.value = Math.min(g.base + def.max, g.value + def.inc);
              drawGateLabel(g.view.label, def.label(g.value));
              this.sfx.play('coin');
              this.popup(g.x, 2.8, g.z, '+', 'coin');
            }
          }
        }
        // spikes absorb
        for (const s of this.spikes) {
          if (p.prevZ >= s.z - 0.5 && p.z <= s.z + 0.5 && Math.abs(p.x - s.x) < s.hw) {
            remove = true;
            this.particles.emit(p.x, 0.8, s.z + 0.5, 3, { colors: SPARK, speed: 2.5, up: 2, size: 0.08, life: 0.25 });
            this.sfx.play('clank');
            break;
          }
        }
      }

      if (!remove) {
        let best = null;
        for (const b of this.barrels) {
          if (b.dead) continue;
          if (Math.abs(p.x - b.x) > b.r + 0.1) continue;
          if (p.z > b.z + b.r * 0.85 || p.prevZ < b.z - b.r * 0.85) continue;
          if (p.hit && p.hit.includes(b)) continue;
          if (!best || b.z > best.z) best = b;
        }
        if (best) {
          this.hitBarrel(best, p.dmg, p);
          if (p.pierce > 0) {
            p.pierce--;
            (p.hit || (p.hit = [])).push(best);
          } else remove = true;
        }
      }

      if (remove) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
    this.projR.render(list);
  }

  updateCamera(dt) {
    const cam = this.camera;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake;
    cam.position.set(rand(-1, 1) * s * 0.5, 9.6 + rand(-1, 1) * s * 0.4, 11.2);
    cam.lookAt(this.player.root.position.x * 0.15, 0.4, -8);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
