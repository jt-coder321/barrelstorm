import * as THREE from 'three';
import { FIELD } from './config.js';
import { FAMILIES } from './data/weapons.js';
import { BIOMES } from './data/biomes.js';
import { ENEMIES } from './data/enemies.js';
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

function drawStone(g, w, h, rgb = [128, 118, 102]) {
  g.fillStyle = `rgb(${rgb[0] * 0.55},${rgb[1] * 0.55},${rgb[2] * 0.55})`;
  g.fillRect(0, 0, w, h);
  const rows = 4;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const cols = r % 2 ? 3 : 4;
    const cw = w / cols;
    const off = r % 2 ? -cw / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      const k = 0.85 + Math.random() * 0.3;
      g.fillStyle = `rgb(${rgb[0] * k | 0},${rgb[1] * k | 0},${rgb[2] * k | 0})`;
      g.fillRect(off + c * cw + 3, r * rh + 3, cw - 6, rh - 6);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(off + c * cw + 3, r * rh + 3, cw - 6, 4);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(off + c * cw + 3, r * rh + rh - 9, cw - 6, 6);
    }
  }
}

function stoneTexture(rgb) {
  return canvasTex(256, 256, (g, w, h) => drawStone(g, w, h, rgb));
}

function drawGround(g, w, h, base) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const c = new THREE.Color(base);
  for (let i = 0; i < 1400; i++) {
    const k = 0.75 + Math.random() * 0.5;
    g.fillStyle = `rgba(${(c.r * 255 * k) | 0},${(c.g * 255 * k * 1.05) | 0},${(c.b * 255 * k) | 0},0.4)`;
    g.fillRect(Math.random() * w, Math.random() * h, 3, 5 + Math.random() * 5);
  }
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

function drawSky(g, w, h, stops) {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, stops[0]);
  grd.addColorStop(0.55, stops[1]);
  grd.addColorStop(0.85, stops[2]);
  grd.addColorStop(1, stops[3]);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
}

function blobTexture() {
  return canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }, false);
}

function glowTexture() {
  return canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
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
  M.blue = lam(0x2f6fd6);
  M.green = lam(0x3f9a3a, { emissive: 0x0a2a08 });
  M.leather = lam(0x6b4423);
  M.rock = lam(0x6b625a);
  M.blob = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
  M.glowTex = glowTexture();
  M.glow = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  M.glowBlue = new THREE.MeshBasicMaterial({ color: 0x7fd4ff });
  M.glowRed = new THREE.MeshBasicMaterial({ color: 0xff3a1a });
  M.glowGreen = new THREE.MeshBasicMaterial({ color: 0x7dff7a });
  M.shield = new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
  M.ice = new THREE.MeshLambertMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55, emissive: 0x1a4a6a, depthWrite: false });
}

// ---------- Target models ----------

const barrelProfile = [];
for (let i = 0; i <= 8; i++) {
  const t = i / 8;
  barrelProfile.push(new THREE.Vector2(0.5 + 0.17 * Math.sin(t * Math.PI), t * 1.1));
}
let barrelGeo;
let bandGeo;
let lidGeo;
let spikeGeo;
let blobGeo;
let sphereGeo;
let boxGeo;

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
  sphereGeo = new THREE.SphereGeometry(1, 12, 10);
  boxGeo = new THREE.BoxGeometry(1, 1, 1);
}

export function getGeo() {
  return { sphereGeo, boxGeo, blobGeo, spikeGeo, barrelGeo, bandGeo };
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo || new THREE.BoxGeometry(1, 1, 1), mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}
function ball(r, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(sphereGeo, mat);
  m.scale.setScalar(r);
  m.userData.s = r;
  m.position.set(x, y, z);
  return m;
}
export { box, cyl, ball };

// body color (null = wood texture), band material, extra decoration
const STYLE = {
  normal: { body: null, band: 'iron' },
  small: { body: null, band: 'iron' },
  minion: { body: 0x777777, band: 'iron' },
  keg: { body: 0xa8322a, band: 'iron', deco: 'fuse' },
  bossKeg: { body: 0xa8322a, band: 'iron', deco: 'fuse' },
  big: { body: null, band: 'ironLight' },
  gift: { body: 0xffc83a, band: 'cloth', deco: 'ribbon' },
  armored: { body: 0x5d636c, band: 'steel', deco: 'plates' },
  shielder: { body: 0x2f5fb0, band: 'steel', deco: 'orb' },
  regen: { body: 0x5a7a3a, band: 'green', deco: 'vines' },
  runner: { body: 0xb05a2a, band: 'iron', deco: 'wheels' },
  zigzag: { body: 0x8a5ab0, band: 'gold', deco: 'mug' },
  splitter: { body: 0xc8a050, band: 'iron', deco: 'seam' },
  ghost: { body: 0x9a7aff, band: 'ironLight', deco: 'ghost' },
  bomber: { body: 0x2a2a2e, band: 'red', deco: 'bomb' },
  elite: { body: 0x6a1a1a, band: 'gold', deco: 'spikes' },
  megakeg: { body: 0xd02a1a, band: 'gold', deco: 'megafuse' },
  archer: { body: 0x4a6a2a, band: 'iron', deco: 'bow' },
  healer: { body: 0xeae4d4, band: 'green', deco: 'cross' },
  charger: { body: 0xd8762a, band: 'iron', deco: 'horns' },
  flyer: { body: 0x7a5a9a, band: 'iron', deco: 'balloon' },
  pinata: { body: 0xff5aa8, band: 'gold', deco: 'pinata' },
  cache: { body: null, band: 'gold', deco: 'sparkle' },
};

export function barrelRadius(kind) {
  return 0.62 * (ENEMIES[kind].scale || 1);
}

export function barrelHeight(kind) {
  const special = { wall: 1.5, chest: 0.9, anvil: 1.3, altar: 1.6, treasure: 1.2, ram: 1.0, tower: 3.4 };
  return (special[kind] || 1.1) * (special[kind] ? 1 : ENEMIES[kind].scale || 1);
}

function makeLabel(w = 160, h = 80) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 20;
  return { canvas, tex, sprite, last: null };
}

