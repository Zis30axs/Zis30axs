// 2A46M-4 125 mm 滑膛炮：防盾、身管（隔热套、抽气装置、炮口校正镜）、炮尾与立楔式炮闩、并列机枪。
// gunPitch 位于耳轴并绕 Z 轴俯仰；gunRecoil 为后坐部分（沿 -X 后坐）。
import * as THREE from 'three';
import { GUN } from './dims.js';
import { cylX, latheX, RoundedBoxGeometry } from './geom.js';
import { Batch, boltGeo, alignY } from './detail.js';
import { mk, group } from './registry.js';

export function buildGun(turret, reg, M) {
  const [tx, ty] = GUN.trunnion;
  const pitch = group(turret, 'gunPitch', [tx, ty, 0]);
  const recoil = group(pitch, 'gunRecoil');

  // —— 防盾与防尘罩（不随后坐）
  const mantlet = mk(pitch, new RoundedBoxGeometry(0.34, 0.44, 0.58, 3, 0.05), M.paintCast, { pos: [0.5, 0.0, 0.0] });
  reg.armorMesh(mantlet, 'mantlet');
  // 帆布防尘罩：交替大小的褶皱
  const pleats = new Batch();
  for (let i = 0; i < 6; i++) {
    const big = i % 2 === 0;
    pleats.add(new RoundedBoxGeometry(0.05, big ? 0.5 : 0.468, big ? 0.66 : 0.626, 2, 0.02), M.canvas, { pos: [0.165 + i * 0.045, -0.01, 0] });
  }
  pleats.build(pitch, { cast: false, name: 'mantletCover' });
  // 身管出口环（带螺栓）与并列机枪射孔
  const ring = new Batch();
  ring.add(latheX([[0.66, 0.165], [0.7, 0.165], [0.74, 0.158], [0.78, 0.15], [0.785, 0.125]], 32), M.paintCast);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ring.add(boltGeo(0.012, 0.01), M.paintDark, alignY(new THREE.Vector3(0.672, Math.cos(a) * 0.205, Math.sin(a) * 0.205), new THREE.Vector3(1, 0, 0)));
  }
  ring.add(cylX(0.032, 0.032, 0.02, 14), M.paintDark, { pos: [0.672, -0.05, 0.215] });
  ring.add(new THREE.CircleGeometry(0.018, 12).rotateY(Math.PI / 2), M.darkMetal, { pos: [0.683, -0.05, 0.215] });
  ring.build(pitch, { name: 'mantletDetails' });
  // 摇架与驻退复进机（炮塔内部）
  mk(pitch, cylX(0.16, 0.16, 0.5, 24), M.interior, { pos: [-0.05, 0, 0] });
  mk(pitch, cylX(0.05, 0.05, 0.8, 12), M.interior, { pos: [-0.35, 0.17, 0] });
  mk(pitch, cylX(0.05, 0.05, 0.8, 12), M.interior, { pos: [-0.35, -0.17, 0] });
  // 高低机
  const elev = mk(pitch, new THREE.BoxGeometry(0.28, 0.2, 0.16), M.electronics, { pos: [-0.15, -0.28, -0.22] });
  reg.module('elevation', elev);

  // —— 身管（后坐部分）：按材质合并成少数网格，整体作为“身管”装甲与模块
  const bd = new Batch();
  bd.add(cylX(0.11, 0.105, 0.8, 28), M.interior, { pos: [0.2, 0, 0] });
  // 隔热套（分段）+ 卡箍（带锁扣）
  const sleeve = [
    [0.6, 1.3, 0.102],
    [1.32, 2.0, 0.1],
    [2.02, 2.52, 0.098],
    [3.42, 4.12, 0.094],
    [4.14, 4.84, 0.092],
    [4.86, 5.12, 0.09],
  ];
  for (const [a, b, r] of sleeve) {
    bd.add(cylX(r, r, b - a, 28), M.paint, { pos: [(a + b) / 2, 0, 0] });
    bd.add(cylX(r + 0.006, r + 0.006, 0.03, 28), M.paintDark, { pos: [b, 0, 0] });
    bd.add(new THREE.BoxGeometry(0.036, 0.022, 0.03), M.paintDark, { pos: [b, r + 0.012, 0] });
    bd.add(new THREE.BoxGeometry(0.012, 0.016, 0.044), M.darkMetal, { pos: [b, r + 0.026, 0] });
  }
  // 抽气装置：两端收口 + 端部卡环
  bd.add(
    latheX(
      [
        [2.5, 0.0001],
        [2.5, 0.1],
        [2.53, 0.128],
        [2.6, 0.15],
        [3.3, 0.155],
        [3.37, 0.136],
        [3.42, 0.098],
        [3.42, 0.0001],
      ],
      36,
    ),
    M.paint,
  );
  for (const x of [2.64, 3.27]) bd.add(cylX(0.159, 0.159, 0.022, 36), M.paintDark, { pos: [x, 0, 0] });
  // 炮口（端面倒角）
  bd.add(latheX([[5.11, 0.087], [5.32, 0.085], [5.345, 0.082], [5.352, 0.072], [5.352, 0.064]], 28), M.darkMetal);
  // 炮口校正镜（MRS）：卡环 + 镜箱 + 朝后的反射窗
  bd.add(cylX(0.096, 0.096, 0.045, 28), M.darkMetal, { pos: [5.2, 0, 0] });
  bd.add(new THREE.BoxGeometry(0.1, 0.06, 0.07), M.darkMetal, { pos: [5.2, 0.115, 0] });
  bd.add(new THREE.BoxGeometry(0.03, 0.03, 0.04), M.darkMetal, { pos: [5.2, 0.088, 0] });
  bd.add(new THREE.BoxGeometry(0.006, 0.036, 0.046), M.glass, { pos: [5.148, 0.118, 0] });
  const barrelParts = bd.build(recoil, { name: 'barrel' });
  const bore = mk(recoil, new THREE.CircleGeometry(0.066, 24), new THREE.MeshBasicMaterial({ color: 0x050505 }), { pos: [5.3505, 0, 0], rot: [0, Math.PI / 2, 0] });
  barrelParts.push(bore);
  for (const m of barrelParts) {
    reg.armorMesh(m, 'barrel');
    reg.module('barrel', m);
  }

  // —— 炮尾环与立楔式炮闩
  const breech = group(recoil, 'breech');
  const bF = GUN.breechFront, bR = GUN.breechFace; // -0.2, -0.8
  const ringMat = M.steel;
  const front = mk(breech, new THREE.BoxGeometry(0.28, 0.5, 0.46), ringMat, { pos: [bF - 0.14, 0, 0] });
  const top = mk(breech, new THREE.BoxGeometry(bF - 0.28 - bR, 0.1, 0.46), ringMat, { pos: [(bR + bF - 0.28) / 2, 0.2, 0] });
  const bottom = mk(breech, new THREE.BoxGeometry(bF - 0.28 - bR, 0.1, 0.46), ringMat, { pos: [(bR + bF - 0.28) / 2, -0.2, 0] });
  const sL = mk(breech, new THREE.BoxGeometry(bF - 0.28 - bR, 0.3, 0.08), ringMat, { pos: [(bR + bF - 0.28) / 2, 0, -0.19] });
  const sR = mk(breech, new THREE.BoxGeometry(bF - 0.28 - bR, 0.3, 0.08), ringMat, { pos: [(bR + bF - 0.28) / 2, 0, 0.19] });
  // 药室口（炮尾后端面上的黑色圆孔，炮闩打开时可见）
  mk(breech, new THREE.CircleGeometry(0.085, 24), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }), { pos: [bF - 0.281, 0, 0], rot: [0, -Math.PI / 2, 0] });
  const wedge = mk(breech, new THREE.BoxGeometry(bF - 0.29 - bR, 0.3, 0.3), M.darkMetal, { pos: [(bR + bF - 0.28) / 2, 0, 0] });
  wedge.userData.closedY = 0;
  wedge.userData.openY = -0.29;
  // 抓壳（残底收集）挡板
  for (const m of [front, top, bottom, sL, sR, wedge]) reg.module('breech', m);

  // —— 并列机枪 PKT（火炮右侧）
  const coax = group(pitch, 'coax', [0, -0.05, 0.215]);
  const cb = mk(coax, new THREE.BoxGeometry(0.62, 0.12, 0.1), M.darkMetal, { pos: [0.1, 0, 0] });
  const cbar = mk(coax, cylX(0.012, 0.012, 0.42, 8), M.darkMetal, { pos: [0.6, 0, 0] });
  mk(coax, new THREE.BoxGeometry(0.2, 0.16, 0.14), M.paintDark, { pos: [-0.1, -0.1, 0.09] });
  reg.module('coax', cb);
  reg.module('coax', cbar);

  reg.explodeGroup(pitch, {
    id: 'gun',
    name: '2A46M-4 125 mm 滑膛炮',
    sub: '身管长约 6 m (L/48) · 立楔式炮闩',
    desc: '主炮带隔热套、抽气装置和炮口校正镜；后坐长约 300 mm，射击后炮闩在复进过程中自动打开并抛出药筒底托。除普通炮弹外还可发射 9M119M1 炮射导弹。',
    offset: [1.6, 0.55, 0],
    label: [2.0, 0.2, 0],
  });

  return { pitch, recoil, wedge, breech, mantlet };
}
