// Environmental hazards and enemy attacks. Every hazard is telegraphed on the ground before it hurts,
// so damage is always avoidable by moving. Many hazards also hurt barrels, which players can exploit.
import { THREE, M, ball, box } from './gfx.js';
import { rand, clamp } from './util.js';

const FIRE = [0xffd23a, 0xff8a1f, 0xff4d1a];
const ICE = [0xffffff, 0xbfe8ff, 0x7fd4ff];
const DUST = [0xc8b08a, 0x8a7a60, 0xe8d8b0];

export class Hazards {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.timers = {};
    this.slippery = false;
    this.push = 0;
    this.sawGeo = new THREE.TorusGeometry(0.55, 0.16, 5, 10);
    this.sawMat = new THREE.MeshLambertMaterial({ color: 0xc8ccd2, emissive: 0x2a2a2a });
  }

  clear() {
    for (const h of this.list) this.dispose(h);
    this.list.length = 0;
    this.timers = {};
    this.push = 0;
    this.gustT = 0;
  }

  dispose(h) {
    if (h.zone) this.g.zones.remove(h.zone);
    if (h.obj) this.g.scene.remove(h.obj);
  }

  setup(biome, cfg) {
    this.clear();
    this.biome = biome;
    this.cfg = cfg;
    this.slippery = biome === 'frozen';
    this.timers = { biome: 5 + rand(0, 2), rain: 3.5 };
  }

  playerX() {
    return this.g.player.root.position.x;
  }

  // ---------- spawners ----------

  // A circular blast after `delay` seconds. `fall` drops a visible bomb onto it.
  zone(x, z, r, delay, opts = {}) {
    const zone = this.g.zones.add('circle', x, z, r, 0, opts.color || 0xff3a2a);
    const h = { type: 'zone', x, z, r, t: 0, delay, zone, ...opts };
    if (opts.fall) {
      h.obj = ball(0.35, opts.fall === 'ice' ? M.steel : M.iron, x, 9, z);
      this.g.scene.add(h.obj);
    }
    this.list.push(h);
    return h;
  }

  // A lane strike: a strip down the road that fires after `delay` and stays deadly for `active` seconds.
  lane(x, w, delay, active, opts = {}) {
    const z0 = opts.z0 ?? -40;
    const z1 = opts.z1 ?? 2.5;
    const zone = this.g.zones.add('rect', x, (z0 + z1) / 2, w, z1 - z0, opts.color || 0xff3a2a);
    const h = { type: 'lane', x, w, z0, z1, t: 0, delay, active, zone, hitP: false, ...opts };
    this.list.push(h);
    return h;
  }

  // A wall of saws or a shockwave rolling toward the player with one gap to slip through.
  wave(gapX, gapW, speed, opts = {}) {
    const obj = new THREE.Group();
    const parts = [];
    for (let x = -3.4; x <= 3.4; x += 0.7) {
      if (Math.abs(x - gapX) < gapW / 2) continue;
      let m;
      if (opts.kind === 'shock') {
        m = box(0.72, 0.5, 0.5, M.rock, x, 0.25, 0);
      } else {
        m = new THREE.Mesh(this.sawGeo, this.sawMat);
        m.position.set(x, 0.55, 0);
      }
      obj.add(m);
      parts.push(m);
    }
    const marker = this.g.zones.add('rect', gapX, 0, gapW, 1.2, 0x4fff7a);
    obj.position.z = opts.z ?? -34;
    this.g.scene.add(obj);
    const h = { type: 'wave', gapX, gapW, speed, obj, parts, zone: marker, t: 0, hit: false, ...opts };
    this.list.push(h);
    return h;
  }

  gust(dir, time) {
    this.gustDir = dir;
    this.gustT = time;
    this.g.showBanner('SANDSTORM', dir > 0 ? 'Wind pushes right!' : 'Wind pushes left!', false, 1300);
    this.g.sfx.play('wind');
  }

  // ---------- biome + modifier schedules ----------

  schedule(dt, speed) {
    const g = this.g;
    if (g.state !== 'playing' || g.draftOpen) return;
    const lead = (delay) => -speed * delay;
    const px = this.playerX();
    const calm = g.bossRef && g.bossRef.attacking ? 1.6 : 1; // fewer hazards while a boss attacks
    this.timers.biome -= dt / calm;
    if (this.timers.biome <= 0) {
      switch (this.biome) {
        case 'courtyard': {
          this.timers.biome = rand(8, 12);
          const lanes = [-2.8, -1.4, 0, 1.4, 2.8];
          const x = Math.random() < 0.55 ? lanes.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a)) : lanes[Math.floor(Math.random() * 5)];
          this.lane(x, 1.3, 1.5, 0.45, { kind: 'ballista', hitsEnemies: true, dmg: 3 });
          g.sfx.play('warn');
          break;
        }
        case 'volcano': {
          this.timers.biome = rand(3.5, 5.5);
          const n = Math.random() < 0.4 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const x = i === 0 && Math.random() < 0.5 ? clamp(px + rand(-0.5, 0.5), -3, 3) : rand(-3, 3);
            this.zone(x, lead(1.7) + rand(-3, 0.5), 1.15, 1.7, { kind: 'geyser', hitsEnemies: true, burn: true, dmg: 2.5, color: 0xff6a1a });
          }
          break;
        }
        case 'frozen': {
          this.timers.biome = rand(5, 7);
          this.zone(clamp(px + rand(-0.3, 0.3), -3, 3), lead(1.4) + 0.3, 0.85, 1.4, { kind: 'icicle', fall: 'ice', color: 0x7fd4ff, hitsEnemies: true, dmg: 1.5, chill: true });
          break;
        }
        case 'desert':
          this.timers.biome = rand(9, 12);
          this.gust(Math.random() < 0.5 ? -1 : 1, 2.8);
          break;
        case 'dungeon': {
          this.timers.biome = rand(4.5, 6.5);
          const x = Math.round(clamp(px, -2.8, 2.8) / 1.4) * 1.4;
          this.lane(x, 1.3, 1.25, 0.6, { kind: 'spikes', z0: -2.5, z1: 2.5, color: 0xff3a2a });
          break;
        }
        case 'ruins':
          this.timers.biome = rand(7, 10);
          this.zone(rand(-3, 3), lead(1.6) + rand(-2, 0.5), 1.2, 1.6, { kind: 'masonry', fall: 'rock', hitsEnemies: true, dmg: 3 });
          break;
        case 'factory': {
          this.timers.biome = rand(8, 11);
          const gx = [-2.1, -0.7, 0.7, 2.1][Math.floor(Math.random() * 4)];
          this.wave(gx, 1.9, 7, { kind: 'saw' });
          g.sfx.play('warn');
          break;
        }
        default:
          this.timers.biome = 99;
      }
    }
    if (this.cfg && this.cfg.rain) {
      this.timers.rain -= dt / calm;
      if (this.timers.rain <= 0) {
        this.timers.rain = rand(1.8, 3.2);
        const target = Math.random() < 0.4;
        const x = target ? clamp(px + rand(-0.4, 0.4), -3, 3) : rand(-3, 3);
        this.zone(x, lead(1.5) + (target ? 0.3 : rand(-8, 0)), 1.3, 1.5, { kind: 'bomb', fall: 'bomb', hitsEnemies: true, dmg: 4 });
      }
    }
  }

  // ---------- update ----------

  update(dt, speed) {
    const g = this.g;
    this.schedule(dt, speed);
    const px = this.playerX();
    const t = g.time;
    if (this.gustT > 0) {
      this.gustT -= dt;
      this.push = this.gustDir * 1.7;
      g.particles.emit(-this.gustDir * 5, rand(0.3, 2.5), rand(-20, 2), 2, { colors: DUST, speed: 0.3, up: 0.2, life: 1.2, size: 0.12, gravity: 0, vx: this.gustDir * 9 });
    } else this.push = 0;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      h.t += dt;
      let done = false;
      if (h.type === 'zone') {
        if (!h.fixed) h.z += speed * dt;
        h.zone.position.z = h.z;
        const k = clamp(h.t / h.delay, 0, 1);
        g.zones.pulse(h.zone, k, t);
        if (h.obj) h.obj.position.set(h.x, 9 * (1 - k * k), h.z);
        if (h.kind === 'geyser' && Math.random() < 0.3) g.particles.emit(h.x, 0.1, h.z, 1, { colors: FIRE, speed: 0.5, up: 1.5, life: 0.4, size: 0.1, gravity: 0 });
        if (h.t >= h.delay) {
          this.blast(h, px);
          done = true;
        }
      } else if (h.type === 'lane') {
        const k = clamp(h.t / h.delay, 0, 1);
        g.zones.pulse(h.zone, k, t);
        if (h.t >= h.delay) {
          if (!h.fired) {
            h.fired = true;
            g.sfx.play(h.kind === 'breath' ? 'flame' : h.kind === 'spikes' ? 'clank' : h.kind === 'arrow' ? 'bow' : 'boom', 2);
            if (h.kind === 'ballista' || h.kind === 'bolt' || h.kind === 'arrow' || h.kind === 'slam') {
              for (let z = h.z0; z < h.z1; z += 2) g.particles.emit(h.x, 0.8, z, 1, { colors: [0xffffff, 0xffe27a], speed: 1, up: 0.5, life: 0.35, size: 0.18, gravity: 0 });
              g.addShake(0.2);
            }
            if (h.hitsEnemies) g.damageLane(h.x, h.w, h.z0, h.z1, (h.dmg || 2) * g.hazardScale());
          }
          if (h.kind === 'breath' && Math.random() < 0.8) {
            const z = rand(h.z0, h.z1);
            g.particles.emit(h.x + rand(-h.w / 2, h.w / 2), 0.6, z, 2, { colors: FIRE, speed: 1.5, up: 2.5, life: 0.5, size: 0.3, gravity: 0 });
          }
          if (h.kind === 'spikes' && !h.spiked) {
            h.spiked = true;
            g.particles.emit(h.x, 0.3, 0, 14, { colors: [0xb9c2cc, 0x8b929c], speed: 1.5, up: 6, life: 0.4, size: 0.14 });
          }
          if (!h.hitP && Math.abs(px - h.x) < h.w / 2 + 0.35 && h.z0 < 0.8 && h.z1 > -0.6) {
            h.hitP = true;
            g.hurt(1, h.kind);
          }
          if (h.t >= h.delay + h.active) done = true;
        }
      } else if (h.type === 'wave') {
        h.obj.position.z += (speed + h.speed) * dt;
        h.zone.position.z = h.obj.position.z;
        g.zones.pulse(h.zone, 0.5, t);
        for (const p of h.parts) if (h.kind !== 'shock') p.rotation.z += dt * 18;
        if (h.kind === 'shock' && Math.random() < 0.5) g.particles.emit(rand(-3.4, 3.4), 0.2, h.obj.position.z, 1, { colors: DUST, speed: 1, up: 2, life: 0.4, size: 0.2 });
        const z = h.obj.position.z;
        if (!h.hit && z > -0.6 && z < 0.9) {
          if (Math.abs(px - h.gapX) > h.gapW / 2 - 0.25) {
            h.hit = true;
            g.hurt(1, h.kind);
          }
        }
        if (z > 6) done = true;
      }
      if (done) {
        this.dispose(h);
        this.list.splice(i, 1);
      }
    }
  }

  blast(h, px) {
    const g = this.g;
    const colors = h.kind === 'icicle' ? ICE : h.kind === 'masonry' ? DUST : FIRE;
    g.particles.emit(h.x, 0.5, h.z, h.kind === 'geyser' ? 26 : 18, { colors, speed: 4, up: h.kind === 'geyser' ? 11 : 6, size: 0.24, life: 0.7, spread: h.r * 0.4 });
    g.rings.add(h.x, 0.2, h.z, h.kind === 'icicle' ? 0x9fe0ff : 0xffa23a, h.r * 1.3, 0.35);
    g.sfx.play(h.kind === 'icicle' ? 'freeze' : 'boom');
    g.addShake(0.18);
    if (h.hitsEnemies) g.damageArea(h.x, h.z, h.r + 0.3, (h.dmg || 2) * g.hazardScale(), { src: 'hazard', burn: h.burn, chill: h.chill });
    if (!h.noHurt && Math.abs(px - h.x) < h.r + 0.45 && h.z > -1.1 - h.r * 0.5 && h.z < 1.2 + h.r * 0.5) g.hurt(1, h.kind);
    if (h.onBlast) h.onBlast(h);
  }
}