export function drawLabel(label, text, color = '#ffffff', badge = '') {
  const key = text + color + badge;
  if (label.last === key) return;
  label.last = key;
  const g = label.canvas.getContext('2d');
  g.clearRect(0, 0, 160, 80);
  const full = badge ? `${badge}${text}` : text;
  const size = full.length > 5 ? 40 : full.length > 4 ? 46 : full.length > 3 ? 54 : 64;
  g.font = `900 ${size}px "Arial Black", Impact, "Roboto Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = '#1a0d04';
  g.strokeText(full, 80, 42);
  g.fillStyle = color;
  g.fillText(full, 80, 42);
  label.tex.needsUpdate = true;
}

function barrelBody(inner, st, kind) {
  const bodyMat = st.body === null
    ? new THREE.MeshLambertMaterial({ map: M.wood.map })
    : new THREE.MeshLambertMaterial({ color: st.body, transparent: kind === 'ghost', opacity: kind === 'ghost' ? 0.55 : 1 });
  inner.add(new THREE.Mesh(barrelGeo, bodyMat));
  const lid = new THREE.Mesh(lidGeo, M.woodDark);
  lid.rotation.x = -Math.PI / 2;
  lid.position.y = 1.1;
  inner.add(lid);
  for (const y of [0.18, 0.55, 0.92]) {
    const band = new THREE.Mesh(bandGeo, M[st.band]);
    const r = radiusAt(y) + 0.02;
    band.scale.set(r, r, 1);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    inner.add(band);
  }
  return bodyMat;
}

function decorate(inner, deco, refs) {
  switch (deco) {
    case 'fuse': {
      inner.add(cyl(0.03, 0.03, 0.3, M.woodDark, 0, 1.25, 0, 5));
      refs.spark = ball(0.1, M.glow, 0, 1.45, 0);
      inner.add(refs.spark);
      const skull = ball(0.2, new THREE.MeshLambertMaterial({ color: 0xf2eee0 }), 0, 0.55, 0.62);
      skull.scale.set(0.2, 0.2, 0.1);
      inner.add(skull);
      break;
    }
    case 'ribbon':
      inner.add(box(0.16, 1.14, 1.5, M.cloth, 0, 0.55, 0));
      inner.add(box(1.5, 0.16, 0.16, M.cloth, 0, 1.12, 0));
      refs.star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
      refs.star.position.y = 1.55;
      inner.add(refs.star);
      break;
    case 'plates':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const p = box(0.34, 0.8, 0.06, M.steel, Math.sin(a) * 0.64, 0.55, Math.cos(a) * 0.64);
        p.rotation.y = a;
        inner.add(p);
      }
      inner.add(cyl(0.5, 0.5, 0.08, M.steel, 0, 1.14, 0, 12));
      break;
    case 'orb':
      refs.orb = ball(0.2, M.glowBlue, 0, 1.45, 0);
      inner.add(refs.orb);
      inner.add(cyl(0.04, 0.04, 0.4, M.steel, 0, 1.2, 0, 5));
      break;
    case 'vines':
      for (let i = 0; i < 3; i++) {
        const v = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.05, 5, 16), M.glowGreen);
        v.position.y = 0.3 + i * 0.3;
        v.rotation.x = Math.PI / 2 + (i - 1) * 0.3;
        inner.add(v);
      }
      break;
    case 'wheels':
      for (const sx of [-0.62, 0.62]) {
        const w = cyl(0.3, 0.3, 0.1, M.woodDark, sx, 0.3, 0, 10);
        w.rotation.z = Math.PI / 2;
        inner.add(w);
      }
      for (const y of [0.4, 0.7]) inner.add(box(1.36, 0.08, 0.08, M.gold, 0, y, 0.55));
      break;
    case 'megafuse': {
      for (const sx of [-0.15, 0.15]) inner.add(cyl(0.03, 0.03, 0.35, M.woodDark, sx, 1.27, 0, 5));
      refs.spark = ball(0.13, M.glow, 0, 1.5, 0);
      inner.add(refs.spark);
      const skull = ball(0.24, new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0x553300 }), 0, 0.55, 0.62);
      skull.scale.set(0.26, 0.26, 0.1);
      inner.add(skull);
      for (let i = 0; i < 4; i++) inner.add(box(0.1, 0.1, 0.1, M.glowRed, Math.sin(i * 1.57) * 0.66, 0.85, Math.cos(i * 1.57) * 0.66));
      break;
    }
    case 'bow': {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 5, 12, Math.PI), M.woodDark);
      bow.position.set(0, 0.7, 0.68);
      bow.rotation.z = Math.PI / 2;
      inner.add(bow);
      inner.add(box(0.03, 0.9, 0.03, M.steel, 0, 0.7, 0.55));
      inner.add(box(0.06, 0.06, 0.6, M.steel, 0, 0.7, 0.75));
      inner.add(cyl(0.45, 0.55, 0.25, M.green, 0, 1.22, 0, 8));
      for (const sx of [-0.18, 0.18]) inner.add(ball(0.07, M.glowRed, sx, 0.95, 0.63));
      break;
    }
    case 'cross':
      inner.add(box(0.5, 0.16, 0.08, M.glowGreen, 0, 0.6, 0.67));
      inner.add(box(0.16, 0.5, 0.08, M.glowGreen, 0, 0.6, 0.67));
      refs.orb = ball(0.2, M.glowGreen, 0, 1.45, 0);
      inner.add(refs.orb);
      break;
    case 'horns':
      for (const sx of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 6), M.steel);
        h.position.set(sx * 0.45, 1.15, 0.2);
        h.rotation.z = -sx * 0.9;
        h.rotation.x = 0.5;
        inner.add(h);
      }
      for (const sx of [-0.2, 0.2]) inner.add(ball(0.08, M.glow, sx, 0.75, 0.64));
      break;
    case 'balloon': {
      const bl = ball(0.55, new THREE.MeshLambertMaterial({ color: 0xe8483a, emissive: 0x3a0a08 }), 0, 2.25, 0);
      bl.scale.set(0.55, 0.65, 0.55);
      inner.add(bl);
      for (const sx of [-0.3, 0.3]) inner.add(box(0.02, 0.75, 0.02, M.woodDark, sx, 1.5, 0));
      inner.add(ball(0.22, M.iron, 0, -0.15, 0));
      break;
    }
    case 'pinata':
      for (let i = 0; i < 5; i++) inner.add(box(1.4, 0.1, 1.4, [M.gold, M.blue, M.green, M.cloth, M.gold][i], 0, 0.12 + i * 0.22, 0));
      refs.star = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
      refs.star.position.y = 1.55;
      inner.add(refs.star);
      break;
    case 'sparkle':
      refs.star = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }));
      refs.star.position.set(0.35, 1.3, 0.35);
      inner.add(refs.star);
      break;
    case 'mug':
      inner.add(box(0.3, 0.3, 0.05, M.gold, 0, 0.6, 0.66));
      break;
    case 'seam': {
      const s = box(0.06, 1.15, 1.42, M.glow, 0, 0.55, 0);
      inner.add(s);
      break;
    }
    case 'ghost':
      for (const sx of [-0.2, 0.2]) inner.add(ball(0.09, M.glowGreen, sx, 0.7, 0.62));
      break;
    case 'bomb': {
      const b = ball(0.28, M.iron, 0, 1.38, 0);
      inner.add(b);
      refs.spark = ball(0.08, M.glow, 0.1, 1.75, 0);
      inner.add(refs.spark);
      for (const sx of [-0.2, 0.2]) inner.add(ball(0.08, M.glowRed, sx, 0.7, 0.62));
      break;
    }
    case 'spikes':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const sp = new THREE.Mesh(spikeGeo, M.ironLight);
        sp.position.set(Math.cos(a) * 0.72, 0.55, Math.sin(a) * 0.72);
        sp.rotation.z = -Math.cos(a) * Math.PI / 2;
        sp.rotation.x = Math.sin(a) * Math.PI / 2;
        inner.add(sp);
      }
      for (const sx of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), M.gold);
        h.position.set(sx * 0.35, 1.3, 0);
        h.rotation.z = -sx * 0.5;
        inner.add(h);
      }
      for (const sx of [-0.2, 0.2]) inner.add(ball(0.1, M.glowRed, sx, 0.7, 0.66));
      break;
    default:
      break;
  }
}

function specialModel(kind, inner, refs) {
  let bodyMat;
  if (kind === 'wall') {
    bodyMat = new THREE.MeshLambertMaterial({ map: M.stone.map });
    const w = box(1.35, 1.5, 0.9, bodyMat, 0, 0.75, 0);
    inner.add(w);
    for (const x of [-0.45, 0.45]) inner.add(box(0.36, 0.3, 0.9, bodyMat, x, 1.65, 0));
  } else if (kind === 'chest') {
    bodyMat = new THREE.MeshLambertMaterial({ map: M.wood.map });
    inner.add(box(1.2, 0.6, 0.8, bodyMat, 0, 0.3, 0));
    const lid = cyl(0.4, 0.4, 1.2, bodyMat, 0, 0.6, 0, 10);
    lid.rotation.z = Math.PI / 2;
    lid.scale.set(1, 1, 1);
    inner.add(lid);
    for (const x of [-0.45, 0, 0.45]) inner.add(box(0.1, 1.02, 0.84, M.gold, x, 0.5, 0));
    inner.add(box(0.2, 0.24, 0.1, M.gold, 0, 0.55, 0.42));
    refs.star = ball(0.12, new THREE.MeshBasicMaterial({ color: 0xfff2a0 }), 0, 1.3, 0);
    inner.add(refs.star);
  } else if (kind === 'anvil') {
    bodyMat = new THREE.MeshLambertMaterial({ color: 0x6a625a });
    inner.add(box(0.9, 0.5, 0.9, bodyMat, 0, 0.25, 0));
    inner.add(box(0.4, 0.35, 0.4, M.iron, 0, 0.67, 0));
    const top = box(1.1, 0.25, 0.5, M.iron, 0, 0.95, 0);
    inner.add(top);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8), M.iron);
    horn.rotation.z = Math.PI / 2;
    horn.position.set(-0.75, 0.95, 0);
    inner.add(horn);
    refs.star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0x9ae8ff }));
    refs.star.position.y = 1.5;
    inner.add(refs.star);
  } else if (kind === 'altar') {
    bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a2a2a });
    inner.add(box(1.0, 0.7, 0.8, bodyMat, 0, 0.35, 0));
    inner.add(box(1.2, 0.15, 1.0, M.rock, 0, 0.75, 0));
    refs.star = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshBasicMaterial({ color: 0xff2a4a }));
    refs.star.position.y = 1.45;
    refs.star.scale.y = 1.6;
    inner.add(refs.star);
  } else if (kind === 'ram') {
    bodyMat = new THREE.MeshLambertMaterial({ map: M.wood.map });
    const log = cyl(0.42, 0.42, 1.9, bodyMat, 0, 0.6, 0, 10);
    log.rotation.x = Math.PI / 2;
    inner.add(log);
    const head = cyl(0.5, 0.36, 0.5, M.iron, 0, 0.6, 1.05, 10);
    head.rotation.x = Math.PI / 2;
    inner.add(head);
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.6, 0.5]) {
      const w = cyl(0.25, 0.25, 0.08, M.woodDark, sx, 0.25, sz, 10);
      w.rotation.z = Math.PI / 2;
      inner.add(w);
    }
    for (const sz of [-0.4, 0.4]) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 5, 14), M.steel);
      b.position.set(0, 0.6, sz);
      inner.add(b);
    }
    for (const sx of [-0.15, 0.15]) inner.add(ball(0.07, M.glowRed, sx, 0.75, 1.3));
  } else if (kind === 'tower') {
    bodyMat = new THREE.MeshLambertMaterial({ map: M.stone.map });
    inner.add(cyl(0.55, 0.7, 2.6, bodyMat, 0, 1.3, 0, 10));
    inner.add(cyl(0.75, 0.75, 0.35, bodyMat, 0, 2.75, 0, 10));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      inner.add(box(0.22, 0.3, 0.22, bodyMat, Math.cos(a) * 0.62, 3.05, Math.sin(a) * 0.62));
    }
    for (let i = 0; i < 3; i++) inner.add(cyl(0.22, 0.22, 0.4, M.red, (i - 1) * 0.3, 3.1, 0, 8));
    refs.spark = ball(0.12, M.glow, 0, 3.5, 0);
    inner.add(refs.spark);
    inner.add(box(0.3, 0.45, 0.05, M.iron, 0, 1.4, 0.62));
  } else if (kind === 'treasure') {
    bodyMat = new THREE.MeshLambertMaterial({ map: M.wood.map });
    inner.add(box(1.2, 0.5, 0.9, bodyMat, 0, 0.5, 0));
    for (let i = 0; i < 9; i++) inner.add(ball(0.22, M.gold, rand(-0.4, 0.4), 0.85 + Math.random() * 0.15, rand(-0.25, 0.25)));
    for (const sx of [-0.62, 0.62]) for (const sz of [-0.3, 0.3]) {
      const w = cyl(0.25, 0.25, 0.08, M.woodDark, sx, 0.25, sz, 10);
      w.rotation.z = Math.PI / 2;
      inner.add(w);
    }
    refs.star = ball(0.1, new THREE.MeshBasicMaterial({ color: 0xfff2a0 }), 0, 1.4, 0);
    inner.add(refs.star);
  }
  return bodyMat;
}

export function buildBarrel(kind) {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const refs = {};
  const st = STYLE[kind];
  let bodyMat;
  if (st) {
    bodyMat = barrelBody(inner, st, kind);
    decorate(inner, st.deco, refs);
  } else {
    bodyMat = specialModel(kind, inner, refs);
  }
  const scale = st ? ENEMIES[kind].scale || 1 : 1;
  inner.scale.setScalar(scale);

  const blob = new THREE.Mesh(blobGeo, M.blob);
  blob.scale.set(2.0 * scale, 1, 2.0 * scale);
  blob.position.y = 0.03;
  group.add(blob);

  // Shield bubble (shown while protected by a shield bearer) and ice block (frozen).
  const bubble = new THREE.Mesh(sphereGeo, M.shield);
  bubble.scale.setScalar(0.95 * scale + 0.1);
  bubble.position.y = 0.6 * scale;
  bubble.visible = false;
  group.add(bubble);
  const ice = new THREE.Mesh(boxGeo, M.ice);
  ice.scale.set(1.5 * scale, 1.3 * scale, 1.5 * scale);
  ice.position.y = 0.6 * scale;
  ice.visible = false;
  group.add(ice);

  // Lantern glow for dark stages.
  const glowMat = new THREE.SpriteMaterial({ map: M.glowTex, color: 0xffb060, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(2.6 * scale);
  glow.position.y = 0.7 * scale;
  glow.visible = false;
  group.add(glow);

  const label = makeLabel();
  const lh = barrelHeight(kind) + 0.55;
  label.sprite.position.set(0, lh, 0.15);
  const ls = 0.95 + scale * 0.45;
  label.sprite.scale.set(ls * 2, ls, 1);
  group.add(label.sprite);

  return { group, inner, bodyMat, label, kind, spark: refs.spark, star: refs.star, orb: refs.orb, bubble, ice, glow };
}

export function disposeBarrel(b) {
  b.label.tex.dispose();
  b.label.sprite.material.dispose();
  b.bodyMat.dispose();
  b.glow.material.dispose();
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && o.geometry !== boxGeo && o.geometry !== sphereGeo && o.geometry !== blobGeo && o.geometry !== spikeGeo) o.geometry.dispose();
  });
}

// ---------- Player + weapons ----------

export function buildPlayer() {
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);

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

  const knight = new THREE.Group();
  knight.position.set(0, 0.55, 0.45);
  knight.add(box(0.55, 0.7, 0.42, M.steel, 0, 0.55, 0));
  knight.add(box(0.57, 0.5, 0.2, M.cloth, 0, 0.5, 0.15));
  knight.add(ball(0.27, M.steel, 0, 1.2, 0));
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
  const sideHolder = new THREE.Group();
  sideHolder.position.set(0.85, 0.85, -0.2);
  sideHolder.scale.setScalar(0.6);
  bob.add(sideHolder);

  // Aegis shield bubble
  const shield = new THREE.Mesh(sphereGeo, M.shield);
  shield.scale.set(1.5, 1.3, 1.7);
  shield.position.y = 0.9;
  shield.visible = false;
  root.add(shield);

  // Aura used while overdrive / frenzy is active
  const auraMat = new THREE.SpriteMaterial({ map: M.glowTex, color: 0xff8a2a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const aura = new THREE.Sprite(auraMat);
  aura.scale.set(4, 4, 1);
  aura.position.y = 1;
  root.add(aura);

  return { root, bob, wheels, knight, weaponHolder, sideHolder, weapon: null, side: null, shield, aura };
}

const famMat = {};
function fm(fid, which) {
  const k = fid + which;
  if (!famMat[k]) {
    const f = FAMILIES[fid];
    famMat[k] = which === 'glow'
      ? new THREE.MeshBasicMaterial({ color: f.color })
      : new THREE.MeshLambertMaterial({ color: f.accent, emissive: new THREE.Color(f.accent).multiplyScalar(0.25) });
  }
  return famMat[k];
}

function tube(r1, r2, len, mat, y, z) {
  const t = cyl(r1, r2, len, mat, 0, y, z, 12);
  t.rotation.x = Math.PI / 2;
  return t;
}

// Builds the weapon model for a family at a given form (0..3). Higher forms add barrels, glow rings,
// fins and size so evolving is visible at a glance.
export function buildWeapon(fid, form) {
  const w = new THREE.Group();
  const glow = fm(fid, 'glow');
  const acc = fm(fid, 'acc');
  const s = 1 + form * 0.12;
  let muzzle = new THREE.Vector3(0, 0.5, -1.4);
  const rings = (n, y, z0, dz, r) => {
    for (let i = 0; i < n; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 6, 14), glow);
      ring.position.set(0, y, z0 - i * dz);
      w.add(ring);
    }
  };
  switch (fid) {
    case 'cannon': {
      const barrels = form >= 3 ? 2 : 1;
      for (let i = 0; i < barrels; i++) {
        const x = barrels > 1 ? (i ? 0.26 : -0.26) : 0;
        const b = tube(0.24, 0.32, 1.6, M.iron, 0.5, -0.65);
        b.position.x = x;
        w.add(b);
      }
      w.add(box(0.9, 0.3, 0.9, M.woodDark, 0, 0.15, -0.1));
      rings(form + 1, 0.5, -0.2, 0.45, 0.34);
      if (form >= 3) {
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 8), M.red);
        head.rotation.x = -Math.PI / 2;
        head.position.set(0, 0.5, -1.65);
        w.add(head);
      }
      muzzle = new THREE.Vector3(0, 0.5, -1.6);
      break;
    }
    case 'gatling': {
      const n = 4 + form * 2;
      const spin = new THREE.Group();
      spin.position.set(0, 0.5, -0.7);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const b = tube(0.05, 0.05, 1.5, M.steel, Math.sin(a) * 0.18, 0);
        b.position.x = Math.cos(a) * 0.18;
        spin.add(b);
      }
      w.add(spin);
      w.userData.spin = spin;
      w.add(tube(0.26, 0.26, 0.3, acc, 0.5, -0.1));
      rings(1 + Math.floor(form / 2), 0.5, -1.3, 0.3, 0.26);
      w.add(box(0.5, 0.4, 0.5, M.woodDark, 0, 0.2, 0.1));
      muzzle = new THREE.Vector3(0, 0.5, -1.5);
      break;
    }
    case 'crossbow': {
      w.add(box(0.2, 0.16, 1.6 + form * 0.2, M.wood, 0, 0.35, -0.45));
      for (let i = 0; i < 1 + Math.min(form, 2); i++) {
        const limb = new THREE.Mesh(new THREE.TorusGeometry(0.7 + form * 0.08, 0.05, 6, 16, Math.PI), i ? acc : M.iron);
        limb.rotation.set(0, Math.PI / 2, Math.PI / 2);
        limb.rotation.x = Math.PI / 2;
        limb.position.set(0, 0.38 + i * 0.14, -1.0);
        w.add(limb);
      }
      w.add(box(0.04, 0.04, 1.0, glow, 0, 0.45, -0.7));
      if (form >= 2) w.add(box(0.3, 0.3, 0.5, M.ironLight, 0, 0.65, -0.1));
      muzzle = new THREE.Vector3(0, 0.45, -1.4);
      break;
    }
    case 'flame': {
      w.add(ball(0.4, acc, 0, 0.5, 0.05));
      w.add(tube(0.12, 0.2, 1.3, M.iron, 0.5, -0.75));
      const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.26 + form * 0.04, 0.4, 8, 1, true), M.iron);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, 0.5, -1.45);
      w.add(nozzle);
      const pilot = ball(0.1 + form * 0.03, glow, 0, 0.5, -1.62);
      w.add(pilot);
      w.userData.pilot = pilot;
      for (let i = 0; i < form; i++) w.add(ball(0.18, acc, (i % 2 ? 1 : -1) * 0.42, 0.35, 0.2 - i * 0.2));
      muzzle = new THREE.Vector3(0, 0.5, -1.65);
      break;
    }
    case 'lightning': {
      w.add(tube(0.18, 0.26, 1.4, M.iron, 0.5, -0.6));
      for (let i = 0; i < 3 + form; i++) {
        const c = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 5, 12), i % 2 ? glow : M.gold);
        c.position.set(0, 0.5, -0.1 - i * 0.28);
        w.add(c);
      }
      const orb = ball(0.16 + form * 0.04, glow, 0, 0.5, -1.4);
      w.add(orb);
      w.userData.pilot = orb;
      if (form >= 2) for (const sx of [-1, 1]) w.add(cyl(0.03, 0.03, 0.7, M.gold, sx * 0.3, 0.85, -0.4, 5));
      muzzle = new THREE.Vector3(0, 0.5, -1.5);
      break;
    }
    case 'mortar': {
      const t = cyl(0.34 + form * 0.04, 0.42 + form * 0.04, 1.0, M.iron, 0, 0.75, -0.3, 12);
      t.rotation.x = -0.6;
      w.add(t);
      w.add(box(1.0, 0.3, 1.0, M.woodDark, 0, 0.15, 0));
      rings(form + 1, 0.75, -0.1, 0.0001, 0.45);
      w.children[w.children.length - 1].rotation.x = -0.6;
      muzzle = new THREE.Vector3(0, 1.2, -0.65);
      break;
    }
    case 'frost': {
      w.add(tube(0.2, 0.28, 1.5, M.steel, 0.5, -0.6));
      for (let i = 0; i < 2 + form; i++) {
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), glow);
        const a = (i / (2 + form)) * Math.PI * 2;
        cr.position.set(Math.cos(a) * 0.34, 0.5 + Math.sin(a) * 0.34, -0.4);
        cr.scale.set(0.6, 1.6, 0.6);
        cr.rotation.z = a;
        w.add(cr);
      }
      rings(1 + form, 0.5, -1.0, 0.25, 0.3);
      muzzle = new THREE.Vector3(0, 0.5, -1.45);
      break;
    }
    case 'rocket': {
      const pods = 1 + Math.min(form, 2);
      for (let i = 0; i < pods; i++) {
        const x = (i - (pods - 1) / 2) * 0.42;
        const p = box(0.36, 0.36, 1.3, M.iron, x, 0.5, -0.5);
        w.add(p);
        for (const dy of [-0.08, 0.08]) {
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), M.red);
          tip.rotation.x = -Math.PI / 2;
          tip.position.set(x, 0.5 + dy, -1.2);
          w.add(tip);
        }
      }
      if (form >= 3) rings(2, 0.5, -0.1, 0.4, 0.5);
      muzzle = new THREE.Vector3(0, 0.5, -1.3);
      break;
    }
    default:
      break;
  }
  w.scale.setScalar(s);
  muzzle.multiplyScalar(s);
  w.userData.muzzle = muzzle;
  return w;
}

export function setPlayerWeapon(player, fid, form) {
  if (player.weapon) {
    player.weaponHolder.remove(player.weapon);
    disposeTree(player.weapon);
  }
  const w = buildWeapon(fid, form);
  player.weapon = w;
  player.weaponHolder.add(w);
  player.muzzle = w.userData.muzzle.clone().add(player.weaponHolder.position);
  player.fid = fid;
  player.form = form;
}

export function setSideWeapon(player, fid) {
  if (player.side) {
    player.sideHolder.remove(player.side);
    disposeTree(player.side);
    player.side = null;
  }
  if (!fid) return;
  player.side = buildWeapon(fid, 1);
  player.sideHolder.add(player.side);
}
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
  disposeTree(g.group);
}

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
        st: opts.stave ? 1 : 0,
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
      const sc = p.size * (0.3 + 0.7 * k);
      if (p.st) d.scale.set(sc * 0.45, sc * 1.8, sc * 0.18);
      else d.scale.setScalar(sc);
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


// ---------- Projectiles, lightning, telegraphs ----------

export class ProjectileRenderer {
  constructor(scene, max = 400) {
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

  render(list, extra) {
    const d = this.dummy;
    let n = 0;
    const put = (p) => {
      if (n >= this.max) return;
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.pitch || 0, p.angle, p.roll || 0);
      d.scale.set(p.size[0], p.size[1], p.size[2]);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.col.setHex(p.color);
      this.mesh.setColorAt(n, this.col);
      n++;
    };
    for (const p of list) put(p);
    if (extra) for (const p of extra) put(p);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// Jagged lightning arcs drawn with stretched boxes.
export class BoltFx {
  constructor(scene, max = 260) {
    this.max = max;
    this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
  }

  add(x1, y1, z1, x2, y2, z2, color = 0x9fd8ff, life = 0.16, width = 0.09) {
    const segs = 6;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const j = i === 0 || i === segs ? 0 : 0.35;
      pts.push([x1 + (x2 - x1) * t + rand(-j, j), y1 + (y2 - y1) * t + rand(-j, j) * 0.6, z1 + (z2 - z1) * t + rand(-j, j)]);
    }
    for (let i = 0; i < segs; i++) {
      if (this.list.length >= this.max) return;
      this.list.push({ p: pts[i], q: pts[i + 1], color, life, max: life, width });
    }
  }

  update(dt) {
    const d = this.dummy;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
      }
    }
    for (const s of this.list) {
      this.a.set(s.p[0], s.p[1], s.p[2]);
      this.b.set(s.q[0], s.q[1], s.q[2]);
      const len = this.a.distanceTo(this.b);
      d.position.copy(this.a).lerp(this.b, 0.5);
      d.lookAt(this.b);
      const k = s.life / s.max;
      d.scale.set(s.width * (0.5 + k), s.width * (0.5 + k), len);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.col.setHex(s.color).multiplyScalar(0.6 + k * 0.6);
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

// Warning zones on the ground: circles and rectangles that pulse before something happens there.
export class ZoneFx {
  constructor(scene) {
    this.scene = scene;
    this.disc = new THREE.CircleGeometry(1, 28);
    this.disc.rotateX(-Math.PI / 2);
    this.ring = new THREE.RingGeometry(0.9, 1, 32);
    this.ring.rotateX(-Math.PI / 2);
    this.plane = new THREE.PlaneGeometry(1, 1);
    this.plane.rotateX(-Math.PI / 2);
  }

  add(shape, x, z, a, b, color = 0xff3a2a) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending });
    const mat2 = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    if (shape === 'circle') {
      const d = new THREE.Mesh(this.disc, mat);
      d.scale.set(a, 1, a);
      const r = new THREE.Mesh(this.ring, mat2);
      r.scale.set(a, 1, a);
      g.add(d, r);
      g.userData.fill = d;
    } else {
      const d = new THREE.Mesh(this.plane, mat);
      d.scale.set(a, 1, b);
      g.add(d);
      const edgeL = new THREE.Mesh(this.plane, mat2);
      edgeL.scale.set(0.08, 1, b);
      edgeL.position.x = -a / 2;
      const edgeR = edgeL.clone();
      edgeR.position.x = a / 2;
      g.add(edgeL, edgeR);
      g.userData.fill = d;
    }
    g.position.set(x, 0.06, z);
    g.userData.mats = [mat, mat2];
    this.scene.add(g);
    return g;
  }

  // k: 0..1 how close the danger is; the fill grows and blinks faster.
  pulse(g, k, t) {
    const [m1, m2] = g.userData.mats;
    const blink = 0.5 + 0.5 * Math.sin(t * (8 + k * 22));
    m1.opacity = 0.12 + k * 0.3 + blink * 0.12;
    m2.opacity = 0.5 + blink * 0.4;
  }

  remove(g) {
    this.scene.remove(g);
    for (const m of g.userData.mats) m.dispose();
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


// ---------- Environment ----------

function propMaker(kind) {
  const mat = (c, e = 0) => lam(c, e ? { emissive: e } : {});
  switch (kind) {
    case 'pines': {
      const m = mat(0x3f6e2f);
      return (s) => {
        const g = new THREE.Group();
        g.add(cyl(0.18 * s, 0.25 * s, 1.2 * s, M.woodDark, 0, 0.6 * s, 0, 6));
        for (let k = 0; k < 3; k++) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry((1.4 - k * 0.3) * s, 1.6 * s, 7), m);
          cone.position.y = (1.5 + k * 0.9) * s;
          g.add(cone);
        }
        return g;
      };
    }
    case 'rocks': {
      const rock = mat(0x3a2a26);
      const lava = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
      return (s) => {
        const g = new THREE.Group();
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1 * s), rock);
        r.position.y = 0.6 * s;
        r.scale.y = 0.7 + Math.random();
        g.add(r);
        const l = ball(0.25 * s, lava, 0.3 * s, 0.2, 0.6 * s);
        g.add(l);
        if (Math.random() < 0.4) {
          const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6 * s, 4 * s, 6), rock);
          spire.position.y = 2 * s;
          g.add(spire);
        }
        return g;
      };
    }
    case 'ice': {
      const ice = new THREE.MeshLambertMaterial({ color: 0xbfe8ff, emissive: 0x204a66 });
      const snow = mat(0xf4f8ff);
      return (s) => {
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.35 * s, (1.6 + Math.random() * 2.2) * s, 5), ice);
          c.position.set(rand(-0.6, 0.6) * s, 1 * s, rand(-0.6, 0.6) * s);
          c.rotation.z = rand(-0.3, 0.3);
          g.add(c);
        }
        const m = ball(0.9 * s, snow, 0, 0, 0);
        m.scale.y = 0.4 * s;
        g.add(m);
        return g;
      };
    }
    case 'cactus': {
      const green = mat(0x5f8a3a);
      const tent = mat(0xd8c090);
      return (s) => {
        const g = new THREE.Group();
        if (Math.random() < 0.5) {
          g.add(cyl(0.22 * s, 0.25 * s, 2.4 * s, green, 0, 1.2 * s, 0, 8));
          for (const sx of [-1, 1]) {
            const arm = cyl(0.14 * s, 0.14 * s, 0.9 * s, green, sx * 0.4 * s, 1.5 * s, 0, 6);
            g.add(arm);
            const link = cyl(0.12 * s, 0.12 * s, 0.4 * s, green, sx * 0.25 * s, 1.1 * s, 0, 6);
            link.rotation.z = Math.PI / 2;
            g.add(link);
          }
        } else {
          const t = new THREE.Mesh(new THREE.ConeGeometry(1.4 * s, 2 * s, 4), tent);
          t.position.y = 1 * s;
          g.add(t);
          g.add(cyl(0.04, 0.04, 2.6 * s, M.woodDark, 0, 1.3 * s, 0, 4));
        }
        return g;
      };
    }
    case 'pillars': {
      const st = mat(0x4a4038);
      const fire = new THREE.MeshBasicMaterial({ color: 0xffa23a });
      return (s) => {
        const g = new THREE.Group();
        g.add(cyl(0.5 * s, 0.6 * s, 7, st, 0, 3.5, 0, 8));
        g.add(box(1.4 * s, 0.4, 1.4 * s, st, 0, 0.2, 0));
        const f = ball(0.22, fire, 0.6 * s, 2.6, 0);
        f.name = 'flame';
        g.add(f);
        return g;
      };
    }
    case 'ruins': {
      const st = mat(0x6e6a62);
      return (s) => {
        const g = new THREE.Group();
        const h = (1 + Math.random() * 3) * s;
        g.add(box(2.2 * s, h, 0.8, st, 0, h / 2, 0));
        const broken = box(0.8 * s, 0.6 * s, 0.6 * s, st, rand(-1, 1), 0.3 * s, 1);
        broken.rotation.y = rand(0, 3);
        g.add(broken);
        return g;
      };
    }
    case 'deadtrees': {
      const bark = mat(0x2a2420);
      const wisp = new THREE.MeshBasicMaterial({ color: 0x9affd0 });
      return (s) => {
        const g = new THREE.Group();
        const t = cyl(0.12 * s, 0.3 * s, 3.5 * s, bark, 0, 1.75 * s, 0, 6);
        t.rotation.z = rand(-0.15, 0.15);
        g.add(t);
        for (let i = 0; i < 3; i++) {
          const b = cyl(0.05 * s, 0.1 * s, 1.4 * s, bark, rand(-0.4, 0.4) * s, (2 + i * 0.5) * s, 0, 5);
          b.rotation.z = rand(-1.2, 1.2);
          g.add(b);
        }
        if (Math.random() < 0.5) {
          const w = ball(0.14, wisp, rand(-1, 1), 2.4 * s, rand(-1, 1));
          w.name = 'flame';
          g.add(w);
        }
        return g;
      };
    }
    case 'gears': {
      const metal = mat(0x5a524a);
      const rust = mat(0x7a4a2a);
      const fire = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
      return (s) => {
        const g = new THREE.Group();
        if (Math.random() < 0.5) {
          g.add(cyl(0.5 * s, 0.7 * s, 6 * s, rust, 0, 3 * s, 0, 8));
          const f = ball(0.3, fire, 0, 6.2 * s, 0);
          f.name = 'flame';
          g.add(f);
        } else {
          const gear = new THREE.Mesh(new THREE.TorusGeometry(1.0 * s, 0.25 * s, 6, 10), metal);
          gear.position.y = 1.3 * s;
          gear.name = 'gear';
          g.add(gear);
          g.add(box(0.3, 1.3 * s, 0.3, metal, 0, 0.65 * s, 0));
        }
        return g;
      };
    }
    default:
      return () => new THREE.Group();
  }
}

export function buildEnvironment(scene) {
  const env = { props: [], sets: {}, tex: {}, scene, biome: null };
  env.skyCanvas = document.createElement('canvas');
  env.skyCanvas.width = 8;
  env.skyCanvas.height = 256;
  env.skyTex = new THREE.CanvasTexture(env.skyCanvas);
  env.skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = env.skyTex;
  scene.fog = new THREE.Fog(0xf0c590, 38, 112);

  env.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6b5a3c, 1.0);
  scene.add(env.hemi);
  env.sun = new THREE.DirectionalLight(0xffe0b0, 2.0);
  env.sun.position.set(-6, 14, 8);
  scene.add(env.sun);

  const len = 190;
  env.pathTile = 8;
  env.grassTile = 10;
  env.pathMat = new THREE.MeshLambertMaterial();
  const path = new THREE.Mesh(new THREE.PlaneGeometry(9, len), env.pathMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0, -len / 2 + 22);
  scene.add(path);
  env.groundMat = new THREE.MeshLambertMaterial();
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(100, len), env.groundMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, -0.04, -len / 2 + 22);
  scene.add(grass);
  env.len = len;

  env.wallMat = new THREE.MeshLambertMaterial({ map: M.stone.map });
  const span = 144;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 24; i++) {
      const g = new THREE.Group();
      g.add(box(0.9, 0.9, 6, env.wallMat, 0, 0.45, 0));
      for (const z of [-2.2, 0, 2.2]) g.add(box(0.9, 0.35, 1.2, env.wallMat, 0, 1.05, z));
      g.position.set(side * 4.9, 0, 22 - i * 6);
      scene.add(g);
      env.props.push({ obj: g, span });
    }
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      g.add(cyl(0.08, 0.1, 2.6, M.woodDark, 0, 1.3, 0, 6));
      const flame = ball(0.18, new THREE.MeshBasicMaterial({ color: 0xffa23a }), 0, 2.75, 0);
      g.add(flame);
      const flag = box(0.04, 0.6, 0.9, M.cloth, 0, 2.1, 0.5);
      g.add(flag);
      g.position.set(side * 4.9, 0.9, 20 - i * 12 - (side > 0 ? 6 : 0));
      scene.add(g);
      env.props.push({ obj: g, span, flame });
    }
  }

  env.castleMat = new THREE.MeshLambertMaterial({ map: M.stone.map });
  const castle = new THREE.Group();
  castle.add(box(46, 9, 4, env.castleMat, 0, 4.5, 0));
  for (let i = -10; i <= 10; i++) castle.add(box(1.6, 1.4, 1.6, env.castleMat, i * 2.2, 9.7, 0));
  env.roofMat = lam(0xb8342b);
  for (const x of [-22, -11, 11, 22]) {
    castle.add(cyl(2.4, 2.8, 15, env.castleMat, x, 7.5, 0, 10));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4.5, 10), env.roofMat);
    roof.position.set(x, 17.2, 0);
    castle.add(roof);
  }
  castle.add(box(9, 14, 5, env.castleMat, 0, 7, 0));
  castle.add(box(4, 6, 0.5, M.woodDark, 0, 3, 2.4));
  castle.position.set(0, 0, -102);
  scene.add(castle);
  env.castle = castle;
  applyBiome(env, 'courtyard');
  return env;
}

function propSet(env, kind) {
  if (env.sets[kind]) return env.sets[kind];
  const make = propMaker(kind);
  const list = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const s = 0.8 + Math.random() * 0.8;
      const g = make(s);
      g.position.set(side * (7 + Math.random() * 14), 0, 24 - i * 9 - Math.random() * 6);
      g.rotation.y = Math.random() * 6;
      g.visible = false;
      env.scene.add(g);
      const flame = g.getObjectByName('flame');
      const gear = g.getObjectByName('gear');
      const p = { obj: g, span: 144, flame, gear };
      list.push(p);
      env.props.push(p);
    }
  }
  env.sets[kind] = list;
  return list;
}

export function applyBiome(env, id) {
  const b = BIOMES[id];
  if (!b) return;
  env.biome = id;
  const g = env.skyCanvas.getContext('2d');
  drawSky(g, 8, 256, b.sky);
  env.skyTex.needsUpdate = true;
  env.scene.fog.color.setHex(b.fog);
  env.scene.fog.near = b.fogNear;
  env.scene.fog.far = b.fogFar;
  env.baseFog = [b.fogNear, b.fogFar];
  env.hemi.color.setHex(b.hemi[0]);
  env.hemi.groundColor.setHex(b.hemi[1]);
  env.hemi.intensity = b.hemi[2];
  env.sun.color.setHex(b.sun[0]);
  env.sun.intensity = b.sun[1];
  env.baseLight = [b.hemi[2], b.sun[1]];
  if (!env.tex[id]) {
    const path = stoneTexture(b.stone);
    path.repeat.set(1, env.len / env.pathTile);
    const ground = canvasTex(256, 256, (gg, w, h) => drawGround(gg, w, h, b.ground));
    ground.repeat.set(10, env.len / env.grassTile);
    env.tex[id] = { path, ground };
  }
  const t = env.tex[id];
  if (env.pathMat.map) {
    t.path.offset.y = env.pathMat.map.offset.y;
    t.ground.offset.y = env.groundMat.map.offset.y;
  }
  env.pathMat.map = t.path;
  env.groundMat.map = t.ground;
  env.pathMat.needsUpdate = true;
  env.groundMat.needsUpdate = true;
  env.wallMat.color.setHex(b.wall);
  env.castleMat.color.setHex(b.wall);
  env.roofMat.color.setHex(id === 'frozen' ? 0x6a8ab8 : id === 'forest' ? 0x3a4a3a : id === 'factory' ? 0x4a4440 : 0xb8342b);
  for (const k of Object.keys(env.sets)) for (const p of env.sets[k]) p.obj.visible = false;
  for (const p of propSet(env, b.props)) p.obj.visible = true;
  setDarkness(env, 0);
}

// 0 = normal lighting, 1 = full night (dark battlefield)
export function setDarkness(env, k) {
  env.dark = k;
  const [h, s] = env.baseLight || [1, 2];
  env.hemi.intensity = h * (1 - 0.75 * k);
  env.sun.intensity = s * (1 - 0.8 * k);
  const [n, f] = env.baseFog || [38, 112];
  env.scene.fog.near = n * (1 - 0.6 * k);
  env.scene.fog.far = f * (1 - 0.45 * k);
}

export function updateEnvironment(env, dt, speed, t) {
  env.pathMat.map.offset.y += (speed * dt) / env.pathTile;
  env.groundMat.map.offset.y += (speed * dt) / env.grassTile;
  for (const p of env.props) {
    if (!p.obj.visible) continue;
    p.obj.position.z += speed * dt;
    if (p.obj.position.z > 24) p.obj.position.z -= p.span;
    if (p.flame) p.flame.scale.setScalar((0.85 + Math.sin(t * 14 + p.obj.position.z) * 0.2) * (p.flame.userData.s || 1));
    if (p.gear) p.gear.rotation.z += dt * 0.8;
  }
}

// ---------- Pickups (power orbs, gold piles, hearts) ----------

export function buildPickup(type, color = 0xffe27a, text = '') {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  const mats = [];
  if (type === 'gold') {
    for (let i = 0; i < 5; i++) {
      const c = cyl(0.24, 0.24, 0.07, M.gold, rand(-0.25, 0.25), 0.1 + i * 0.07, rand(-0.25, 0.25), 12);
      spin.add(c);
    }
    spin.add(ball(0.16, M.gold, 0, 0.5, 0));
  } else if (type === 'heart') {
    const m = new THREE.MeshBasicMaterial({ color: 0xff3a5a });
    mats.push(m);
    const a = ball(0.24, m, -0.16, 0.9, 0);
    const b = ball(0.24, m, 0.16, 0.9, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 4), m);
    tip.rotation.z = Math.PI;
    tip.position.y = 0.62;
    spin.add(a, b, tip);
  } else {
    const m = new THREE.MeshBasicMaterial({ color });
    mats.push(m);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), m);
    core.position.y = 1.0;
    spin.add(core);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    mats.push(ringMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 24), ringMat);
    ring.position.y = 1.0;
    ring.rotation.x = Math.PI / 2;
    spin.add(ring);
  }
  const glowMat = new THREE.SpriteMaterial({ map: M.glowTex, color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  mats.push(glowMat);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(type === 'orb' ? 2.6 : 1.6);
  glow.position.y = type === 'orb' ? 1.0 : 0.5;
  group.add(glow);
  // Ground beacon so it reads as "drive here".
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  mats.push(beamMat);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 12, 1, true), beamMat);
  beam.position.y = 2;
  if (type === 'orb') group.add(beam);
  let label = null;
  if (text) {
    label = makeLabel();
    drawLabel(label, text, '#ffffff');
    label.sprite.position.set(0, 2.1, 0);
    label.sprite.scale.set(2.2, 1.1, 1);
    group.add(label.sprite);
  }
  return { group, spin, mats, label };
}

export function disposePickup(p) {
  for (const m of p.mats) m.dispose();
  if (p.label) {
    p.label.tex.dispose();
    p.label.sprite.material.dispose();
  }
  disposeTree(p.group);
}
