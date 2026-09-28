// 几何辅助函数：装甲板、放样（铸造炮塔）、履带包络路径等。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3();

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * 由一个平面多边形（外表面，3D 顶点）沿法线向内挤出厚度，得到封闭的板状实体。
 * @param {THREE.Vector3[]} pts 外表面多边形顶点（共面）
 * @param {THREE.Vector3} outward 外法线
 * @param {number} t 厚度（米）
 * @param {{center: THREE.Vector3, r: number}[]} holes 圆孔（圆心在板平面上）
 */
export function plateGeometry(pts, outward, t, holes = []) {
  const N = outward.clone().normalize();
  const O = pts[0].clone();
  const U = pts[1].clone().sub(pts[0]);
  U.addScaledVector(N, -U.dot(N)).normalize();
  const V = new THREE.Vector3().crossVectors(N, U); // U × V = N，保持右手系
  const to2 = (p) => {
    _v.copy(p).sub(O);
    return new THREE.Vector2(_v.dot(U), _v.dot(V));
  };
  const shape = new THREE.Shape(pts.map(to2));
  for (const h of holes) {
    const c = to2(h.center);
    const path = new THREE.Path();
    path.absarc(c.x, c.y, h.r, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 40 });
  const m = new THREE.Matrix4().makeBasis(U, V, N);
  m.setPosition(O.clone().addScaledVector(N, -t));
  geo.applyMatrix4(m);
  geo.computeBoundingSphere();
  return geo;
}

/** 侧视轮廓（XY 平面多边形）在 z∈[z0,z1] 之间挤出。 */
export function profileExtrude(pointsXY, z0, z1) {
  const shape = new THREE.Shape(pointsXY.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false });
  geo.translate(0, 0, z0);
  return geo;
}

/** 以方向向量构造的长方体（中心、尺寸、朝向四元数）。 */
export function boxGeo(sx, sy, sz) {
  return new THREE.BoxGeometry(sx, sy, sz);
}

/** 沿 X 轴的圆柱（Three 默认沿 Y）。 */
export function cylX(r0, r1, len, seg = 24, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);
  g.rotateZ(-Math.PI / 2); // +Y → +X；r0 在 -X 端，r1 在 +X 端
  return g;
}

/** 沿 Z 轴的圆柱。 */
export function cylZ(r, len, seg = 24) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

/** 以 [x, r] 剖面沿 X 轴旋转成形（x 为轴向坐标）。 */
export function latheX(profile, seg = 32, phiStart = 0, phiLength = Math.PI * 2) {
  const pts = profile.map(([x, r]) => new THREE.Vector2(Math.max(r, 0.0001), x));
  const g = new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
  g.rotateZ(-Math.PI / 2); // 旋转轴 +Y → +X
  return g;
}

/** 合并若干几何体（已各自变换好）。 */
export function merge(geos) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  // 统一属性集合，避免 merge 失败
  for (const g of list) {
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    }
    g.clearGroups();
  }
  const out = mergeGeometries(list, false);
  out.computeBoundingSphere();
  return out;
}

/** 变换几何体的便捷函数。 */
export function place(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  geo.applyMatrix4(m);
  return geo;
}

/**
 * 放样：在若干层闭合轮廓之间生成侧面，可选顶盖。
 * 每个三角面通过 zoneOf(centroid, normal) 获得装甲分区编号，并写入几何分组（materialIndex = 分区序号）。
 * @returns {{geometry: THREE.BufferGeometry, zones: string[]}}
 */
