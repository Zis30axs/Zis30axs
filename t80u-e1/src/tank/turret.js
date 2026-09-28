// 炮塔：放样生成的铸造炮塔外壳（按方位分装甲区），接触-5 楔形反应装甲、指挥塔与 NSVT、
// 炮手瞄准镜、烟幕弹发射器、储物箱、潜渡筒等。坐标为炮塔坐标系（原点在座圈中心、车体顶甲平面）。
import * as THREE from 'three';
import { loftGeometry, outlineNormals, V3, cylX, cylZ, merge, place, RoundedBoxGeometry } from './geom.js';
import { mk, group } from './registry.js';

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
  if (a < 14) return 'turret_front_center';
  if (a < 58) return 'turret_cheek';
  if (a < 105) return 'turret_side_front';
  if (a < 150) return 'turret_side_rear';
  return 'turret_rear';
}

export function buildTurretShell(turret, reg, M) {
  const base = baseOutline(120);
  const normals = outlineNormals(base);
  const ringDefs = [
    // y, inset(front, side, rear)
    [-0.03, [0.1, 0.1, 0.1]],
    [0.2, [0.0, 0.0, 0.0]],
    [0.58, [0.2, 0.08, 0.07]],
    [0.715, [0.28, 0.14, 0.12]],
    [TURRET_ROOF_Y, [0.36, 0.2, 0.18]],
  ];
  const rings = ringDefs.map(([y, [f, s, r]]) =>
    base.map((p, i) => {
      const phi = (Math.atan2(p.y, p.x) * 180) / Math.PI;
      const ins = insetAt(phi, f, s, r);
      return new THREE.Vector3(p.x - normals[i].x * ins, y, p.y - normals[i].y * ins);
    }),
  );
  const { geometry, zones } = loftGeometry(rings, { capTop: true, zoneOf: turretZoneOf });
  const mats = zones.map(() => M.paint);
  const shell = mk(turret, geometry, mats, { name: 'turretShell' });
  reg.armorZones(shell, zones);
  return { shell, rings };
}

