import * as THREE from 'three';
import { FIELD, TIERS } from './config.js';
import { rand, clamp } from './util.js';

export { THREE };

// ---------- Canvas textures ----------

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function stoneTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4338';
    g.fillRect(0, 0, w, h);
    const rows = 4;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const cols = r % 2 ? 3 : 4;
      const cw = w / cols;
      const off = r % 2 ? -cw / 2 : 0;
      for (let c = -1; c <= cols; c++) {
        const shade = 118 + Math.floor(Math.random() * 40);
        g.fillStyle = `rgb(${shade + 10},${shade},${shade - 16})`;
        g.fillRect(off + c * cw + 3, r * rh + 3, cw - 6, rh - 6);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(off + c * cw + 3, r * rh + 3, cw - 6, 4);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(off + c * cw + 3, r * rh + rh - 9, cw - 6, 6);
      }
    }
  });
}

function grassTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4f7d34';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const s = 70 + Math.random() * 60;
      g.fillStyle = `rgba(${s * 0.6},${s + 40},${s * 0.4},0.35)`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 5 + Math.random() * 5);
    }
  });
}

function woodTexture(base, dark) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const planks = 8;
    for (let i = 0; i < planks; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.1})`;
      g.fillRect((i * w) / planks, 0, w / planks, h);
      g.fillStyle = dark;
      g.fillRect((i * w) / planks, 0, 2, h);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect((i * w) / planks + 4 + Math.random() * 8, Math.random() * h, 1.5, 14 + Math.random() * 24);
      }
    }
  });
}

function skyTexture() {
  return canvasTex(8, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#3f5f9a');
    grd.addColorStop(0.55, '#8fa7c9');
    grd.addColorStop(0.85, '#f0c590');
    grd.addColorStop(1, '#f6d3a2');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, false);
}

function blobTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, false);
}

// ---------- Materials ----------

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export const M = {};
export function initMaterials() {
  M.stone = new THREE.MeshLambertMaterial({ map: stoneTexture() });
  M.wood = new THREE.MeshLambertMaterial({ map: woodTexture('#8a5a2b', '#3a2310') });
  M.woodDark = lam(0x5a3a1e);
  M.iron = lam(0x3b3f46);
  M.ironLight = lam(0x8b929c);
  M.steel = lam(0xb9c2cc);
  M.gold = new THREE.MeshLambertMaterial({ color: 0xffc83a, emissive: 0x6a4500 });
  M.red = lam(0xb8342b);
  M.cloth = lam(0xc23b32);
  M.leather = lam(0x6b4423);
  M.blob = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
  M.glow = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
}

// ---------- Barrel models ----------

const barrelProfile = [];
for (let i = 0; i <= 8; i++) {
  const t = i / 8;
  const y = t * 1.1;
  const r = 0.5 + 0.17 * Math.sin(t * Math.PI);
  barrelProfile.push(new THREE.Vector2(r, y));
}
let barrelGeo;
let bandGeo;
let lidGeo;
let spikeGeo;
let blobGeo;

function radiusAt(y) {
  return 0.5 + 0.17 * Math.sin(clamp(y / 1.1, 0, 1) * Math.PI);
}

export function initGeometry() {
  barrelGeo = new THREE.LatheGeometry(barrelProfile, 16);
  bandGeo = new THREE.TorusGeometry(1, 0.045, 6, 18);
  lidGeo = new THREE.CircleGeometry(0.5, 14);
  spikeGeo = new THREE.ConeGeometry(0.12, 0.45, 5);
  blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
}

const KIND_STYLE = {
  normal: { body: null, band: 'iron', scale: 1 },
  powder: { body: 0xa8322a, band: 'iron', scale: 1 },
  gift: { body: 0xffc83a, band: 'cloth', scale: 1.02 },
  big: { body: null, band: 'ironLight', scale: 1.55 },
  boss: { body: 0x2c2f36, band: 'red', scale: 2.55 },
};

export function barrelRadius(kind) {
  return 0.62 * KIND_STYLE[kind].scale;
}

export function barrelHeight(kind) {
  return 1.1 * KIND_STYLE[kind].scale;
}

function makeLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 80;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 20;
  return { canvas, tex, sprite, last: null };
}

export function drawLabel(label, text, color = '#ffffff') {
  const key = text + color;
  if (label.last === key) return;
  label.last = key;
  const g = label.canvas.getContext('2d');
  g.clearRect(0, 0, 160, 80);
  const size = text.length > 4 ? 44 : text.length > 3 ? 54 : 64;
  g.font = `900 ${size}px "Arial Black", Impact, "Roboto Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = '#1a0d04';
  g.strokeText(text, 80, 42);
  g.fillStyle = color;
  g.fillText(text, 80, 42);
  label.tex.needsUpdate = true;
}

