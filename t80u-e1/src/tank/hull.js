// 车体：由装甲板拼成的空心车体（便于 X 光透视与内部布置），以及车体外部附件。
import * as THREE from 'three';
import { HULL as H, TURRET } from './dims.js';
import { plateGeometry, V3, cylX, cylZ, merge, place, RoundedBoxGeometry } from './geom.js';
import { mk, group } from './registry.js';

const planeNormal = (pts, hint) => {
  const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0])).normalize();
  if (n.dot(hint) < 0) n.negate();
  return n;
};

export function buildHull(root, reg, M) {
  const hull = group(root, 'hull');
  const body = group(hull, 'hullBody');
  const armorPlates = [];

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

  // —— 下车体侧板（前段 80 mm / 动力舱段 60 mm）
  for (const side of [-1, 1]) {
    const z = side * H.halfIn;
    const bx = H.bulkheadX;
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
  plate(body, [V3(H.bulkheadX, H.roof, -H.halfOut), V3(H.ufpTopX, H.roof, -H.halfOut), V3(H.ufpTopX, H.roof, H.halfOut), V3(H.bulkheadX, H.roof, H.halfOut)], V3(0, 1, 0), 0.04, 'hull_roof', M.paint, [{ center: V3(TURRET.x, H.roof, 0), r: TURRET.ringR - 0.02 }]);
  const deck = group(hull, 'engineDeck');
  plate(deck, [V3(H.rearTopX, H.roof, -H.halfOut), V3(H.bulkheadX, H.roof, -H.halfOut), V3(H.bulkheadX, H.roof, H.halfOut), V3(H.rearTopX, H.roof, H.halfOut)], V3(0, 1, 0), 0.03, 'engine_deck');

  // —— 后装甲（上、中、下）
  plate(body, [V3(H.rearTopX, H.roof, -H.halfOut), V3(H.rearTopX, H.roof, H.halfOut), V3(xRearS, yS, H.halfOut), V3(xRearS, yS, -H.halfOut)], V3(-1, 0, 0), 0.05, 'hull_rear');
  plate(body, [V3(xRearS, yS, -H.halfIn), V3(xRearS, yS, H.halfIn), V3(H.rearKneeX, H.rearKneeY, H.halfIn), V3(H.rearKneeX, H.rearKneeY, -H.halfIn)], V3(-1, 0, 0), 0.05, 'hull_rear');
  plate(body, [V3(H.rearKneeX, H.rearKneeY, -H.halfIn), V3(H.rearKneeX, H.rearKneeY, H.halfIn), V3(H.rearBottomX, H.belly, H.halfIn), V3(H.rearBottomX, H.belly, -H.halfIn)], V3(-1, -1, 0), 0.05, 'hull_rear');

  buildHullDetails(hull, body, deck, reg, M);
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

function buildHullDetails(hull, body, deck, reg, M) {
  // 驾驶员舱盖与潜望镜
  const hatch = new THREE.Group();
  hatch.position.set(1.7, H.roof, 0);
  body.add(hatch);
  mk(hatch, new THREE.CylinderGeometry(0.29, 0.31, 0.05, 32), M.paint, { pos: [0, 0.025, 0] });
  mk(hatch, new THREE.CylinderGeometry(0.24, 0.26, 0.04, 32), M.paintDark, { pos: [0, 0.06, 0] });
  mk(hatch, new THREE.BoxGeometry(0.1, 0.05, 0.16), M.paintDark, { pos: [-0.27, 0.05, 0] });
  for (const z of [-0.2, 0, 0.2]) {
    const p = mk(hatch, new THREE.BoxGeometry(0.12, 0.08, 0.13), M.darkMetal, { pos: [0.33, 0.04, z] });
    mk(hatch, new THREE.BoxGeometry(0.02, 0.05, 0.1), M.glass, { pos: [0.4, 0.05, z] });
    p.rotation.z = -0.25;
  }

  // 车前大灯（带护罩）
  for (const side of [-1, 1]) {
    const s = 1.43; // 沿斜面距离（上装甲板顶角）
    const up = V3(-Math.cos(H.ufpSlope), Math.sin(H.ufpSlope), 0);
    const nrm = V3(Math.sin(H.ufpSlope), Math.cos(H.ufpSlope), 0);
    const base = V3(H.noseX, H.noseY, side * 1.44).addScaledVector(up, s).addScaledVector(nrm, 0.02);
    const lamp = new THREE.Group();
    lamp.position.copy(base);
    body.add(lamp);
    mk(lamp, new THREE.BoxGeometry(0.1, 0.12, 0.1), M.paintDark, { pos: [0, 0.06, 0] });
    const head = mk(lamp, cylX(0.075, 0.075, 0.14, 20), M.darkMetal, { pos: [0.03, 0.17, 0] });
    mk(lamp, new THREE.CircleGeometry(0.062, 20), M.light, { pos: [0.101, 0.17, 0], rot: [0, Math.PI / 2, 0] });
    mk(lamp, new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI), M.paint, { pos: [0.05, 0.17, 0], rot: [0, Math.PI / 2, 0] });
    head.castShadow = true;
  }

  // 推土铲（下装甲板上的自救推土铲）
  const lfpDir = V3(Math.cos(H.lfpSlope), Math.sin(H.lfpSlope), 0);
  const lfpN = V3(Math.sin(H.lfpSlope), -Math.cos(H.lfpSlope), 0);
  const dozerCenter = V3(H.lfpBottomX, H.belly, 0).addScaledVector(lfpDir, 0.3).addScaledVector(lfpN, 0.05);
  const dozer = mk(body, new THREE.BoxGeometry(0.34, 0.06, 2.0), M.paint, { pos: dozerCenter.toArray() });
  dozer.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lfpDir, lfpN, V3(0, 0, -1)));
  reg.armorMesh(dozer, 'dozer');
  // 前拖钩
  for (const z of [-0.72, 0.72]) {
    const p = V3(H.noseX, H.noseY, z).addScaledVector(lfpDir, -0.12).addScaledVector(lfpN, 0.05);
    mk(body, new THREE.TorusGeometry(0.07, 0.022, 8, 16), M.darkMetal, { pos: p.toArray(), rot: [0, Math.PI / 2, 0] });
  }

  // 后部：燃气轮机排气百叶窗
  const rearOut = V3(-(H.roof - H.sponsonFloor), H.rearTopX - H.rearXAt(H.sponsonFloor), 0).normalize();
  const exhaust = new THREE.Group();
  exhaust.position.set(H.rearXAt(1.2) - 0.02, 1.2, 0);
  exhaust.quaternion.setFromUnitVectors(V3(-1, 0, 0), rearOut);
  body.add(exhaust);
  mk(exhaust, new THREE.BoxGeometry(0.06, 0.36, 1.3), M.darkMetal, { pos: [-0.02, 0, 0] });
  for (let i = 0; i < 6; i++) {
    const s = mk(exhaust, new THREE.BoxGeometry(0.09, 0.025, 1.24), M.steel, { pos: [-0.06, -0.14 + i * 0.056, 0] });
    s.rotation.z = 0.5;
  }
  // 尾灯
  for (const z of [-1.45, 1.45]) mk(body, new THREE.BoxGeometry(0.05, 0.08, 0.14), M.darkMetal, { pos: [H.rearXAt(1.3) - 0.03, 1.3, z] });
  // 后拖钩
  for (const z of [-0.7, 0.7]) mk(body, new THREE.TorusGeometry(0.07, 0.022, 8, 16), M.darkMetal, { pos: [H.rearKneeX - 0.04, 0.68, z], rot: [0, Math.PI / 2, 0] });

  // 外挂油桶（200 L ×2）与自救木
  const drums = group(hull, 'drums');
  for (const side of [-1, 1]) {
    const drum = new THREE.Group();
    drum.position.set(H.rearTopX - 0.32, H.roof - 0.02, side * 1.12);
    drums.add(drum);
    const d = mk(drum, cylZ(0.27, 0.8, 28), M.paint);
    reg.armorMesh(d, 'drum');
    for (const dz of [-0.24, 0.24]) mk(drum, cylZ(0.28, 0.035, 28), M.paintDark, { pos: [0, 0, dz] });
    mk(drum, cylZ(0.06, 0.04, 10), M.darkMetal, { pos: [0.11, 0.11, side * 0.41] });
    // 支架
    mk(drum, new THREE.BoxGeometry(0.34, 0.05, 0.05), M.darkMetal, { pos: [0.12, -0.28, -0.3] });
    mk(drum, new THREE.BoxGeometry(0.34, 0.05, 0.05), M.darkMetal, { pos: [0.12, -0.28, 0.3] });
  }
  mk(drums, cylZ(0.11, 1.34, 14), M.wood, { pos: [H.rearTopX - 0.16, H.roof + 0.07, 0] });
  mk(drums, cylZ(0.117, 0.05, 14), M.darkMetal, { pos: [H.rearTopX - 0.16, H.roof + 0.07, -0.45] });
  mk(drums, cylZ(0.117, 0.05, 14), M.darkMetal, { pos: [H.rearTopX - 0.16, H.roof + 0.07, 0.45] });
  reg.explodeGroup(drums, {
    id: 'drums',
    name: '外挂油桶与自救木',
    sub: '2 × 200 L',
    desc: '车尾外挂的两个 200 升附加油桶，可在战斗前抛掉；中间是用于陷车自救的圆木。',
    offset: [-1.3, 0.25, 0],
    label: [H.rearTopX - 0.3, H.roof + 0.3, 1.12],
  });

  // 动力舱进气格栅
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(-2.3, H.roof + 0.015, side * 0.78);
    deck.add(g);
    mk(g, new THREE.BoxGeometry(1.7, 0.03, 0.95), M.paintDark);
    for (let i = 0; i < 12; i++) {
      mk(g, new THREE.BoxGeometry(1.62, 0.035, 0.03), M.darkMetal, { pos: [0, 0.02, -0.42 + i * 0.077] });
    }
  }
  mk(deck, new THREE.BoxGeometry(1.9, 0.05, 0.42), M.paint, { pos: [-2.28, H.roof + 0.025, 0] });
  for (const x of [-3.0, -2.3, -1.6]) mk(deck, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), M.darkMetal, { pos: [x, H.roof + 0.06, 0] });

  // 翼子板储物箱 / 外置油箱
  const boxes = group(hull, 'fenderBoxes');
  const boxDefs = [
    // x0, x1, side, h
    [-3.25, -2.35, 1, 0.32],
    [-2.28, -1.4, 1, 0.32],
    [-3.25, -2.3, -1, 0.26],
    [-2.22, -1.4, -1, 0.26],
    [1.36, 1.98, 1, 0.22],
    [1.36, 1.98, -1, 0.22],
  ];
  for (const [x0, x1, side, h] of boxDefs) {
    const w = 0.46;
    const geo = new RoundedBoxGeometry(x1 - x0, h, w, 2, 0.02);
    const b = mk(boxes, geo, M.paint, { pos: [(x0 + x1) / 2, H.roof + h / 2, side * (H.halfOut - w / 2 - 0.03)] });
    reg.armorMesh(b, 'hull_box');
    mk(boxes, new THREE.BoxGeometry(x1 - x0 - 0.06, 0.02, 0.03), M.paintDark, { pos: [(x0 + x1) / 2, H.roof + h * 0.7, side * (H.halfOut - 0.02)] });
  }
  reg.explodeGroup(boxes, {
    id: 'fenderBoxes',
    name: '翼子板储物箱 / 外置油箱',
    sub: '车体两侧',
    desc: '安装在翼子板上的储物箱与外置油箱。它们对破甲弹有少量“间隔装甲”效果，但本身不属于主装甲。',
    offset: [0, 0.35, 0],
    label: [-2.3, H.roof + 0.35, 1.35],
  });
}

