// 车体：由装甲板拼成的空心车体（便于 X 光透视与内部布置），以及车体外部附件。
// 装甲板、反应装甲块、侧裙等参与弹道计算的部件保持独立网格；螺栓、把手、线缆等小零件按材质批量合并。
import * as THREE from 'three';
import { HULL as H, TURRET, RUNNING as R } from './dims.js';
import { plateGeometry, V3, cylX, cylZ, merge, place, RoundedBoxGeometry } from './geom.js';
import { Batch, tube, handle, boltGeo, basis } from './detail.js';
import { mk, group } from './registry.js';

const planeNormal = (pts, hint) => {
  const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0])).normalize();
  if (n.dot(hint) < 0) n.negate();
  return n;
};

/** 两点之间的圆柱（焊缝、拉杆、管线） */
export function rod(a, b, r, seg = 8) {
  const A = a.isVector3 ? a.clone() : V3(...a), B = b.isVector3 ? b.clone() : V3(...b);
  const g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), B.clone().sub(A).normalize());
  return { geo: g, t: { pos: A.add(B).multiplyScalar(0.5).toArray(), quat: q } };
}

/** 沿 XY 平面折线的薄板（挡泥板等），沿 +Z 挤出 width */
export function sheetGeo(pts2, thick, width) {
  const L = pts2.length;
  const up = [], down = [];
  for (let i = 0; i < L; i++) {
    const p = pts2[i], a = pts2[Math.max(0, i - 1)], b = pts2[Math.min(L - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len, ny = tx / len;
    up.push(new THREE.Vector2(p[0] + (nx * thick) / 2, p[1] + (ny * thick) / 2));
    down.push(new THREE.Vector2(p[0] - (nx * thick) / 2, p[1] - (ny * thick) / 2));
  }
  return new THREE.ExtrudeGeometry(new THREE.Shape([...up, ...down.reverse()]), { depth: width, bevelEnabled: false });
}

/** 百叶窗格栅：外框 + 倾斜叶片（局部 X 为叶片方向，叶片沿 Z 排列），t 为整体变换 */
export function louverGrille(det, M, { len, wid, n, tilt = 0.6, frameMat = M.paint, slatMat = M.darkMetal, t }) {
  const frame = [
    place(new THREE.BoxGeometry(len + 0.06, 0.05, 0.035), { pos: [0, 0.01, wid / 2 + 0.017] }),
    place(new THREE.BoxGeometry(len + 0.06, 0.05, 0.035), { pos: [0, 0.01, -wid / 2 - 0.017] }),
    place(new THREE.BoxGeometry(0.035, 0.05, wid), { pos: [len / 2 + 0.017, 0.01, 0] }),
    place(new THREE.BoxGeometry(0.035, 0.05, wid), { pos: [-len / 2 - 0.017, 0.01, 0] }),
  ];
  for (const g of frame) det.add(g, frameMat, t);
  const slat = new THREE.BoxGeometry(len, 0.006, (wid / n) * 1.35);
  for (let i = 0; i < n; i++) {
    const z = -wid / 2 + (i + 0.5) * (wid / n);
    const lm = new THREE.Matrix4().compose(V3(0, 0.012, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), V3(1, 1, 1));
    det.add(slat, slatMat, new THREE.Matrix4().multiplyMatrices(t, lm));
  }
  // 中间加强筋
  det.add(new THREE.BoxGeometry(0.03, 0.04, wid), frameMat, new THREE.Matrix4().multiplyMatrices(t, new THREE.Matrix4().makeTranslation(0, 0.015, 0)));
}

export function buildHull(root, reg, M) {
  const hull = group(root, 'hull');
  const body = group(hull, 'hullBody');
  const armorPlates = [];
  const det = new Batch();

  const plate = (parent, pts, hint, t, zone, mat = M.paint, holes) => {
    const n = planeNormal(pts, hint);
    const mesh = mk(parent, plateGeometry(pts, n, t, holes), mat);
    if (zone) reg.armorMesh(mesh, zone);
    armorPlates.push(mesh);
    return mesh;
  };

  const yS = H.sponsonFloor;
  const xFrontS = H.ufpXAt(yS);
  const xRearS = H.rearXAt(yS);

  // —— 上装甲板（UFP，68°）
  plate(body, [V3(H.noseX, H.noseY, -H.halfOut), V3(H.noseX, H.noseY, H.halfOut), V3(H.ufpTopX, H.roof, H.halfOut), V3(H.ufpTopX, H.roof, -H.halfOut)], V3(1, 1, 0), 0.12, 'hull_ufp');
  // —— 下装甲板（LFP）
  plate(body, [V3(H.lfpBottomX, H.belly, -H.halfIn), V3(H.lfpBottomX, H.belly, H.halfIn), V3(H.noseX, H.noseY, H.halfIn), V3(H.noseX, H.noseY, -H.halfIn)], V3(1, -1, 0), 0.08, 'hull_lfp');
  // —— 车底
  plate(body, [V3(H.rearBottomX, H.belly, -H.halfIn), V3(H.lfpBottomX, H.belly, -H.halfIn), V3(H.lfpBottomX, H.belly, H.halfIn), V3(H.rearBottomX, H.belly, H.halfIn)], V3(0, -1, 0), 0.03, 'hull_floor');

  for (const side of [-1, 1]) {
    const z = side * H.halfIn;
    const bx = H.bulkheadX;
    // 下车体侧板（前段 80 mm / 动力舱段 60 mm）
    plate(body, [V3(bx, H.belly, z), V3(H.lfpBottomX, H.belly, z), V3(H.noseX, H.noseY, z), V3(xFrontS, yS, z), V3(bx, yS, z)], V3(0, 0, side), 0.08, 'hull_side');
    plate(body, [V3(H.rearBottomX, H.belly, z), V3(bx, H.belly, z), V3(bx, yS, z), V3(xRearS, yS, z), V3(H.rearKneeX, H.rearKneeY, z)], V3(0, 0, side), 0.06, 'hull_side_rear');
    // 翼子板底甲
    const z0 = side * H.halfIn, z1 = side * H.halfOut;
    plate(body, [V3(xRearS, yS, z0), V3(xFrontS, yS, z0), V3(xFrontS, yS, z1), V3(xRearS, yS, z1)], V3(0, -1, 0), 0.025, 'sponson_floor');
    // 上车体侧板
    const zo = side * H.halfOut;
    plate(body, [V3(bx, yS, zo), V3(xFrontS, yS, zo), V3(H.ufpTopX, H.roof, zo), V3(bx, H.roof, zo)], V3(0, 0, side), 0.08, 'hull_side');
    plate(body, [V3(xRearS, yS, zo), V3(bx, yS, zo), V3(bx, H.roof, zo), V3(H.rearTopX, H.roof, zo)], V3(0, 0, side), 0.06, 'hull_side_rear');
  }

  // —— 车体顶甲（战斗室，开座圈孔）与动力舱顶盖
  plate(body, [V3(H.bulkheadX, H.roof, -H.halfOut), V3(H.ufpTopX, H.roof, -H.halfOut), V3(H.ufpTopX, H.roof, H.halfOut), V3(H.bulkheadX, H.roof, H.halfOut)], V3(0, 1, 0), 0.04, 'hull_roof', M.paint, [
    { center: V3(TURRET.x, H.roof, 0), r: TURRET.ringR - 0.02 },
  ]);
  const deck = group(hull, 'engineDeck');
  plate(deck, [V3(H.rearTopX, H.roof, -H.halfOut), V3(H.bulkheadX, H.roof, -H.halfOut), V3(H.bulkheadX, H.roof, H.halfOut), V3(H.rearTopX, H.roof, H.halfOut)], V3(0, 1, 0), 0.03, 'engine_deck');

  // —— 后装甲（上、中、下）
  plate(body, [V3(H.rearTopX, H.roof, -H.halfOut), V3(H.rearTopX, H.roof, H.halfOut), V3(xRearS, yS, H.halfOut), V3(xRearS, yS, -H.halfOut)], V3(-1, 0, 0), 0.05, 'hull_rear');
  plate(body, [V3(xRearS, yS, -H.halfIn), V3(xRearS, yS, H.halfIn), V3(H.rearKneeX, H.rearKneeY, H.halfIn), V3(H.rearKneeX, H.rearKneeY, -H.halfIn)], V3(-1, 0, 0), 0.05, 'hull_rear');
  plate(body, [V3(H.rearKneeX, H.rearKneeY, -H.halfIn), V3(H.rearKneeX, H.rearKneeY, H.halfIn), V3(H.rearBottomX, H.belly, H.halfIn), V3(H.rearBottomX, H.belly, -H.halfIn)], V3(-1, -1, 0), 0.05, 'hull_rear');

  buildWelds(det, M);
  buildFront(det, body, reg, M);
  buildRoof(det, M);
  buildSides(det, M);
  buildRear(det, hull, reg, M);
  buildDeck(deck, M);
  buildFenderBoxes(hull, reg, M);
  det.build(body, { name: 'hullDetails' });

  const eras = buildHullEra(hull, reg, M);
  const skirts = buildSkirts(hull, reg, M);

  reg.explodeGroup(deck, {
    id: 'deck',
    name: '动力舱顶盖',
    sub: '进气格栅 / 检修盖板',
    desc: '动力舱上方的检修盖板与燃气轮机进气格栅。燃气轮机需要大量空气，进气先经过旋风式空气滤清器。',
    offset: [-0.2, 1.55, 0],
    label: [-2.3, H.roof + 0.05, 0.9],
  });

  return { hull, body, deck, armorPlates, eras, skirts };
}

// ———————————————————— 焊缝 ————————————————————
function buildWelds(det, M) {
  const r = 0.011;
  const add = (a, b) => {
    const { geo, t } = rod(a, b, r, 6);
    det.add(geo, M.paintDark, t);
  };
  const yS = H.sponsonFloor;
  add([H.ufpTopX, H.roof + 0.004, -H.halfOut], [H.ufpTopX, H.roof + 0.004, H.halfOut]); // 上装甲板与顶甲
  add([H.noseX + 0.004, H.noseY, -H.halfIn], [H.noseX + 0.004, H.noseY, H.halfIn]); // 首上/首下交线
  for (const s of [-1, 1]) {
    const z = s * (H.halfOut + 0.004);
    add([H.noseX, H.noseY, z], [H.ufpTopX, H.roof, z]); // 上装甲板侧边
    add([H.ufpTopX, H.roof, z], [H.rearTopX, H.roof, z]); // 翼子板上沿
    add([H.rearTopX, H.roof, z], [H.rearXAt(yS), yS, z]); // 后角
    add([H.bulkheadX, yS + 0.01, z], [H.bulkheadX, H.roof - 0.01, z]); // 侧板分段
  }
  add([H.rearTopX - 0.004, H.roof, -H.halfOut], [H.rearTopX - 0.004, H.roof, H.halfOut]);
}

// ———————————————————— 车首 ————————————————————
function buildFront(det, body, reg, M) {
  const up = V3(-Math.cos(H.ufpSlope), Math.sin(H.ufpSlope), 0);
  const nrm = V3(Math.sin(H.ufpSlope), Math.cos(H.ufpSlope), 0);
  const onUfp = (s, z, h = 0) => V3(H.noseX, H.noseY, z).addScaledVector(up, s).addScaledVector(nrm, h);

  // 大灯（左侧白光 + 红外，右侧白光），带立柱与护栏
  for (const side of [-1, 1]) {
    const base = onUfp(1.44, side * 1.46, 0);
    det.add(new THREE.BoxGeometry(0.12, 0.05, 0.12), M.paintDark, { pos: [base.x, base.y + 0.02, base.z], rot: [0, 0, -H.ufpSlope] });
    det.add(new THREE.BoxGeometry(0.05, 0.12, 0.05), M.paintDark, { pos: [base.x, base.y + 0.09, base.z] });
    const lampAt = (dz, lensMat) => {
      const c = V3(base.x, base.y + 0.19, base.z + dz);
      det.add(cylX(0.075, 0.068, 0.15, 20), M.darkMetal, { pos: [c.x + 0.02, c.y, c.z] });
      det.add(new THREE.CircleGeometry(0.062, 20), lensMat, { pos: [c.x + 0.096, c.y, c.z], rot: [0, Math.PI / 2, 0] });
      det.add(
        tube([[c.x - 0.02, c.y - 0.09, c.z - 0.09], [c.x + 0.13, c.y - 0.05, c.z - 0.1], [c.x + 0.17, c.y + 0.02, c.z], [c.x + 0.13, c.y - 0.05, c.z + 0.1], [c.x - 0.02, c.y - 0.09, c.z + 0.09]], 0.01, { segments: 30 }),
        M.paint,
      );
    };
    lampAt(0, M.light);
    if (side < 0) lampAt(0.2, M.lens);
  }

  // 驾驶员舱盖与潜望镜
  const hx = 1.72;
  det.add(new THREE.CylinderGeometry(0.33, 0.34, 0.04, 36), M.paint, { pos: [hx, H.roof + 0.02, 0] });
  det.add(
    new THREE.LatheGeometry([[0.0001, 0.07], [0.12, 0.068], [0.24, 0.058], [0.285, 0.04], [0.29, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 32),
    M.paint,
    { pos: [hx, H.roof + 0.04, 0] },
  );
  det.add(new THREE.BoxGeometry(0.12, 0.06, 0.22), M.paintDark, { pos: [hx - 0.3, H.roof + 0.06, 0] });
  det.add(cylZ(0.03, 0.26, 10), M.paintDark, { pos: [hx - 0.3, H.roof + 0.08, 0] });
  det.add(handle([hx + 0.05, H.roof + 0.1, -0.08], [hx + 0.05, H.roof + 0.1, 0.08], [0, 1, 0], 0.04, 0.01), M.darkMetal);
  // 3 具 TNPO 潜望镜（带装甲罩）
  const cowl = new THREE.ExtrudeGeometry(new THREE.Shape([[-0.07, 0], [0.07, 0], [0.05, 0.075], [-0.06, 0.08]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.13, bevelEnabled: false });
  cowl.translate(0, 0, -0.065);
  for (const z of [-0.2, 0, 0.2]) {
    det.add(cowl, M.paintDark, { pos: [hx + 0.36, H.roof + 0.005, z] });
    det.add(new THREE.PlaneGeometry(0.11, 0.05), M.glass, { pos: [hx + 0.425, H.roof + 0.045, z], rot: [0, Math.PI / 2, -0.25] });
  }
  // 车首把手与牵引钩
  for (const z of [-0.55, 0.55]) det.add(handle(onUfp(1.45, z - 0.1).toArray(), onUfp(1.45, z + 0.1).toArray(), nrm.toArray(), 0.05, 0.011), M.darkMetal);
  const lfpDir = V3(Math.cos(H.lfpSlope), Math.sin(H.lfpSlope), 0);
  const lfpN = V3(Math.sin(H.lfpSlope), -Math.cos(H.lfpSlope), 0);
  for (const z of [-0.72, 0.72]) {
    const p = V3(H.noseX, H.noseY, z).addScaledVector(lfpDir, -0.12).addScaledVector(lfpN, 0.05);
    det.add(new THREE.BoxGeometry(0.1, 0.16, 0.12), M.paintDark, { pos: p.clone().addScaledVector(lfpN, -0.03).toArray(), rot: [0, 0, -H.lfpSlope] });
    det.add(new THREE.TorusGeometry(0.07, 0.022, 8, 18), M.darkMetal, { pos: p.toArray(), rot: [0, Math.PI / 2, 0] });
  }

  // 推土铲（下装甲板上的自救推土铲）+ 支撑筋
  const dozerCenter = V3(H.lfpBottomX, H.belly, 0).addScaledVector(lfpDir, 0.3).addScaledVector(lfpN, 0.05);
  const dozer = mk(body, new RoundedBoxGeometry(0.34, 0.06, 2.0, 2, 0.015), M.paint, { pos: dozerCenter.toArray() });
  dozer.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lfpDir, lfpN, V3(0, 0, -1)));
  reg.armorMesh(dozer, 'dozer');
  for (const z of [-0.95, -0.35, 0.35, 0.95]) {
    const p = dozerCenter.clone().addScaledVector(lfpN, -0.02).add(V3(0, 0, z));
    det.add(new THREE.BoxGeometry(0.3, 0.1, 0.03), M.paintDark, { pos: p.toArray(), rot: [0, 0, H.lfpSlope] });
  }

  // 前挡泥板（诱导轮上方）与橡胶挡泥皮
  for (const side of [-1, 1]) {
    const pts = [
      [H.noseX - 0.06, H.noseY + 0.02],
      [H.noseX + 0.07, H.noseY + 0.002],
      [H.noseX + 0.15, H.noseY - 0.04],
      [H.noseX + 0.185, H.noseY - 0.1],
    ];
    det.add(sheetGeo(pts, 0.012, 0.62), M.paint, { pos: [0, 0, side * R.trackZ - 0.31] });
    det.add(new THREE.BoxGeometry(0.012, 0.11, 0.58), M.rubber, { pos: [H.noseX + 0.19, H.noseY - 0.155, side * R.trackZ], rot: [0, 0, 0.1] });
    const { geo, t } = rod(V3(H.noseX + 0.14, H.noseY - 0.04, side * (R.trackZ - 0.27)), V3(H.noseX - 0.02, H.noseY - 0.09, side * (R.trackZ - 0.29)), 0.01, 6);
    det.add(geo, M.paintDark, t);
  }
}

// ———————————————————— 车体顶部 ————————————————————
function buildRoof(det, M) {
  // 座圈防护环（防止弹片卡住炮塔）
  det.add(new THREE.CylinderGeometry(TURRET.ringR + 0.06, TURRET.ringR + 0.09, 0.05, 72, 1, true), M.paint, { pos: [TURRET.x, H.roof + 0.025, 0] });
  det.add(new THREE.TorusGeometry(TURRET.ringR + 0.07, 0.014, 6, 72), M.paintDark, { pos: [TURRET.x, H.roof + 0.05, 0], rot: [Math.PI / 2, 0, 0] });
  // 起吊环
  for (const z of [1.35, -1.35]) {
    det.add(new THREE.BoxGeometry(0.08, 0.03, 0.05), M.paintDark, { pos: [1.25, H.roof + 0.015, z] });
    det.add(new THREE.TorusGeometry(0.04, 0.012, 6, 14), M.darkMetal, { pos: [1.25, H.roof + 0.06, z], rot: [0, Math.PI / 2, 0] });
  }
  // 顶甲上的检修口
  det.add(new THREE.CylinderGeometry(0.12, 0.13, 0.05, 20), M.paintDark, { pos: [1.28, H.roof + 0.025, 0.55] });
  det.add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 20), M.paint, { pos: [1.28, H.roof + 0.06, 0.55] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    det.add(boltGeo(0.012, 0.012), M.darkMetal, { pos: [1.28 + Math.cos(a) * 0.105, H.roof + 0.05, 0.55 + Math.sin(a) * 0.105] });
  }
}

// ———————————————————— 车体两侧：牵引钢缆 ————————————————————
function buildSides(det, M) {
  for (const side of [-1, 1]) {
    const z = side * (H.halfOut + 0.03);
    for (const [y, x0, x1] of [
      [1.14, 1.75, -2.6],
      [1.27, 1.6, -2.45],
    ]) {
      const pts = [];
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const sag = Math.sin(k * Math.PI * 3) * 0.008 - (i % 2 ? 0.012 : 0);
        pts.push(V3(x0 + (x1 - x0) * k, y + sag, z));
      }
      det.add(tube(pts, 0.019, { segments: 60, radial: 7 }), M.cable);
      for (const [x, s] of [[x0, 1], [x1, -1]]) det.add(new THREE.TorusGeometry(0.06, 0.018, 7, 16), M.cable, { pos: [x + s * 0.06, y, z] });
      for (let i = 1; i < n; i += 2) det.add(new THREE.BoxGeometry(0.05, 0.07, 0.04), M.paintDark, { pos: [x0 + ((x1 - x0) * i) / n, y, z - side * 0.005] });
    }
  }
}

// ———————————————————— 车尾 ————————————————————
function buildRear(det, hull, reg, M) {
  const rearOut = V3(-(H.roof - H.sponsonFloor), H.rearTopX - H.rearXAt(H.sponsonFloor), 0).normalize();
  // 燃气轮机排气百叶窗
  const ex = new THREE.Matrix4().compose(V3(H.rearXAt(1.2) - 0.03, 1.2, 0), new THREE.Quaternion().setFromUnitVectors(V3(-1, 0, 0), rearOut), V3(1, 1, 1));
  const exAdd = (geo, mat, pos, rot = [0, 0, 0]) => det.add(geo, mat, new THREE.Matrix4().multiplyMatrices(ex, new THREE.Matrix4().compose(V3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V3(1, 1, 1))));
  exAdd(new THREE.BoxGeometry(0.05, 0.4, 1.36), M.paint, [-0.01, 0, 0]);
  exAdd(new THREE.BoxGeometry(0.03, 0.32, 1.26), M.darkMetal, [-0.035, 0, 0]);
  for (let i = 0; i < 7; i++) exAdd(new THREE.BoxGeometry(0.11, 0.022, 1.24), M.steel, [-0.075, -0.14 + i * 0.047, 0], [0, 0, 0.55]);
  for (const z of [-0.42, 0, 0.42]) exAdd(new THREE.BoxGeometry(0.12, 0.34, 0.02), M.steel, [-0.075, 0, z]);
  // 尾灯（带护罩）
  for (const z of [-1.45, 1.45]) {
    const x = H.rearXAt(1.3) - 0.03;
    det.add(new THREE.BoxGeometry(0.06, 0.09, 0.15), M.darkMetal, { pos: [x, 1.3, z] });
    det.add(new THREE.PlaneGeometry(0.1, 0.05), M.redLens, { pos: [x - 0.032, 1.3, z], rot: [0, -Math.PI / 2, 0] });
    det.add(tube([[x + 0.01, 1.24, z - 0.1], [x - 0.08, 1.26, z - 0.1], [x - 0.09, 1.36, z], [x - 0.08, 1.26, z + 0.1], [x + 0.01, 1.24, z + 0.1]], 0.008, { segments: 24 }), M.paint);
  }
  // 后拖钩
  for (const z of [-0.7, 0.7]) {
    det.add(new THREE.BoxGeometry(0.1, 0.14, 0.12), M.paintDark, { pos: [H.rearKneeX - 0.02, 0.68, z] });
    det.add(new THREE.TorusGeometry(0.07, 0.022, 8, 18), M.darkMetal, { pos: [H.rearKneeX - 0.06, 0.68, z], rot: [0, Math.PI / 2, 0] });
  }
  // 后挡泥板（主动轮上方）
  for (const side of [-1, 1]) {
    const x0 = H.rearXAt(H.sponsonFloor);
    const pts = [
      [x0 + 0.05, H.sponsonFloor - 0.005],
      [x0 - 0.07, H.sponsonFloor - 0.025],
      [x0 - 0.14, H.sponsonFloor - 0.08],
      [x0 - 0.165, H.sponsonFloor - 0.16],
    ];
    det.add(sheetGeo(pts, 0.012, 0.62), M.paint, { pos: [0, 0, side * R.trackZ - 0.31] });
    det.add(new THREE.BoxGeometry(0.012, 0.13, 0.58), M.rubber, { pos: [x0 - 0.17, H.sponsonFloor - 0.225, side * R.trackZ], rot: [0, 0, -0.08] });
  }

  // 外挂油桶（200 L ×2）与自救木
  const drums = group(hull, 'drums');
  const dd = new Batch();
  for (const side of [-1, 1]) {
    const c = V3(H.rearTopX - 0.32, H.roof - 0.02, side * 1.12);
    const d = mk(drums, cylZ(0.27, 0.8, 32), M.paint, { pos: c.toArray() });
    reg.armorMesh(d, 'drum');
    for (const dz of [-0.2, 0.2]) dd.add(new THREE.TorusGeometry(0.272, 0.012, 6, 36), M.paint, { pos: [c.x, c.y, c.z + dz] });
    for (const dz of [-0.4, 0.4]) dd.add(new THREE.TorusGeometry(0.262, 0.014, 6, 36), M.paintDark, { pos: [c.x, c.y, c.z + dz] });
    dd.add(cylZ(0.045, 0.04, 10), M.darkMetal, { pos: [c.x + 0.12, c.y + 0.1, c.z + side * 0.41] });
    dd.add(new THREE.BoxGeometry(0.36, 0.05, 0.05), M.paintDark, { pos: [c.x + 0.12, c.y - 0.27, c.z - 0.28] });
    dd.add(new THREE.BoxGeometry(0.36, 0.05, 0.05), M.paintDark, { pos: [c.x + 0.12, c.y - 0.27, c.z + 0.28] });
    for (const dz of [-0.28, 0.28]) {
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const a = -Math.PI * 0.5 + (i / 16) * Math.PI * 1.15;
        pts.push(V3(c.x + Math.cos(a) * 0.285, c.y + Math.sin(a) * 0.285, c.z + dz));
      }
      dd.add(tube(pts, 0.012, { segments: 40, radial: 5 }), M.strap);
    }
  }
  const logC = V3(H.rearTopX - 0.16, H.roof + 0.07, 0);
  dd.add(cylZ(0.11, 1.34, 14), M.wood, { pos: logC.toArray() });
  for (const dz of [-0.45, 0.45]) {
    dd.add(new THREE.TorusGeometry(0.118, 0.012, 6, 20), M.darkMetal, { pos: [logC.x, logC.y, dz] });
    dd.add(new THREE.BoxGeometry(0.12, 0.04, 0.05), M.paintDark, { pos: [logC.x + 0.06, logC.y - 0.1, dz] });
  }
  dd.build(drums, { name: 'drumDetails' });
  reg.explodeGroup(drums, {
    id: 'drums',
    name: '外挂油桶与自救木',
    sub: '2 × 200 L',
    desc: '车尾外挂的两个 200 升附加油桶，可在战斗前抛掉；中间是用于陷车自救的圆木。',
    offset: [-1.3, 0.25, 0],
    label: [H.rearTopX - 0.3, H.roof + 0.3, 1.12],
  });
}

