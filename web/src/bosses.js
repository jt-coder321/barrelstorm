// Boss archetypes. Each boss is a scripted controller with its own model, hit parts (body, weak points,
// shields, generators), attack patterns, phases and vulnerable windows. Parts are inserted into the
// game's target list so every weapon (pierce, splash, chain, homing) interacts with them normally.
import { THREE, M, box, cyl, ball, disposeTree } from './gfx.js';
import { BOSS_NAMES } from './levelgen.js';
import { rand, clamp } from './util.js';

const FIRE = [0xffd23a, 0xff8a1f, 0xff4d1a, 0x5a3a1e];

function mat(c, e) {
  return new THREE.MeshLambertMaterial({ color: c, emissive: e || 0x000000 });
}

class Boss {
  constructor(game, opts) {
    this.g = game;
    this.mini = !!opts.mini;
    this.hp = opts.hp;
    this.maxHp = opts.hp;
    this.x = 0;
    this.z = -46;
    this.y = 0;
    this.stopZ = this.mini ? -15 : -17;
    this.phase = 1;
    this.t = 0;
    this.attackT = 2.5;
    this.parts = [];
    this.dead = false;
    this.flash = 0;
    this.vulnT = 0;
    this.enrage = 0;
    this.attacking = false;
    this.root = new THREE.Group();
    this.scale = this.mini ? 0.72 : 1;
    this.mats = [];
    this.timers = [];
    this.build();
    this.root.scale.setScalar(this.scale);
    game.scene.add(this.root);
  }

  get name() {
    return (this.mini ? 'Lesser ' : '') + BOSS_NAMES[this.id].replace('The ', this.mini ? '' : 'The ');
  }

  part(ox, oz, r, opts = {}) {
    const p = {
      part: true, boss: this, ox, oz, oy: opts.oy || 0, x: 0, z: 0, r: r * this.scale, h: (opts.h || 2) * this.scale,
      mult: opts.mult ?? 1, weak: !!opts.weak, own: opts.hp ? { hp: opts.hp, max: opts.hp } : null, name: opts.name || 'body',
      kind: 'part', dead: false, flash: 0, burn: 0, chill: 0, frozen: 0, slow: 0, maxHp: this.maxHp, hp: this.maxHp, view: null, active: opts.active ?? true,
    };
    this.parts.push(p);
    this.g.barrels.push(p);
    return p;
  }

  syncParts() {
    for (const p of this.parts) {
      p.x = this.x + p.ox * this.scale;
      p.z = this.z + p.oz * this.scale;
      p.hp = p.own ? p.own.hp : this.hp;
      p.maxHp = p.own ? p.own.max : this.maxHp;
    }
  }

  // Damage multiplier for a part right now.
  partMult(p) {
    if (!p.active) return 0;
    let m = p.mult;
    if (this.vulnT > 0) m *= 1.6;
    if (p.weak) m *= this.g.mods.weakMul;
    return m;
  }

  hit(p, dmg, info) {
    if (this.dead || this.entering) return 0;
    const m = this.partMult(p);
    if (m <= 0) {
      if (info && info.direct) this.g.blocked(p);
      return 0;
    }
    const d = dmg * m;
    if (p.own) {
      p.own.hp -= d;
      p.flash = 0.1;
      if (p.own.hp <= 0) this.partBroken(p);
      return d;
    }
    this.hp -= d;
    this.flash = 0.08;
    if (p.weak) this.g.weakHit(p, d);
    this.onDamage();
    if (this.hp <= 0) this.g.killBoss(this);
    return d;
  }

  partBroken(p) {
    p.active = false;
    p.own.hp = 0;
    this.g.blast(p.x, p.z, 1.5, 0xffa23a);
  }

  onDamage() {
    if (!this.mini && this.phase === 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2;
      this.onPhase(2);
      this.g.showBanner('PHASE 2', this.phaseText(2), true, 1600);
      this.g.sfx.play('boss');
      this.g.addShake(0.5);
    }
    if (!this.mini && this.phase === 2 && this.hp < this.maxHp * 0.25 && this.hasPhase3) {
      this.phase = 3;
      this.onPhase(3);
      this.g.showBanner('FINAL PHASE', this.phaseText(3), true, 1600);
      this.g.sfx.play('boss');
      this.g.addShake(0.6);
    }
  }