export function buildTurretFittings(turret, reg, M) {
  const out = {};
  // —— 接触-5 楔形反应装甲（炮塔正面两侧各 4 块）
  const eraFront = group(turret, 'eraTurret');
  const eraBlocks = [];
  const blockGeo = merge([
    new RoundedBoxGeometry(0.21, 0.5, 0.44, 2, 0.015),
    ...[[0.15, -0.14], [0.15, 0.14], [-0.15, -0.14], [-0.15, 0.14]].map(([yy, zz]) => place(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 8), { pos: [0.107, yy, zz], rot: [0, 0, Math.PI / 2] })),
  ]);
  for (const side of [-1, 1]) {
    const A = new THREE.Vector2(1.48, side * 0.33);
    const B = new THREE.Vector2(0.92, side * 1.12);
    const dir = new THREE.Vector2().subVectors(B, A).normalize();
    const nOut = new THREE.Vector2(dir.y, -dir.x).multiplyScalar(side); // 指向前外侧
    if (nOut.x < 0) nOut.negate();
    const n = 4;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const c = new THREE.Vector2().lerpVectors(A, B, t).addScaledVector(nOut, -0.105);
      const m = mk(eraFront, blockGeo, M.paint, { pos: [c.x, 0.43, c.y] });
      // 局部 X 轴沿外法线，Y 轴向上，Z 轴沿装甲带
      const X = V3(nOut.x, 0, nOut.y);
      const Y = V3(0, 1, 0);
      const Z = new THREE.Vector3().crossVectors(X, Y);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
      m.rotateZ(0.14); // 上沿略向后倾
      reg.armorMesh(m, 'era_turret');
      m.userData.era = true;
      eraBlocks.push(m);
    }
    // 反应装甲托架（与炮塔之间的楔形框）
    const mid = new THREE.Vector2().lerpVectors(A, B, 0.5).addScaledVector(nOut, -0.3);
    const frame = mk(eraFront, new THREE.BoxGeometry(0.3, 0.1, 0.95), M.paintDark, { pos: [mid.x, 0.7, mid.y] });
    frame.rotation.y = -Math.atan2(dir.y, dir.x) + Math.PI / 2;
  }
  // 顶部反应装甲（炮塔顶前部）
  const roofEraGeo = new RoundedBoxGeometry(0.3, 0.06, 0.34, 2, 0.01);
  const roofEraPos = [
    [0.66, 0.24],
    [0.66, 0.62],
    [0.4, 0.95],
    [0.66, -0.18],
    [0.36, -0.98],
    [0.08, -0.98],
  ];
  {
    for (const [x, z] of roofEraPos) {
      const m = mk(eraFront, roofEraGeo, M.paint, { pos: [x, TURRET_ROOF_Y + 0.03, z] });
      m.rotation.z = -0.1;
      reg.armorMesh(m, 'era_roof');
      m.userData.era = true;
      eraBlocks.push(m);
    }
  }
  out.eraBlocks = eraBlocks;
  reg.explodeGroup(eraFront, {
    id: 'eraTurret',
    name: '“接触-5”爆炸反应装甲（炮塔）',
    sub: '楔形布置 · 顶部附加块',
    desc: '炮塔正面左右两组楔形布置的“接触-5”反应装甲，与铸造炮塔内的胞状填充复合装甲共同构成正面防护；炮塔顶前部另有附加反应块防御攻顶。',
    offset: [0.9, 0.55, 0],
    label: [1.2, 0.62, 0.7],
  });

  // —— 车长指挥塔 + NSVT 12.7 mm 高射机枪
  const cupola = group(turret, 'cupola', [-0.2, TURRET_ROOF_Y - 0.03, 0.55]);
  const cup = mk(cupola, new THREE.CylinderGeometry(0.34, 0.37, 0.16, 36), M.paint, { pos: [0, 0.08, 0] });
  reg.armorMesh(cup, 'cupola');
  mk(cupola, new THREE.CylinderGeometry(0.29, 0.3, 0.05, 32), M.paintDark, { pos: [0, 0.185, 0] });
  // 观察镜
  for (let i = 0; i < 5; i++) {
    const a = (-60 + i * 30) * (Math.PI / 180);
    const p = mk(cupola, new THREE.BoxGeometry(0.07, 0.06, 0.1), M.glass, { pos: [Math.cos(a) * 0.35, 0.1, Math.sin(a) * 0.35] });
    p.rotation.y = -a;
  }
  // 车长昼夜观瞄
  const tkn = mk(cupola, new THREE.BoxGeometry(0.22, 0.2, 0.2), M.paintDark, { pos: [0.18, 0.28, -0.08] });
  mk(cupola, new THREE.BoxGeometry(0.02, 0.1, 0.14), M.glass, { pos: [0.3, 0.3, -0.08] });
  reg.module('cmdr_sight', tkn);
  // 红外探照灯
  const ir = new THREE.Group();
  ir.position.set(0.12, 0.34, 0.2);
  cupola.add(ir);
  mk(ir, cylX(0.1, 0.1, 0.16, 20), M.paintDark);
  mk(ir, new THREE.CircleGeometry(0.085, 20), M.lens, { pos: [0.081, 0, 0], rot: [0, Math.PI / 2, 0] });
  // NSVT 机枪
  const mg = group(cupola, 'nsvt', [0.0, 0.3, 0.0]);
  const mgBody = mk(mg, new THREE.BoxGeometry(0.5, 0.12, 0.14), M.darkMetal, { pos: [0.1, 0.07, 0] });
  const mgBarrel = mk(mg, cylX(0.022, 0.018, 1.0, 10), M.darkMetal, { pos: [0.85, 0.08, 0] });
  mk(mg, cylX(0.034, 0.034, 0.08, 10), M.darkMetal, { pos: [1.34, 0.08, 0] });
  const mgBox = mk(mg, new THREE.BoxGeometry(0.2, 0.18, 0.12), M.paint, { pos: [0.05, 0.02, -0.14] });
  mk(mg, new THREE.BoxGeometry(0.1, 0.16, 0.2), M.paintDark, { pos: [-0.12, -0.05, 0] });
  reg.module('nsvt', mgBody);
  reg.module('nsvt', mgBarrel);
  reg.module('nsvt', mgBox);
  out.cupola = cupola;
  reg.explodeGroup(cupola, {
    id: 'cupola',
    name: '车长指挥塔与 NSVT 机枪',
    sub: '12.7 mm “悬崖”高射机枪',
    desc: '车长位于炮塔右侧，指挥塔装有昼夜观瞄装置、潜望镜和红外探照灯；顶部 NSVT 12.7 mm 机枪用于对付轻型目标和低空目标。',
    offset: [0, 0.75, 0.25],
    label: [0.3, 0.35, 0],
  });

  // —— 炮手瞄准镜（1G46 + 热像仪）装甲罩（左侧）
  const sight = group(turret, 'gunnerSight', [0.55, TURRET_ROOF_Y - 0.02, -0.52]);
  const sbox = mk(sight, new RoundedBoxGeometry(0.46, 0.3, 0.32, 2, 0.02), M.paint, { pos: [0, 0.15, 0] });
  reg.armorMesh(sbox, 'sight_box');
  const head = mk(sight, new RoundedBoxGeometry(0.2, 0.18, 0.28, 2, 0.02), M.paintDark, { pos: [0.18, 0.36, 0] });
  mk(sight, new THREE.BoxGeometry(0.02, 0.12, 0.22), M.glass, { pos: [0.285, 0.37, 0] });
  mk(sight, new THREE.BoxGeometry(0.02, 0.1, 0.1), M.lens, { pos: [0.235, 0.17, -0.08] });
  mk(sight, new THREE.BoxGeometry(0.02, 0.1, 0.1), M.glass, { pos: [0.235, 0.17, 0.08] });
  reg.module('gunner_sight', head);
  reg.module('gunner_sight', sbox);
  out.sight = sight;
  reg.explodeGroup(sight, {
    id: 'gunnerSight',
    name: '炮手瞄准镜',
    sub: '1G46 昼间瞄准镜 + 第二代热像仪',
    desc: '1G46 瞄准镜集成激光测距仪和导弹制导通道（发射 9M119M1 时由其投射激光驾束）；T-80U-E1 加装了第二代热成像仪，夜间观瞄能力明显提升。',
    offset: [0.2, 0.6, -0.25],
    label: [0.2, 0.3, 0],
  });

  // —— 炮手舱盖
  mk(turret, new THREE.CylinderGeometry(0.26, 0.28, 0.06, 28), M.paint, { pos: [-0.25, TURRET_ROOF_Y + 0.02, -0.55] });
  mk(turret, new THREE.BoxGeometry(0.1, 0.05, 0.14), M.paintDark, { pos: [-0.5, TURRET_ROOF_Y + 0.04, -0.55] });

  // —— 烟幕弹发射器（902B “乌云”，每侧 4 具）
  const tubeGeo = cylX(0.043, 0.043, 0.3, 14);
  for (const side of [-1, 1]) {
    const smoke = group(turret, side < 0 ? 'smokeL' : 'smokeR');
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const x = 0.78 - i * 0.16, z = side * (1.14 + i * 0.06);
      g.position.set(x, 0.42 + (i % 2) * 0.1, z);
      g.rotation.y = -side * (0.45 - i * 0.05);
      g.rotation.z = 0.2 + i * 0.03;
      smoke.add(g);
      const t = mk(g, tubeGeo, M.paintDark);
      reg.armorMesh(t, 'smoke');
      mk(g, new THREE.CircleGeometry(0.036, 14), M.darkMetal, { pos: [0.151, 0, 0], rot: [0, Math.PI / 2, 0] });
    }
    mk(smoke, new THREE.BoxGeometry(0.55, 0.08, 0.1), M.paint, { pos: [0.54, 0.34, side * 1.2], rot: [0, side * 0.5, 0] });
    reg.explodeGroup(smoke, {
      id: side < 0 ? 'smokeL' : 'smokeR',
      name: side < 0 ? '烟幕弹发射器（左）' : '烟幕弹发射器（右）',
      sub: '902B “乌云” · 每侧 4 具',
      desc: '炮塔两侧各 4 具 81 mm 烟幕弹发射器，可在数秒内形成遮蔽烟幕，干扰敌方观瞄与激光测距。',
      offset: [0.2, 0.25, side * 0.55],
      label: [0.55, 0.5, side * 1.25],
    });
  }

  // —— 炮塔后部储物箱与潜渡筒
  const stow = group(turret, 'stowage');
  const rearBox = mk(stow, new RoundedBoxGeometry(0.34, 0.42, 1.5, 2, 0.02), M.paint, { pos: [-1.66, 0.34, 0] });
  reg.armorMesh(rearBox, 'box');
  for (const side of [-1, 1]) {
    const sb = mk(stow, new RoundedBoxGeometry(0.72, 0.34, 0.2, 2, 0.02), M.paint, { pos: [-0.8, 0.36, side * 1.2] });
    sb.rotation.y = -side * 0.4;
    reg.armorMesh(sb, 'box');
  }
  const snorkel = mk(stow, cylZ(0.14, 1.7, 20), M.paintDark, { pos: [-1.5, 0.66, 0] });
  reg.armorMesh(snorkel, 'box');
  for (const z of [-0.55, 0.55]) mk(stow, new THREE.BoxGeometry(0.16, 0.05, 0.05), M.darkMetal, { pos: [-1.5, 0.52, z] });
  // 天线与风传感器
  mk(stow, new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10), M.darkMetal, { pos: [-1.05, TURRET_ROOF_Y + 0.02, -0.55] });
  mk(stow, new THREE.CylinderGeometry(0.006, 0.01, 2.2, 6), M.darkMetal, { pos: [-1.05, TURRET_ROOF_Y + 1.12, -0.55], cast: false });
  mk(stow, new THREE.CylinderGeometry(0.015, 0.015, 0.45, 8), M.darkMetal, { pos: [-1.0, TURRET_ROOF_Y + 0.22, 0.25] });
  mk(stow, new THREE.SphereGeometry(0.04, 10, 8), M.darkMetal, { pos: [-1.0, TURRET_ROOF_Y + 0.46, 0.25] });
  reg.explodeGroup(stow, {
    id: 'stowage',
    name: '储物箱与潜渡筒',
    sub: '炮塔尾部',
    desc: '炮塔尾部储物箱和潜渡进气筒（涉深水时竖立在车长舱口上）。这些外挂物会先于主装甲触发破甲弹引信。',
    offset: [-0.9, 0.4, 0],
    label: [-1.66, 0.6, 0],
  });

  return out;
}
