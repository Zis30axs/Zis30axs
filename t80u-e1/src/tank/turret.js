// 炮塔：放样生成的铸造炮塔外壳（按方位分装甲区；圆角肩部、铸造表面），“接触-5”马蹄形楔形反应装甲与顶部反应块，
// T-80UD 式车长指挥塔（TKN-4S 观瞄、OU-3GA2M 红外灯、遥控 NSVT 机枪）、1G46 瞄准镜装甲罩与热像仪、
// 902B 烟幕弹发射器、尾舱储物箱、潜渡筒、篷布卷、天线与风传感器等。
// 坐标为炮塔坐标系（原点在座圈中心、车体顶甲平面），x 向前、y 向上、z 向右。
import * as THREE from 'three';
import { loftGeometry, outlineNormals, V3, cylX, cylZ, latheX, merge, RoundedBoxGeometry } from './geom.js';
import { Batch, tube, handle, boltGeo, alignY, basis } from './detail.js';
import { rod } from './hull.js';
import { mk, group } from './registry.js';

const UP = V3(0, 1, 0);

// 炮塔基准轮廓（右半边，从正前方到正后方），x 向前、z 向右
const OUTLINE_R = [
  [1.1, 0.0],
  [1.12, 0.28],
  [1.08, 0.6],
  [0.88, 0.98],
  [0.52, 1.2],
  [0.0, 1.27],
  [-0.55, 1.2],
  [-1.05, 0.98],
  [-1.42, 0.62],
  [-1.6, 0.25],
  [-1.63, 0.0],
];

export const TURRET_ROOF_Y = 0.78;

// 放样截面：高度 y 与内收量（正面, 侧面, 后部）；最上面三层构成铸造炮塔的圆角肩部
const RING_DEFS = [
  [-0.03, [0.1, 0.1, 0.1]],
  [0.06, [0.04, 0.035, 0.035]],
  [0.2, [0.0, 0.0, 0.0]],
  [0.42, [0.1, 0.03, 0.025]],
  [0.6, [0.2, 0.08, 0.07]],
  [0.7, [0.27, 0.13, 0.11]],
  [0.755, [0.325, 0.18, 0.155]],
  [TURRET_ROOF_Y, [0.37, 0.215, 0.19]],
];

function baseOutline(n = 120) {
  const pts = [];
  const k = 1.04;
  for (const [x, z] of OUTLINE_R) pts.push(new THREE.Vector3(x * k, 0, z * k));
  for (let i = OUTLINE_R.length - 2; i >= 1; i--) pts.push(new THREE.Vector3(OUTLINE_R[i][0] * k, 0, -OUTLINE_R[i][1] * k));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return curve.getSpacedPoints(n).slice(0, n).map((p) => new THREE.Vector2(p.x, p.z));
}

/** 按方位角（0° 为正前、90° 为右侧）返回内收量插值 */
function insetAt(phiDeg, front, side, rear) {
  const a = Math.abs(phiDeg);
  if (a < 50) return front;
  if (a < 90) return front + ((side - front) * (a - 50)) / 40;
  if (a < 140) return side;
  if (a < 180) return side + ((rear - side) * (a - 140)) / 40;
  return rear;
}

export function turretZoneOf(cen, nrm) {
  if (nrm.y > 0.8) return 'turret_roof';
  const phi = (Math.atan2(cen.z, cen.x) * 180) / Math.PI;
  const a = Math.abs(phi);
  if (a < 10) return 'turret_front_center';
  if (a < 58) return 'turret_cheek';
  if (a < 105) return 'turret_side_front';
  if (a < 150) return 'turret_side_rear';
  return 'turret_rear';
}

let _rings = null;
function turretRings() {
  if (!_rings) {
    const base = baseOutline(120);
    const normals = outlineNormals(base);
    _rings = RING_DEFS.map(([y, [f, s, r]]) =>
      base.map((p, i) => {
        const ins = insetAt((Math.atan2(p.y, p.x) * 180) / Math.PI, f, s, r);
        return new THREE.Vector3(p.x - normals[i].x * ins, y, p.y - normals[i].y * ins);
      }),
    );
  }
  return _rings;
}

// —— 炮塔外表面查询：让附件贴合铸造曲面 ——
const _sections = new Map();
/** 高度 y 处的水平截面（闭合折线，Vector2(x, z)） */
function sectionAt(y) {
  const key = Math.round(y * 1e4);
  let sec = _sections.get(key);
  if (sec) return sec;
  const rings = turretRings();
  const yy = THREE.MathUtils.clamp(y, rings[0][0].y, rings[rings.length - 1][0].y);
  let j = 0;
  while (j < rings.length - 2 && yy > rings[j + 1][0].y) j++;
  const a = rings[j], b = rings[j + 1];
  const k = (yy - a[0].y) / (b[0].y - a[0].y);
  sec = a.map((p, i) => new THREE.Vector2(p.x + (b[i].x - p.x) * k, p.z + (b[i].z - p.z) * k));
  _sections.set(key, sec);
  return sec;
}