export function loftGeometry(rings, { capTop = true, zoneOf = () => 'default' } = {}) {
  const n = rings[0].length;
  const positions = [];
  const tris = []; // {a,b,c,zone}
  for (const ring of rings) for (const p of ring) positions.push(p.x, p.y, p.z);
  const idx = (j, i) => j * n + (i % n);

  // 判断侧面朝向：检查第一个四边形法线是否朝外
  const p0 = rings[0][0], p1 = rings[0][1], p2 = rings[1][1];
  const nrm = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  const center = new THREE.Vector3();
  for (const p of rings[0]) center.add(p);
  center.divideScalar(n);
  const outwardOK = nrm.dot(new THREE.Vector3().subVectors(p0, center)) > 0;

  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
  const faceInfo = (a, b, c) => {
    tmpA.fromArray(positions, a * 3);
    tmpB.fromArray(positions, b * 3);
    tmpC.fromArray(positions, c * 3);
    const cen = new THREE.Vector3().add(tmpA).add(tmpB).add(tmpC).divideScalar(3);
    const nn = new THREE.Vector3().subVectors(tmpB, tmpA).cross(new THREE.Vector3().subVectors(tmpC, tmpA)).normalize();
    return [cen, nn];
  };
  const pushTri = (a, b, c) => {
    const [cen, nn] = faceInfo(a, b, c);
    tris.push({ a, b, c, zone: zoneOf(cen, nn) });
  };

  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = idx(j, i), b = idx(j, i + 1), c = idx(j + 1, i + 1), d = idx(j + 1, i);
      if (outwardOK) {
        pushTri(a, b, c);
        pushTri(a, c, d);
      } else {
        pushTri(a, c, b);
        pushTri(a, d, c);
      }
    }
  }

  if (capTop) {
    const top = rings[rings.length - 1];
    const base = positions.length / 3;
    for (const p of top) positions.push(p.x, p.y, p.z);
    const contour = top.map((p) => new THREE.Vector2(p.x, p.z));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [a, b, c] of faces) {
      // 顶盖法线应朝 +Y
      const A = top[a], B = top[b], C = top[c];
      const ny = (B.z - A.z) * (C.x - A.x) - (B.x - A.x) * (C.z - A.z);
      if (ny > 0) pushTri(base + a, base + b, base + c);
      else pushTri(base + a, base + c, base + b);
    }
  }

  // 按分区排序并建立分组
  const zones = [...new Set(tris.map((t) => t.zone))];
  const index = [];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  let start = 0;
  zones.forEach((z, zi) => {
    const list = tris.filter((t) => t.zone === z);
    for (const t of list) index.push(t.a, t.b, t.c);
    geo.addGroup(start, list.length * 3, zi);
    start += list.length * 3;
  });
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return { geometry: geo, zones };
}

/**
 * 计算闭合平面曲线（x,z）的外法线（2D）。
 */
export function outlineNormals(pts2) {
  const n = pts2.length;
  // 判断方向（面积符号）
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts2[i], b = pts2[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  const sign = area > 0 ? 1 : -1;
  return pts2.map((p, i) => {
    const a = pts2[(i - 1 + n) % n], b = pts2[(i + 1) % n];
    const tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    // CCW(面积>0) 时右法线朝外
    return new THREE.Vector2((ty / len) * sign, (-tx / len) * sign);
  });
}

/**
 * 履带包络：给定按逆时针（XY 平面，从 +Z 看）排列的圆（轮），
 * 计算外公切线 + 圆弧组成的闭合路径，返回可按弧长取点的对象。
 */
export function beltPath(circles) {
  const segs = [];
  const n = circles.length;
  const tang = [];
  for (let i = 0; i < n; i++) {
    const A = circles[i], B = circles[(i + 1) % n];
    const dx = B.x - A.x, dy = B.y - A.y;
    const L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L;
    const rx = uy, ry = -ux; // 右法线（逆时针路径的外侧）
    const s = (A.r - B.r) / L;
    const c = Math.sqrt(Math.max(0, 1 - s * s));
    const nx = c * rx + s * ux, ny = c * ry + s * uy;
    tang.push({
      a: new THREE.Vector2(A.x + A.r * nx, A.y + A.r * ny),
      b: new THREE.Vector2(B.x + B.r * nx, B.y + B.r * ny),
    });
  }
  for (let i = 0; i < n; i++) {
    const C = circles[i];
    const arrive = tang[(i - 1 + n) % n].b; // 到达此圆的切点
    const depart = tang[i].a; // 离开此圆的切点
    let a0 = Math.atan2(arrive.y - C.y, arrive.x - C.x);
    let a1 = Math.atan2(depart.y - C.y, depart.x - C.x);
    while (a1 < a0 - 1e-6) a1 += Math.PI * 2;
    if (a1 - a0 > 1e-4) segs.push({ type: 'arc', c: C, a0, a1, len: C.r * (a1 - a0) });
    const t = tang[i];
    segs.push({ type: 'line', a: t.a, b: t.b, len: t.a.distanceTo(t.b) });
  }
  const total = segs.reduce((s, g) => s + g.len, 0);
  return {
    total,
    /** 按弧长 s 取点与切向（均为 2D） */
    at(s) {
      s = ((s % total) + total) % total;
      for (const g of segs) {
        if (s <= g.len) {
          if (g.type === 'line') {
            const k = s / g.len;
            const p = new THREE.Vector2().lerpVectors(g.a, g.b, k);
            const tdir = new THREE.Vector2().subVectors(g.b, g.a).normalize();
            return { p, t: tdir };
          }
          const ang = g.a0 + s / g.c.r;
          const p = new THREE.Vector2(g.c.x + g.c.r * Math.cos(ang), g.c.y + g.c.r * Math.sin(ang));
          const tdir = new THREE.Vector2(-Math.sin(ang), Math.cos(ang));
          return { p, t: tdir };
        }
        s -= g.len;
      }
      const g = segs[0];
      return { p: g.type === 'line' ? g.a.clone() : new THREE.Vector2(g.c.x, g.c.y), t: new THREE.Vector2(1, 0) };
    },
  };
}

/** 圆角盒（用于储物箱等）。 */
export { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