  onPhase() {}
  phaseText() {
    return 'It grows desperate!';
  }

  update(dt) {
    this.t += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        if (!this.dead) tm.fn();
      }
    }
    if (this.z < this.stopZ) {
      this.entering = true;
      this.z = Math.min(this.stopZ, this.z + dt * 9);
    } else this.entering = false;
    if (this.t > 75) this.enrage = Math.min(1, (this.t - 75) / 30);
    if (this.vulnT > 0) this.vulnT -= dt;
    if (!this.entering) {
      this.attackT -= dt * (1 + this.enrage * 0.8) * (this.g.warpT > 0 ? 0.3 : 1);
      if (this.attackT <= 0 && !this.g.draftOpen) this.attack();
    }
    this.animate(dt);
    this.root.position.set(this.x, this.y, this.z);
    if (this.flash > 0) this.flash -= dt;
    const e = this.flash > 0 ? 0x553311 : this.vulnT > 0 ? 0x2a2a00 : 0x000000;
    for (const m of this.mats) m.emissive.setHex(e);
    this.syncParts();
  }

  // Game-time timer (respects pause and slow motion), same signature as setTimeout.
  after(fn, ms) {
    this.timers.push({ t: ms / 1000, fn });
  }

  vulnerable(t, text = 'VULNERABLE!') {
    this.vulnT = t;
    this.g.popup(this.x, 4.5, this.z, text, 'coin big');
  }

  remove() {
    for (const p of this.parts) {
      p.dead = true;
      const i = this.g.barrels.indexOf(p);
      if (i >= 0) this.g.barrels.splice(i, 1);
    }
    this.g.scene.remove(this.root);
    disposeTree(this.root);
  }

  lanes() {
    return [-2.8, -1.4, 0, 1.4, 2.8];
  }

  nearestLane(x) {
    return this.lanes().reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  }

  px() {
    return this.g.player.root.position.x;
  }
}

// ---------- The Barrel King ----------
// Lobs explosive kegs that roll at you. Shoot a keg while it is still near the King and the blast hurts him.
class BarrelKing extends Boss {
  build() {
    this.id = 'king';
    const body = mat(0x6a3a1a);
    this.mats.push(body);
    const g = this.root;
    const barrel = cyl(1.3, 1.1, 2.6, body, 0, 1.3, 0, 14);
    g.add(barrel);
    for (const y of [0.4, 1.3, 2.2]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.08, 6, 18), M.gold);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      g.add(band);
    }
    const crown = new THREE.Group();
    crown.add(cyl(0.9, 0.9, 0.35, M.gold, 0, 0, 0, 10));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), M.gold);
      sp.position.set(Math.cos(a) * 0.8, 0.4, Math.sin(a) * 0.8);
      crown.add(sp);
    }
    crown.position.y = 2.85;
    g.add(crown);
    this.crown = crown;
    for (const sx of [-0.4, 0.4]) g.add(ball(0.16, M.glowRed, sx, 1.8, 1.15));
    const mouth = box(0.8, 0.12, 0.1, M.iron, 0, 1.3, 1.2);
    g.add(mouth);
    for (const sx of [-1, 1]) {
      const arm = cyl(0.18, 0.18, 1.4, body, sx * 1.5, 1.5, 0, 6);
      arm.rotation.z = sx * 0.8;
      g.add(arm);
    }
    this.body = this.part(0, 0, 1.4, { h: 3 });
    this.crownPart = this.part(0, -0.3, 0.7, { weak: true, mult: 2, oy: 2.8, name: 'crown' });
    this.orbit = [];
  }

  phaseText(p) {
    return p === 2 ? 'Royal guard! Shoot through the ring' : '';
  }

  onPhase() {
    for (let i = 0; i < 6; i++) {
      const e = this.g.spawnEnemy({ kind: 'minion', x: this.x, hp: Math.max(6, Math.round(this.maxHp * 0.025)) }, this.z, true);
      e.orbit = { boss: this, a: (i / 6) * Math.PI * 2, r: 2.6 * this.scale };
      this.orbit.push(e);
    }
  }

  attack() {
    this.attacking = true;
    const n = this.phase === 1 ? (Math.random() < 0.5 ? 1 : 2) : 3;
    const px = this.px();
    for (let i = 0; i < n; i++) {
      const tx = n === 1 ? this.nearestLane(px) : clamp(px + (i - (n - 1) / 2) * 2.4, -2.8, 2.8);
      const tz = this.z + 6 + Math.random() * 2;
      const hp = Math.max(4, Math.round(this.g.rowHp(0.4) * 1.2));
      this.g.hazards.zone(tx, tz, 0.9, 1.0, {
        kind: 'lob', color: 0xffa23a, fixed: true, fall: 'bomb', dmg: 0,
        onBlast: (h) => { this.g.spawnEnemy({ kind: 'bossKeg', x: h.x, hp }, h.z, true); },
      });
    }
    this.g.sfx.play('mortar');
    this.attackT = this.phase === 1 ? 4.2 : 3.4;
    this.mini && (this.attackT += 1.2);
    // After a volley the King laughs: a short window where he takes extra damage.
    this.after(() => {
      if (!this.dead) this.vulnerable(1.8, 'HE LAUGHS: HIT HIM!');
      this.attacking = false;
    }, 1300);
  }

  animate(dt) {
    this.x = Math.sin(this.t * 0.55) * 1.6;
    this.crown.rotation.y += dt * (this.vulnT > 0 ? 6 : 1);
    this.root.rotation.z = this.vulnT > 0 ? Math.sin(this.t * 20) * 0.06 : Math.sin(this.t * 2) * 0.03;
    for (const e of this.orbit) {
      if (e.dead) continue;
      e.orbit.a += dt * 0.9;
    }
  }
}