/** 截面内从 (px, pz) 沿单位方向 (dx, dz) 到轮廓的最近距离；未命中返回 null */
function raySection(sec, px, pz, dx, dz) {
  let best = null;
  for (let i = 0; i < sec.length; i++) {
    const a = sec[i], b = sec[(i + 1) % sec.length];
    const ex = b.x - a.x, ez = b.y - a.y;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = a.x - px, wz = a.y - pz;
    const t = (wx * ez - wz * ex) / den;
    const u = (wx * dz - wz * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}

/** 侧面外表面的 z（side = ±1） */
function sideZ(x, y, side) {
  return side * (3 - raySection(sectionAt(y), x, side * 3, 0, -side));
}
/** 尾部外表面的 x */
function rearX(z, y) {
  return -3 + raySection(sectionAt(y), -3, z, 1, 0);
}
/** 沿侧面的切线方向对应的偏航角（让长方体局部 x 轴贴着侧面） */
function sideYaw(x, y, side) {
  const dz = sideZ(x + 0.05, y, side) - sideZ(x - 0.05, y, side);
  return Math.atan2(-dz, 0.1);
}
/** 方位角 phi（弧度，0 为正前、正值向右）上的截面边缘点，可向内收 inset */
function edgeAt(y, phi, inset = 0) {
  const c = Math.cos(phi), s = Math.sin(phi);
  const t = raySection(sectionAt(y), 0, 0, c, s) - inset;
  return new THREE.Vector2(c * t, s * t);
}

// —— 几何辅助 ——
/** 由 8 个顶点（0-3 底面、4-7 顶面，顺序对应）构成的六面体，法线自动朝外 */
function hexaGeo(v) {
  const faces = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  const cen = v.reduce((s, p) => s.add(p), V3(0, 0, 0)).multiplyScalar(1 / v.length);
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), fc = new THREE.Vector3();
  const pos = [];
  for (const f of faces) {
    const [a, b, c, d] = f.map((i) => v[i]);
    fc.copy(a).add(b).add(c).add(d).multiplyScalar(0.25);
    n.crossVectors(e1.subVectors(c, a), e2.subVectors(d, b));
    const q = n.dot(fc.sub(cen)) > 0 ? [a, b, c, d] : [a, d, c, b];
    for (const p of [q[0], q[1], q[2], q[0], q[2], q[3]]) pos.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** 侧视轮廓（XY）在 z0..z1 间挤出，带小倒角 */
function profileSlab(pts, z0, z1, b = 0.008) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0 - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, z0 + b);
  return g;
}

/** 俯视轮廓（[x, z]）从 yTop 向下挤出高度 h，带小倒角 */
function slabXZ(pts, yTop, h, b = 0.012) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, b);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(V3(1, 0, 0), V3(0, 0, 1), V3(0, -1, 0)));
  g.translate(0, yTop, 0);
  return g;
}

const lathe = (pts, seg = 36) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// ———————————————————— 炮塔外壳 ————————————————————
export function buildTurretShell(turret, reg, M) {
  const rings = turretRings();
  const { geometry, zones } = loftGeometry(rings, { capTop: true, zoneOf: turretZoneOf });
  const shell = mk(turret, geometry, zones.map(() => M.paintCast), { name: 'turretShell' });
  reg.armorZones(shell, zones);
  return { shell, rings };
}

export function buildTurretFittings(turret, reg, M) {
  const out = {};
  out.eraBlocks = buildEra(turret, reg, M);
  out.cupola = buildCupola(turret, reg, M);
  out.sight = buildSights(turret, reg, M);
  buildSmokeLaunchers(turret, reg, M);
  buildStowage(turret, reg, M);
  buildShellDetails(turret, M);
  return out;
}

// ———————————————————— “接触-5” ————————————————————
/** 一块楔形反应装甲：六面体箱体 + 顶部装填盖板 + 螺栓 */
function eraWedgeGeo(v) {
  const parts = [hexaGeo(v)];
  const top = v.slice(4, 8);
  const tc = top.reduce((s, p) => s.add(p), V3(0, 0, 0)).multiplyScalar(0.25);
  const lidB = top.map((p) => p.clone().addScaledVector(tc.clone().sub(p).normalize(), 0.03));
  const lidT = lidB.map((p) => p.clone().setY(p.y + 0.012));
  parts.push(hexaGeo([...lidB, ...lidT]));
  for (const p of lidT) parts.push(boltGeo(0.012, 0.01).applyMatrix4(alignY(p.clone().addScaledVector(tc.clone().sub(p).setY(0).normalize(), 0.028), UP)));
  // 正面四角螺栓
  const F = (u, h) => v[0].clone().lerp(v[1], u).lerp(v[4].clone().lerp(v[5], u), h);
  const cen = v.reduce((s, p) => s.add(p), V3(0, 0, 0)).multiplyScalar(1 / 8);
  const nf = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[4], v[0])).normalize();
  if (nf.dot(F(0.5, 0.5).sub(cen)) < 0) nf.negate();
  for (const [u, h] of [[0.2, 0.14], [0.8, 0.14], [0.2, 0.86], [0.8, 0.86]]) parts.push(boltGeo(0.013, 0.01).applyMatrix4(alignY(F(u, h), nf)));
  return merge(parts);
}

function roofEraGeo() {
  const w = 0.28, d = 0.32, h = 0.055;
  const parts = [new RoundedBoxGeometry(w, h, d, 2, 0.01), new RoundedBoxGeometry(w - 0.06, 0.012, d - 0.06, 1, 0.004).translate(0, h / 2 + 0.004, 0)];
  for (const a of [-1, 1]) for (const b of [-1, 1]) parts.push(boltGeo(0.012, 0.01).translate(a * (w / 2 - 0.045), h / 2 + 0.009, b * (d / 2 - 0.045)));
  return merge(parts);
}

