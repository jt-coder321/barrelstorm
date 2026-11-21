import {
  THREE, initMaterials, initGeometry, buildBarrel, disposeBarrel, drawLabel, barrelRadius, barrelHeight,
  buildPlayer, setPlayerWeapon, setSideWeapon, buildGate, drawGateLabel, disposeGate, ParticleSystem, ProjectileRenderer,
  RingFx, CoinFx, BoltFx, ZoneFx, buildEnvironment, updateEnvironment, applyBiome, setDarkness,
} from './gfx.js';
import { FIELD, MAX_BOLTS, GATE_KINDS } from './config.js';
import { FAMILIES, FAMILY_IDS, formForLevel, xpNeeded, masteryLevel, BLUEPRINTS_TO_UNLOCK } from './data/weapons.js';
import { CARDS, SYNERGIES, FAMILY_TAGS, BLESSINGS, ALTAR, rollDraft, rollFrom, cardCtx, RARITY_ORDER } from './data/cards.js';
import { ENEMIES } from './data/enemies.js';
import { BIOMES } from './data/biomes.js';
import { MODIFIER_BY_ID } from './data/modifiers.js';
import { BASE_HEARTS, ABILITIES, RELIC_IDS, RELICS, rankFor } from './data/meta.js';
import { stageProfile, genLayout, Layout, endlessProfile, dailySetup, hpBase, BOSS_NAMES } from './levelgen.js';
import { createBoss, BOSS_TIPS } from './bosses.js';
import { Hazards } from './hazards.js';
import { clamp, lerp, rand, fmt, mulberry32, dateKey } from './util.js';

const WOOD = [0x8a5a2b, 0xa06a33, 0x5a3a1e, 0xc08a4a];
const SPARK = [0xffe27a, 0xffb347, 0xffffff];
const BLAST = [0xffd23a, 0xff8a1f, 0xff4d1a, 0x5a3a1e];
const ICE = [0xffffff, 0xbfe8ff, 0x7fd4ff];
const GOLD = [0xffe27a, 0xffc83a, 0xfff6b0];
const STONE = [0x8a847a, 0x6a645a, 0xb0a898];