// ———————————————————— 动力舱顶盖 ————————————————————
function buildDeck(deck, M) {
  const det = new Batch();
  for (const side of [-1, 1]) {
    louverGrille(det, M, { len: 1.7, wid: 0.78, n: 11, tilt: 0.65, t: new THREE.Matrix4().makeTranslation(-2.3, H.roof + 0.015, side * 0.8) });
    for (const x of [-2.95, -1.65]) det.add(cylX(0.022, 0.022, 0.14, 10), M.paintDark, { pos: [x, H.roof + 0.04, side * 0.36] });
  }
  // 中央检修盖板与三个圆形舱盖
  det.add(new RoundedBoxGeometry(1.9, 0.05, 0.5, 2, 0.01), M.paint, { pos: [-2.28, H.roof + 0.025, 0] });
  for (const x of [-3.0, -2.3, -1.6]) {
    det.add(new THREE.CylinderGeometry(0.13, 0.135, 0.03, 24), M.paint, { pos: [x, H.roof + 0.065, 0] });
    det.add(handle([x - 0.06, H.roof + 0.08, 0], [x + 0.06, H.roof + 0.08, 0], [0, 1, 0], 0.03, 0.008), M.darkMetal);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      det.add(boltGeo(0.01, 0.01), M.darkMetal, { pos: [x + Math.cos(a) * 0.11, H.roof + 0.08, Math.sin(a) * 0.11] });
    }
  }
  // 横向格栅（车尾）
  louverGrille(det, M, { len: 0.28, wid: 2.3, n: 16, tilt: 0.4, t: new THREE.Matrix4().makeTranslation(H.rearTopX + 0.22, H.roof + 0.015, 0) });
  // 加油口
  for (const z of [-1.38, 1.38]) {
    det.add(new THREE.CylinderGeometry(0.06, 0.065, 0.04, 16), M.paintDark, { pos: [-1.32, H.roof + 0.02, z] });
    det.add(new THREE.BoxGeometry(0.1, 0.015, 0.03), M.darkMetal, { pos: [-1.32, H.roof + 0.045, z] });
  }
  det.build(deck, { name: 'deckDetails' });
}