function buildEra(turret, reg, M) {
  const era = group(turret, 'eraTurret');
  const blocks = [];
  // 正面“马蹄形”：每侧 5 个楔形箱，前缘沿 A→B 直线，背面贴合铸造外壳
  const n = 5, gap = 0.014, clear = 0.012, setback = 0.05;
  for (const side of [-1, 1]) {
    const A = new THREE.Vector2(1.5, side * 0.345);
    const B = new THREE.Vector2(0.93, side * 1.14);
    const L = A.distanceTo(B);
    const along = B.clone().sub(A).divideScalar(L);
    const w = new THREE.Vector2(-along.y, along.x);
    if (w.x > 0) w.negate();
    // 分界面方向：靠近火炮处沿 -x（避开防盾），外端逐渐转为垂直于前缘
    const dirs = [], hts = [];
    for (let k = 0; k <= n; k++) {
      const s = k / n;
      dirs.push(new THREE.Vector2(-1, 0).lerp(w, s).normalize());
      hts.push([0.17 + 0.03 * s, 0.685 - 0.05 * s]);
    }
    for (let i = 0; i < n; i++) {
      const f0 = A.clone().addScaledVector(along, (i * L) / n + gap / 2);
      const f1 = A.clone().addScaledVector(along, ((i + 1) * L) / n - gap / 2);
      const frontAt = (u, h) => {
        const d = dirs[i].clone().lerp(dirs[i + 1], u).normalize();
        const yb = hts[i][0] + (hts[i + 1][0] - hts[i][0]) * u;
        const yt = hts[i][1] + (hts[i + 1][1] - hts[i][1]) * u;
        return { p: f0.clone().lerp(f1, u).addScaledVector(d, setback * h), d, y: yb + (yt - yb) * h };
      };
      const depthAt = (u, h) => {
        const { p, d, y } = frontAt(u, h);
        return raySection(sectionAt(y), p.x, p.y, d.x, d.y) ?? 0.3;
      };
      const v = [
        [depthAt(0, 0) - clear, depthAt(1, 0) - clear],
        [depthAt(0, 1) - clear, depthAt(1, 1) - clear],
      ];
      // 背面取四角双线性插值；抽样检查，保证整块位于铸造外壳之外
      let excess = 0;
      for (let a = 0; a <= 4; a++) {
        for (let c = 0; c <= 4; c++) {
          const u = a / 4, h = c / 4;
          const vb = (v[0][0] * (1 - u) + v[0][1] * u) * (1 - h) + (v[1][0] * (1 - u) + v[1][1] * u) * h;
          excess = Math.max(excess, vb - (depthAt(u, h) - 0.004));
        }
      }
      const corner = (u, h, back) => {
        const { p, d, y } = frontAt(u, h);
        const t = back ? v[h][u] - excess : 0;
        return V3(p.x + d.x * t, y, p.y + d.y * t);
      };
      const verts = [corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1), corner(0, 1, 0), corner(1, 1, 0), corner(1, 1, 1), corner(0, 1, 1)];
      // 网格原点放在块中心（起爆特效取网格位置）
      const cen = verts.reduce((s, p) => s.add(p), V3(0, 0, 0)).multiplyScalar(1 / 8);
      for (const p of verts) p.sub(cen);
      const m = mk(era, eraWedgeGeo(verts), M.paint, { pos: cen.toArray(), name: 'k5Turret' });
      m.userData.edgeGeo = hexaGeo(verts); // X 光轮廓只描箱体，不描螺栓
      reg.armorMesh(m, 'era_turret');
      m.userData.era = true;
      blocks.push(m);
    }
  }
  // 顶部附加反应块（炮塔顶前部，避开瞄准镜与指挥塔）
  const roofGeo = roofEraGeo();
  const roofEdge = new THREE.BoxGeometry(0.28, 0.055, 0.32);
  for (const [x, z, yaw] of [
    [0.6, 0.21, 0],
    [0.5, 0.58, -0.33],
    [0.6, -0.19, 0],
  ]) {
    const m = mk(era, roofGeo, M.paint, { pos: [x, TURRET_ROOF_Y + 0.0285, z], rot: [0, yaw, 0], name: 'k5Roof' });
    m.userData.edgeGeo = roofEdge;
    reg.armorMesh(m, 'era_roof');
    m.userData.era = true;
    blocks.push(m);
  }
  reg.explodeGroup(era, {
    id: 'eraTurret',
    name: '“接触-5”爆炸反应装甲（炮塔）',
    sub: '马蹄形楔形布置 · 顶部附加块',
    desc: '炮塔正面左右各 5 个楔形箱体组成“马蹄形”，箱内装重型反应块，顶部盖板可拆装更换；它与铸造炮塔内的胞状填充复合装甲共同构成正面防护。炮塔顶前部另有附加反应块防御攻顶弹药。',
    offset: [0.9, 0.55, 0],
    label: [1.2, 0.62, 0.7],
  });
  return blocks;
}