export function buildBarrel(kind) {
  const st = KIND_STYLE[kind];
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);

  const bodyMat = st.body
    ? new THREE.MeshLambertMaterial({ color: st.body })
    : new THREE.MeshLambertMaterial({ map: M.wood.map });
  const body = new THREE.Mesh(barrelGeo, bodyMat);
  inner.add(body);
  const lid = new THREE.Mesh(lidGeo, kind === 'boss' ? M.iron : M.woodDark);
  lid.rotation.x = -Math.PI / 2;
  lid.position.y = 1.1;
  inner.add(lid);

  const bandMat = M[st.band];
  for (const y of [0.18, 0.55, 0.92]) {
    const band = new THREE.Mesh(bandGeo, bandMat);
    const r = radiusAt(y) + 0.02;
    band.scale.set(r, r, 1);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    inner.add(band);
  }

  if (kind === 'powder') {
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5), M.woodDark);
    fuse.position.set(0, 1.25, 0);
    inner.add(fuse);
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), M.glow);
    spark.position.set(0, 1.45, 0);
    spark.name = 'spark';
    inner.add(spark);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshLambertMaterial({ color: 0xf2eee0 }));
    skull.position.set(0, 0.55, 0.62);
    skull.scale.set(1, 1, 0.5);
    inner.add(skull);
  } else if (kind === 'gift') {
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.14, 1.5), M.cloth);
    ribbon.position.y = 0.55;
    inner.add(ribbon);
    const ribbon2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.16), M.cloth);
    ribbon2.position.y = 1.12;
    inner.add(ribbon2);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
    star.position.y = 1.55;
    star.name = 'star';
    inner.add(star);
  } else if (kind === 'boss') {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const sp = new THREE.Mesh(spikeGeo, M.ironLight);
      sp.position.set(Math.cos(a) * 0.72, 0.55, Math.sin(a) * 0.72);
      sp.rotation.z = -Math.cos(a) * Math.PI / 2;
      sp.rotation.x = Math.sin(a) * Math.PI / 2;
      inner.add(sp);
    }
    for (const sx of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3a1a }));
      eye.position.set(sx, 0.62, 0.69);
      inner.add(eye);
    }
  }

  inner.scale.setScalar(st.scale);

  const blob = new THREE.Mesh(blobGeo, M.blob);
  blob.scale.set(2.0 * st.scale, 1, 2.0 * st.scale);
  blob.position.y = 0.03;
  group.add(blob);

  const label = makeLabel();
  const lh = barrelHeight(kind) + 0.55;
  label.sprite.position.set(0, lh, 0.15);
  const ls = 0.95 + st.scale * 0.45;
  label.sprite.scale.set(ls * 2, ls, 1);
  group.add(label.sprite);

  return { group, inner, bodyMat, label, kind, spark: inner.getObjectByName('spark'), star: inner.getObjectByName('star') };
}

export function disposeBarrel(b) {
  b.label.tex.dispose();
  b.label.sprite.material.dispose();
  b.bodyMat.dispose();
}

