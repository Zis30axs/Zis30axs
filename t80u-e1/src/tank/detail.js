// 细节批处理：把大量静态小零件（螺栓、把手、铰链、线缆……）按材质合并成少数几个网格，
// 在增加细节的同时控制绘制调用数量。另含管线、把手等常用细节几何。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export function toMatrix(t) {
  if (!t) return new THREE.Matrix4();
  if (t.isMatrix4) return t;
  _p.set(...(t.pos || [0, 0, 0]));
  if (t.quat) _q.copy(t.quat);
  else _q.setFromEuler(_e.set(...(t.rot || [0, 0, 0])));
  const sc = t.scale ?? [1, 1, 1];
  if (typeof sc === 'number') _s.set(sc, sc, sc);
  else _s.set(...sc);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

function normalizeAttrs(g) {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.clearGroups();
  g.morphAttributes = {};
  return g;
}

export class Batch {
  constructor() {
    this.byMat = new Map();
  }

  /** 加入一个零件：geo 会被复制并按 t（{pos, rot, quat, scale} 或 Matrix4）变换 */
  add(geo, mat, t) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(toMatrix(t));
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(normalizeAttrs(g));
    return this;
  }

  /** 合并并加入 parent，返回生成的网格 */
  build(parent, { cast = true, receive = true, name = 'details' } = {}) {
    const out = [];
    for (const [mat, list] of this.byMat) {
      if (!list.length) continue;
      const geo = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      parent.add(mesh);
      out.push(mesh);
    }
    this.byMat.clear();
    return out;
  }
}

/** 沿若干点的圆管（线缆、扶手、油管） */
export function tube(points, r, { segments, radial = 6, closed = false, tension = 0.5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed, 'catmullrom', tension);
  return new THREE.TubeGeometry(curve, segments ?? Math.max(8, points.length * 6), r, radial, closed);
}

/**
 * 弯管把手：从 a 到 b，沿 up 方向抬高 h。
 */
export function handle(a, b, up, h = 0.06, r = 0.012) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), U = new THREE.Vector3(...up).normalize();
  const A1 = A.clone().addScaledVector(U, h), B1 = B.clone().addScaledVector(U, h);
  const d = B.clone().sub(A).multiplyScalar(0.12);
  return tube([A, A1.clone().add(d.clone().multiplyScalar(0.2)), A1.clone().add(d), B1.clone().sub(d), B1.clone().sub(d.clone().multiplyScalar(0.2)), B], r, { segments: 24, radial: 6, tension: 0.2 });
}

/** 六角螺栓头（沿 +Y） */
let _bolt = null;
export function boltGeo(r = 0.016, h = 0.014) {
  if (r === 0.016 && h === 0.014 && _bolt) return _bolt;
  const g = new THREE.CylinderGeometry(r, r, h, 6);
  g.translate(0, h / 2, 0);
  if (r === 0.016 && h === 0.014) _bolt = g;
  return g;
}

/** 把一个沿 +Y 的零件对齐到法线 n 并放在 p 处 */
export function alignY(p, n, { spin = 0, scale = 1 } = {}) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
  return new THREE.Matrix4().compose(p.clone(), q, new THREE.Vector3(scale, scale, scale));
}

/** 由三个正交轴与中心构造变换 */
export function basis(X, Y, Z, pos) {
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  m.setPosition(pos);
  return m;
}