// ———————————————————— 车长指挥塔 ————————————————————
function buildCupola(turret, reg, M) {
  const cupola = group(turret, 'cupola', [-0.2, TURRET_ROOF_Y - 0.03, 0.55]);
  const det = new Batch();
  // 座圈法兰与螺栓
  det.add(lathe([[0.422, 0.026], [0.422, 0.05], [0.415, 0.06], [0.36, 0.06]], 40), M.paintCast);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    det.add(boltGeo(0.011, 0.01), M.paintDark, { pos: [Math.cos(a) * 0.398, 0.058, Math.sin(a) * 0.398] });
  }
  // 铸造塔体（装甲）：重复轮廓点得到硬边
  const body = mk(
    cupola,
    lathe([[0.001, 0], [0.375, 0], [0.375, 0], [0.375, 0.055], [0.365, 0.11], [0.345, 0.15], [0.318, 0.165], [0.318, 0.165], [0.001, 0.165]], 40),
    M.paintCast,
    { name: 'cupolaBody' },
  );
  reg.armorMesh(body, 'cupola');
  // 舱盖（位于塔体后部）、铰链、把手、锁柄
  const hx = -0.07;
  det.add(lathe([[0.222, 0.158], [0.222, 0.172], [0.212, 0.186], [0.178, 0.2], [0.11, 0.21], [0.001, 0.213]], 32), M.paint, { pos: [hx, 0, 0] });
  det.add(cylZ(0.024, 0.2, 12), M.paintDark, { pos: [hx - 0.235, 0.182, 0] });
  for (const z of [-0.075, 0.075]) det.add(new THREE.BoxGeometry(0.07, 0.028, 0.036), M.paintDark, { pos: [hx - 0.2, 0.19, z] });
  det.add(handle([hx - 0.02, 0.208, -0.07], [hx - 0.02, 0.208, 0.07], [0, 1, 0], 0.035, 0.009), M.darkMetal);
  det.add(new THREE.BoxGeometry(0.1, 0.014, 0.024), M.darkMetal, { pos: [hx + 0.14, 0.2, 0.05], rot: [0, 0.5, 0] });
  // 观察潜望镜（带遮檐）
  for (const deg of [55, 100, 145, -170, -125]) {
    const R = new THREE.Matrix4().makeRotationY((-deg * Math.PI) / 180);
    const at = (x, y, z) => R.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
    det.add(new THREE.BoxGeometry(0.04, 0.062, 0.11), M.paintDark, at(0.36, 0.1, 0));
    det.add(new THREE.BoxGeometry(0.012, 0.042, 0.086), M.glass, at(0.381, 0.098, 0));
    det.add(new THREE.BoxGeometry(0.055, 0.012, 0.124), M.paintDark, at(0.38, 0.14, 0));
  }
  // OU-3GA2M 红外探照灯（与观瞄联动）
  det.add(cylX(0.098, 0.098, 0.15, 24), M.paintDark, { pos: [0.22, 0.36, 0.2] });
  det.add(cylX(0.105, 0.105, 0.022, 24), M.paintDark, { pos: [0.3, 0.36, 0.2] });
  det.add(new THREE.CircleGeometry(0.088, 24).rotateY(Math.PI / 2), M.lens, { pos: [0.3115, 0.36, 0.2] });
  det.add(new THREE.SphereGeometry(0.098, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2), M.paintDark, { pos: [0.145, 0.36, 0.2] });
  det.add(new THREE.CylinderGeometry(0.024, 0.03, 0.12, 10), M.paintDark, { pos: [0.2, 0.22, 0.2] });
  det.add(new THREE.BoxGeometry(0.1, 0.03, 0.12), M.paintDark, { pos: [0.24, 0.27, 0.14] });
  det.add(tube([[0.13, 0.35, 0.27], [0.06, 0.3, 0.3], [0.0, 0.19, 0.3]], 0.008, { radial: 5 }), M.cable);
  det.build(cupola, { name: 'cupolaDetails' });

  // TKN-4S 车长昼夜观瞄（模块）
  const tkn = group(cupola, 'tkn', [0.25, 0.15, -0.03]);
  const td = new Batch();
  td.add(new THREE.CylinderGeometry(0.085, 0.09, 0.05, 20), M.paintDark, { pos: [-0.03, 0.02, 0] });
  td.add(new RoundedBoxGeometry(0.2, 0.15, 0.25, 2, 0.018), M.paint, { pos: [0, 0.11, 0] });
  td.add(new THREE.BoxGeometry(0.075, 0.018, 0.27), M.paint, { pos: [0.095, 0.195, 0], rot: [0, 0, -0.45] });
  td.add(new THREE.BoxGeometry(0.02, 0.075, 0.21), M.paintDark, { pos: [0.095, 0.115, 0] });
  td.add(new THREE.BoxGeometry(0.012, 0.06, 0.19), M.glass, { pos: [0.102, 0.115, 0] });
  td.add(new THREE.BoxGeometry(0.03, 0.04, 0.04), M.glass, { pos: [0.02, 0.2, -0.08] });
  td.build(tkn, { name: 'tknSight' });
  reg.module('cmdr_sight', tkn);

  // 遥控 NSVT 12.7 mm 机枪（模块）：立柱、摇架、机匣、枪管、弹箱
  const mg = group(cupola, 'nsvt', [-0.2, 0.33, -0.25]);
  const md = new Batch();
  md.add(new THREE.CylinderGeometry(0.032, 0.038, 0.19, 12), M.paintDark, { pos: [0, -0.095, 0] });
  md.add(new RoundedBoxGeometry(0.12, 0.07, 0.1, 1, 0.01), M.paintDark, { pos: [0, 0, 0] });
  for (const z of [-0.058, 0.058]) md.add(new THREE.BoxGeometry(0.3, 0.1, 0.012), M.paint, { pos: [0.08, 0.06, z] });
  md.add(new THREE.BoxGeometry(0.3, 0.012, 0.128), M.paint, { pos: [0.08, 0.012, 0] });
  md.add(cylZ(0.018, 0.15, 10), M.darkMetal, { pos: [0.02, 0.07, 0] });
  md.add(new THREE.BoxGeometry(0.5, 0.09, 0.08), M.darkMetal, { pos: [0.09, 0.07, 0] });
  md.add(new THREE.BoxGeometry(0.2, 0.022, 0.084), M.darkMetal, { pos: [0.02, 0.126, 0] });
  md.add(cylX(0.03, 0.03, 0.06, 12), M.darkMetal, { pos: [-0.19, 0.07, 0] });
  md.add(new THREE.BoxGeometry(0.08, 0.05, 0.05), M.paintDark, { pos: [-0.12, 0.02, 0.07] });
  md.add(new THREE.BoxGeometry(0.16, 0.018, 0.018), M.darkMetal, { pos: [0.14, 0.085, 0.049] });
  md.add(new THREE.SphereGeometry(0.016, 8, 6), M.darkMetal, { pos: [0.06, 0.085, 0.064] });
  md.add(cylX(0.034, 0.034, 0.12, 14), M.darkMetal, { pos: [0.4, 0.075, 0] });
  md.add(cylX(0.024, 0.02, 0.92, 12), M.darkMetal, { pos: [0.8, 0.075, 0] });
  const gas = rod([0.36, 0.036, 0], [0.96, 0.036, 0], 0.011, 8);
  md.add(gas.geo, M.darkMetal, gas.t);
  md.add(new THREE.BoxGeometry(0.05, 0.05, 0.036), M.darkMetal, { pos: [0.96, 0.055, 0] });
  md.add(handle([0.55, 0.095, 0], [0.72, 0.095, 0], [0, 1, 0], 0.05, 0.008), M.darkMetal);
  md.add(latheX([[1.255, 0.0215], [1.275, 0.03], [1.36, 0.036], [1.362, 0.03], [1.34, 0.024]], 14), M.darkMetal);
  md.add(new RoundedBoxGeometry(0.26, 0.17, 0.1, 2, 0.01), M.paint, { pos: [0.04, 0.02, -0.12] });
  md.add(new THREE.BoxGeometry(0.2, 0.012, 0.104), M.paintDark, { pos: [0.04, 0.09, -0.12] });
  md.add(handle([-0.02, 0.107, -0.12], [0.1, 0.107, -0.12], [0, 1, 0], 0.025, 0.006), M.darkMetal);
  md.add(new THREE.BoxGeometry(0.08, 0.02, 0.07), M.darkMetal, { pos: [0.05, 0.1, -0.07], rot: [0.5, 0, 0] });
  md.add(new THREE.BoxGeometry(0.06, 0.08, 0.02), M.darkMetal, { pos: [0.05, 0.0, 0.056] });
  md.build(mg, { name: 'nsvtParts' });
  reg.module('nsvt', mg);

  reg.explodeGroup(cupola, {
    id: 'cupola',
    name: '车长指挥塔与 NSVT 机枪',
    sub: 'TKN-4S 观瞄 · 12.7 mm 遥控“悬崖”机枪',
    desc: '车长位于炮塔右侧。铸造指挥塔前部装 TKN-4S 昼夜观瞄装置与 OU-3GA2M 红外探照灯，周围 5 具潜望镜；T-80UD 式遥控 NSVT 12.7 mm 机枪可由车长在车内操纵，对付轻型目标和低空目标。',
    offset: [0, 0.75, 0.25],
    label: [0.3, 0.35, 0],
  });
  return cupola;
}

