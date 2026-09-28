// 2A46M-4 125 mm 滑膛炮：防盾、身管（隔热套、抽气装置、炮口校正镜）、炮尾与立楔式炮闩、并列机枪。
// gunPitch 位于耳轴并绕 Z 轴俯仰；gunRecoil 为后坐部分（沿 -X 后坐）。
import * as THREE from 'three';
import { GUN } from './dims.js';
import { cylX, latheX, RoundedBoxGeometry } from './geom.js';
import { mk, group } from './registry.js';

export function buildGun(turret, reg, M) {
  const [tx, ty] = GUN.trunnion;
  const pitch = group(turret, 'gunPitch', [tx, ty, 0]);
  const recoil = group(pitch, 'gunRecoil');

  // —— 防盾与防尘罩（不随后坐）
  const mantlet = mk(pitch, new RoundedBoxGeometry(0.34, 0.44, 0.58, 3, 0.05), M.paint, { pos: [0.5, 0.0, 0.0] });
  reg.armorMesh(mantlet, 'mantlet');
  const cover = mk(pitch, new RoundedBoxGeometry(0.26, 0.5, 0.66, 3, 0.08), M.canvas, { pos: [0.3, -0.01, 0] });
  cover.castShadow = false;
  mk(pitch, cylX(0.16, 0.15, 0.12, 28), M.paint, { pos: [0.72, 0.0, 0] });
  // 摇架与驻退复进机（炮塔内部）
  mk(pitch, cylX(0.16, 0.16, 0.5, 24), M.interior, { pos: [-0.05, 0, 0] });
  mk(pitch, cylX(0.05, 0.05, 0.8, 12), M.interior, { pos: [-0.35, 0.17, 0] });
  mk(pitch, cylX(0.05, 0.05, 0.8, 12), M.interior, { pos: [-0.35, -0.17, 0] });
  // 高低机
  const elev = mk(pitch, new THREE.BoxGeometry(0.28, 0.2, 0.16), M.electronics, { pos: [-0.15, -0.28, -0.22] });
  reg.module('elevation', elev);

  // —— 身管（后坐部分）
  const barrelParts = [];
  const bp = (geo, mat, x) => {
    const m = mk(recoil, geo, mat, { pos: [x, 0, 0] });
    barrelParts.push(m);
    return m;
  };
  bp(cylX(0.11, 0.105, 0.8, 28), M.interior, 0.2);
  // 隔热套（分段）
  const sleeve = [
    [0.6, 1.3, 0.102],
    [1.32, 2.0, 0.1],
    [2.02, 2.52, 0.098],
    [3.42, 4.12, 0.094],
    [4.14, 4.84, 0.092],
    [4.86, 5.12, 0.09],
  ];
  for (const [a, b, r] of sleeve) {
    bp(cylX(r, r, b - a, 28), M.paint, (a + b) / 2);
    bp(cylX(r + 0.006, r + 0.006, 0.03, 28), M.paintDark, b);
  }
  // 抽气装置
  bp(
    latheX(
      [
        [2.5, 0.0001],
        [2.5, 0.1],
        [2.6, 0.15],
        [3.3, 0.155],
        [3.42, 0.098],
        [3.42, 0.0001],
      ],
      32,
    ),
    M.paint,
    0,
  );
  // 炮口
  bp(cylX(0.086, 0.084, 0.24, 28), M.darkMetal, 5.23);
  const bore = mk(recoil, new THREE.CircleGeometry(0.0625, 24), new THREE.MeshBasicMaterial({ color: 0x050505 }), { pos: [5.352, 0, 0], rot: [0, Math.PI / 2, 0] });
  barrelParts.push(bore);
  // 炮口校正镜（MRS）
  bp(new THREE.BoxGeometry(0.1, 0.06, 0.07), M.darkMetal, 5.2).position.y = 0.11;
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
  const coax = group(pitch, 'coax', [0, -0.05, 0.3]);
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
