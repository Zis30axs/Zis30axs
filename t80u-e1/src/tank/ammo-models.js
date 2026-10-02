// 弹丸与发射药筒模型。弹丸沿 +X，弹底在 x=0，弹尖在 x=L；药筒沿 +X，前端在 x=0，金属底托在末端。
import * as THREE from 'three';
import { AMMO } from '../data/ammo.js';
import { LOADER } from './dims.js';
import { latheX, cylX, merge, place } from './geom.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const matCache = new Map();
function mat(key, opts) {
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial(opts));
  return matCache.get(key);
}

const bandMat = (id) => mat('band-' + id, { color: AMMO[id].color, roughness: 0.5, metalness: 0.2, emissive: AMMO[id].color, emissiveIntensity: 0.25 });

function fins(count, x0, len, rIn, rOut, thick, m) {
  const g = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const f = new THREE.BoxGeometry(len, rOut - rIn, thick);
    f.translate(x0 + len / 2, (rIn + rOut) / 2, 0);
    f.rotateX(a);
    g.push(f);
  }
  return new THREE.Mesh(merge(g), m);
}

function apfsds(id) {
  const a = AMMO[id];
  const L = a.length;
  const g = new THREE.Group();
  const rodMat = id === '3BM46' ? mat('du', { color: 0x3b3c3a, roughness: 0.35, metalness: 0.9 }) : mat('wa', { color: 0x9a9c9e, roughness: 0.3, metalness: 0.95 });
  const sabotMat = mat('sabot', { color: 0x5b5e5a, roughness: 0.45, metalness: 0.75, side: THREE.DoubleSide });
  const finMat = mat('fin', { color: 0x2e302d, roughness: 0.5, metalness: 0.6 });
  const rod = new THREE.Mesh(cylX(0.015, 0.015, L - 0.07, 12), rodMat);
  rod.position.x = 0.02 + (L - 0.07) / 2;
  g.add(rod);
  const cap = new THREE.Mesh(latheX([[L - 0.055, 0.016], [L - 0.02, 0.01], [L, 0.002]], 12), finMat);
  g.add(cap);
  g.add(fins(6, 0.0, 0.075, 0.012, 0.05, 0.004, finMat));
  // 三瓣式弹托
  const s0 = L * 0.18, s1 = L * 0.56;
  const prof = [
    [s0, 0.016],
    [s0 + 0.02, 0.05],
    [s0 + 0.06, 0.0625],
    [s0 + (s1 - s0) * 0.55, 0.0625],
    [s0 + (s1 - s0) * 0.72, 0.052],
    [s1 - 0.015, 0.035],
    [s1, 0.016],
  ];
  const petals = [];
  for (let k = 0; k < 3; k++) {
    const phi0 = (k * 2 * Math.PI) / 3 + 0.03;
    const geo = latheX(prof, 12, phi0, (2 * Math.PI) / 3 - 0.06);
    const p = new THREE.Mesh(geo, sabotMat);
    p.userData.petalAngle = phi0 + Math.PI / 3;
    g.add(p);
    petals.push(p);
  }
  const band = new THREE.Mesh(cylX(0.0632, 0.0632, 0.025, 24), bandMat(id));
  band.position.x = s0 + (s1 - s0) * 0.35;
  g.add(band);
  petals.push(band);
  g.petals = petals; // 注意：不放进 userData，避免 clone 时被 JSON 序列化
  return g;
}

function heat(id) {
  const L = AMMO[id].length;
  const body = mat('heatBody', { color: 0x30332f, roughness: 0.55, metalness: 0.5 });
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      latheX(
        [
          [0, 0.0001],
          [0, 0.038],
          [0.13, 0.038],
          [0.14, 0.0625],
          [0.34, 0.0625],
          [0.52, 0.034],
          [0.56, 0.022],
          [L - 0.02, 0.018],
          [L, 0.0001],
        ],
        24,
      ),
      body,
    ),
  );
  g.add(fins(6, 0.005, 0.12, 0.03, 0.058, 0.006, mat('finDark', { color: 0x1f201e, roughness: 0.6, metalness: 0.5 })));
  const band = new THREE.Mesh(cylX(0.0635, 0.0635, 0.03, 24), bandMat(id));
  band.position.x = 0.25;
  g.add(band);
  return g;
}

function he(id) {
  const L = AMMO[id].length;
  const body = mat('heBody', { color: 0x59603f, roughness: 0.6, metalness: 0.35 });
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      latheX(
        [
          [0, 0.0001],
          [0, 0.038],
          [0.12, 0.038],
          [0.13, 0.0625],
          [0.42, 0.0625],
          [0.52, 0.055],
          [0.6, 0.035],
          [0.64, 0.02],
          [L, 0.006],
          [L, 0.0001],
        ],
        24,
      ),
      body,
    ),
  );
  g.add(fins(6, 0.005, 0.11, 0.03, 0.058, 0.006, mat('finDark', { color: 0x1f201e, roughness: 0.6, metalness: 0.5 })));
  const band = new THREE.Mesh(cylX(0.0635, 0.0635, 0.03, 24), bandMat(id));
  band.position.x = 0.3;
  g.add(band);
  return g;
}