// ———————————————————— 炮手瞄准镜与热像仪 ————————————————————
function buildSights(turret, reg, M) {
  const sight = group(turret, 'gunnerSight', [0.55, TURRET_ROOF_Y, -0.54]);
  const det = new Batch();
  // 1G46 装甲罩（正面下部竖直、上部斜面开窗）
  const housing = mk(sight, profileSlab([[-0.24, -0.02], [0.17, -0.02], [0.215, 0.07], [0.215, 0.17], [0.14, 0.32], [-0.21, 0.32], [-0.24, 0.29]], -0.16, 0.16, 0.01), M.paint, { name: 'sightHousing' });
  reg.armorMesh(housing, 'sight_box');
  // 斜面观察窗 + 两扇向两侧打开的装甲窗门
  const X = V3(0.894, 0.447, 0), Y = V3(-0.447, 0.894, 0), Z = V3(0, 0, 1);
  const F = basis(X, Y, Z, V3(0.1775, 0.245, 0));
  const at = (...ms) => ms.reduce((acc, m) => acc.multiply(m), F.clone());
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  det.add(new THREE.BoxGeometry(0.01, 0.12, 0.25), M.paintDark, at(T(0.003, 0, 0)));
  det.add(new THREE.BoxGeometry(0.008, 0.095, 0.22), M.glass, at(T(0.008, 0, 0)));
  for (const s of [-1, 1]) {
    det.add(new THREE.BoxGeometry(0.014, 0.12, 0.135), M.paint, at(T(0.012, 0, s * 0.135), new THREE.Matrix4().makeRotationY(-s * 1.9), T(0.007, 0, -s * 0.068)));
    det.add(new THREE.CylinderGeometry(0.011, 0.011, 0.13, 8), M.paintDark, at(T(0.012, 0, s * 0.135)));
  }
  // 激光测距 / 导弹制导通道窗口
  for (const [z, mat] of [[-0.075, M.lens], [0.075, M.glass]]) {
    det.add(new THREE.BoxGeometry(0.012, 0.075, 0.1), M.paintDark, { pos: [0.212, 0.12, z] });
    det.add(new THREE.BoxGeometry(0.01, 0.058, 0.08), mat, { pos: [0.218, 0.12, z] });
  }
  // 顶盖、侧面螺栓、吊环、后部电缆
  det.add(new RoundedBoxGeometry(0.24, 0.03, 0.27, 1, 0.01), M.paint, { pos: [-0.05, 0.332, 0] });
  for (const s of [-1, 1]) {
    for (const [x, y] of [[-0.16, 0.08], [0.0, 0.08], [0.14, 0.08], [-0.16, 0.24], [0.0, 0.24]]) det.add(boltGeo(0.013, 0.01), M.paintDark, alignY(V3(x, y, s * 0.16), V3(0, 0, s)));
  }
  det.add(new THREE.TorusGeometry(0.03, 0.009, 6, 14), M.darkMetal, { pos: [-0.12, 0.37, 0] });
  det.add(tube([[-0.24, 0.12, 0.1], [-0.3, 0.06, 0.11], [-0.34, 0.012, 0.12]], 0.014, { radial: 6 }), M.cable);

  // 热像仪装甲箱（圆形镜头 + 向上翻开的防护盖）
  const tp = V3(-0.39, 0, -0.32);
  mk(sight, new RoundedBoxGeometry(0.34, 0.2, 0.22, 2, 0.015), M.paint, { pos: [tp.x, 0.1, tp.z], name: 'thermalSight' });
  det.add(cylX(0.068, 0.068, 0.02, 20), M.paintDark, { pos: [tp.x + 0.175, 0.1, tp.z] });
  det.add(new THREE.CircleGeometry(0.056, 20).rotateY(Math.PI / 2), M.lens, { pos: [tp.x + 0.186, 0.1, tp.z] });
  const hinge = V3(tp.x + 0.175, 0.2, tp.z);
  det.add(new THREE.BoxGeometry(0.012, 0.15, 0.18), M.paint, new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z).multiply(new THREE.Matrix4().makeRotationZ(1.9)).multiply(T(0.006, -0.075, 0)));
  det.add(cylZ(0.01, 0.17, 8), M.paintDark, { pos: hinge.toArray() });
  for (const s of [-1, 1]) det.add(boltGeo(0.012, 0.01), M.paintDark, alignY(V3(tp.x - 0.1, 0.2, tp.z + s * 0.07), UP));
  det.add(tube([[tp.x - 0.17, 0.08, tp.z + 0.06], [tp.x - 0.22, 0.03, tp.z + 0.08], [tp.x - 0.26, 0.012, tp.z + 0.1]], 0.012, { radial: 6 }), M.cable);
  det.build(sight, { name: 'sightDetails' });
  reg.module('gunner_sight', sight);

  reg.explodeGroup(sight, {
    id: 'gunnerSight',
    name: '炮手瞄准镜',
    sub: '1G46 昼间瞄准镜 + 第二代热像仪',
    desc: '1G46 瞄准镜集成激光测距仪和导弹制导通道（发射 9M119M1 时由其投射激光驾束），装甲罩正面的观察窗由两扇装甲门保护；T-80U-E1 在其左侧加装第二代热成像仪，夜间观瞄能力明显提升。',
    offset: [0.2, 0.6, -0.25],
    label: [0.0, 0.3, -0.1],
  });
  return sight;
}