// ---------- The Iron Golem ----------
// Heavy armor; glowing cores open after each ground slam. Jump the shockwave through the gap.
class IronGolem extends Boss {
  build() {
    this.id = 'golem';
    const stone = mat(0x5a5650);
    const iron = mat(0x3b3f46);
    this.mats.push(stone, iron);
    const g = this.root;
    g.add(box(2.6, 2.2, 1.6, iron, 0, 2.2, 0));
    g.add(box(1.2, 0.9, 1.1, stone, 0, 3.75, 0.1));
    for (const sx of [-0.25, 0.25]) g.add(ball(0.12, M.glowBlue, sx, 3.8, 0.66));
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 1.65, 3, 0);
      arm.add(box(0.8, 2.4, 0.8, stone, 0, -1.1, 0));
      arm.add(box(1.0, 0.8, 1.0, iron, 0, -2.4, 0));
      g.add(arm);
      this.arms.push(arm);
    }
    for (const sx of [-0.7, 0.7]) g.add(box(0.8, 1.2, 0.8, stone, sx, 0.6, 0));
    this.cores = [];
    for (const sx of [-1, 1]) {
      const c = ball(0.32, new THREE.MeshBasicMaterial({ color: 0x553311 }), sx * 1.65, 3.2, 0.5);
      g.add(c);
      this.cores.push(c);
    }
    this.body = this.part(0, 0, 1.6, { h: 4, mult: 0.12 });
    this.weak = [this.part(-1.65, 0.4, 0.55, { weak: true, mult: 3, oy: 3.2, name: 'core', active: false }),
      this.part(1.65, 0.4, 0.55, { weak: true, mult: 3, oy: 3.2, name: 'core', active: false })];
    this.slamT = 0;
  }

  phaseText() {
    return 'Armor cracks! Double shockwaves';
  }

  onPhase() {
    this.body.mult = 0.3;
  }

  setCores(open) {
    for (const p of this.weak) p.active = open;
    for (const c of this.cores) c.material.color.setHex(open ? 0x7fd4ff : 0x553311);
  }

  attack() {
    this.attacking = true;
    if (Math.random() < 0.65 || this.phase === 2) {
      // Ground slam: arms rise (telegraph), then a shockwave rolls out with a gap.
      this.slamT = 1.1;
      this.g.sfx.play('warn');
      this.after(() => {
        if (this.dead) return;
        this.g.addShake(0.6);
        this.g.sfx.play('boom');
        const gap = [-2.1, -0.7, 0.7, 2.1][Math.floor(Math.random() * 4)];
        this.g.hazards.wave(gap, 1.9, 5, { kind: 'shock', z: this.z + 2 });
        if (this.phase === 2 && !this.mini) {
          this.after(() => {
            if (!this.dead) this.g.hazards.wave(clamp(-gap + rand(-0.7, 0.7), -2.1, 2.1), 1.9, 5, { kind: 'shock', z: this.z + 2 });
          }, 1100);
        }
        this.setCores(true);
        this.vulnerable(3.2, 'CORES EXPOSED!');
        this.after(() => {
          this.setCores(false);
          this.attacking = false;
        }, 3200);
      }, 1100);
      this.attackT = this.phase === 1 ? 6 : 5;
    } else {
      // Boulder throw at the player.
      this.g.hazards.zone(this.px(), -1.6 * this.g.stageSpeed() + 0.4, 1.1, 1.6, { kind: 'masonry', fall: 'rock', dmg: 4, hitsEnemies: true });
      this.attackT = 2.5;
      this.attacking = false;
    }
    if (this.mini) this.attackT += 1.5;
  }

  animate(dt) {
    this.x = Math.sin(this.t * 0.35) * 1.2;
    const lift = this.slamT > 0 ? 1 - this.slamT / 1.1 : 0;
    if (this.slamT > 0) this.slamT -= dt;
    for (const a of this.arms) a.rotation.x = this.slamT > 0 ? -lift * 2.4 : 0;
    this.y = Math.abs(Math.sin(this.t * 2)) * 0.08;
  }
}