// ———————————————————— 翼子板储物箱 / 外置油箱 ————————————————————
function buildFenderBoxes(hull, reg, M) {
  const boxes = group(hull, 'fenderBoxes');
  const det = new Batch();
  const defs = [
    // x0, x1, side, h, kind
    [-3.25, -2.35, 1, 0.34, 'tank'],
    [-2.28, -1.4, 1, 0.34, 'tank'],
    [-3.25, -2.3, -1, 0.28, 'box'],
    [-2.22, -1.4, -1, 0.28, 'box'],
    [1.36, 1.98, 1, 0.22, 'box'],
    [1.36, 1.98, -1, 0.22, 'box'],
  ];
  const w = 0.46;
  for (const [x0, x1, side, h, kind] of defs) {
    const cx = (x0 + x1) / 2, L = x1 - x0;
    const cz = side * (H.halfOut - w / 2 - 0.03);
    const b = mk(boxes, new RoundedBoxGeometry(L, h, w, 2, kind === 'tank' ? 0.05 : 0.02), M.paint, { pos: [cx, H.roof + h / 2, cz] });
    reg.armorMesh(b, 'hull_box');
    const outer = cz + side * (w / 2);
    if (kind === 'tank') {
      // 外置油箱：加强筋 + 油口 + 连接管
      for (const f of [-0.3, 0, 0.3]) det.add(new THREE.BoxGeometry(0.02, h * 0.9, w + 0.01), M.paint, { pos: [cx + f * L, H.roof + h / 2, cz] });
      det.add(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), M.darkMetal, { pos: [cx + L * 0.35, H.roof + h + 0.02, cz] });
      det.add(tube([[cx - L / 2 + 0.05, H.roof + 0.08, cz - side * w * 0.52], [cx - L / 2 + 0.05, H.roof + 0.03, cz - side * w * 0.6]], 0.02), M.darkMetal);
    } else {
      // 储物箱：箱盖缝、搭扣、铰链、把手
      det.add(new THREE.BoxGeometry(L - 0.04, 0.012, 0.012), M.paintDark, { pos: [cx, H.roof + h * 0.78, outer + side * 0.004] });
      for (const f of [-0.3, 0.3]) {
        det.add(new THREE.BoxGeometry(0.04, 0.06, 0.02), M.darkMetal, { pos: [cx + f * L, H.roof + h * 0.62, outer + side * 0.01] });
        det.add(cylX(0.012, 0.012, 0.08, 8), M.paintDark, { pos: [cx + f * L, H.roof + h + 0.003, cz - side * (w / 2 - 0.02)] });
      }
      det.add(handle([cx - 0.08, H.roof + h * 0.45, outer], [cx + 0.08, H.roof + h * 0.45, outer], [0, 0, side], 0.035, 0.008), M.darkMetal);
    }
  }
  // 工具：撬棍与铁锹（左侧翼子板外沿）
  det.add(cylX(0.016, 0.016, 1.3, 8), M.darkMetal, { pos: [-2.3, H.roof - 0.1, -H.halfOut - 0.04] });
  det.add(new THREE.BoxGeometry(0.22, 0.16, 0.02), M.darkMetal, { pos: [-1.55, H.roof - 0.22, -H.halfOut - 0.04] });
  det.add(cylX(0.018, 0.018, 0.75, 8), M.wood, { pos: [-2.05, H.roof - 0.22, -H.halfOut - 0.045] });
  det.build(boxes, { name: 'boxDetails' });
  reg.explodeGroup(boxes, {
    id: 'fenderBoxes',
    name: '翼子板储物箱 / 外置油箱',
    sub: '车体两侧',
    desc: '安装在翼子板上的储物箱与外置油箱。它们对破甲弹有少量“间隔装甲”效果，但本身不属于主装甲。',
    offset: [0, 0.35, 0],
    label: [-2.3, H.roof + 0.35, 1.35],
  });
}