// ---------- Player + weapons ----------

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

export function buildPlayer() {
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);

  // Cart
  bob.add(box(1.3, 0.22, 1.9, M.wood, 0, 0.42, 0.1));
  bob.add(box(1.4, 0.35, 0.12, M.woodDark, 0, 0.62, 0.95));
  bob.add(box(0.12, 0.35, 1.9, M.woodDark, -0.65, 0.62, 0.1));
  bob.add(box(0.12, 0.35, 1.9, M.woodDark, 0.65, 0.62, 0.1));
  const wheels = [];
  for (const sx of [-0.78, 0.78]) {
    const w = cyl(0.42, 0.42, 0.14, M.woodDark, sx, 0.42, 0.45, 12);
    w.rotation.z = Math.PI / 2;
    bob.add(w);
    wheels.push(w);
    const hub = cyl(0.12, 0.12, 0.18, M.ironLight, sx, 0.42, 0.45, 8);
    hub.rotation.z = Math.PI / 2;
    bob.add(hub);
  }

  // Knight
  const knight = new THREE.Group();
  knight.position.set(0, 0.55, 0.45);
  knight.add(box(0.55, 0.7, 0.42, M.steel, 0, 0.55, 0));
  knight.add(box(0.57, 0.5, 0.2, M.cloth, 0, 0.5, 0.15));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), M.steel);
  head.position.set(0, 1.2, 0);
  knight.add(head);
  knight.add(box(0.36, 0.07, 0.1, M.iron, 0, 1.2, -0.24));
  const plume = box(0.1, 0.3, 0.4, M.cloth, 0, 1.55, 0.05);
  plume.rotation.x = 0.3;
  knight.add(plume);
  for (const sx of [-0.38, 0.38]) knight.add(box(0.18, 0.55, 0.18, M.steel, sx, 0.62, -0.1));
  bob.add(knight);

  const blob = new THREE.Mesh(blobGeo, M.blob);
  blob.scale.set(3.2, 1, 3.6);
  blob.position.set(0, 0.03, 0.3);
  root.add(blob);

  const weaponHolder = new THREE.Group();
  weaponHolder.position.set(0, 0.9, -0.55);
  bob.add(weaponHolder);

  return { root, bob, wheels, knight, weaponHolder, weapon: null, tier: -1 };
}