// ---------- The War Machine ----------
// A shield dome makes it immune. Destroy both generators to drop the shield; it keeps deploying minions.
class WarMachine extends Boss {
  build() {
    this.id = 'machine';
    const iron = mat(0x4a4640);
    const rust = mat(0x7a4a2a);
    this.mats.push(iron, rust);
    const g = this.root;
    g.add(box(3.4, 1.4, 2.4, iron, 0, 1.0, 0));
    g.add(box(2.0, 1.0, 1.6, rust, 0, 2.2, 0));
    const barrel = cyl(0.25, 0.3, 1.8, M.iron, 0, 2.3, 1.1, 10);
    barrel.rotation.x = Math.PI / 2;
    g.add(barrel);
    for (const sx of [-1.8, 1.8]) {
      const w = cyl(0.6, 0.6, 0.4, M.woodDark, sx, 0.6, 0.6, 10);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(2.7, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.shield);
    g.add(this.dome);
    this.gens = [];
    for (const sx of [-1, 1]) {
      const gen = new THREE.Group();
      gen.add(cyl(0.35, 0.45, 1.2, iron, 0, 0.6, 0, 8));
      const orb = ball(0.3, M.glowBlue, 0, 1.45, 0);
      gen.add(orb);
      gen.position.set(sx * 2.9, 0, 1.4);
      g.add(gen);
      this.gens.push({ obj: gen, orb });
    }
    const genHp = Math.round(this.maxHp * 0.09);
    this.body = this.part(0, 0, 1.8, { h: 3, mult: 0 });
    this.genParts = [this.part(-2.9, 1.4, 0.6, { hp: genHp, name: 'generator' }), this.part(2.9, 1.4, 0.6, { hp: genHp, name: 'generator' })];
    this.shieldUp = true;
    this.downT = 0;
    this.deployT = 3;
  }

  phaseText() {
    return 'Generators rebuild faster. Runners deployed!';
  }

  partBroken(p) {
    super.partBroken(p);
    const i = this.genParts.indexOf(p);
    this.gens[i].orb.visible = false;
    if (this.genParts.every((q) => !q.active)) {
      this.shieldUp = false;
      this.dome.visible = false;
      this.body.mult = 1.5;
      this.downT = this.phase === 1 ? 7 : 5.5;
      this.g.showBanner('SHIELD DOWN!', 'Hit the core now', false, 1300);
      this.vulnerable(this.downT, 'OPEN FIRE!');
      this.g.sfx.play('shatter');
    }
  }

  restoreShield() {
    this.shieldUp = true;
    this.dome.visible = true;
    this.body.mult = 0;
    for (const [i, p] of this.genParts.entries()) {
      p.active = true;
      p.own.hp = p.own.max * (this.phase === 1 ? 1 : 0.8);
      this.gens[i].orb.visible = true;
    }
    this.g.sfx.play('shield');
  }

  attack() {
    // Cannon lob at the player
    this.g.hazards.zone(this.px(), -1.5 * this.g.stageSpeed() + 0.4, 1.2, 1.5, { kind: 'bomb', fall: 'bomb', dmg: 3, hitsEnemies: true });
    this.g.sfx.play('mortar');
    this.attackT = this.phase === 1 ? 3.8 : 2.8;
    if (this.mini) this.attackT += 1.5;
  }

  animate(dt) {
    this.x = Math.sin(this.t * 0.4) * 1.0;
    if (!this.shieldUp) {
      this.downT -= dt;
      if (this.downT <= 0) this.restoreShield();
    }
    this.dome.rotation.y += dt * 0.5;
    this.deployT -= dt;
    if (this.deployT <= 0 && !this.entering) {
      this.deployT = this.phase === 1 ? 5.5 : 4.2;
      if (this.mini) this.deployT += 2;
      const kind = this.phase === 2 ? 'runner' : Math.random() < 0.4 ? 'armored' : 'minion';
      for (const dx of [-1.6, 1.6]) {
        this.g.spawnEnemy({ kind, x: clamp(this.x + dx, -2.8, 2.8), hp: Math.max(4, Math.round(this.g.rowHp(0.5))) }, this.z + 2.5, true);
      }
    }
  }
}

// ---------- The Siege Engine ----------
// Phase 1: break three shield planks. Phase 2: its turret sweeps ballista bolts across the lanes.
// Final phase: it rolls side to side and fires volleys.
class SiegeEngine extends Boss {
  build() {
    this.id = 'siege';
    this.hasPhase3 = true;
    const wood = new THREE.MeshLambertMaterial({ map: M.wood.map });
    const dark = mat(0x3a2410);
    this.mats.push(wood, dark);
    const g = this.root;
    g.add(box(3.2, 4.2, 2.2, wood, 0, 2.1, -0.4));
    g.add(box(3.6, 0.4, 2.6, dark, 0, 4.3, -0.4));
    for (const sx of [-1.4, 1.4]) for (const sz of [-1.2, 0.6]) {
      const w = cyl(0.55, 0.55, 0.3, dark, sx, 0.55, sz, 10);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
    this.turret = new THREE.Group();
    this.turret.position.set(0, 4.9, 0);
    this.turret.add(box(1.2, 0.6, 1.2, M.iron, 0, 0, 0));
    this.turret.add(box(0.2, 0.2, 2.2, M.steel, 0, 0.1, 1.0));
    this.turretCore = ball(0.3, M.glowRed, 0, 0.45, 0.4);
    this.turret.add(this.turretCore);
    g.add(this.turret);
    this.planks = [];
    const plankHp = Math.round(this.maxHp * 0.07);
    for (const sx of [-1.1, 0, 1.1]) {
      const pl = box(1.0, 2.6, 0.3, wood, sx, 1.4, 1.0);
      g.add(pl);
      this.planks.push(pl);
    }
    this.body = this.part(0, 0, 1.7, { h: 4, mult: 0 });
    this.plankParts = [-1.1, 0, 1.1].map((sx) => this.part(sx, 1.0, 0.6, { hp: plankHp, name: 'plank' }));
    this.core = this.part(0, 0.4, 0.5, { weak: true, mult: 2.5, oy: 5, name: 'turret', active: false });
    this.sweep = null;
  }

  phaseText(p) {
    return p === 2 ? 'The turret wakes up. Watch the lanes!' : 'Overdrive! It rolls and fires volleys';
  }

  partBroken(p) {
    super.partBroken(p);
    const i = this.plankParts.indexOf(p);
    this.planks[i].visible = false;
    if (this.plankParts.every((q) => !q.active)) {
      this.body.mult = 1;
      this.core.active = true;
      this.g.showBanner('DEFENSES BROKEN', 'Hit the engine!', false, 1300);
      this.vulnerable(2.5);
    }
  }

  onPhase(p) {
    if (p >= 2) {
      for (const q of this.plankParts) if (q.active) this.partBroken(q);
      this.body.mult = 1;
      this.core.active = true;
    }
  }

  attack() {
    this.attacking = true;
    const lanes = this.lanes();
    if (this.phase === 1) {
      // two lane strikes
      const a = this.nearestLane(this.px());
      const b = lanes.filter((x) => Math.abs(x - a) > 2)[Math.floor(Math.random() * 3)];
      for (const x of [a, b]) this.g.hazards.lane(x, 1.3, 1.5, 0.4, { kind: 'bolt', hitsEnemies: false, z0: this.z + 2, z1: 2.5 });
      this.attackT = 4;
    } else if (this.phase === 2) {
      // turret sweep: lanes fire in order, leaving one safe lane
      const dir = Math.random() < 0.5 ? 1 : -1;
      const safe = Math.floor(Math.random() * 5);
      const order = dir > 0 ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
      order.forEach((li, k) => {
        if (li === safe) return;
        this.g.hazards.lane(lanes[li], 1.3, 1.2 + k * 0.35, 0.35, { kind: 'bolt', z0: this.z + 2, z1: 2.5 });
      });
      this.sweep = { dir, t: 0 };
      this.attackT = 5;
      this.after(() => this.vulnerable(1.8, 'RELOADING!'), 2900);
    } else {
      for (let i = 0; i < 3; i++) this.g.hazards.zone(clamp(this.px() + (i - 1) * 2.2, -3, 3), -1.4 * this.g.stageSpeed() + 0.3, 1.0, 1.4, { kind: 'bomb', fall: 'bomb', dmg: 3, hitsEnemies: true });
      this.g.hazards.lane(this.nearestLane(-this.px()), 1.3, 1.3, 1.2, { kind: 'breath', z0: this.z + 2, z1: 2.5, color: 0xff7a1a });
      this.attackT = 3.4;
    }
    if (this.mini) this.attackT += 1.5;
    this.g.sfx.play('warn');
    this.after(() => {
      this.attacking = false;
    }, 2000);
  }

  animate(dt) {
    this.x = this.phase === 3 ? Math.sin(this.t * 1.1) * 2.0 : Math.sin(this.t * 0.3) * 0.6;
    if (this.sweep) {
      this.sweep.t += dt;
      this.turret.rotation.y = this.sweep.dir * (-0.8 + Math.min(1.6, this.sweep.t * 0.9));
      if (this.sweep.t > 2.2) this.sweep = null;
    } else this.turret.rotation.y *= 0.95;
  }
}

// ---------- The Dragon ----------
// Flies and breathes fire down lanes, then dives at you. After a dive it lands, exposed.
class Dragon extends Boss {
  build() {
    this.id = 'dragon';
    this.hasPhase3 = false;
    const scale = mat(0x8a1a1a);
    const belly = mat(0xd8a040);
    this.mats.push(scale, belly);
    const g = this.root;
    const body = ball(1.2, scale, 0, 0, 0);
    body.scale.set(1.1, 0.9, 1.8);
    g.add(body);
    g.add(ball(0.8, belly, 0, -0.3, 0.6));
    const neck = cyl(0.35, 0.5, 1.6, scale, 0, 0.6, 1.8, 8);
    neck.rotation.x = 1.0;
    g.add(neck);
    this.head = new THREE.Group();
    this.head.position.set(0, 1.0, 2.6);
    this.head.add(box(0.9, 0.6, 1.2, scale, 0, 0, 0));
    for (const sx of [-0.25, 0.25]) this.head.add(ball(0.1, M.glow, sx, 0.2, 0.55));
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 5), M.gold);
      horn.position.set(sx * 0.3, 0.5, -0.3);
      horn.rotation.x = -0.6;
      this.head.add(horn);
    }
    g.add(this.head);
    this.wings = [];
    for (const sx of [-1, 1]) {
      const wing = new THREE.Group();
      const w = box(3.2, 0.08, 1.8, scale, sx * 1.6, 0, 0);
      wing.add(w);
      wing.position.set(sx * 0.8, 0.4, 0);
      g.add(wing);
      this.wings.push({ wing, sx });
    }
    const tail = cyl(0.1, 0.5, 2.4, scale, 0, 0, -2.6, 6);
    tail.rotation.x = -Math.PI / 2 + 0.2;
    g.add(tail);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(2, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.g.scene.add(this.shadow);
    this.body = this.part(0, 0, 1.6, { h: 5, mult: 0.6 });
    this.headPart = this.part(0, 2.6, 0.6, { weak: true, mult: 2.2, oy: 1, name: 'head' });
    this.y = 3.4;
    this.mode = 'fly';
    this.modeT = 0;
  }