// ———————————————————— 902B 烟幕弹发射器 ————————————————————
function buildSmokeLaunchers(turret, reg, M) {
  const tubeGeo = cylX(0.043, 0.043, 0.3, 16);
  for (const side of [-1, 1]) {
    const id = side < 0 ? 'smokeL' : 'smokeR';
    const smoke = group(turret, id);
    const det = new Batch();
    const rail = [];
    const jx = -0.17, jy = 0.43;
    const junction = V3(jx, jy, sideZ(jx, jy, side) + side * 0.03);
    for (let i = 0; i < 4; i++) {
      const x = 0.56 - i * 0.165, y = 0.47;
      const base = V3(x, y, sideZ(x, y, side) + side * 0.085);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -side * (0.42 - i * 0.07), 0.36 + i * 0.03));
      const Tm = new THREE.Matrix4().compose(base, q, V3(1, 1, 1));
      const at = (lx, ly, lz) => Tm.clone().multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz));
      const t = mk(smoke, tubeGeo, M.paint);
      t.position.copy(V3(0.11, 0, 0).applyQuaternion(q).add(base));
      t.quaternion.copy(q);
      reg.armorMesh(t, 'smoke');
      // 炮口环、膛口、尾部电插头
      det.add(cylX(0.05, 0.05, 0.022, 16), M.paintDark, at(0.25, 0, 0));
      det.add(new THREE.CircleGeometry(0.037, 16).rotateY(Math.PI / 2), M.darkMetal, at(0.2615, 0, 0));
      det.add(cylX(0.05, 0.046, 0.05, 16), M.paintDark, at(-0.06, 0, 0));
      det.add(cylX(0.012, 0.012, 0.04, 8), M.darkMetal, at(-0.1, 0, 0));
      // 托架：从安装导轨伸出
      det.add(new THREE.BoxGeometry(0.08, 0.03, 0.05), M.paintDark, at(0.05, -0.052, 0));
      const r = V3(x, 0.4, sideZ(x, 0.4, side) + side * 0.028);
      rail.push(r);
      const b = rod(r, V3(0.05, -0.06, 0).applyMatrix4(Tm), 0.014, 8);
      det.add(b.geo, M.paintDark, b.t);
      // 发火电缆
      const plug = V3(-0.12, 0, 0).applyMatrix4(Tm);
      det.add(tube([plug, plug.clone().add(V3(-0.04, -0.05, 0)), junction.clone().add(V3(0.07, 0, side * 0.01))], 0.008, { radial: 5 }), M.cable);
    }
    // 安装导轨与焊接座
    const r0 = rail[0].clone().add(V3(0.06, 0, 0)), r1 = rail[rail.length - 1].clone().add(V3(-0.06, 0, 0));
    det.add(tube([r0, ...rail, r1], 0.02, { radial: 8 }), M.paintDark);
    for (const p of [r0, r1]) det.add(new THREE.BoxGeometry(0.05, 0.05, 0.05), M.paintDark, { pos: [p.x, p.y, p.z - side * 0.015] });
    det.add(new RoundedBoxGeometry(0.13, 0.1, 0.05, 1, 0.01), M.paintDark, { pos: junction.toArray(), rot: [0, sideYaw(jx, jy, side), 0] });
    det.build(smoke, { name: 'smokeDetails' });
    reg.explodeGroup(smoke, {
      id,
      name: side < 0 ? '烟幕弹发射器（左）' : '烟幕弹发射器（右）',
      sub: '902B “乌云” · 每侧 4 具',
      desc: '炮塔两侧各 4 具 81 mm 烟幕弹发射器，呈扇形指向前上方，可在数秒内形成遮蔽烟幕，干扰敌方观瞄与激光测距。',
      offset: [0.2, 0.25, side * 0.55],
      label: [0.3, 0.6, side * 1.35],
    });
  }
}