// ———————————————————— 上装甲板“接触-5” ————————————————————
function buildHullEra(hull, reg, M) {
  const era = group(hull, 'eraHull');
  const up = V3(-Math.cos(H.ufpSlope), Math.sin(H.ufpSlope), 0);
  const down = up.clone().negate();
  const nrm = V3(Math.sin(H.ufpSlope), Math.cos(H.ufpSlope), 0);
  const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(down, nrm, V3(0, 0, 1)));
  const blocks = [];
  const rows = [
    { s: 0.4, len: 0.62 },
    { s: 1.07, len: 0.6 },
  ];
  const cols = 6;
  const bw = 0.5, gap = 0.045;
  const geoFor = (len) => {
    const parts = [new RoundedBoxGeometry(len, 0.085, bw, 2, 0.014), place(new RoundedBoxGeometry(len - 0.07, 0.014, bw - 0.07, 1, 0.005), { pos: [0, 0.048, 0] })];
    for (const a of [-len / 2 + 0.05, 0, len / 2 - 0.05]) for (const b of [-bw / 2 + 0.05, bw / 2 - 0.05]) parts.push(place(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 6), { pos: [a, 0.05, b] }));
    return merge(parts);
  };
  for (const row of rows) {
    const geo = geoFor(row.len);
    const edge = new THREE.BoxGeometry(row.len, 0.085, bw); // X 光轮廓只描箱体，不描螺栓
    for (let c = 0; c < cols; c++) {
      const z = -((cols - 1) / 2) * (bw + gap) + c * (bw + gap);
      const pos = V3(H.noseX, H.noseY, z).addScaledVector(up, row.s).addScaledVector(nrm, 0.047);
      const m = mk(era, geo, M.paint, { pos: pos.toArray() });
      // 轻微的“V”形布置（绕板面法线转动）
      m.quaternion.copy(q0).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), (z > 0 ? 1 : -1) * 0.06));
      m.userData.edgeGeo = edge;
      reg.armorMesh(m, 'era_hull');
      m.userData.era = true;
      blocks.push(m);
    }
  }
  reg.explodeGroup(era, {
    id: 'eraHull',
    name: '“接触-5”爆炸反应装甲（车体）',
    sub: 'Kontakt-5 · 上装甲板',
    desc: '覆盖车体上装甲板的重型爆炸反应装甲。被击中时内部炸药起爆，推动厚钢板斜向切割来袭弹丸，对穿甲弹和破甲弹都有效；每块只能起作用一次。',
    offset: [1.1, 1.05, 0],
    label: [H.noseX - 0.9, H.noseY + 0.5, 0.6],
  });
  return blocks;
}