export function setPlayerWeapon(player, tier) {
  if (player.weapon) {
    player.weaponHolder.remove(player.weapon);
    player.weapon.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
  const w = new THREE.Group();
  const bow = (r, thick, mat) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, thick, 6, 16, Math.PI), mat);
    t.rotation.z = Math.PI / 2;
    t.rotation.y = Math.PI / 2;
    return t;
  };
  switch (tier) {
    case 0: {
      w.add(cyl(0.05, 0.05, 0.7, M.woodDark, 0, 0, 0, 6));
      const l = cyl(0.04, 0.04, 0.5, M.woodDark, -0.2, 0.4, 0, 6);
      l.rotation.z = 0.5;
      const r = cyl(0.04, 0.04, 0.5, M.woodDark, 0.2, 0.4, 0, 6);
      r.rotation.z = -0.5;
      w.add(l, r);
      w.add(box(0.5, 0.05, 0.06, M.leather, 0, 0.35, -0.1));
      const stone = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), M.ironLight);
      stone.position.set(0, 0.45, -0.12);
      w.add(stone);
      w.userData.muzzle = new THREE.Vector3(0, 0.45, -0.4);
      break;
    }
    case 1: {
      const b = bow(0.6, 0.045, M.woodDark);
      b.position.set(0, 0.35, -0.2);
      w.add(b);
      w.add(box(0.015, 1.2, 0.015, M.steel, 0, 0.35, -0.2));
      w.add(box(0.04, 0.04, 0.9, M.wood, 0, 0.35, -0.5));
      w.userData.muzzle = new THREE.Vector3(0, 0.35, -0.95);
      break;
    }
    case 2: {
      w.add(box(0.16, 0.14, 1.3, M.wood, 0, 0.3, -0.35));
      const limb = bow(0.7, 0.05, M.iron);
      limb.position.set(0, 0.34, -0.85);
      w.add(limb);
      w.add(box(0.03, 0.03, 0.9, M.steel, 0, 0.4, -0.6));
      w.userData.muzzle = new THREE.Vector3(0, 0.4, -1.05);
      break;
    }
    case 3: {
      w.add(box(0.2, 0.16, 1.5, M.wood, 0, 0.3, -0.35));
      for (const y of [0.34, 0.5]) {
        const limb = bow(0.72, 0.05, M.iron);
        limb.position.set(0, y, -0.95);
        w.add(limb);
      }
      w.add(box(0.28, 0.3, 0.6, M.ironLight, 0, 0.6, -0.15));
      for (let i = 0; i < 4; i++) w.add(box(0.03, 0.03, 0.4, M.gold, -0.09 + i * 0.06, 0.78, -0.15));
      w.userData.muzzle = new THREE.Vector3(0, 0.42, -1.15);
      break;
    }
    case 4: {
      w.add(box(0.3, 0.22, 1.9, M.woodDark, 0, 0.3, -0.5));
      for (const s of [-1, 1]) {
        const arm = box(1.1, 0.12, 0.14, M.iron, s * 0.62, 0.42, -1.15);
        arm.rotation.y = s * -0.25;
        w.add(arm);
      }
      w.add(box(0.1, 0.1, 1.7, M.steel, 0, 0.5, -0.6));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), M.steel);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(0, 0.5, -1.62);
      w.add(tip);
      w.add(box(0.1, 0.55, 0.1, M.ironLight, 0, 0.1, -0.3));
      w.userData.muzzle = new THREE.Vector3(0, 0.5, -1.85);
      break;
    }
    default: {
      const barrel = cyl(0.3, 0.38, 1.9, M.iron, 0, 0.55, -0.7, 12);
      barrel.rotation.x = Math.PI / 2;
      w.add(barrel);
      for (const z of [-0.2, -0.75, -1.3]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 14), M.glow);
        ring.position.set(0, 0.55, z);
        w.add(ring);
      }
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 8), M.red);
      head.rotation.x = -Math.PI / 2;
      head.position.set(0, 0.55, -1.8);
      w.add(head);
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 5), M.gold);
        horn.position.set(s * 0.25, 0.9, -1.6);
        horn.rotation.x = -0.6;
        w.add(horn);
      }
      w.userData.muzzle = new THREE.Vector3(0, 0.55, -2.1);
    }
  }
  player.weapon = w;
  player.weaponHolder.add(w);
  player.muzzle = w.userData.muzzle.clone().add(player.weaponHolder.position);
  player.tier = tier;
}

// ---------- Gates and obstacles ----------

export function buildGate(kind, color) {
  const group = new THREE.Group();
  const panelMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.1), panelMat);
  panel.position.y = 1.35;
  group.add(panel);
  const frameMat = lam(0x2c1b0d);
  group.add(box(0.2, 2.6, 0.2, frameMat, -1.65, 1.3, 0));
  group.add(box(0.2, 2.6, 0.2, frameMat, 1.65, 1.3, 0));
  group.add(box(3.5, 0.2, 0.2, frameMat, 0, 2.5, 0));
  group.add(box(3.5, 0.15, 0.15, frameMat, 0, 0.1, 0));
  const label = makeLabel();
  label.canvas.width = 320;
  label.canvas.height = 128;
  label.sprite.material.map.dispose();
  label.tex = new THREE.CanvasTexture(label.canvas);
  label.tex.colorSpace = THREE.SRGBColorSpace;
  label.sprite.material.map = label.tex;
  label.sprite.position.set(0, 1.4, 0.2);
  label.sprite.scale.set(3.1, 1.25, 1);
  group.add(label.sprite);
  return { group, label, panelMat, kind };
}