// ———————————————————— 尾舱储物箱、潜渡筒、侧箱、天线 ————————————————————
function buildStowage(turret, reg, M) {
  const stow = group(turret, 'stowage');
  const det = new Batch();

  // 尾舱储物箱：前缘贴合炮塔尾部曲面，等深“香蕉形”，底面高于翼子板油箱以便炮塔回转
  const y0 = 0.36, y1 = 0.74, depth = 0.34, zEnd = 0.72, N = 12;
  const front = [];
  for (let k = 0; k <= N; k++) {
    const z = zEnd - (2 * zEnd * k) / N;
    front.push([Math.min(rearX(z, y0), rearX(z, (y0 + y1) / 2), rearX(z, y1)) - 0.012, z]);
  }
  const back = front.map(([x, z]) => [x - depth, z]).reverse();
  const rearBox = mk(stow, slabXZ([...front, ...back], y1, y1 - y0), M.paint, { name: 'rearBox' });
  reg.armorMesh(rearBox, 'box');
  const xf = (z) => {
    const k = THREE.MathUtils.clamp(((zEnd - z) / (2 * zEnd)) * N, 0, N - 1e-6);
    const i = Math.floor(k), f = k - i;
    return front[i][0] + (front[i + 1][0] - front[i][0]) * f;
  };
  const backAt = (z) => {
    const x = xf(z) - depth;
    const s = (xf(z + 0.02) - xf(z - 0.02)) / 0.04;
    const n = V3(-1, 0, s).normalize();
    return { p: V3(x, 0, z), n, yaw: Math.atan2(-n.z, -n.x) };
  };
  // 箱盖缝、铰链、搭扣、加强筋、端部把手
  for (const z of [-0.36, 0, 0.36]) {
    const { p, n, yaw } = backAt(z);
    det.add(new THREE.BoxGeometry(0.02, 0.07, 0.06), M.darkMetal, { pos: [p.x + n.x * 0.01, y1 - 0.07, z + n.z * 0.01], rot: [0, yaw, 0] });
    det.add(cylZ(0.012, 0.14, 8), M.paintDark, { pos: [xf(z) - 0.03, y1 + 0.004, z] });
  }
  const seam = [], rib = [];
  for (let z = -zEnd + 0.03; z <= zEnd - 0.03 + 1e-6; z += 0.12) {
    const { p, n } = backAt(z);
    seam.push(p.clone().addScaledVector(n, 0.003).setY(y1 - 0.03));
    rib.push(p.clone().addScaledVector(n, 0.006).setY(y0 + 0.12));
  }
  det.add(tube(seam, 0.005, { radial: 4 }), M.paintDark);
  det.add(tube(rib, 0.012, { radial: 6 }), M.paint);
  for (const s of [-1, 1]) {
    const z = s * (zEnd + 0.002);
    const xm = xf(s * zEnd) - depth / 2;
    det.add(handle([xm - 0.07, (y0 + y1) / 2, z], [xm + 0.07, (y0 + y1) / 2, z], [0, 0, s], 0.035, 0.008), M.darkMetal);
  }

  // 篷布卷（沿箱顶中线弯曲）+ 捆扎带
  const roll = [];
  for (let z = -0.52; z <= 0.52 + 1e-6; z += 0.13) roll.push(V3(xf(z) - depth * 0.55, y1 + 0.09, z));
  det.add(tube(roll, 0.09, { radial: 12, segments: 32 }), M.tarp);
  for (const p of [roll[0], roll[roll.length - 1]]) det.add(new THREE.SphereGeometry(0.09, 12, 8).scale(1, 1, 0.35), M.tarp, { pos: p.toArray() });
  for (const z of [-0.36, 0, 0.36]) {
    const p = V3(xf(z) - depth * 0.55, y1 + 0.09, z);
    const d = V3(xf(z + 0.05) - xf(z - 0.05), 0, 0.1).normalize();
    det.add(new THREE.TorusGeometry(0.093, 0.009, 6, 20), M.strap, { pos: p.toArray(), quat: new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), d) });
  }

  // 潜渡进气筒（横放在储物箱背面）
  const sx = xf(0) - depth - 0.13, sy = 0.56;
  const snorkel = mk(stow, cylZ(0.11, 1.24, 24), M.paint, { pos: [sx, sy, 0], name: 'snorkel' });
  reg.armorMesh(snorkel, 'box');
  for (const s of [-1, 1]) {
    det.add(cylZ(0.12, 0.05, 24), M.paintDark, { pos: [sx, sy, s * 0.64] });
    det.add(new THREE.TorusGeometry(0.113, 0.01, 6, 24), M.darkMetal, { pos: [sx, sy, s * 0.35] });
    const b = rod([sx + 0.1, sy, s * 0.35], [backAt(s * 0.35).p.x + 0.004, sy, s * 0.35], 0.02, 8);
    det.add(b.geo, M.paintDark, b.t);
  }

  // 炮塔两侧后部储物箱（贴合侧面弦线，外面有搭扣、铰链与把手）
  for (const side of [-1, 1]) {
    const xa = -0.44, xb = -1.16, yb = 0.2, yt = 0.52, d = 0.19;
    const p0 = new THREE.Vector2(xa, sideZ(xa, yb, side)), p1 = new THREE.Vector2(xb, sideZ(xb, yb, side));
    const t = p1.clone().sub(p0).normalize();
    const nrm = new THREE.Vector2(-t.y, t.x);
    if (nrm.y * side < 0) nrm.negate();
    let bulge = 0;
    for (let k = 1; k < 8; k++) {
      const x = xa + ((xb - xa) * k) / 8;
      bulge = Math.max(bulge, new THREE.Vector2(x, sideZ(x, yb, side)).sub(p0).dot(nrm));
    }
    const c = p0.clone().add(p1).multiplyScalar(0.5).addScaledVector(nrm, bulge + 0.012 + d / 2);
    const Lb = p0.distanceTo(p1);
    const yaw = Math.atan2(-t.y, t.x);
    const box = mk(stow, new RoundedBoxGeometry(Lb, yt - yb, d, 2, 0.015), M.paint, { pos: [c.x, (yb + yt) / 2, c.y], rot: [0, yaw, 0], name: 'sideBox' });
    reg.armorMesh(box, 'box');
    const Mb = new THREE.Matrix4().compose(V3(c.x, (yb + yt) / 2, c.y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), V3(1, 1, 1));
    const lz = V3(0, 0, 1).applyAxisAngle(UP, yaw);
    const so = Math.sign(lz.x * nrm.x + lz.z * nrm.y) || 1; // 局部 z 的哪一侧朝外
    const hy = (yt - yb) / 2;
    const at = (x, y, z) => Mb.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
    det.add(new THREE.BoxGeometry(Lb - 0.05, 0.012, 0.012), M.paintDark, at(0, hy - 0.06, so * (d / 2 + 0.003)));
    for (const f of [-0.3, 0.3]) {
      det.add(new THREE.BoxGeometry(0.04, 0.06, 0.02), M.darkMetal, at(f * Lb, hy - 0.1, so * (d / 2 + 0.008)));
      det.add(cylX(0.011, 0.011, 0.08, 8), M.paintDark, at(f * Lb, hy + 0.004, -so * (d / 2 - 0.02)));
    }
    det.add(handle([-0.08, -0.02, 0], [0.08, -0.02, 0], [0, 0, so], 0.035, 0.008).applyMatrix4(at(0, 0, so * (d / 2))), M.darkMetal);
  }

  // 天线座与鞭状天线、风传感器（DVE-BS）、通风罩
  for (const [x, z, whip] of [
    [-1.12, -0.64, true],
    [-1.12, 0.64, false],
  ]) {
    det.add(new THREE.CylinderGeometry(0.045, 0.055, 0.07, 12), M.paintDark, { pos: [x, TURRET_ROOF_Y + 0.035, z] });
    det.add(new THREE.CylinderGeometry(0.028, 0.028, 0.06, 10), M.darkMetal, { pos: [x, TURRET_ROOF_Y + 0.1, z] });
    if (!whip) det.add(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), M.darkMetal, { pos: [x, TURRET_ROOF_Y + 0.19, z] });
  }
  mk(stow, new THREE.CylinderGeometry(0.006, 0.011, 2.2, 6), M.darkMetal, { pos: [-1.12, TURRET_ROOF_Y + 1.23, -0.64], cast: false, name: 'antenna' });
  det.add(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 12), M.paintDark, { pos: [-1.0, TURRET_ROOF_Y + 0.012, 0.18] });
  det.add(new THREE.CylinderGeometry(0.014, 0.018, 0.42, 8), M.darkMetal, { pos: [-1.0, TURRET_ROOF_Y + 0.23, 0.18] });
  det.add(new THREE.SphereGeometry(0.035, 12, 8), M.darkMetal, { pos: [-1.0, TURRET_ROOF_Y + 0.45, 0.18] });
  det.add(new THREE.BoxGeometry(0.11, 0.035, 0.005), M.darkMetal, { pos: [-1.06, TURRET_ROOF_Y + 0.45, 0.18] });
  det.build(stow, { name: 'stowageDetails' });

  reg.explodeGroup(stow, {
    id: 'stowage',
    name: '储物箱与潜渡筒',
    sub: '炮塔尾舱 · 两侧储物箱',
    desc: '炮塔尾部的贴合式储物箱（顶上捆着篷布卷）、横放的潜渡进气筒（涉深水时竖立在车长舱口上）以及两侧储物箱。这些外挂物会先于主装甲触发破甲弹引信，起到少量间隔装甲作用。',
    offset: [-0.9, 0.4, 0],
    label: [-1.95, 0.85, 0],
  });
}