function atgm(id) {
  const L = AMMO[id].length;
  const body = mat('atgmBody', { color: 0x3d4a33, roughness: 0.55, metalness: 0.35 });
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      latheX(
        [
          [0, 0.0001],
          [0, 0.055],
          [0.03, 0.0625],
          [0.45, 0.0625],
          [0.58, 0.036],
          [0.6, 0.026],
          [L - 0.015, 0.024],
          [L, 0.0001],
        ],
        24,
      ),
      body,
    ),
  );
  // 折叠鸭翼
  const canard = mat('canard', { color: 0x262a22, roughness: 0.6, metalness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.004, 0.035), canard);
    c.position.set(0.5, 0, 0);
    const piv = new THREE.Group();
    piv.rotation.x = (i / 4) * Math.PI * 2 + Math.PI / 4;
    c.position.y = 0.058;
    piv.add(c);
    g.add(piv);
  }
  const band = new THREE.Mesh(cylX(0.0635, 0.0635, 0.03, 24), bandMat(id));
  band.position.x = 0.18;
  g.add(band);
  return g;
}

export function projectileMesh(id) {
  const a = AMMO[id];
  let g;
  if (a.kind === 'ke') g = apfsds(id);
  else if (a.kind === 'heat') g = heat(id);
  else if (a.kind === 'he') g = he(id);
  else g = atgm(id);
  g.userData.ammo = id;
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.userData.ammoPart = 'projectile';
    }
  });
  return g;
}

/** 可燃药筒 + 金属底托（导弹为二级：抛射装药） */
export function chargeMesh(id) {
  const Lc = LOADER.chargeLen, r = LOADER.chargeR;
  const g = new THREE.Group();
  const isAtgm = AMMO[id]?.atgm;
  const caseMat = isAtgm ? mat('atgmCase', { color: 0x6b6f62, roughness: 0.8, metalness: 0.1 }) : mat('chargeCase', { color: 0xb3a077, roughness: 0.85, metalness: 0 });
  const body = new THREE.Mesh(latheX([[0, 0.0001], [0, r * 0.82], [0.03, r * 0.96], [Lc - 0.07, r], [Lc - 0.07, 0.0001]], 20), caseMat);
  g.add(body);
  const stub = stubMesh();
  stub.position.x = Lc - 0.07;
  g.add(stub);
  const band = new THREE.Mesh(cylX(r + 0.002, r + 0.002, 0.03, 20), bandMat(id));
  band.position.x = 0.12;
  g.add(band);
  g.stub = stub;
  g.caseMeshes = [body, band];
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.userData.ammoPart = 'charge';
    }
  });
  return g;
}

let stubGeo = null;
/** 药筒金属底托（残底），沿 +X，长 0.07 */
export function stubMesh() {
  if (!stubGeo) {
    const r = LOADER.chargeR;
    stubGeo = merge([
      latheX([[0, 0.0001], [0, r * 0.98], [0.055, r * 1.0], [0.058, r * 1.05], [0.07, r * 1.05], [0.07, 0.0001]], 20),
      place(cylX(0.012, 0.012, 0.01, 10), { pos: [0.074, 0, 0] }),
    ]);
  }
  const m = new THREE.Mesh(stubGeo, mat('stub', { color: 0x8a7446, roughness: 0.35, metalness: 0.85 }));
  m.castShadow = true;
  return m;
}

// —— 静态合并版本（顶点色、单个网格），用于转盘和弹架中的大量弹药，减少绘制调用 ——
const staticGeoCache = new Map();
let staticMat = null;
export function staticRoundMaterial() {
  if (!staticMat) staticMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.45 });
  return staticMat;
}

function bakeGroup(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const col = o.material.color.clone();
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(arr, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    parts.push(g);
  });
  const out = mergeGeometries(parts, false);
  out.computeBoundingSphere();
  return out;
}

/** kind: 'p' 弹丸 | 'c' 药筒；返回共享几何与材质的单网格 */
export function staticRound(kind, id) {
  const key = kind + id;
  if (!staticGeoCache.has(key)) staticGeoCache.set(key, bakeGroup(kind === 'p' ? projectileMesh(id) : chargeMesh(id)));
  const m = new THREE.Mesh(staticGeoCache.get(key), staticRoundMaterial());
  m.userData.ammoPart = kind === 'p' ? 'projectile' : 'charge';
  return m;
}