  phaseText() {
    return 'Fire rains from the sky!';
  }

  attack() {
    this.attacking = true;
    if (this.mode !== 'fly') return;
    const r = Math.random();
    if (r < 0.55) {
      const x = this.nearestLane(this.px());
      const w = this.phase === 2 ? 2.8 : 1.4;
      this.g.hazards.lane(x, w, 1.3, 1.5, { kind: 'breath', z0: this.z + 2, z1: 2.5, color: 0xff7a1a, hitsEnemies: true, dmg: 2 });
      this.g.sfx.play('roar');
      this.breathX = x;
      this.attackT = 4;
      this.after(() => {
        this.attacking = false;
      }, 2800);
    } else {
      // Dive: leave the field, then crash where the player stands.
      this.mode = 'up';
      this.modeT = 0;
      this.g.sfx.play('roar');
      this.attackT = 6.5;
    }
    if (this.phase === 2) {
      for (let i = 0; i < 2; i++) this.g.hazards.zone(rand(-3, 3), -1.6 * this.g.stageSpeed() + rand(-6, 0.5), 1.0, 1.6, { kind: 'bomb', fall: 'bomb', dmg: 2.5, hitsEnemies: true, color: 0xff7a1a });
    }
    if (this.mini) this.attackT += 1.5;
  }