// ———————————————————— 侧裙 ————————————————————
function buildSkirts(hull, reg, M) {
  const out = [];
  const x0 = -3.3, x1 = 3.22, n = 8;
  const w = (x1 - x0) / n;
  for (const side of [-1, 1]) {
    const g = group(hull, side < 0 ? 'skirtL' : 'skirtR');
    const det = new Batch();
    const z = side * (H.halfOut + 0.045);
    for (let i = 0; i < n; i++) {
      const xa = x0 + i * w + 0.01, xb = x0 + (i + 1) * w - 0.01;
      const cx = (xa + xb) / 2, L = xb - xa;
      const front = i >= n - 3;
      const h = 0.43;
      const thick = front ? 0.07 : 0.018;
      const cz = z + side * (thick / 2 - 0.009);
      const geo = front ? new RoundedBoxGeometry(L, h, thick, 2, 0.01) : new THREE.BoxGeometry(L, h, thick);
      const m = mk(g, geo, front ? M.paint : M.skirt, { pos: [cx, 0.99 - h / 2, cz] });
      reg.armorMesh(m, front ? 'era_skirt' : 'skirt');
      if (front) m.userData.era = true;
      const face = cz + side * (thick / 2);
      if (front) {
        // 装甲裙板：横向压条 + 两排螺栓 + 底部橡胶边
        det.add(new THREE.BoxGeometry(L - 0.03, 0.02, 0.012), M.paintDark, { pos: [cx, 0.8, face] });
        for (let k = 0; k < 5; k++) for (const y of [0.9, 0.7]) det.add(boltGeo(0.014, 0.012), M.paintDark, { pos: [cx - L / 2 + 0.08 + (k * (L - 0.16)) / 4, y, face], rot: [(side * Math.PI) / 2, 0, 0] });
        det.add(new THREE.BoxGeometry(L, 0.08, 0.02), M.rubber, { pos: [cx, 0.99 - h - 0.035, cz] });
      } else {
        // 橡胶裙板：竖向加强肋
        for (let k = 1; k < 4; k++) det.add(new THREE.BoxGeometry(0.025, h - 0.06, 0.008), M.skirt, { pos: [xa + (k * L) / 4, 0.99 - h / 2 - 0.02, face + side * 0.003] });
      }
      // 顶部压条与螺栓
      det.add(new THREE.BoxGeometry(L, 0.04, 0.03), M.paintDark, { pos: [cx, 0.99, z + side * 0.014] });
      for (let k = 0; k < 4; k++) det.add(boltGeo(0.013, 0.012), M.darkMetal, { pos: [xa + 0.08 + (k * (L - 0.16)) / 3, 0.99, z + side * 0.03], rot: [(side * Math.PI) / 2, 0, 0] });
      out.push(m);
    }
    // 裙板挂架
    for (let i = 0; i <= n; i++) det.add(new THREE.BoxGeometry(0.05, 0.05, 0.09), M.paintDark, { pos: [x0 + i * w, 1.005, side * (H.halfOut + 0.01)] });
    det.build(g, { name: 'skirtDetails' });
    reg.explodeGroup(g, {
      id: side < 0 ? 'skirtL' : 'skirtR',
      name: side < 0 ? '左侧裙板' : '右侧裙板',
      sub: '前三块内置“接触-5”',
      desc: '橡胶-织物侧裙遮挡履带上半部；前段三块为带爆炸反应装甲的加强裙板，对侧面来袭的破甲弹起间隔装甲作用。',
      offset: [0, 0.2, side * 1.25],
      label: [2.2, 0.8, z],
    });
  }
  return out;
}

export { basis };