function buildHullEra(hull, reg, M) {
  const era = group(hull, 'eraHull');
  const up = V3(-Math.cos(H.ufpSlope), Math.sin(H.ufpSlope), 0);
  const down = up.clone().negate();
  const nrm = V3(Math.sin(H.ufpSlope), Math.cos(H.ufpSlope), 0);
  const basis = new THREE.Matrix4().makeBasis(down, nrm, V3(0, 0, 1));
  const q = new THREE.Quaternion().setFromRotationMatrix(basis);
  const blocks = [];
  const rows = [0.4, 1.06];
  const cols = 6;
  const bw = 0.48, gap = 0.04;
  const bolts = [[-0.24, -0.18], [-0.24, 0.18], [0.24, -0.18], [0.24, 0.18]].map(([a, b]) => place(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8), { pos: [a, 0.045, b] }));
  const blockGeo = merge([new RoundedBoxGeometry(0.62, 0.085, bw, 2, 0.012), ...bolts]);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols; c++) {
      const z = -((cols - 1) / 2) * (bw + gap) + c * (bw + gap);
      const pos = V3(H.noseX, H.noseY, z).addScaledVector(up, rows[r]).addScaledVector(nrm, 0.047);
      const m = mk(era, blockGeo, M.paint, { pos: pos.toArray() });
      m.quaternion.copy(q);
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

function buildSkirts(hull, reg, M) {
  const out = [];
  const x0 = -3.3, x1 = 3.22, n = 8;
  const w = (x1 - x0) / n;
  for (const side of [-1, 1]) {
    const g = group(hull, side < 0 ? 'skirtL' : 'skirtR');
    const z = side * (H.halfOut + 0.035);
    for (let i = 0; i < n; i++) {
      const xa = x0 + i * w + 0.01, xb = x0 + (i + 1) * w - 0.01;
      const front = i >= n - 3;
      const h = 0.43;
      const thick = front ? 0.07 : 0.018;
      const geo = front ? new RoundedBoxGeometry(xb - xa, h, thick, 2, 0.01) : new THREE.BoxGeometry(xb - xa, h, thick);
      const m = mk(g, geo, front ? M.paint : M.skirt, { pos: [(xa + xb) / 2, 0.99 - h / 2, z + side * (thick / 2 - 0.009)] });
      reg.armorMesh(m, front ? 'era_skirt' : 'skirt');
      if (front) m.userData.era = true;
      // 顶部压条
      mk(g, new THREE.BoxGeometry(xb - xa, 0.035, 0.03), M.paintDark, { pos: [(xa + xb) / 2, 0.985, z + side * 0.012] });
      out.push(m);
    }
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