export function drawGateLabel(label, text) {
  if (label.last === text) return;
  label.last = text;
  const g = label.canvas.getContext('2d');
  g.clearRect(0, 0, 320, 128);
  let size = 54;
  g.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
  const w = g.measureText(text).width;
  if (w > 280) {
    size = Math.floor((size * 280) / w);
    g.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 14;
  g.strokeStyle = '#150a02';
  g.strokeText(text, 160, 66);
  g.fillStyle = '#ffffff';
  g.fillText(text, 160, 66);
  label.tex.needsUpdate = true;
}

export function disposeGate(g) {
  g.label.tex.dispose();
  g.label.sprite.material.dispose();
  g.panelMat.dispose();
  g.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}

export function buildSpikes(width) {
  const group = new THREE.Group();
  const log = cyl(0.42, 0.42, width * FIELD.colSpacing, M.wood, 0, 0.55, 0, 10);
  log.rotation.z = Math.PI / 2;
  group.add(log);
  const n = Math.round(width * 3);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * (width * FIELD.colSpacing - 0.4);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const sp = new THREE.Mesh(spikeGeo, M.ironLight);
      sp.position.set(x, 0.55 + Math.sin(a) * 0.5, Math.cos(a) * 0.5);
      sp.rotation.x = -a + Math.PI / 2 * 0;
      sp.rotation.x = Math.PI / 2 - a;
      group.add(sp);
    }
  }
  for (const s of [-1, 1]) group.add(box(0.25, 0.95, 0.25, M.woodDark, s * (width * FIELD.colSpacing * 0.5), 0.5, 0));
  const blob = new THREE.Mesh(blobGeo, M.blob);
  blob.scale.set(width * FIELD.colSpacing + 1, 1, 2);
  blob.position.y = 0.03;
  group.add(blob);
  return { group, halfWidth: (width * FIELD.colSpacing) / 2 + 0.1 };
}

// ---------- Particles, projectiles, rings, coins ----------

export class ParticleSystem {
  constructor(scene, max = 700) {
    this.max = max;
    this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
    this.budget = 1;
  }

  emit(x, y, z, count, opts = {}) {
    const n = Math.max(1, Math.round(count * this.budget));
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) return;
      const sp = opts.speed ?? 4;
      const a = Math.random() * Math.PI * 2;
      const up = opts.up ?? 3;
      const c = Array.isArray(opts.colors) ? opts.colors[Math.floor(Math.random() * opts.colors.length)] : (opts.color ?? 0xffffff);
      const s = (opts.size ?? 0.15) * (0.6 + Math.random() * 0.8);
      this.list.push({
        x: x + rand(-1, 1) * (opts.spread ?? 0.2),
        y: y + rand(-1, 1) * (opts.spread ?? 0.2),
        z: z + rand(-1, 1) * (opts.spread ?? 0.2),
        vx: Math.cos(a) * sp * Math.random() + (opts.vx ?? 0),
        vy: Math.random() * up + (opts.vy ?? 0),
        vz: Math.sin(a) * sp * Math.random() + (opts.vz ?? 0),
        g: opts.gravity ?? 14,
        life: (opts.life ?? 0.7) * (0.6 + Math.random() * 0.6),
        max: 0,
        size: s,
        color: c,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        spin: rand(-8, 8),
        shrink: opts.shrink ?? true,
      });
      this.list[this.list.length - 1].max = this.list[this.list.length - 1].life;
    }
  }

  update(dt, scrollSpeed) {
    const d = this.dummy;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
        continue;
      }
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += (p.vz + scrollSpeed) * dt;
      if (p.y < 0.05 && p.g > 0) {
        p.y = 0.05;
        p.vy *= -0.35;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      p.rx += p.spin * dt;
    }
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      const k = p.shrink ? clamp(p.life / p.max, 0, 1) : 1;
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.rx, p.ry + p.rx * 0.5, 0);
      d.scale.setScalar(p.size * (0.3 + 0.7 * k));
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.col.setHex(p.color);
      this.mesh.setColorAt(n, this.col);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.list.length = 0;
    this.mesh.count = 0;
  }
}