const AMBIENT = {
  embers: { colors: [0xff8a2a, 0xffd23a], up: 2.5, vy: 1.5, g: -0.5, size: 0.08 },
  snow: { colors: [0xffffff, 0xe8f4ff], up: 0, vy: -2.2, g: 0, size: 0.08 },
  sand: { colors: [0xe8d0a0, 0xc8a870], up: 0, vy: 0, g: 0, size: 0.06, vx: 4 },
  dust: { colors: [0x8a7a6a, 0x6a6a6a], up: 0.3, vy: 0.2, g: 0, size: 0.05 },
  wisps: { colors: [0x9affd0, 0x6affa0], up: 0.8, vy: 0.4, g: -0.2, size: 0.1 },
  sparks: { colors: [0xffd23a, 0xff8a2a], up: 4, vy: 2, g: 9, size: 0.05 },
};

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
    this.particles = new ParticleSystem(this.scene, 1100);
    this.projR = new ProjectileRenderer(this.scene, 420);
    this.rings = new RingFx(this.scene);
    this.coinFx = new CoinFx(this.scene, 50);
    this.bolts = new BoltFx(this.scene);
    this.zones = new ZoneFx(this.scene);
    this.hazards = new Hazards(this);

    this.pool = {};
    this.barrels = [];
    this.gates = [];
    this.projs = [];
    this.fireZones = [];
    this.state = 'menu';
    this.time = 0;
    this.shake = 0;
    this.targetX = 0;
    this.velX = 0;
    this.callbacks = {};
    this.hudCache = {};
    this.slowT = 0;
    this.hitstop = 0;
    this.popups = [];
    this.camZoom = 0;
    this.fovKick = 0;
    this.hud = {};
    for (const id of [
      'hud-level', 'hud-progress-fill', 'hud-coins', 'hud-hearts', 'hud-combo', 'hud-combo-n', 'hud-combo-x', 'hud-combo-fill', 'hud-boss', 'hud-boss-name', 'hud-boss-fill', 'hud-boss-tip',
      'hud-weapon', 'hud-wicon', 'hud-wlv', 'hud-wxp', 'hud-dmg', 'hud-rate', 'hud-bolts', 'hud-tags', 'popups', 'banner', 'banner-title', 'banner-sub', 'flash', 'drag-hint',
      'hud-mods', 'hud-objective', 'hud-ability', 'hud-ability-fill', 'hud-ability-icon', 'hud-temps', 'edge', 'hud-score',
    ]) this.hud[id] = document.getElementById(id);
    this.hud.flash.style.opacity = '0';
    this.setQuality(save.settings.quality);
    this.resize();
    this.vec = new THREE.Vector3();
    this.mode = 'campaign';
    this.family = save.loadout.weapon;
    this.level = 1;
    this.resetMods();
    setPlayerWeapon(this.player, this.family, 0);
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
    this.baseFov = clamp((half * 2 * 180) / Math.PI, 48, 72);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.canvasW = w;
  }

  // ---------- run modifiers and weapon stats ----------

  resetMods() {
    const relic = this.save.loadout.relic;
    this.mods = {
      dmgMul: 1, rateMul: 1, bolts: 0, pierce: 0, splash: 0, burn: 0, chain: 0, chill: 0, homing: 0,
      crit: 0.06 + (relic === 'horseshoe' ? 0.1 : 0), critMul: 2, coinMul: 1 + (relic === 'gauntlet' ? 0.25 : 0),
      comboTime: relic === 'drum' ? 1.5 : 0, comboBonus: 0, deathBlast: 0, execute: 0, abilityCharge: 0, bigDmg: 0, weakMul: 1,
      bossReward: 0, critGold: false, ricochet: false, thunder: false, comboRate: false,
    };
    this.cardsTaken = {};
    this.tags = new Set();
    this.synergies = new Set();
    this.secondary = null;
    this.temps = {};
    this.shieldHits = 0;
  }

  hasRelic(id) {
    return this.save.loadout.relic === id;
  }

  syn(id) {
    return this.synergies.has(id);
  }

  form() {
    return formForLevel(this.level);
  }

  stats(fid = this.family, secondary = false) {
    const f = FAMILIES[fid];
    const fi = this.form();
    const fo = f.forms[fi];
    const fg = this.save.forge;
    const m = this.mods;
    const mastery = masteryLevel(this.save.weapons.mastery[fid] || 0).level;
    const frenzy = this.temps.frenzy > 0;
    const od = this.temps.overdrive > 0;
    let dmg = f.dmg * (1 + 0.2 * (this.level - 1)) * (1 + 0.12 * fg.damage) * (1 + 0.04 * mastery) * Math.max(0.3, m.dmgMul) * (1 + (fo.dmg || 0));
    let rate = f.rate * (1 + 0.08 * fg.rate) * Math.max(0.4, m.rateMul) * (1 + (fo.rate || 0)) * this.cfgv('rateMul', 1);
    if (m.comboRate) rate *= 1 + Math.min(0.6, Math.floor(this.combo / 10) * 0.04);
    if (frenzy) rate *= 2.6;
    if (od) rate *= 2.6;
    rate = Math.min(rate, Math.max(18, f.rate * 4));
    let bolts = 1 + (fo.bolts || 0) + m.bolts + fg.bolts + (this.syn('swarm') ? 1 : 0);
    if (secondary) {
      rate *= 0.6;
      bolts = Math.max(1, Math.ceil(bolts / 2));
      dmg *= 0.8;
    }
    bolts = Math.min(MAX_BOLTS, bolts);
    let splash = (f.splash ? f.splash + (fo.splash || 0) : 0) + m.splash + (od ? 1 : 0);
    if (this.hasRelic('powderhorn')) splash *= 1.35;
    let burn = (f.burn ? f.burn + (fo.burn || 0) : 0) + m.burn + (od ? 2.5 : 0);
    if (this.hasRelic('ember')) burn *= 1.6;
    const chain = (f.chain ? f.chain + (fo.chain || 0) : 0) + m.chain + (this.hasRelic('rune') && (f.chain || m.chain) ? 1 : 0);
    const chill = (f.chill ? f.chill + (fo.chill || 0) : 0) + m.chill;
    const homing = (f.homing || 0) + m.homing + (this.syn('swarm') ? 4 : 0);
    const pierce = (f.pierce || 0) + (fo.pierce || 0) + m.pierce + (frenzy ? 2 : 0);
    return {
      f, fid, form: fi, formName: fo.name, dmg: Math.max(1, dmg), rate, bolts, splash, splashMul: f.splashMul || 0.5, burn: burn * Math.max(1, dmg / 4),
      chain, chill, homing, pierce, speed: (f.speed || 30) * this.cfgv('projSpeedMul', 1), lob: f.lob || 0,
    };
  }

  cfgv(k, d) {
    return this.cfg && this.cfg[k] !== undefined ? this.cfg[k] : d;
  }

  refreshTags() {
    const tags = new Set(FAMILY_TAGS[this.family] || []);
    if (this.secondary) for (const t of FAMILY_TAGS[this.secondary] || []) tags.add(t);
    for (const id of Object.keys(this.cardsTaken)) {
      const c = CARDS.find((x) => x.id === id);
      if (c && c.tags) for (const t of c.tags) tags.add(t);
    }
    if (this.mods.rateMul >= 1.5 || this.family === 'gatling') tags.add('rapid');
    if (this.stats().bolts >= 3) tags.add('multishot');
    this.tags = tags;
    for (const s of SYNERGIES) {
      if (this.synergies.has(s.id)) continue;
      if (s.needs.every((t) => tags.has(t))) {
        this.synergies.add(s.id);
        this.announceSynergy(s);
      }
    }
  }

  announceSynergy(s) {
    if (this.state !== 'playing') return;
    const st = this.save.stats;
    st.synergies = (st.synergies || 0) + 1;
    if (!this.save.synergiesSeen.includes(s.id)) this.save.synergiesSeen.push(s.id);
    st.synergyTypes = this.save.synergiesSeen.length;
    this.showBanner(`${s.icon} SYNERGY: ${s.name.toUpperCase()}`, s.desc, false, 2400, 'gold');
    this.sfx.play('synergy');
    this.evolveFx(0xb46bff);
  }

  // ---------- stage lifecycle ----------

  resetRun() {
    this.level = 1 + this.save.forge.start;
    this.xp = 0;
    this.resetMods();
    this.maxHearts = BASE_HEARTS + this.save.forge.hearts;
    this.hearts = this.maxHearts;
    this.runCoins = 0;
    this.score = 0;
    this.kills = 0;
    this.killWeight = 0;
    this.combo = 0;
    this.comboT = 0;
    this.bestCombo = 0;
    this.multi = { n: 0, t: 0, x: 0, z: 0 };
    this.chain = { n: 0, t: 0, best: 0 };
    this.invuln = 0;
    this.fireT = 0.3;
    this.fireT2 = 0.5;
    this.shotCount = 0;
    this.recoil = 0;
    this.hurtCount = 0;
    this.leaks = 0;
    this.crits = 0;
    this.weakHits = 0;
    this.chestsBroken = 0;
    this.cartsCaught = 0;
    this.cartsTotal = 0;
    this.revived = false;
    this.warpT = 0;
    this.thunderT = 2;
    this.stormT = 0;
    this.volleyT = 0;
    this.bossRef = null;
    this.bossKills = 0;
    this.draftOpen = false;
    this.draftQueue = [];
    this.rerolls = this.save.forge.reroll + (this.hasRelic('seal') ? 1 : 0);
    this.trial = null;
    this.player.root.position.x = 0;
    this.targetX = 0;
    this.velX = 0;
    const ab = ABILITIES[this.save.loadout.ability] ? this.save.loadout.ability : 'bomb';
    this.ability = { id: ab, charge: 0.25, activeT: 0 };
    this.drops = { blueprints: [], relic: null, coins: 0 };
    this.eventsSeen = [];
    this.hurtLog = [];
    this.delayed = [];
    this.riskyT = 0;
    this.transformT = 0;
    this.blessingDue = false;
    this.extraBosses = [];
  }

  clearStage() {
    for (const b of [...this.barrels]) if (!b.part) this.releaseBarrel(b);
    if (this.bossRef) this.bossRef.remove();
    for (const b of this.extraBosses || []) b.remove();
    this.extraBosses = [];
    this.bossRef = null;
    this.barrels.length = 0;
    for (const g of this.gates) {
      this.scene.remove(g.view.group);
      disposeGate(g.view);
    }
    this.gates.length = 0;
    this.projs.length = 0;
    this.fireZones.length = 0;
    this.hazards.clear();
    this.particles.clear();
    this.rings.clear();
    this.coinFx.clear();
    this.bolts.clear();
    for (const p of this.popups) p.el.remove();
    this.popups.length = 0;
    this.player.shield.visible = false;
  }

  // opts: { mode: 'campaign' | 'daily' | 'endless', stage }
  startStage(opts) {
    this.clearStage();
    this.mode = opts.mode || 'campaign';
    this.resetRun();
    let profile;
    let n;
    let seed = (Math.random() * 4294967296) >>> 0;
    this.family = this.save.loadout.weapon;
    if (this.mode === 'daily') {
      const d = dailySetup(dateKey());
      profile = d.profile;
      n = d.n;
      seed = d.seed;
      this.family = d.weapon;
      this.dailyKey = dateKey();
    } else if (this.mode === 'endless') {
      this.wave = 1;
      profile = endlessProfile(1, null);
      n = profile.n;
    } else {
      n = opts.stage;
      profile = stageProfile(n);
    }
    if (!FAMILIES[this.family]) this.family = 'cannon';
    this.stageNum = n;
    this.profile = profile;
    this.difficulty = this.mode === 'campaign' ? this.save.difficulty : 'normal';
    this.layout = genLayout(profile, { stage: n, seed, difficulty: this.difficulty, mode: this.mode, seenEvents: this.save.seenEvents });
    this.cfg = this.layout.cfg;
    this.items = this.layout.items;
    this.nextItem = 0;
    this.D = 22;
    this.speed = this.layout.speed;
    this.totalWeight = Math.max(1, this.layout.barrels);
    this.par = this.layout.par * 10;
    this.elapsed = 0;
    this.endT = 0;
    this.state = 'playing';
    this.slowT = 0;
    this.hitstop = 0;
    this.camZoom = 0;
    this.cartsTotal = this.items.filter((i) => i.kind === 'treasure').length;
    this.biome = profile.biome;
    applyBiome(this.env, this.biome);
    setDarkness(this.env, this.cfg.dark ? (BIOMES[this.biome].dark ? 0.4 : 1) : 0);
    this.hazards.setup(this.biome, this.cfg);
    setPlayerWeapon(this.player, this.family, this.form());
    setSideWeapon(this.player, null);
    // Each stage starts with a stronger weapon so late stages do not begin underpowered, then offers an
    // opening pick (stage 3+) so every run begins with a decision.
    this.level += Math.min(30, Math.floor((n - 1) * 0.6));
    setPlayerWeapon(this.player, this.family, this.form());
    this.refreshTags();
    this.setupObjectives();
    this.hud['hud-boss'].classList.add('hidden');
    this.hud['hud-combo'].classList.add('hidden');
    this.hud.flash.style.opacity = 0;
    this.hudCache = {};
    this.renderMods();
    this.updateHud(true);
    const title = this.mode === 'daily' ? 'DAILY CHALLENGE' : this.mode === 'endless' ? 'ENDLESS: WAVE 1' : `STAGE ${n}`;
    this.showBanner(title, this.introLine(), !!profile.boss, 2600);
    this.sfx.play('gate');
    this.spawnDue();
    if (n >= 3 || this.mode !== 'campaign') this.queueDraft('anvil');
    if (this.callbacks.onStart) this.callbacks.onStart(this.stageInfo());
  }

  introLine() {
    const p = this.profile;
    const b = BIOMES[p.biome];
    if (p.boss) return `${BOSS_NAMES[p.boss]} awaits in the ${b.name}`;
    if (p.objective === 'survive') return `Hold the line for ${Math.round(this.layout.duration)} seconds`;
    if (p.objective === 'hunt') return 'Hunt down the elite captains';
    const m = p.mods.map((id) => MODIFIER_BY_ID[id].name);
    return `${b.name}${m.length ? ': ' + m.join(' + ') : ''}`;
  }

  stageInfo() {
    const p = this.profile;
    return {
      stage: this.stageNum, mode: this.mode, biome: BIOMES[p.biome], mods: p.mods.map((id) => MODIFIER_BY_ID[id]), boss: p.boss,
      objective: p.objective, objectives: this.objectives, weapon: this.family, wave: this.wave,
    };
  }

  nextWave() {
    // Endless: chain a new short stage onto the current run, keeping weapon, cards and hearts.
    this.wave++;
    const prev = this.profile;
    this.profile = endlessProfile(this.wave, prev);
    this.stageNum = this.profile.n;
    const lay = genLayout(this.profile, { stage: this.stageNum, seed: (Math.random() * 4294967296) >>> 0, difficulty: 'normal', mode: 'endless', seenEvents: this.save.seenEvents });
    this.layout = lay;
    this.cfg = lay.cfg;
    const off = this.D + 8;
    this.items = lay.items.map((it) => ({ ...it, at: it.at + off }));
    this.nextItem = 0;
    this.speed = lay.speed;
    this.totalWeight = Math.max(1, lay.barrels);
    this.killWeight = 0;
    this.par += lay.par * 10;
    this.biome = this.profile.biome;
    this.flashScreen('#ffffff', 0.8);
    applyBiome(this.env, this.biome);
    setDarkness(this.env, this.cfg.dark ? (BIOMES[this.biome].dark ? 0.4 : 1) : 0);
    this.hazards.setup(this.biome, this.cfg);
    if (this.wave % 2 === 0) this.heal(1);
    const bonus = Math.round(20 + this.wave * 15);
    this.runCoins += bonus;
    this.renderMods();
    this.showBanner(`WAVE ${this.wave}`, `${this.introLine()}  (+${bonus} coins)`, !!this.profile.boss, 2600);
    this.sfx.play('evolve');
    if (this.wave > (this.save.endless.bestWave || 0)) this.save.endless.bestWave = this.wave;
    this.save.stats.bestWave = Math.max(this.save.stats.bestWave || 0, this.wave);
  }

  toMenu() {
    this.clearStage();
    this.state = 'menu';
    applyBiome(this.env, 'courtyard');
    setDarkness(this.env, 0);
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

  // ---------- optional objectives (stars) ----------

  setupObjectives() {
    const n = this.stageNum;
    const rng = mulberry32(this.layout.seed ^ 0x51ed);
    const pool = [{ id: 'flawless', text: 'Take no damage', check: () => this.hurtCount === 0, live: true }];
    const comboGoal = Math.min(90, 15 + n * 3);
    pool.push({ id: 'combo', text: `Reach a ${comboGoal} combo`, goal: comboGoal, prog: () => this.bestCombo, check: () => this.bestCombo >= comboGoal });
    const kegs = this.items.filter((i) => i.kind === 'keg').length;
    if (kegs >= 5) {
      const g = Math.min(10, 3 + Math.floor(n / 5));
      pool.push({ id: 'chain', text: `Chain ${g} explosions`, goal: g, prog: () => this.chain.best, check: () => this.chain.best >= g });
    }
    if (this.items.some((i) => i.kind === 'chest')) pool.push({ id: 'chest', text: 'Break the treasure chest', check: () => this.chestsBroken > 0 });
    if (this.cartsTotal >= 3) pool.push({ id: 'carts', text: 'Catch every gold cart', goal: this.cartsTotal, prog: () => this.cartsCaught, check: () => this.cartsCaught >= this.cartsTotal });
    const critGoal = 25 + n * 2;
    pool.push({ id: 'crits', text: `Land ${critGoal} critical hits`, goal: critGoal, prog: () => this.crits, check: () => this.crits >= critGoal });
    pool.push({ id: 'noleak', text: 'Let nothing through', check: () => this.leaks === 0, live: true });
    if (this.profile.boss) pool.push({ id: 'weak', text: 'Hit weak points 25 times', goal: 25, prog: () => this.weakHits, check: () => this.weakHits >= 25 }, { id: 'weak', text: 'Hit weak points 25 times', goal: 25, prog: () => this.weakHits, check: () => this.weakHits >= 25 });
    const out = [];
    while (out.length < 2 && pool.length) {
      const i = Math.floor(rng() * pool.length);
      const o = pool.splice(i, 1)[0];
      if (!out.some((x) => x.id === o.id)) out.push(o);
    }
    this.objectives = out;
  }

  primaryText() {
    const p = this.profile;
    if (this.mode === 'endless') return `Wave ${this.wave}`;
    if (p.objective === 'survive') return `Survive ${Math.max(0, Math.ceil(this.layout.duration - this.elapsed))}s`;
    if (p.objective === 'hunt') {
      const left = this.barrels.filter((b) => b.captain && !b.dead).length + this.items.slice(this.nextItem).filter((i) => i.captain).length;
      return `Captains left: ${left}`;
    }
    if (p.boss) return this.bossRef ? `Defeat ${BOSS_NAMES[p.boss]}` : 'Reach the boss';
    return 'Destroy the barrels';
  }

  // ---------- spawning ----------

  acquireBarrel(kind) {
    const list = this.pool[kind] || (this.pool[kind] = []);
    let v = list.pop();
    if (!v) v = buildBarrel(kind);
    v.group.visible = true;
    this.scene.add(v.group);
    return v;
  }

  releaseBarrel(b) {
    if (b.part || !b.view) return;
    const v = b.view;
    this.scene.remove(v.group);
    v.bodyMat.emissive.setHex(0x000000);
    v.bubble.visible = false;
    v.ice.visible = false;
    v.glow.visible = false;
    v.group.scale.setScalar(1);
    if (v.bodyMat.transparent && b.kind === 'ghost') v.bodyMat.opacity = 0.55;
    v.inner.scale.setScalar(v.inner.userData.base || v.inner.scale.x);
    const list = this.pool[b.kind] || (this.pool[b.kind] = []);
    if (list.length < 14) list.push(v);
    else disposeBarrel(v);
  }

  rowHp(progress) {
    return this.layout ? this.layout.hp(progress, 1) : 5;
  }

  stageSpeed() {
    return this.speed;
  }

  hazardScale() {
    return hpBase(this.stageNum) * this.cfgv('hpMul', 1) * 1.2;
  }

  spawnEnemy(it, z, minion = false) {
    const kind = it.kind;
    const def = ENEMIES[kind];
    const view = this.acquireBarrel(kind);
    if (!view.inner.userData.base) view.inner.userData.base = view.inner.scale.x;
    const x = it.x !== undefined ? it.x : 0;
    const e = {
      view, kind, def, x, baseX: x, z, r: barrelRadius(kind), h: barrelHeight(kind), hp: it.hp, maxHp: it.hp, flash: 0, minion,
      phase: Math.random() * 6, dead: false, burn: 0, burnT: 0, burnStacks: 0, chill: 0, chillT: 0, frozen: 0, lastHit: 9, shielded: false,
      cross: it.cross || 0, captain: !!it.captain, gold: !!it.gold, jackpot: !!it.jackpot, throwT: 1.5 + Math.random(), solid: true, pushZ: 0,
    };
    view.group.position.set(x, 0, z);
    view.group.rotation.set(0, 0, 0);
    view.glow.visible = !!this.cfgv('dark', false);
    if (e.captain) view.group.scale.setScalar(1.1);
    if (e.gold) view.bodyMat.emissive.setHex(0x4a3300);
    this.updateLabel(e);
    this.barrels.push(e);
    return e;
  }

  spawnDue() {
    while (this.nextItem < this.items.length && this.items[this.nextItem].at <= this.D) {
      const it = this.items[this.nextItem++];
      const z = FIELD.spawnZ + (this.D - it.at);
      switch (it.type) {
        case 'enemy': this.spawnEnemy(it, z); break;
        case 'gate': this.spawnGate(it.kind, it.side, it.value, z); break;
        case 'route':
          this.spawnGate('safe', -1, 1, z);
          this.spawnGate('risky', 1, 1, z);
          this.showBanner('CROSSROADS', 'Safe road heals. Risky road doubles loot', false, 2000);
          break;
        case 'event': this.startEvent(it, z); break;
        case 'boss': this.spawnBoss(it); break;
        case 'cue': if (it.title) this.showBanner(it.title, it.sub, false, 1600, it.gold ? 'gold' : ''); break;
        default: break;
      }
    }
  }

  spawnGate(kind, side, value, z) {
    const def = GATE_KINDS[kind];
    const view = buildGate(kind, def.color);
    const x = side * 1.78;
    view.group.position.set(x, 0, z);
    this.scene.add(view.group);
    const g = { view, kind, side, x, z, value, base: value, hits: 0, taken: false, fade: 0 };
    drawGateLabel(view.label, def.label(g.value));
    this.gates.push(g);
    return g;
  }

  // ---------- special events ----------

  startEvent(it, z) {
    if (!this.eventsSeen.includes(it.id)) this.eventsSeen.push(it.id);
    if (!this.save.seenEvents.includes(it.id)) this.save.seenEvents.push(it.id);
    if (it.warn) this.warn(it.warn, it.sub, it.gold);
    switch (it.id) {
      case 'frenzy':
        this.temps.frenzyIn = 1.6;
        break;
      case 'transform':
        this.transformT = 1.4;
        this.transformTo = it.to;
        break;
      case 'vault': {
        const g = this.spawnGate('vault', Math.random() < 0.5 ? -1 : 1, 1, z + 4);
        g.vanishT = 7;
        this.sfx.play('secret');
        break;
      }
      case 'storm':
        this.stormT = 12;
        break;
      case 'blessing':
        this.blessingDue = true;
        break;
      default:
        break;
    }
  }

  warn(title, sub, gold) {
    this.showBanner(title, sub || '', !gold, 2200, gold ? 'gold' : '');
    this.edgePulse(gold ? 'gold' : 'red');
    this.sfx.play(gold ? 'fanfare' : 'horn');
    this.vibrate(30);
  }

  spawnBoss(it) {
    const boss = createBoss(this, it.boss, { hp: it.hp, mini: !!it.mini });
    if (!this.bossRef) {
      this.bossRef = boss;
      this.hud['hud-boss'].classList.remove('hidden');
      this.setText('hud-boss-name', boss.name.toUpperCase());
      this.setText('hud-boss-tip', BOSS_TIPS[it.boss] || '');
      this.hud['hud-boss-fill'].style.width = '100%';
    } else this.extraBosses.push(boss);
    this.camZoom = 1;
    this.showBanner(it.mini ? "MINI-BOSS" : "BOSS", boss.name, true, 2600);
    this.sfx.play('boss');
    this.addShake(0.4);
  }

  enterVault() {
    this.save.stats.vaults = (this.save.stats.vaults || 0) + 1;
    this.flashScreen('#c080ff', 0.9);
    this.showBanner('SECRET VAULT', 'Smash the riches before they roll away!', false, 2400, 'gold');
    this.sfx.play('fanfare');
    const z0 = FIELD.spawnZ + 10;
    for (let i = 0; i < 16; i++) {
      const kind = i % 5 === 0 ? 'gift' : 'treasure';
      const e = this.spawnEnemy({ kind, x: rand(-2.8, 2.8), hp: Math.max(3, Math.round(this.rowHp(0.3) * 0.6)), gold: true }, z0 - i * 1.6);
      e.vault = true;
    }
    if (Math.random() < 0.5) this.grantRelic();
  }

  // ---------- drafts ----------

  queueDraft(kind, opts = {}) {
    this.draftQueue.push({ kind, ...opts });
    if (!this.draftOpen) this.openNextDraft();
  }

  openNextDraft() {
    const d = this.draftQueue.shift();
    if (!d) return;
    const rng = Math.random;
    const ctx = cardCtx(this);
    const luck = this.save.forge.luck * 0.06 + (this.hasRelic('compass') ? 0.25 : 0);
    let cards;
    let title = 'CHOOSE AN UPGRADE';
    let sub = '';
    if (d.kind === 'jackpot') {
      cards = rollDraft(rng, ctx, { count: 4, luck: luck + 0.8, minRarity: 'rare' });
      title = 'JACKPOT!';
      sub = 'Four rare picks';
    } else if (d.kind === 'blessing') {
      cards = rollFrom(rng, BLESSINGS, ctx, 3);
      title = 'BOSS BLESSING';
      sub = `Prepare for ${BOSS_NAMES[this.profile.boss] || 'the boss'}`;
    } else if (d.kind === 'altar') {
      cards = rollFrom(rng, ALTAR, ctx, 2);
      title = 'BLOOD ALTAR';
      sub = this.hearts > 1 ? 'Pay a heart for power, or walk away' : 'You have no heart to spare';
    } else if (d.kind === 'chest') {
      cards = rollDraft(rng, ctx, { count: 3, luck: luck + 0.5, minRarity: 'rare' });
      title = 'TREASURE!';
      sub = 'Pick your spoils';
    } else {
      cards = rollDraft(rng, ctx, { count: 3, luck });
    }
    if (!cards.length) return;
    this.draftOpen = true;
    this.draft = { ...d, cards };
    this.sfx.play('draft');
    for (const c of cards) if (RARITY_ORDER.indexOf(c.rarity) >= 3) this.sfx.play('rareCard');
    const canSkip = d.kind === 'altar';
    const canAfford = d.kind !== 'altar' || this.hearts > 1;
    if (this.callbacks.onDraft) this.callbacks.onDraft({ title, sub, cards, rerolls: d.kind === 'altar' || d.kind === 'blessing' ? 0 : this.rerolls, canSkip, canAfford, kind: d.kind });
    else this.pickCard(0);
  }

  rerollDraft() {
    if (!this.draftOpen || this.rerolls <= 0) return;
    this.rerolls--;
    this.draftQueue.unshift({ kind: this.draft.kind });
    this.draftOpen = false;
    this.openNextDraft();
  }

  pickCard(i) {
    if (!this.draftOpen) return;
    const d = this.draft;
    const c = i >= 0 ? d.cards[i] : null;
    this.draftOpen = false;
    this.draft = null;
    if (c) {
      if (d.kind === 'altar') {
        if (this.hearts <= 1) return this.afterDraft();
        this.hearts--;
        this.flashScreen('#ff2040', 0.6);
        this.sfx.play('hurt');
      }
      c.apply(this);
      this.cardsTaken[c.id] = (this.cardsTaken[c.id] || 0) + 1;
      if (c.rarity === 'mythic') this.save.stats.mythics = (this.save.stats.mythics || 0) + 1;
      const p = this.player.root.position;
      const big = RARITY_ORDER.indexOf(c.rarity) >= 3;
      this.popup(p.x, 3, p.z, `${c.icon} ${c.name}`, big ? 'coin big' : 'coin');
      this.evolveFx(big ? 0xffcf4a : 0x7fd4ff, big ? 1 : 0.5);
      this.sfx.play(big ? 'evolve' : 'gate');
      this.refreshTags();
    }
    this.afterDraft();
  }

  afterDraft() {
    this.slowT = Math.max(this.slowT, 0.25);
    this.updateHud(true);
    if (this.draftQueue.length) this.openNextDraft();
  }

  // ---------- card effects (called by cards) ----------

  heal(n) {
    this.hearts = Math.min(this.maxHearts, this.hearts + n);
    const p = this.player.root.position;
    this.popup(p.x, 2.6, p.z, `+${n} ❤`, 'big');
    this.rings.add(p.x, 0.3, p.z, 0xff6a8a, 2.4, 0.5);
  }

  loseMaxHeart() {
    this.maxHearts = Math.max(1, this.maxHearts - 1);
    this.hearts = Math.min(this.hearts, this.maxHearts);
  }

  addShield(n) {
    this.shieldHits += n;
    this.player.shield.visible = true;
  }

  addTemp(id, t) {
    this.temps[id] = t;
    this.showBanner(id === 'overdrive' ? 'DRAGONFIRE OVERDRIVE' : 'WRATH OF STORMS', `${t} seconds of fury`, false, 1800, 'gold');
  }

  swapWeapon(fid, locked) {
    this.family = fid;
    setPlayerWeapon(this.player, fid, this.form());
    this.evolveFx(FAMILIES[fid].color, 1);
    this.showBanner('NEW WEAPON', FAMILIES[fid].name, false, 1600);
    if (locked) {
      this.trial = fid;
      this.addBlueprint(fid);
    }
  }

  mountSecondary() {
    const options = FAMILY_IDS.filter((f) => f !== this.family);
    this.secondary = options[Math.floor(Math.random() * options.length)];
    setSideWeapon(this.player, this.secondary);
    this.showBanner('DUAL WIELD', `${FAMILIES[this.secondary].name} mounted`, false, 1800, 'gold');
  }

  addBlueprint(fid) {
    const w = this.save.weapons;
    if (w.unlocked.includes(fid)) return;
    w.blueprints[fid] = (w.blueprints[fid] || 0) + 1;
    this.drops.blueprints.push(fid);
    if (w.blueprints[fid] >= BLUEPRINTS_TO_UNLOCK) {
      w.unlocked.push(fid);
      this.save.stats.weaponsUnlocked = w.unlocked.length;
      this.drops.unlockedWeapon = fid;
      this.showBanner('WEAPON UNLOCKED!', `${FAMILIES[fid].icon} ${FAMILIES[fid].name}`, false, 2400, 'gold');
      this.sfx.play('fanfare');
    } else {
      const p = this.player.root.position;
      this.popup(p.x, 3.4, p.z, `${FAMILIES[fid].icon} Blueprint ${w.blueprints[fid]}/${BLUEPRINTS_TO_UNLOCK}`, 'coin big');
    }
  }

  grantRelic() {
    const missing = RELIC_IDS.filter((r) => !this.save.relics.includes(r));
    if (!missing.length) {
      this.drops.coins += 150;
      return;
    }
    const r = missing[Math.floor(Math.random() * missing.length)];
    this.save.relics.push(r);
    this.save.stats.relicsOwned = this.save.relics.length;
    this.drops.relic = r;
    this.showBanner('RELIC FOUND!', `${RELICS[r].icon} ${RELICS[r].name}: ${RELICS[r].desc}`, false, 2600, 'gold');
    this.sfx.play('fanfare');
  }

  chestLoot(e) {
    this.chestsBroken++;
    this.save.stats.chests = (this.save.stats.chests || 0) + 1;
    const r = Math.random();
    const locked = FAMILY_IDS.filter((f) => !this.save.weapons.unlocked.includes(f));
    if (r < 0.4 && locked.length) this.addBlueprint(locked[Math.floor(Math.random() * locked.length)]);
    else if (r < 0.55) this.grantRelic();
    this.queueDraft('chest');
    this.coinBurst(e.x, e.z, 12);
  }

  // ---------- input ----------

  dragBy(dxPx) {
    this.targetX = clamp(this.targetX + dxPx * (7.4 / this.canvasW) * 1.5, -FIELD.playerMaxX, FIELD.playerMaxX);
    if (Math.abs(dxPx) > 0 && !this.dragged) {
      this.hud['drag-hint'].style.opacity = 0;
      this.dragged = true;
    }
  }

  // ---------- firing ----------

  frontTargets(x, n) {
    // Live targets ahead, nearest to the castle line first, biased to the given x.
    const list = this.barrels.filter((b) => !b.dead && b.z > FIELD.spawnZ + 4 && b.z < 0 && (!b.part || b.active));
    list.sort((a, b) => (b.z - Math.abs(b.x - x) * 2) - (a.z - Math.abs(a.x - x) * 2));
    return list.slice(0, n);
  }

  fire(fid, secondary) {
    const s = this.stats(fid, secondary);
    const f = s.f;
    const n = s.bolts;
    const px = this.player.root.position.x + (secondary ? 0.85 : 0);
    const mz = this.player.muzzle ? this.player.muzzle.z : -1.2;
    const frenzy = this.temps.frenzy > 0;
    const color = frenzy ? 0xffe27a : this.temps.overdrive > 0 ? 0xff5a1a : f.color;
    this.shotCount++;
    if (s.lob) {
      const targets = this.frontTargets(px, n);
      for (let i = 0; i < n; i++) {
        const t = targets[i % Math.max(1, targets.length)];
        const tx = t ? t.x + rand(-0.2, 0.2) : px + (i - (n - 1) / 2) * 1.4;
        const tz = t ? t.z + this.speed * s.lob * (t.def ? t.def.speed || 1 : 0) : -16;
        this.projs.push({
          lob: true, sx: px, sz: mz, tx, tz, t: 0, T: s.lob, x: px, y: 1.2, z: mz, prevZ: mz, vx: 0, vz: 0,
          dmg: s.dmg, s, size: f.size, color, angle: 0, fid,
        });
      }
    } else {
      for (let i = 0; i < n; i++) {
        const o = i - (n - 1) / 2;
        let vx = o * (f.spread * 2.2);
        if (f.jitter) vx += rand(-f.jitter, f.jitter);
        const speed = s.speed;
        this.projs.push({
          x: px + o * f.spread * 0.8, y: 0.85, z: mz - 0.2, prevZ: mz, vx, vz: -speed, dmg: s.dmg, s, pierce: s.pierce, hit: null, pierced: 0,
          size: f.size, color, angle: Math.atan2(vx, -speed), life: f.life || 3, fid, bounced: false,
        });
      }
    }
    this.recoil = secondary ? this.recoil : 0.18;
    if (!secondary) {
      this.particles.emit(px, 1.0, mz, 3, { color, speed: 1.5, up: 1.2, life: 0.18, size: 0.12, gravity: 0, vz: -4, spread: 0.1 });
      this.sfx.play(f.sound, s.form);
    }
    // Chain Barrage synergy: every 6th shot calls a lightning barrage.
    if (this.syn('barrage') && this.shotCount % 6 === 0) {
      for (const t of this.frontTargets(px, 4)) this.zap(this.player.root.position.x, 1, -1, t, s.dmg * 1.2);
    }
  }

  zap(x, y, z, t, dmg) {
    this.bolts.add(x, y, z, t.x, (t.oy || 0) + 0.8, t.z, 0x9fd8ff, 0.18, 0.1);
    this.damage(t, dmg, { src: 'chain' });
    if (this.syn('wildfire')) this.ignite(t, dmg * 0.5);
  }

  updateProjectiles(dt) {
    const list = this.projs;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      let remove = false;
      if (p.lob) {
        p.t += dt;
        const k = Math.min(1, p.t / p.T);
        p.x = lerp(p.sx, p.tx, k);
        p.z = lerp(p.sz, p.tz, k);
        p.y = 1.2 + Math.sin(k * Math.PI) * 6;
        p.pitch = (k - 0.5) * 2;
        if (k >= 1) {
          this.explode(p.x, p.z, p.s.splash, p.dmg * p.s.splashMul, { color: 0xff8a2a, src: 'blast', shot: p });
          remove = true;
        }
      } else {
        p.prevZ = p.z;
        p.life -= dt;
        if (p.s.homing > 0) {
          let best = null;
          let bd = 1e9;
          for (const b of this.barrels) {
            if (b.dead || (b.part && !b.active) || b.z > p.z + 0.5 || b.z < p.z - 22) continue;
            const d = Math.abs(b.x - p.x) * 2 + (p.z - b.z) * 0.3;
            if (d < bd) {
              bd = d;
              best = b;
            }
          }
          if (best) {
            const sp = Math.hypot(p.vx, p.vz);
            const want = Math.atan2(best.x - p.x, best.z - p.z);
            const cur = Math.atan2(p.vx, p.vz);
            let da = want - cur;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            const na = cur + clamp(da, -p.s.homing * dt, p.s.homing * dt);
            p.vx = Math.sin(na) * sp;
            p.vz = Math.cos(na) * sp;
            p.angle = Math.atan2(p.vx, p.vz) + Math.PI;
          }
          if (Math.random() < 0.4) this.particles.emit(p.x, p.y, p.z, 1, { color: 0xbbbbbb, speed: 0.3, up: 0.3, life: 0.3, size: 0.1, gravity: 0 });
        }
        p.z += p.vz * dt;
        p.x += p.vx * dt;
        if (p.fid === 'flame') {
          const k = 1 + (1 - p.life / (FAMILIES.flame.life || 1)) * 1.2;
          p.size = [0.34 * k, 0.34 * k, 0.34 * k];
          p.color = p.life > 0.5 ? 0xffd23a : 0xff5a1a;
        }
        remove = p.z < -56 || Math.abs(p.x) > 7 || p.life <= 0;

        if (!remove) {
          for (const g of this.gates) {
            if (g.taken || !GATE_KINDS[g.kind].step) continue;
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
        }

        if (!remove) {
          let best = null;
          for (const b of this.barrels) {
            if (b.dead) continue;
            if (b.part && (b.oy || 0) > 2.5 && b.name !== 'head' && b.name !== 'crown' && b.name !== 'core' && b.name !== 'turret') continue;
            if (Math.abs(p.x - b.x) > b.r + 0.1) continue;
            if (p.z > b.z + b.r * 0.85 || p.prevZ < b.z - b.r * 0.85) continue;
            if (p.hit && p.hit.includes(b)) continue;
            if (b.part && !b.active && !b.boss.parts.some((q) => q !== b && q.active && Math.abs(q.x - p.x) < q.r)) {
              // inactive weak point: shots pass to the body below
              continue;
            }
            if (!best || b.z > best.z) best = b;
          }
          if (best) {
            remove = this.shotHit(p, best);
          }
        }
      }
      if (remove) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
    this.projR.render(list);
  }

  // Returns true when the projectile is used up.
  shotHit(p, b) {
    const s = p.s;
    let dmg = p.dmg;
    if (this.syn('skewer')) dmg *= 1 + 0.4 * p.pierced;
    if (this.syn('shatter') && p.pierced > 0 && (b.chill > 0 || b.frozen > 0)) dmg *= 2;
    const dealt = this.damage(b, dmg, { src: 'shot', direct: true, crit: true, p });
    if (dealt < 0) return true; // blocked
    if (s.splash > 0) this.explode(b.x, b.z, s.splash, dmg * s.splashMul, { exclude: b, color: FAMILIES[p.fid].accent, src: 'blast', small: true });
    if (s.burn > 0) this.ignite(b, s.burn);
    if (s.chill > 0) this.chillHit(b, s.chill);
    if (s.chain > 0) this.chainFrom(b, s.chain, dmg * 0.7);
    if (p.pierce > 0) {
      p.pierce--;
      p.pierced++;
      (p.hit || (p.hit = [])).push(b);
      return false;
    }
    if (this.mods.ricochet && !p.bounced) {
      p.bounced = true;
      (p.hit || (p.hit = [])).push(b);
      const t = this.barrels.find((o) => !o.dead && o !== b && !p.hit.includes(o) && Math.abs(o.z - b.z) < 8);
      if (t) {
        const dx = t.x - p.x;
        const dz = t.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const sp = Math.hypot(p.vx, p.vz);
        p.vx = (dx / d) * sp;
        p.vz = (dz / d) * sp;
        p.angle = Math.atan2(p.vx, p.vz) + Math.PI;
        return false;
      }
    }
    return true;
  }

  // ---------- damage ----------

  // Central damage pipeline. Returns damage dealt, or -1 when the hit was blocked.
  damage(e, amount, info = {}) {
    if (e.dead || amount <= 0) return 0;
    const src = info.src || 'shot';
    let dmg = amount;
    let crit = false;
    if (info.crit && Math.random() < this.mods.crit) {
      crit = true;
      dmg *= this.mods.critMul;
      this.crits++;
    }
    const big = e.part || (e.def && (e.def.big || e.def.elite));
    if (big) dmg *= 1 + this.mods.bigDmg;
    if (e.frozen > 0) dmg *= 1.5 + (this.hasRelic('sigil') ? 0.4 : 0);
    if (e.part) {
      const d = e.boss.hit(e, dmg, info);
      if (d <= 0) return info.direct ? -1 : 0;
      if (crit) this.critFx(e, d);
      this.ability.charge = Math.min(1, this.ability.charge + (d / e.boss.maxHp) * 2.2 * (1 + this.mods.abilityCharge));
      this.updateBossBar();
      return d;
    }
    if (e.kind === 'ghost' && !e.solid && src !== 'hazard' && src !== 'ability') {
      if (info.direct && this.sfx.throttle('ghostmiss', 300) === false) this.popup(e.x, 1.6, e.z, 'PHASED', '');
      return info.direct ? 0 : 0;
    }
    if (e.shielded && src !== 'ability' && src !== 'hazard') {
      dmg *= 0.15;
      e.view.bubble.visible = true;
      e.bubbleT = 0.25;
      if (info.direct) this.sfx.play('shield');
    }
    if (e.def.armor && src === 'shot' && !crit) {
      dmg *= 1 - e.def.armor;
      if (info.direct && Math.random() < 0.3) this.particles.emit(e.x, 0.9, e.z + e.r, 2, { colors: [0xb9c2cc, 0xffffff], speed: 3, up: 2, life: 0.2, size: 0.08 });
      if (info.direct) this.sfx.play('clank');
    }
    if (this.mods.execute && e.hp < e.maxHp * this.mods.execute) dmg *= 3;
    e.hp -= dmg;
    e.flash = 0.08;
    e.lastHit = 0;
    if (this.comboT > 0) this.comboT = Math.max(this.comboT, 0.9);
    if (info.direct) {
      this.sfx.play('hit');
      this.particles.emit(e.x + rand(-0.3, 0.3), Math.min(e.h, 1.0), e.z + e.r * 0.8, 2, { colors: SPARK, speed: 2.5, up: 2, life: 0.3, size: 0.09, vz: 2 });
    }
    if (crit) this.critFx(e, dmg);
    if (e.hp <= 0) this.killEnemy(e, true, src);
    else this.updateLabel(e);
    return dmg;
  }

  critFx(e, d) {
    if (this.popups.length < 18) this.popup(e.x + rand(-0.3, 0.3), (e.oy || 0) + e.h + 0.8, e.z, `CRIT ${fmt(d)}`, 'crit');
    this.particles.emit(e.x, (e.oy || 0) + 0.9, e.z + 0.4, 4, { colors: [0xffffff, 0xffe27a], speed: 4, up: 3, life: 0.25, size: 0.1 });
    this.sfx.play('crit');
    if (this.mods.critGold && Math.random() < 0.35) {
      this.runCoins += 2;
      this.coinFx.spawn(e.x, 1, e.z);
    }
  }

  weakHit(p, d) {
    this.weakHits++;
    if (this.sfx.throttle('weakpop', 260) === false) this.popup(p.x, (p.oy || 0) + 1.2, p.z, `WEAK POINT ${fmt(d)}`, 'crit');
    this.particles.emit(p.x, (p.oy || 0) + 0.5, p.z + 0.5, 5, { colors: [0x7fd4ff, 0xffffff], speed: 4, up: 3, life: 0.3, size: 0.12 });
  }

  blocked(p) {
    if (this.sfx.throttle('immune', 500) === false) {
      this.popup(p.x, (p.oy || 0) + 2.2, p.z, p.boss && p.boss.shieldUp ? 'SHIELDED' : 'IMMUNE', '');
    }
    this.sfx.play('clank');
    this.particles.emit(p.x, (p.oy || 0) + 1, p.z + p.r, 2, { colors: [0x7fd4ff, 0xffffff], speed: 3, up: 2, life: 0.2, size: 0.08 });
  }

  ignite(e, dps) {
    if (e.dead) return;
    e.burnStacks = Math.min(3, (e.burnStacks || 0) + 1);
    e.burn = Math.max(e.burn, dps) ;
    e.burnT = 2.4;
  }

  chillHit(e, n) {
    if (e.dead || e.part) return;
    e.chill = Math.min(4, e.chill + n);
    e.chillT = 2.2;
    if (e.chill >= 4 && e.frozen <= 0) {
      e.frozen = 1.7;
      e.chill = 0;
      e.view.ice.visible = true;
      this.sfx.play('freeze');
      this.particles.emit(e.x, 0.8, e.z, 8, { colors: ICE, speed: 2.5, up: 3, life: 0.4, size: 0.12 });
      if (this.syn('cryoblast')) {
        e.cryo = true;
      }
    }
  }

  chainFrom(src, jumps, dmg) {
    let cur = src;
    const hit = [src];
    for (let k = 0; k < jumps; k++) {
      let best = null;
      let bd = 3.4 * 3.4;
      for (const o of this.barrels) {
        if (o.dead || hit.includes(o) || (o.part && !o.active)) continue;
        const d = (o.x - cur.x) ** 2 + (o.z - cur.z) ** 2;
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (!best) break;
      hit.push(best);
      this.bolts.add(cur.x, (cur.oy || 0) + 0.8, cur.z, best.x, (best.oy || 0) + 0.8, best.z, 0x9fd8ff, 0.16, 0.08);
      this.damage(best, dmg, { src: 'chain' });
      if (this.syn('wildfire')) this.ignite(best, dmg * 0.4);
      cur = best;
    }
    if (hit.length > 1) this.sfx.play('zap');
  }

  // Area damage used by explosions and hazards.
  damageArea(x, z, r, dmg, opts = {}) {
    let n = 0;
    for (const o of [...this.barrels]) {
      if (o === opts.exclude || o.dead) continue;
      const dx = o.x - x;
      const dz = o.z - z;
      const rr = r + o.r * 0.6;
      if (dx * dx + dz * dz < rr * rr) {
        this.damage(o, dmg, { src: opts.src || 'blast' });
        if (opts.burn) this.ignite(o, dmg * 0.3);
        if (opts.chill) this.chillHit(o, 2);
        n++;
      }
    }
    return n;
  }

  damageLane(x, w, z0, z1, dmg) {
    for (const o of [...this.barrels]) {
      if (o.dead || o.part) continue;
      if (Math.abs(o.x - x) < w / 2 + o.r * 0.5 && o.z > z0 && o.z < z1) this.damage(o, dmg, { src: 'hazard' });
    }
  }

  explode(x, z, r, dmg, opts = {}) {
    const small = opts.small;
    this.rings.add(x, 0.25, z, opts.color || 0xffa23a, r * 1.2, small ? 0.22 : 0.4);
    this.particles.emit(x, 0.7, z, small ? 6 : 22, { colors: BLAST, speed: small ? 3 : 6, up: small ? 3 : 5, size: small ? 0.18 : 0.3, life: small ? 0.35 : 0.55, gravity: 2, spread: 0.4 });
    if (!small) {
      this.sfx.play('boom');
      this.addShake(0.28);
    }
    this.damageArea(x, z, r, dmg, { exclude: opts.exclude, src: opts.src || 'blast' });
    if (this.syn('napalm') && !small && this.fireZones.length < 8) this.fireZones.push({ x, z, r: r * 0.7, t: 2.6, dps: dmg * 0.45 });
  }

  blast(x, z, r, color) {
    this.rings.add(x, 0.3, z, color, r * 1.4, 0.4);
    this.particles.emit(x, 1, z, 20, { colors: BLAST, speed: 5, up: 6, size: 0.26, life: 0.6 });
    this.sfx.play('boom');
    this.addShake(0.3);
  }

  // Explosive barrels: tracks chain depth for chain bonuses.
  kegBlast(e) {
    const ex = e.def.explode;
    const r = ex.r * (this.hasRelic('powderhorn') ? 1.35 : 1);
    const dmg = Math.max(10, e.maxHp * ex.dmg, this.stats().dmg * 4);
    this.chain.n++;
    this.chain.t = 0.55;
    if (this.chain.n > this.chain.best) this.chain.best = this.chain.n;
    if (this.chain.n >= 3) {
      const bonus = Math.round(this.chain.n * 3 * this.mods.coinMul);
      this.runCoins += bonus;
      this.score += this.chain.n * 60;
      this.popup(e.x, 2.8, e.z, `CHAIN x${this.chain.n}!`, 'chain');
      if (this.chain.n === 6 || this.chain.n === 10) {
        this.slowT = Math.max(this.slowT, 0.7);
        this.camZoom = Math.max(this.camZoom, 0.6);
      }
    }
    this.rings.add(e.x, 0.3, e.z, 0xffa23a, r * 1.1, 0.4);
    this.particles.emit(e.x, 0.8, e.z, 26, { colors: BLAST, speed: 6, up: 5, size: 0.3, life: 0.5, gravity: 2, spread: 0.5 });
    this.addShake(0.35);
    this.fovKick = Math.max(this.fovKick, 0.5);
    this.hitstop = Math.max(this.hitstop, 0.03);
    // Damage is applied a beat later so chains ripple outward visibly.
    this.delayed.push({ t: 0.07, fn: () => this.damageArea(e.x, e.z, r, dmg, { src: 'blast' }) });
    if (this.syn('napalm')) this.fireZones.push({ x: e.x, z: e.z, r: r * 0.6, t: 2.6, dps: dmg * 0.3 });
  }

  // ---------- kills and rewards ----------

  killEnemy(e, reward, src) {
    if (e.dead) return;
    e.dead = true;
    const def = e.def;
    const big = def.big;
    this.particles.emit(e.x, 0.7, e.z, big ? 40 : 16, {
      colors: def.wall ? STONE : e.gold ? GOLD : WOOD, speed: big ? 7 : 4.5, up: big ? 9 : 6, size: big ? 0.34 : 0.22, life: 0.9, spread: e.r * 0.6,
    });
    this.sfx.play(def.explode ? 'boom' : def.wall ? 'rubble' : 'break');
    if (def.explode) this.kegBlast(e);
    else if (this.mods.deathBlast && Math.random() < this.mods.deathBlast) this.explode(e.x, e.z, 1.8, Math.max(6, e.maxHp * 0.6), { color: 0xffa23a });
    if (e.cryo || (this.syn('cryoblast') && e.frozen > 0)) {
      this.rings.add(e.x, 0.3, e.z, 0x9fe0ff, 2.6, 0.4);
      this.particles.emit(e.x, 0.8, e.z, 18, { colors: ICE, speed: 6, up: 4, size: 0.2, life: 0.5 });
      this.sfx.play('shatter');
      this.delayed.push({ t: 0.05, fn: () => this.damageArea(e.x, e.z, 2.0, this.stats().dmg * 3, { src: 'blast', chill: true }) });
    }
    if (e.burn > 0 && this.family === 'flame') {
      // fire spreads to neighbors on death
      for (const o of this.barrels) if (!o.dead && !o.part && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < 4) this.ignite(o, e.burn * 0.8);
    }
    if (def.split && reward) {
      for (const dx of [-0.6, 0.6]) {
        this.spawnEnemy({ kind: 'small', x: clamp(e.x + dx, -2.9, 2.9), hp: Math.max(2, Math.round(e.maxHp * 0.35)) }, e.z - 0.5, true);
      }
    }
    if (reward) {
      this.kills++;
      this.killWeight += e.minion ? 0 : def.weight;
      this.combo++;
      this.comboT = 2.4 + this.mods.comboTime;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      const mult = this.comboMult();
      const coinBonus = (1 + 0.1 * this.save.forge.coin) * this.mods.coinMul * this.cfgv('coinMul', 1) * (this.riskyT > 0 ? 2 : 1) * (this.temps.frenzy > 0 ? 2 : 1);
      const base = (1 + e.maxHp / 8) * (def.coins || 1) * (e.gold ? 3 : 1);
      const val = Math.max(def.coins ? 1 : 0, Math.round(base * mult * coinBonus * (1 + this.mods.comboBonus)));
      this.runCoins += val;
      this.score += Math.round(base * mult * 10);
      if (val > 0) {
        if (this.popups.length < 16) this.popup(e.x, 1.8, e.z, `+${val}`, 'coin');
        const nCoins = big ? 5 : def.treasure ? 6 : Math.min(3, 1 + Math.floor(val / 15));
        for (let i = 0; i < nCoins; i++) this.coinFx.spawn(e.x, 1, e.z);
        this.sfx.play('coin');
      }
      this.multi.n++;
      this.multi.t = 0.35;
      this.multi.x = e.x;
      this.multi.z = e.z;
      this.ability.charge = Math.min(1, this.ability.charge + (1 / ABILITIES[this.ability.id].charge) * (1 + this.mods.abilityCharge) * (def.weight || 0.5));
      this.save.weapons.mastery[this.family] = (this.save.weapons.mastery[this.family] || 0) + 1;
      if (def.gift) {
        this.addLevels(def.gift, true);
        this.popup(e.x, 2.6, e.z, `LEVEL +${def.gift}!`, 'coin big');
        this.rings.add(e.x, 0.3, e.z, 0xfff2a0, 3, 0.5);
      }
      if (def.treasure) {
        this.cartsCaught++;
        this.popup(e.x, 2.8, e.z, 'GOLD!', 'coin big');
        this.coinBurst(e.x, e.z, 6);
      }
      if (def.chest) this.chestLoot(e);
      if (def.anvil) {
        this.rings.add(e.x, 0.3, e.z, 0x9ae8ff, 3, 0.5);
        this.queueDraft(e.jackpot ? 'jackpot' : 'anvil');
      }
      if (def.altar) this.queueDraft('altar');
      if (def.elite) {
        this.slowT = Math.max(this.slowT, 0.35);
        this.addShake(0.4);
        this.popup(e.x, 3, e.z, 'ELITE DOWN!', 'chain');
      }
      this.addXp(def.xp || 1);
      this.bumpCombo();
    }
    const i = this.barrels.indexOf(e);
    if (i >= 0) this.barrels.splice(i, 1);
    this.releaseBarrel(e);
  }

  coinBurst(x, z, n) {
    for (let i = 0; i < n; i++) this.coinFx.spawn(x + rand(-0.5, 0.5), 1, z);
  }

  killBoss(boss) {
    if (boss.dead) return;
    boss.dead = true;
    const main = boss === this.bossRef;
    this.slowT = main ? 1.6 : 0.8;
    this.camZoom = 1.4;
    this.addShake(1);
    this.vibrate(120);
    this.sfx.play('bossdie');
    for (let k = 0; k < 6; k++) {
      this.delayed.push({
        t: k * 0.12,
        fn: () => {
          const x = boss.x + rand(-2, 2) * boss.scale;
          const z = boss.z + rand(-1.5, 1.5);
          this.rings.add(x, 0.5, z, k % 2 ? 0xffd23a : 0xff6a2a, 5, 0.6);
          this.particles.emit(x, 2, z, 30, { colors: BLAST, speed: 8, up: 10, size: 0.36, life: 1.0 });
          this.sfx.play('boom');
        },
      });
    }
    this.delayed.push({ t: 0.75, fn: () => boss.remove() });
    const val = Math.round((60 + this.stageNum * 10) * (boss.mini ? 0.5 : 1) * this.mods.coinMul * (1 + this.mods.bossReward));
    this.runCoins += val;
    this.score += boss.mini ? 1500 : 4000;
    this.coinBurst(boss.x, boss.z, 20);
    this.popup(boss.x, 4, boss.z, `+${val}`, 'coin big');
    this.bossKills++;
    for (const o of [...this.barrels]) if (!o.part && !o.dead && o.minion) this.killEnemy(o, false);
    const locked = FAMILY_IDS.filter((f) => !this.save.weapons.unlocked.includes(f));
    if (locked.length && (!boss.mini || Math.random() < 0.5)) this.addBlueprint(locked[Math.floor(Math.random() * locked.length)]);
    if (!boss.mini && Math.random() < 0.6) this.grantRelic();
    if (!boss.mini) {
      const st = this.save.stats;
      st.bossKills = (st.bossKills || 0) + 1;
      if (!this.save.bossesBeaten.includes(boss.id)) this.save.bossesBeaten.push(boss.id);
      st.bossTypes = this.save.bossesBeaten.length;
    }
    if (main) {
      this.hud['hud-boss'].classList.add('hidden');
      this.showBanner(boss.mini ? 'MINI-BOSS DOWN!' : 'BOSS DEFEATED!', boss.name, false, 2400, 'gold');
      this.bossRef = this.extraBosses.shift() || null;
      if (boss.mini) this.queueDraft('chest');
    } else {
      const i = this.extraBosses.indexOf(boss);
      if (i >= 0) this.extraBosses.splice(i, 1);
    }
  }

  comboMult() {
    return 1 + Math.min(Math.floor(this.combo / 5), 12) * 0.25;
  }

  bumpCombo() {
    const el = this.hud['hud-combo'];
    if (this.combo >= 3) {
      this.setText('hud-combo-n', `${this.combo}`);
      this.setText('hud-combo-x', `x${this.comboMult().toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}`);
      el.classList.remove('hidden');
      el.classList.toggle('hot', this.combo >= 25);
      el.classList.toggle('blaze', this.combo >= 60);
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
      if (this.combo % 25 === 0) {
        this.sfx.play('combo');
        this.popup(this.player.root.position.x, 3.4, 0, `${this.combo} COMBO!`, 'chain');
      }
    }
  }

  multiKill() {
    const n = this.multi.n;
    this.multi.n = 0;
    if (n < 3) return;
    const names = { 3: 'TRIPLE KILL', 4: 'QUAD KILL', 5: 'PENTA KILL' };
    const name = names[n] || (n >= 10 ? `MASSACRE x${n}` : `MULTI KILL x${n}`);
    const bonus = Math.round(n * n * (1 + this.stageNum * 0.2) * this.mods.coinMul);
    this.runCoins += bonus;
    this.score += n * n * 25;
    this.popup(this.multi.x, 3.2, this.multi.z, `${name} +${bonus}`, 'chain');
    this.sfx.play('multi');
    if (n >= 6) this.slowT = Math.max(this.slowT, 0.4);
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
    if (leveled) this.afterLevel();
  }

  addLevels(n) {
    this.level += n;
    this.afterLevel();
  }

  afterLevel() {
    const nf = this.form();
    if (nf !== this.player.form) {
      setPlayerWeapon(this.player, this.family, nf);
      this.evolveFx(FAMILIES[this.family].color, 1.2);
      this.showBanner('WEAPON EVOLVED!', `${FAMILIES[this.family].icon} ${FAMILIES[this.family].forms[nf].name}`, false, 2000, 'gold');
      this.sfx.play('evolve');
      this.flashStat('hud-weapon');
      this.slowT = Math.max(this.slowT, 0.5);
      this.camZoom = Math.max(this.camZoom, 0.5);
      this.refreshTags();
    } else {
      const p = this.player.root.position;
      this.rings.add(p.x, 0.2, p.z, 0xffe27a, 2.4, 0.4);
      this.popup(p.x, 2.6, p.z, 'LEVEL UP', 'coin');
      this.sfx.play('gate');
    }
    this.flashStat('hud-dmg');
  }

  evolveFx(color = 0x7fd4ff, k = 1) {
    const p = this.player.root.position;
    this.rings.add(p.x, 0.3, p.z, 0xfff2a0, 6.5 * k, 0.8);
    this.rings.add(p.x, 0.6, p.z, color, 4.5 * k, 0.6);
    this.particles.emit(p.x, 1.2, p.z, Math.round(50 * k), { colors: [0xfff2a0, 0xffd23a, color, 0xffffff], speed: 6, up: 8, size: 0.2, life: 1.0, gravity: 6 });
    this.addShake(0.3 * k);
    this.player.weaponHolder.scale.setScalar(1 + 0.5 * k);
    this.fovKick = Math.max(this.fovKick, 0.6 * k);
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
    switch (g.kind) {
      case 'bolts': this.mods.bolts += g.value; this.refreshTags(); break;
      case 'dmg': this.mods.dmgMul += g.value / 100; break;
      case 'rate': this.mods.rateMul += g.value / 100; this.refreshTags(); break;
      case 'level': this.addLevels(g.value); break;
      case 'safe': this.heal(1); break;
      case 'risky': this.takeRisk(); break;
      case 'vault': this.enterVault(); break;
      default: break;
    }
    this.popup(p.x, 3, p.z, def.label(g.value), 'coin big');
    this.rings.add(p.x, 0.3, p.z, def.color, 3, 0.5);
    this.particles.emit(p.x, 1.2, p.z, 24, { color: def.color, speed: 4, up: 5, size: 0.16, life: 0.6, gravity: 4 });
    this.sfx.play('gate');
    this.flashStat(g.kind === 'bolts' ? 'hud-bolts' : g.kind === 'rate' ? 'hud-rate' : 'hud-dmg');
    this.vibrate(15);
    for (const o of this.gates) if (Math.abs(o.z - g.z) < 0.01 && o !== g) o.taken = true;
  }

  takeRisk() {
    this.riskyT = 22;
    this.showBanner('RISKY ROAD', 'Elites ahead. Loot doubled for 22s', true, 2000);
    const z = FIELD.spawnZ + 8;
    const hp = this.rowHp(0.6);
    this.spawnEnemy({ kind: 'elite', x: -1.75, hp: Math.round(hp * ENEMIES.elite.hp) }, z);
    this.spawnEnemy({ kind: 'chest', x: 1.4, hp: Math.round(hp * ENEMIES.chest.hp) }, z - 3);
    this.spawnEnemy({ kind: Math.random() < 0.5 ? 'bomber' : 'armored', x: 2.8, hp: Math.round(hp * 1.3) }, z + 1);
  }

  hurt(amount, why) {
    if (this.invuln > 0 || this.state !== 'playing') return;
    if (this.shieldHits > 0) {
      this.shieldHits--;
      this.invuln = 0.6;
      const p = this.player.root.position;
      this.rings.add(p.x, 0.8, p.z, 0x5ab4ff, 3, 0.4);
      this.popup(p.x, 2.6, p.z, 'BLOCKED', 'big');
      this.sfx.play('shield');
      if (this.shieldHits <= 0) this.player.shield.visible = false;
      return;
    }
    this.hearts -= amount;
    this.hurtCount++;
    (this.hurtLog || (this.hurtLog = [])).push(`${why}@${this.elapsed.toFixed(0)}`);
    this.invuln = 1.0;
    this.combo = 0;
    this.comboT = 0;
    this.hud['hud-combo'].classList.add('hidden');
    this.addShake(0.6);
    this.hud.flash.style.opacity = 0.75;
    this.sfx.play('hurt');
    this.vibrate(80);
    const p = this.player.root.position;
    this.particles.emit(p.x, 1, p.z, 18, { colors: [0xff5a4a, 0xffb0a0], speed: 5, up: 5, size: 0.18, life: 0.6 });
    this.popup(p.x, 2.8, p.z, why === 'leak' ? 'BREACH!' : 'OUCH!', 'big');
    if (this.hearts <= 0) {
      if (this.hasRelic('phoenix') && !this.revived) {
        this.revived = true;
        this.hearts = 1;
        this.invuln = 2.5;
        this.showBanner('PHOENIX REBIRTH', 'Back from the ashes!', false, 2000, 'gold');
        this.evolveFx(0xff8a2a, 1.2);
        this.damageArea(p.x, -6, 8, this.stats().dmg * 10, { src: 'ability' });
        return;
      }
      this.hearts = 0;
      this.finish(false);
    }
  }

  finish(win) {
    if (this.state !== 'playing') return;
    this.state = 'ending';
    this.endWin = win;
    this.endT = win ? 1.4 : 1.1;
    if (win) {
      this.slowT = Math.max(this.slowT, 0.8);
      this.camZoom = Math.max(this.camZoom, 0.6);
      this.sfx.play('win');
      for (const o of [...this.barrels]) if (!o.part && !o.dead) this.killEnemy(o, false);
    } else {
      this.sfx.play('lose');
    }
  }

  buildResult() {
    const win = this.endWin;
    const n = this.stageNum;
    const p = this.profile;
    const base = Math.round(30 + n * 14 + (p.boss ? 120 + n * 10 : 0));
    const stageBonus = win ? Math.round(base * (this.mode === 'campaign' ? 1 : 1.5) * (this.mode === 'campaign' ? (this.difficulty === 'nightmare' ? 2.2 : this.difficulty === 'veteran' ? 1.5 : 1) : 1)) : 0;
    const objectives = this.objectives.map((o) => ({ text: o.text, done: win && o.check() }));
    const stars = win ? 1 + objectives.filter((o) => o.done).length : 0;
    const objBonus = objectives.filter((o) => o.done).length * Math.round(base * 0.35);
    let score = this.score + (win ? 1000 + objectives.filter((o) => o.done).length * 800 + (this.hurtCount === 0 ? 1200 : 0) : 0);
    if (this.mode === 'endless') score += (this.wave - 1) * 2000;
    const ratio = this.par > 0 ? score / (this.par + 1500) : 0;
    const rank = win || this.mode === 'endless' ? rankFor(ratio) : '-';
    return {
      win, mode: this.mode, stage: n, boss: p.boss, runCoins: this.runCoins + this.drops.coins, stageBonus, objBonus, objectives, stars, score, rank,
      kills: this.kills, level: this.level, family: this.family, form: this.form(), bestCombo: this.bestCombo, bestChain: this.chain.best,
      wave: this.wave, drops: this.drops, hurtLog: this.hurtLog, trial: this.trial, crits: this.crits, synergies: [...this.synergies], daily: this.dailyKey,
      biome: p.biome, mods: p.mods,
    };
  }

  // ---------- abilities ----------

  useAbility() {
    if (this.state !== 'playing' || this.draftOpen || this.ability.charge < 1) return false;
    this.ability.charge = 0;
    const id = this.ability.id;
    const s = this.stats();
    const p = this.player.root.position;
    this.sfx.play('ability');
    this.vibrate(60);
    if (id === 'bomb') {
      // Densest cluster ahead.
      let best = null;
      let bn = -1;
      for (const b of this.barrels) {
        if (b.dead || b.z < -30) continue;
        let n = 0;
        for (const o of this.barrels) if (!o.dead && (o.x - b.x) ** 2 + (o.z - b.z) ** 2 < 9) n++;
        if (n > bn) {
          bn = n;
          best = b;
        }
      }
      const x = best ? best.x : p.x;
      const z = best ? best.z : -10;
      this.rings.add(x, 0.4, z, 0xffd23a, 7, 0.7);
      this.rings.add(x, 0.4, z, 0xff4d1a, 5, 0.5);
      this.particles.emit(x, 1, z, 60, { colors: BLAST, speed: 9, up: 12, size: 0.4, life: 1.0 });
      this.addShake(0.9);
      this.slowT = Math.max(this.slowT, 0.4);
      this.sfx.play('boom');
      this.damageArea(x, z, 4, s.dmg * 16 + hpBase(this.stageNum) * 6, { src: 'ability', burn: this.tags.has('fire') });
      this.showBanner('POWDER BOMB!', '', false, 900);
    } else if (id === 'volley') {
      this.volleyT = 3;
      this.showBanner('ARROW STORM!', '', false, 900);
    } else if (id === 'warp') {
      this.warpT = 5;
      this.flashScreen('#6ad4ff', 0.5);
      this.showBanner('TIME WARP', 'Enemies slowed', false, 900);
    } else if (id === 'aegis') {
      this.addShield(2);
      for (const b of this.barrels) if (!b.part && !b.dead) b.pushZ = -7;
      this.rings.add(p.x, 0.5, p.z, 0x5ab4ff, 9, 0.7);
      this.showBanner('AEGIS WAVE', 'Shield up, enemies shoved back', false, 900);
    }
    return true;
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

  flashScreen(color, a) {
    const el = this.hud.flash;
    el.style.background = `radial-gradient(ellipse at center, ${color}55 0%, ${color} 100%)`;
    el.style.opacity = String(a);
    this.flashColorT = 0.6;
  }

  edgePulse(kind) {
    const el = this.hud.edge;
    if (!el) return;
    el.className = '';
    void el.offsetWidth;
    el.className = `edge-${kind}`;
  }

  showBanner(title, sub, danger, ms = 2200, style = '') {
    const b = this.hud.banner;
    this.hud['banner-title'].textContent = title;
    this.hud['banner-sub'].textContent = sub;
    b.classList.toggle('danger', !!danger);
    b.classList.toggle('gold', style === 'gold');
    b.classList.remove('hidden');
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = `banner ${ms}ms forwards`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
  }

  popup(x, y, z, text, cls = '') {
    if (this.popups.length > 24) return;
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    this.hud.popups.appendChild(el);
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
    }
  }

  updateLabel(e) {
    if (!e.view) return;
    const frac = e.hp / e.maxHp;
    let color = frac > 0.66 ? '#ffffff' : frac > 0.33 ? '#ffe27a' : '#ff9c7a';
    let badge = '';
    if (e.def.armor) {
      color = frac > 0.33 ? '#c8d4e0' : '#ff9c7a';
      badge = '\u{1F6E1}';
    }
    if (e.captain) badge = '\u{1F451}';
    if (e.def.anvil) badge = '⚒';
    if (e.def.chest || e.def.treasure) color = '#ffe27a';
    drawLabel(e.view.label, fmt(Math.ceil(e.hp)), color, badge);
  }

  updateBossBar() {
    const b = this.bossRef;
    if (!b) return;
    this.hud['hud-boss-fill'].style.width = `${clamp((b.hp / b.maxHp) * 100, 0, 100)}%`;
  }

  // ---------- HUD ----------

  setText(id, text) {
    if (this.hudCache[id] === text) return;
    this.hudCache[id] = text;
    this.hud[id].textContent = text;
  }

  setHtml(id, html) {
    if (this.hudCache[id] === html) return;
    this.hudCache[id] = html;
    this.hud[id].innerHTML = html;
  }

  renderMods() {
    const chips = this.profile.mods.map((id) => {
      const m = MODIFIER_BY_ID[id];
      return `<span class="chip" title="${m.desc}">${m.icon} ${m.name}</span>`;
    });
    const b = BIOMES[this.biome];
    chips.unshift(`<span class="chip biome">${b.icon} ${b.name}</span>`);
    this.setHtml('hud-mods', chips.join(''));
  }

  updateHud(force) {
    if (!this.profile) return;
    const s = this.stats();
    const f = FAMILIES[this.family];
    const label = this.mode === 'daily' ? 'Daily' : this.mode === 'endless' ? `Wave ${this.wave}` : `Stage ${this.stageNum}`;
    this.setText('hud-level', label);
    this.setText('hud-coins', fmt(this.runCoins));
    this.setText('hud-score', fmt(this.score));
    this.setText('hud-weapon', s.formName);
    this.setText('hud-wicon', f.icon);
    this.setText('hud-wlv', String(this.level));
    this.setText('hud-dmg', fmt(s.dmg));
    this.setText('hud-rate', s.rate.toFixed(1));
    this.setText('hud-bolts', String(s.bolts));
    const tagIcons = { fire: '\u{1F525}', frost: '❄', lightning: '⚡', explosive: '\u{1F4A5}', pierce: '\u{1F4CC}', multishot: '\u{1F3AF}', rapid: '⏩', homing: '\u{1F9ED}' };
    let tags = [...this.tags].map((t) => tagIcons[t] || '').join('');
    for (const sid of this.synergies) tags += `<b class="syn">${SYNERGIES.find((x) => x.id === sid).icon}</b>`;
    this.setHtml('hud-tags', tags);
    const need = xpNeeded(this.level);
    const xpw = `${clamp((this.xp / need) * 100, 0, 100).toFixed(0)}%`;
    if (this.hudCache.xpw !== xpw) {
      this.hudCache.xpw = xpw;
      this.hud['hud-wxp'].style.width = xpw;
    }
    let prog;
    if (this.profile.objective === 'survive' && this.mode !== 'endless') prog = this.elapsed / this.layout.duration;
    else if (this.bossRef && this.profile.boss) prog = 0.6 + 0.4 * (1 - clamp(this.bossRef.hp / this.bossRef.maxHp, 0, 1));
    else prog = Math.min(this.nextItem / Math.max(1, this.items.length), this.killWeight / this.totalWeight + 0.25) * (this.profile.boss ? 0.6 : 1);
    const pw = `${clamp(prog * 100, 0, 100).toFixed(1)}%`;
    if (this.hudCache.pw !== pw) {
      this.hudCache.pw = pw;
      this.hud['hud-progress-fill'].style.width = pw;
    }
    const hk = `${this.hearts}/${this.maxHearts}/${this.shieldHits}`;
    if (this.hudCache.hearts !== hk) {
      this.hudCache.hearts = hk;
      let html = '';
      for (let i = 0; i < this.maxHearts; i++) html += i < this.hearts ? '❤️' : '<span class="lost">❤️</span>';
      for (let i = 0; i < this.shieldHits; i++) html += '\u{1F6E1}';
      this.hud['hud-hearts'].innerHTML = html;
    }
    // objectives
    const obj = [`<div class="obj main">${this.primaryText()}</div>`];
    for (const o of this.objectives) {
      const done = o.check();
      const failed = o.live && !done;
      const pr = o.goal ? ` ${Math.min(o.goal, o.prog())}/${o.goal}` : '';
      obj.push(`<div class="obj ${done && !o.live ? 'done' : ''} ${failed ? 'failed' : ''}">${done && !o.live ? '★' : '☆'} ${o.text}${pr}</div>`);
    }
    this.setHtml('hud-objective', obj.join(''));
    // ability
    const ab = ABILITIES[this.ability.id];
    this.setText('hud-ability-icon', ab.icon);
    const af = `${(this.ability.charge * 100).toFixed(0)}%`;
    if (this.hudCache.af !== af) {
      this.hudCache.af = af;
      this.hud['hud-ability-fill'].style.height = af;
      this.hud['hud-ability'].classList.toggle('ready', this.ability.charge >= 1);
    }
    // combo timer bar
    const cw = `${clamp((this.comboT / (2.4 + this.mods.comboTime)) * 100, 0, 100).toFixed(0)}%`;
    if (this.hudCache.cw !== cw) {
      this.hudCache.cw = cw;
      this.hud['hud-combo-fill'].style.width = cw;
    }
    // temporary effects
    const temps = [];
    if (this.temps.frenzy > 0) temps.push(`<span class="temp gold">\u{1F31F} FRENZY ${this.temps.frenzy.toFixed(0)}</span>`);
    if (this.temps.overdrive > 0) temps.push(`<span class="temp">\u{1F409} OVERDRIVE ${this.temps.overdrive.toFixed(0)}</span>`);
    if (this.temps.storm > 0) temps.push(`<span class="temp blue">\u{1F329} STORM ${this.temps.storm.toFixed(0)}</span>`);
    if (this.warpT > 0) temps.push(`<span class="temp blue">⏳ WARP ${this.warpT.toFixed(0)}</span>`);
    if (this.riskyT > 0) temps.push(`<span class="temp">\u{1F4B0} LOOT x2 ${this.riskyT.toFixed(0)}</span>`);
    this.setHtml('hud-temps', temps.join(''));
    if (force) this.hud['drag-hint'].style.opacity = this.dragged ? 0 : 1;
  }

  // ---------- main loop ----------

  update(rawDt) {
    let dt = Math.min(rawDt, 0.05);
    const real = dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      dt *= 0.08;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= 0.3;
    }
    if (this.draftOpen) dt *= 0.0;
    this.time += dt;
    const playing = this.state === 'playing' || this.state === 'ending';
    const paused = this.state === 'paused';

    if (!paused) {
      const speed = playing ? this.speed : 1.2;
      updateEnvironment(this.env, dt, speed, this.time);
      this.updatePlayer(dt, playing, speed, real);
      if (playing) this.updatePlaying(dt, speed);
      this.particles.update(dt, speed);
      this.rings.update(dt, speed);
      this.coinFx.update(dt, this.player.root.position, speed);
      this.bolts.update(dt);
      this.updatePopups(dt);
      this.ambient(dt);
    }
    this.updateCamera(real);
  }

  ambient(dt) {
    const b = BIOMES[this.biome || 'courtyard'];
    const a = AMBIENT[b.ambient];
    if (!a || Math.random() > dt * 30) return;
    const x = rand(-8, 8);
    const z = rand(-36, 4);
    this.particles.emit(x, a.vy < 0 ? 8 : rand(0, 3), z, 1, {
      colors: a.colors, speed: 0.3, up: a.up, vy: a.vy, vx: a.vx || 0, gravity: a.g, life: 2.2, size: a.size, shrink: false,
    });
  }

  updatePlayer(dt, playing, speed, real) {
    const p = this.player;
    const x = p.root.position.x;
    // Ice makes the cart slide; gusts push it.
    if (this.hazards.push && playing) this.targetX = clamp(this.targetX + this.hazards.push * dt, -FIELD.playerMaxX, FIELD.playerMaxX);
    let nx;
    if (this.hazards.slippery && playing) {
      this.velX += (this.targetX - x) * 40 * dt;
      this.velX *= Math.exp(-3.2 * dt);
      nx = clamp(x + this.velX * dt, -FIELD.playerMaxX, FIELD.playerMaxX);
    } else {
      nx = lerp(x, this.targetX, 1 - Math.exp(-18 * real));
      this.velX = 0;
    }
    p.root.position.x = nx;
    p.root.rotation.y = clamp((x - nx) * -2.5, -0.35, 0.35) * 0.5;
    for (const w of p.wheels) w.rotation.x += (speed * dt) / 0.42;
    p.bob.position.y = Math.sin(this.time * 9) * 0.02;
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 1.4);
    if (p.weapon) {
      p.weapon.position.z = this.recoil;
      if (p.weapon.userData.spin) p.weapon.userData.spin.rotation.z += dt * 25;
      if (p.weapon.userData.pilot) p.weapon.userData.pilot.scale.setScalar((p.weapon.userData.pilot.userData.s || 0.15) * (0.8 + Math.sin(this.time * 30) * 0.2));
    }
    const s = p.weaponHolder.scale.x;
    if (s > 1) p.weaponHolder.scale.setScalar(Math.max(1, s - dt * 2));
    p.root.visible = true;
    if (this.invuln > 0) {
      this.invuln -= dt;
      p.root.visible = Math.floor(this.time * 20) % 2 === 0 || this.invuln <= 0;
    }
    const aura = this.temps.frenzy > 0 ? 0xffe27a : this.temps.overdrive > 0 ? 0xff5a1a : this.temps.storm > 0 ? 0x7fd4ff : 0;
    p.aura.material.opacity = aura ? 0.5 + Math.sin(this.time * 12) * 0.15 : 0;
    if (aura) p.aura.material.color.setHex(aura);
    const fl = this.hud.flash;
    if (fl && fl.style.opacity !== '0') {
      const v = Math.max(0, parseFloat(fl.style.opacity) - real * 2.5);
      fl.style.opacity = String(v);
      if (v === 0) fl.style.background = '';
    }
  }

  updateTemps(dt) {
    for (const k of Object.keys(this.temps)) {
      if (this.temps[k] > 0) {
        this.temps[k] -= dt;
        if (this.temps[k] <= 0 && (k === 'frenzy' || k === 'overdrive')) this.refreshTags();
      }
    }
    if (this.temps.frenzyIn > 0) {
      this.temps.frenzyIn -= dt;
      if (this.temps.frenzyIn <= 0) {
        this.temps.frenzy = 7;
        this.sfx.play('fanfare');
        this.flashScreen('#ffe27a', 0.5);
      }
    }
    if (this.riskyT > 0) this.riskyT -= dt;
    if (this.warpT > 0) this.warpT -= dt;
    if (this.transformT > 0) {
      this.transformT -= dt;
      if (this.transformT <= 0) {
        this.biome = this.transformTo;
        this.flashScreen('#ffffff', 1);
        applyBiome(this.env, this.biome);
        setDarkness(this.env, this.cfg.dark ? (BIOMES[this.biome].dark ? 0.4 : 1) : 0);
        this.hazards.setup(this.biome, this.cfg);
        this.renderMods();
        this.showBanner(BIOMES[this.biome].name.toUpperCase(), BIOMES[this.biome].hazardName, false, 2200);
        this.sfx.play('boom');
        this.addShake(0.6);
      }
    }
    // Thunderhead / Wrath of Storms strike the toughest targets.
    if (this.mods.thunder || this.temps.storm > 0) {
      this.thunderT -= dt;
      if (this.thunderT <= 0) {
        this.thunderT = this.temps.storm > 0 ? 0.35 : 2;
        const s = this.stats();
        const live = this.barrels.filter((b) => !b.dead && b.z > -36 && (!b.part || b.active));
        live.sort((a, b) => b.hp - a.hp);
        const n = this.temps.storm > 0 ? 2 : 3;
        for (const t of live.slice(0, n)) {
          this.bolts.add(t.x + rand(-0.5, 0.5), 12, t.z, t.x, (t.oy || 0) + 0.6, t.z, 0xcfe8ff, 0.22, 0.16);
          this.damage(t, s.dmg * (this.temps.storm > 0 ? 3 : 2.5), { src: 'chain' });
        }
        if (live.length) this.sfx.play('thunder');
      }
    }
    if (this.volleyT > 0) {
      this.volleyT -= dt;
      const s = this.stats();
      const live = this.barrels.filter((b) => !b.dead && b.z > -34 && (!b.part || b.active));
      for (let k = 0; k < 2 && live.length; k++) {
        const t = live[Math.floor(Math.random() * live.length)];
        this.particles.emit(t.x, 4, t.z, 2, { colors: [0xf1e3b0, 0xffffff], speed: 0.3, up: 0, vy: -16, gravity: 0, life: 0.2, size: 0.12 });
        this.damage(t, s.dmg * 1.4, { src: 'ability' });
      }
    }
    if (this.stormT > 0) {
      this.stormT -= dt;
      if (Math.random() < dt * 1.3) {
        const px = this.player.root.position.x;
        this.hazards.zone(Math.random() < 0.4 ? px : rand(-3, 3), -1.5 * this.speed + rand(-6, 0.5), 1.2, 1.5, { kind: 'bomb', fall: 'bomb', hitsEnemies: true, dmg: 3 });
      }
    }
  }

  updatePlaying(dt, speed) {
    this.elapsed += dt;
    this.D += speed * dt * (this.warpT > 0 ? 0.4 : 1);
    if (this.state === 'playing') this.spawnDue();
    const px = this.player.root.position.x;

    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.delayed.splice(i, 1);
        d.fn();
      }
    }
    if (this.chain.t > 0) {
      this.chain.t -= dt;
      if (this.chain.t <= 0) {
        const n = this.chain.n;
        this.chain.n = 0;
        const st = this.save.stats;
        st.bestChain = Math.max(st.bestChain || 0, n);
      }
    }
    if (this.multi.t > 0) {
      this.multi.t -= dt;
      if (this.multi.t <= 0) this.multiKill();
    }
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        this.combo = 0;
        this.hud['hud-combo'].classList.add('hidden');
      }
    }
    this.updateTemps(dt);
    if (this.blessingDue && !this.draftOpen) {
      this.blessingDue = false;
      this.queueDraft('blessing');
    }

    // firing
    if (this.state === 'playing' && !this.draftOpen) {
      const s = this.stats();
      this.fireT -= dt;
      let guard = 0;
      while (this.fireT <= 0 && guard++ < 4) {
        this.fire(this.family, false);
        this.fireT += 1 / s.rate;
      }
      if (this.secondary) {
        const s2 = this.stats(this.secondary, true);
        this.fireT2 -= dt;
        guard = 0;
        while (this.fireT2 <= 0 && guard++ < 3) {
          this.fire(this.secondary, true);
          this.fireT2 += 1 / s2.rate;
        }
      }
    }

    // shield bearers protect neighbors
    for (const b of this.barrels) b.shielded = false;
    for (const sh of this.barrels) {
      if (sh.dead || !sh.def || !sh.def.shieldAura) continue;
      const r2 = sh.def.shieldAura * sh.def.shieldAura;
      for (const o of this.barrels) {
        if (o === sh || o.dead || o.part || (o.def && o.def.shieldAura)) continue;
        if ((o.x - sh.x) ** 2 + (o.z - sh.z) ** 2 < r2) o.shielded = true;
      }
    }

    const warp = this.warpT > 0 ? 0.2 : 1;
    const push = this.hazards.push;
    for (let i = this.barrels.length - 1; i >= 0; i--) {
      const b = this.barrels[i];
      if (!b || b.dead || b.part) continue;
      const def = b.def;
      let mul = (def.speed || 1) * warp;
      if (b.frozen > 0) {
        b.frozen -= dt;
        mul = 0;
        if (b.frozen <= 0) b.view.ice.visible = false;
      } else if (b.chill > 0) mul *= 1 - 0.12 * b.chill;
      if (b.chillT > 0) {
        b.chillT -= dt;
        if (b.chillT <= 0) b.chill = 0;
      }
      if (b.pushZ < 0) {
        b.z += b.pushZ * dt * 4;
        b.pushZ = Math.min(0, b.pushZ + dt * 28);
      }
      b.phase += dt;
      if (b.orbit) {
        const o = b.orbit;
        if (o.boss.dead) {
          this.killEnemy(b, false);
          continue;
        }
        b.x = o.boss.x + Math.cos(o.a) * o.r;
        b.z = o.boss.z + 1 + Math.sin(o.a) * o.r * 0.6;
      } else {
        b.z += speed * mul * dt;
        if (def.sway) b.x = clamp(b.baseX + Math.sin(b.phase * 1.3) * def.sway, -2.9, 2.9);
        if (b.cross) {
          b.x += b.cross * 2.4 * dt * warp;
          if (Math.abs(b.x) > 3.7) {
            this.popup(clamp(b.x, -3, 3), 1.8, b.z, 'ESCAPED', '');
            this.removeQuiet(b);
            continue;
          }
        }
        if (push && !def.big) {
          b.x = clamp(b.x + push * 0.4 * dt, -3, 3);
          b.baseX = clamp(b.baseX + push * 0.4 * dt, -3, 3);
        }
      }
      // behaviours
      if (def.ghost) {
        const cyc = (b.phase % 3) / 3;
        const solid = cyc < 0.6;
        if (solid !== b.solid) {
          b.solid = solid;
          b.view.bodyMat.opacity = solid ? 0.85 : 0.18;
          b.view.label.sprite.material.opacity = solid ? 1 : 0.35;
        }
      }
      if (def.regen && b.lastHit > 1.0 && b.hp < b.maxHp) {
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * def.regen * dt);
        if (Math.random() < 0.15) this.particles.emit(b.x, 0.8, b.z, 1, { colors: [0x7dff7a, 0xc0ffb0], speed: 0.5, up: 2, life: 0.5, size: 0.1, gravity: 0 });
        this.updateLabel(b);
      }
      b.lastHit += dt;
      if (def.bomber && b.z > -18 && b.z < -3) {
        b.throwT -= dt;
        if (b.throwT <= 0) {
          b.throwT = 4.5;
          this.hazards.zone(clamp(px + rand(-0.3, 0.3), -3, 3), -1.4 * speed + 0.3, 1.0, 1.4, { kind: 'bomb', fall: 'bomb', dmg: 1.5, hitsEnemies: false });
          this.sfx.play('mortar');
        }
      }
      if (b.burnT > 0) {
        b.burnT -= dt;
        b.burnTick = (b.burnTick || 0) - dt;
        if (b.burnTick <= 0) {
          b.burnTick = 0.25;
          this.damage(b, b.burn * b.burnStacks * 0.25, { src: 'burn' });
          if (b.dead) continue;
        }
        if (Math.random() < 0.35) this.particles.emit(b.x + rand(-0.3, 0.3), b.h * 0.8, b.z, 1, { colors: [0xffd23a, 0xff5a1a], speed: 0.3, up: 2, life: 0.4, size: 0.14, gravity: 0 });
        if (b.burnT <= 0) b.burnStacks = 0;
      }
      if (b.bubbleT > 0) {
        b.bubbleT -= dt;
        if (b.bubbleT <= 0) b.view.bubble.visible = false;
      }
      b.view.bubble.visible = b.shielded && (b.bubbleT > 0 || Math.floor(this.time * 3) % 2 === 0);
      const v = b.view;
      v.group.position.set(b.x, 0, b.z);
      v.inner.rotation.z = Math.sin(b.phase * 3) * 0.025 + (def.sway ? Math.sin(b.phase * 1.3) * 0.15 : 0);
      if (v.spark) v.spark.scale.setScalar(0.1 * (0.8 + Math.sin(b.phase * 25) * 0.4));
      if (v.star) {
        v.star.rotation.y += dt * 3;
        v.star.position.y = (b.kind === 'altar' ? 1.45 : b.kind === 'chest' ? 1.3 : 1.5) + Math.sin(b.phase * 4) * 0.12;
      }
      if (v.orb) v.orb.scale.setScalar(0.2 * (1 + Math.sin(b.phase * 6) * 0.15));
      if (b.flash > 0) {
        b.flash -= dt;
        v.bodyMat.emissive.setHex(b.flash > 0 ? 0x884422 : b.gold ? 0x4a3300 : this.cfg.dark ? 0x1a1208 : 0x000000);
        const base = v.inner.userData.base;
        v.inner.scale.setScalar(base * (b.flash > 0 ? 1.07 : 1));
      }
      if (b.z > FIELD.leakZ) this.leak(b);
    }

    for (const boss of [this.bossRef, ...this.extraBosses]) {
      if (!boss || boss.dead) continue;
      boss.update(dt);
      if (this.warpT > 0) boss.attackT += dt * 0.7;
    }

    this.hazards.update(dt, speed);

    // napalm ground fires
    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const fz = this.fireZones[i];
      fz.t -= dt;
      fz.z += speed * dt;
      if (Math.random() < 0.6) this.particles.emit(fz.x + rand(-fz.r, fz.r), 0.2, fz.z + rand(-fz.r, fz.r), 1, { colors: [0xffd23a, 0xff5a1a], speed: 0.4, up: 2.4, life: 0.5, size: 0.2, gravity: 0 });
      fz.tick = (fz.tick || 0) - dt;
      if (fz.tick <= 0) {
        fz.tick = 0.3;
        for (const o of this.barrels) if (!o.dead && !o.part && (o.x - fz.x) ** 2 + (o.z - fz.z) ** 2 < (fz.r + 0.4) ** 2) this.ignite(o, fz.dps * 0.5);
      }
      if (fz.t <= 0) this.fireZones.splice(i, 1);
    }

    // gates
    for (let i = this.gates.length - 1; i >= 0; i--) {
      const g = this.gates[i];
      g.z += speed * dt;
      g.view.group.position.z = g.z;
      if (g.vanishT !== undefined && !g.taken) {
        g.vanishT -= dt;
        g.view.panelMat.opacity = 0.3 + Math.sin(this.time * 10) * 0.25;
        if (g.vanishT <= 0) g.taken = true;
      }
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
    this.checkEnd();
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

  removeQuiet(b) {
    b.dead = true;
    const idx = this.barrels.indexOf(b);
    if (idx >= 0) this.barrels.splice(idx, 1);
    this.releaseBarrel(b);
  }

  leak(b) {
    const def = b.def;
    this.particles.emit(b.x, 0.8, b.z, 14, { colors: WOOD, speed: 4, up: 5, size: 0.2, life: 0.7 });
    if (b.captain) {
      // Captains regroup at the back instead of breaking through.
      b.z = FIELD.spawnZ + 4;
      this.popup(b.x, 2, 0, 'CAPTAIN REGROUPS', '');
      this.hurt(1, 'leak');
      return;
    }
    this.removeQuiet(b);
    this.killWeight += b.minion ? 0 : def.weight;
    if (def.leak > 0) {
      this.leaks++;
      this.sfx.play('break');
      this.hurt(def.leak + this.cfgv('leakExtra', 0), 'leak');
    }
  }

  checkEnd() {
    if (this.state !== 'playing' || this.draftOpen || this.draftQueue.length) return;
    const p = this.profile;
    const live = this.barrels.some((b) => !b.dead && !b.part);
    const bosses = this.bossRef || this.extraBosses.length;
    const itemsDone = this.nextItem >= this.items.length;
    if (this.mode === 'endless') {
      if (itemsDone && !live && !bosses) this.nextWave();
      return;
    }
    if (p.objective === 'survive') {
      if (this.elapsed >= this.layout.duration) this.finish(true);
      return;
    }
    if (p.objective === 'hunt') {
      const pending = this.items.slice(this.nextItem).some((i) => i.captain);
      const alive = this.barrels.some((b) => b.captain && !b.dead);
      if (!pending && !alive && this.items.some((i) => i.captain)) this.finish(true);
      else if (itemsDone && !live && !bosses) this.finish(true);
      return;
    }
    if (p.boss) {
      if (itemsDone && !bosses && this.bossKills > 0 && !live) this.finish(true);
      return;
    }
    if (itemsDone && !live && !bosses) this.finish(true);
  }

  updateCamera(dt) {
    const cam = this.camera;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake;
    const bossView = this.bossRef && !this.bossRef.dead && this.state === 'playing' ? 1 : 0;
    this.camZoom = Math.max(0, this.camZoom - dt * 0.9);
    this.camBoss = lerp(this.camBoss || 0, bossView, 1 - Math.exp(-2 * dt));
    const zoom = Math.min(1, this.camZoom) * 0.7;
    cam.position.set(rand(-1, 1) * s * 0.5, 9.6 + this.camBoss * 1.4 - zoom * 1.2 + rand(-1, 1) * s * 0.4, 11.2 + this.camBoss * 1.6 - zoom * 1.6);
    cam.lookAt(this.player.root.position.x * 0.15, 0.4, -8 - this.camBoss * 2);
    this.fovKick = Math.max(0, this.fovKick - dt * 3);
    const fov = (this.baseFov || 60) + this.fovKick * 4;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