// ———————————————————— 外壳上的小零件 ————————————————————
function buildShellDetails(turret, M) {
  const det = new Batch();
  // 顶板与铸造塔体之间的焊缝
  const roof = sectionAt(TURRET_ROOF_Y);
  const nr = outlineNormals(roof);
  const seam = [];
  for (let i = 0; i < roof.length; i += 2) seam.push(V3(roof[i].x - nr[i].x * 0.03, TURRET_ROOF_Y + 0.001, roof[i].y - nr[i].y * 0.03));
  det.add(tube(seam, 0.006, { closed: true, segments: 240, radial: 4 }), M.paint);
  // 吊环
  for (const deg of [62, -62, 150, -150]) {
    const phi = (deg * Math.PI) / 180;
    const p = edgeAt(TURRET_ROOF_Y, phi, 0.07);
    const radial = V3(Math.cos(phi), 0, Math.sin(phi));
    const tangent = V3(-radial.z, 0, radial.x);
    det.add(new THREE.TorusGeometry(0.035, 0.011, 6, 14), M.darkMetal, { pos: [p.x, TURRET_ROOF_Y + 0.026, p.y], quat: new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), tangent) });
    det.add(new THREE.BoxGeometry(0.07, 0.014, 0.05), M.paintDark, { pos: [p.x, TURRET_ROOF_Y + 0.007, p.y], rot: [0, -phi, 0] });
  }
  // 侧面扶手（三个立柱）
  for (const side of [-1, 1]) {
    const pts = [], posts = [];
    for (const x of [-0.3, -0.72, -1.16]) {
      const z = sideZ(x, 0.64, side);
      pts.push(V3(x, 0.64, z + side * 0.055));
      posts.push([V3(x, 0.64, z - side * 0.01), V3(x, 0.64, z + side * 0.055)]);
    }
    det.add(tube(pts, 0.012, { radial: 6, segments: 24 }), M.paintDark);
    for (const [a, b] of posts) {
      const r = rod(a, b, 0.011, 6);
      det.add(r.geo, M.paintDark, r.t);
    }
  }
  // 炮手舱盖：法兰、穹顶盖、后铰链、把手；前方潜望镜
  const gh = V3(-0.25, TURRET_ROOF_Y, -0.55);
  det.add(new THREE.CylinderGeometry(0.3, 0.31, 0.024, 36), M.paintCast, { pos: [gh.x, gh.y + 0.012, gh.z] });
  det.add(lathe([[0.27, 0.018], [0.27, 0.03], [0.25, 0.044], [0.2, 0.058], [0.12, 0.067], [0.001, 0.07]], 32), M.paint, { pos: gh.toArray() });
  det.add(cylZ(0.022, 0.2, 10), M.paintDark, { pos: [gh.x - 0.29, gh.y + 0.03, gh.z] });
  for (const z of [-0.07, 0.07]) det.add(new THREE.BoxGeometry(0.07, 0.024, 0.034), M.paintDark, { pos: [gh.x - 0.255, gh.y + 0.036, gh.z + z] });
  det.add(handle([gh.x - 0.04, gh.y + 0.066, gh.z - 0.07], [gh.x - 0.04, gh.y + 0.066, gh.z + 0.07], [0, 1, 0], 0.035, 0.009), M.darkMetal);
  det.add(new THREE.BoxGeometry(0.1, 0.07, 0.15), M.paintDark, { pos: [0.14, TURRET_ROOF_Y + 0.035, -0.6] });
  det.add(new THREE.BoxGeometry(0.01, 0.04, 0.12), M.glass, { pos: [0.192, TURRET_ROOF_Y + 0.045, -0.6] });
  det.add(new THREE.BoxGeometry(0.05, 0.012, 0.17), M.paintDark, { pos: [0.19, TURRET_ROOF_Y + 0.076, -0.6] });
  // 风扇装甲罩
  det.add(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 20), M.paintDark, { pos: [-0.78, TURRET_ROOF_Y + 0.025, -0.12] });
  det.add(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 24), M.paint, { pos: [-0.78, TURRET_ROOF_Y + 0.075, -0.12] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    det.add(new THREE.BoxGeometry(0.02, 0.03, 0.02), M.paintDark, { pos: [-0.78 + Math.cos(a) * 0.11, TURRET_ROOF_Y + 0.055, -0.12 + Math.sin(a) * 0.11] });
  }
  det.build(turret, { name: 'turretDetails' });
}