export class ProjectileRenderer {
  constructor(scene, max = 300) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
  }

  render(list) {
    const d = this.dummy;
    const n = Math.min(list.length, this.max);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const t = TIERS[p.tier];
      d.position.set(p.x, 0.85, p.z);
      d.rotation.set(0, p.angle, 0);
      d.scale.set(t.size[0], t.size[1], t.size[2]);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.col.setHex(t.color);
      this.mesh.setColorAt(i, this.col);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class RingFx {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.RingGeometry(0.85, 1, 32);
    this.geo.rotateX(-Math.PI / 2);
  }

  add(x, y, z, color, maxR = 4, time = 0.5, width = 1) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.set(x, y, z);
    this.scene.add(m);
    this.list.push({ m, t: 0, time, maxR, width });
  }

  update(dt, scrollSpeed) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      r.t += dt;
      const k = r.t / r.time;
      if (k >= 1) {
        this.scene.remove(r.m);
        r.m.material.dispose();
        this.list.splice(i, 1);
        continue;
      }
      const s = 0.3 + (r.maxR - 0.3) * (1 - Math.pow(1 - k, 2));
      r.m.scale.set(s, 1, s);
      r.m.material.opacity = 0.9 * (1 - k);
      r.m.position.z += scrollSpeed * dt * 0;
    }
  }

  clear() {
    for (const r of this.list) {
      this.scene.remove(r.m);
      r.m.material.dispose();
    }
    this.list.length = 0;
  }
}

export class CoinFx {
  constructor(scene, max = 40) {
    this.pool = [];
    this.active = [];
    this.scene = scene;
    const geo = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12);
    geo.rotateX(Math.PI / 2);
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(geo, M.gold);
      m.visible = false;
      scene.add(m);
      this.pool.push(m);
    }
  }

  spawn(x, y, z) {
    const m = this.pool.pop();
    if (!m) return;
    m.visible = true;
    m.position.set(x, y, z);
    this.active.push({ m, vx: rand(-2, 2), vy: rand(4, 7), vz: rand(-1, 3), t: 0, delay: rand(0.25, 0.45) });
  }

  update(dt, target, scrollSpeed) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      c.t += dt;
      const m = c.m;
      m.rotation.y += dt * 10;
      if (c.t < c.delay) {
        c.vy -= 16 * dt;
        m.position.x += c.vx * dt;
        m.position.y = Math.max(0.3, m.position.y + c.vy * dt);
        m.position.z += (c.vz + scrollSpeed) * dt;
      } else {
        const dx = target.x - m.position.x;
        const dy = 0.9 - m.position.y;
        const dz = target.z - m.position.z;
        const k = Math.min(1, (c.t - c.delay) * 4 + 0.1);
        m.position.x += dx * k * dt * 12;
        m.position.y += dy * k * dt * 12;
        m.position.z += dz * k * dt * 12;
        if (dx * dx + dz * dz < 0.5) {
          m.visible = false;
          this.pool.push(m);
          this.active.splice(i, 1);
        }
      }
    }
  }

  clear() {
    for (const c of this.active) {
      c.m.visible = false;
      this.pool.push(c.m);
    }
    this.active.length = 0;
  }
}

// ---------- Environment ----------