  animate(dt) {
    this.modeT += dt;
    for (const { wing, sx } of this.wings) wing.rotation.z = sx * Math.sin(this.t * (this.mode === 'land' ? 2 : 6)) * 0.5;
    if (this.mode === 'fly') {
      this.x = Math.sin(this.t * 0.7) * 2.2;
      this.y = 3.4 + Math.sin(this.t * 1.4) * 0.4;
      this.body.mult = 0.6;
      this.headPart.active = true;
    } else if (this.mode === 'up') {
      this.y += dt * 9;
      this.z = Math.max(this.z - dt * 10, -40);
      this.body.mult = 0;
      this.headPart.active = false;
      if (this.modeT > 1.0) {
        this.mode = 'dive';
        this.modeT = 0;
        this.diveX = clamp(this.px(), -2.6, 2.6);
        this.diveZone = this.g.hazards.zone(this.diveX, -7, 2.2, 1.5, { kind: 'bomb', fixed: true, dmg: 0, color: 0xff3a2a });
      }
    } else if (this.mode === 'dive') {
      this.x = this.diveX;
      const k = clamp(this.modeT / 1.5, 0, 1);
      this.z = -40 + (-7 - -40) * k;
      this.y = 20 * (1 - k) + 0.8;
      if (k >= 1) {
        this.mode = 'land';
        this.modeT = 0;
        this.g.addShake(0.8);
        this.g.sfx.play('boom');
        this.g.damageArea(this.x, this.z, 3, this.g.rowHp(0.5) * 2, { src: 'hazard' });
        this.vulnerable(3.2, 'GROUNDED! STRIKE!');
        this.body.mult = 1.4;
        this.headPart.active = true;
      }
    } else if (this.mode === 'land') {
      this.y = 0.8;
      if (this.modeT > 3.2) {
        this.mode = 'rise';
        this.modeT = 0;
      }
    } else if (this.mode === 'rise') {
      this.y = Math.min(3.4, this.y + dt * 4);
      this.z += (this.stopZ - this.z) * Math.min(1, dt * 2);
      if (this.modeT > 1.2) {
        this.mode = 'fly';
        this.attacking = false;
      }
    }
    for (const p of this.parts) p.oy = this.y + (p.name === 'head' ? 1 : 0);
    this.shadow.position.set(this.x, 0.05, this.z);
    this.shadow.scale.setScalar(clamp(1.2 - this.y * 0.03, 0.4, 1.2) * this.scale);
  }

  remove() {
    this.g.scene.remove(this.shadow);
    super.remove();
  }
}

const CLASSES = { king: BarrelKing, golem: IronGolem, machine: WarMachine, siege: SiegeEngine, dragon: Dragon };

export function createBoss(game, id, opts) {
  const C = CLASSES[id] || BarrelKing;
  return new C(game, opts);
}

export const BOSS_TIPS = {
  king: 'Shoot his kegs while they are near him',
  golem: 'Slip through the shockwave gap, then hit the cores',
  machine: 'Destroy both generators to drop the shield',
  siege: 'Break the planks, then find the safe lane',
  dragon: 'Dodge the fire lane; strike when it lands',
};

export { FIRE };