export function buildEnvironment(scene) {
  const env = { pathTex: null, grassTex: null, props: [], flags: [] };
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xf0c590, 38, 112);

  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x6b5a3c, 1.0));
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.0);
  sun.position.set(-6, 14, 8);
  scene.add(sun);

  const len = 190;
  const pathTile = 8;
  env.pathTex = stoneTexture();
  env.pathTex.repeat.set(1, len / pathTile);
  env.pathTile = pathTile;
  const path = new THREE.Mesh(new THREE.PlaneGeometry(9, len), new THREE.MeshLambertMaterial({ map: env.pathTex }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0, -len / 2 + 22);
  scene.add(path);

  const grassTile = 10;
  env.grassTex = grassTexture();
  env.grassTex.repeat.set(10, len / grassTile);
  env.grassTile = grassTile;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(100, len), new THREE.MeshLambertMaterial({ map: env.grassTex }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, -0.04, -len / 2 + 22);
  scene.add(grass);

  // Wall segments + torches + trees recycle along z.
  const wallMat = M.stone;
  const span = 144;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 24; i++) {
      const g = new THREE.Group();
      const wall = box(0.9, 0.9, 6, wallMat, 0, 0.45, 0);
      g.add(wall);
      for (const z of [-2.2, 0, 2.2]) g.add(box(0.9, 0.35, 1.2, wallMat, 0, 1.05, z));
      g.position.set(side * 4.9, 0, 22 - i * 6);
      scene.add(g);
      env.props.push({ obj: g, span });
    }
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      g.add(cyl(0.08, 0.1, 2.6, M.woodDark, 0, 1.3, 0, 6));
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffa23a }));
      flame.position.y = 2.75;
      flame.name = 'flame';
      g.add(flame);
      const flag = box(0.04, 0.6, 0.9, M.cloth, 0, 2.1, 0.5);
      flag.name = 'flag';
      g.add(flag);
      g.position.set(side * 4.9, 0.9, 20 - i * 12 - (side > 0 ? 6 : 0));
      scene.add(g);
      env.props.push({ obj: g, span, flame });
    }
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const s = 0.8 + Math.random() * 0.8;
      g.add(cyl(0.18 * s, 0.25 * s, 1.2 * s, M.woodDark, 0, 0.6 * s, 0, 6));
      const mat = lam(new THREE.Color().setHSL(0.27 + Math.random() * 0.05, 0.45, 0.28 + Math.random() * 0.08));
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((1.4 - k * 0.3) * s, 1.6 * s, 7), mat);
        cone.position.y = (1.5 + k * 0.9) * s;
        g.add(cone);
      }
      g.position.set(side * (7 + Math.random() * 14), 0, 24 - i * 9 - Math.random() * 6);
      scene.add(g);
      env.props.push({ obj: g, span: 144 });
    }
  }

  // Distant enemy fortress
  const castle = new THREE.Group();
  castle.add(box(46, 9, 4, M.stone, 0, 4.5, 0));
  for (let i = -10; i <= 10; i++) castle.add(box(1.6, 1.4, 1.6, M.stone, i * 2.2, 9.7, 0));
  for (const x of [-22, -11, 11, 22]) {
    castle.add(cyl(2.4, 2.8, 15, M.stone, x, 7.5, 0, 10));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4.5, 10), M.red);
    roof.position.set(x, 17.2, 0);
    castle.add(roof);
  }
  castle.add(box(9, 14, 5, M.stone, 0, 7, 0));
  castle.add(box(4, 6, 0.5, M.woodDark, 0, 3, 2.4));
  castle.position.set(0, 0, -102);
  scene.add(castle);
  env.castle = castle;

  return env;
}

export function updateEnvironment(env, dt, speed, t) {
  env.pathTex.offset.y += (speed * dt) / env.pathTile;
  env.grassTex.offset.y += (speed * dt) / env.grassTile;
  for (const p of env.props) {
    p.obj.position.z += speed * dt;
    if (p.obj.position.z > 24) p.obj.position.z -= p.span;
    if (p.flame) p.flame.scale.setScalar(0.85 + Math.sin(t * 14 + p.obj.position.z) * 0.2);
  }
}
