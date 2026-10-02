// 车内布置：乘员、油箱弹架、燃气轮机、传动、油箱、辅助动力装置、电子设备与附加弹药。
import * as THREE from 'three';
import { merge, place, cylX, cylZ, profileExtrude, RoundedBoxGeometry } from './geom.js';
import { mk, group } from './registry.js';
import { staticRound } from './ammo-models.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

function limb(a, b, r) {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, 10);
  const q = new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/**
 * 坐姿乘员（局部原点在臀部，面向 +X）。recline：躯干后仰角（弧度）。
 * arms：'forward'（握操纵杆）或 'up'（扶瞄准镜）。
 */
export function crewFigure(M, { recline = 0.15, arms = 'forward', legs = 'bent' } = {}) {
  const g = new THREE.Group();
  const up = v(-Math.sin(recline), Math.cos(recline), 0);
  const hip = v(0, 0.06, 0);
  const neck = hip.clone().addScaledVector(up, 0.52);
  const headC = neck.clone().addScaledVector(up, 0.13);
  const body = [];
  body.push(limb(hip.clone().addScaledVector(up, 0.12), neck.clone().addScaledVector(up, -0.1), 0.15));
  body.push(place(new THREE.BoxGeometry(0.26, 0.16, 0.36), { pos: [0.0, 0.05, 0] }));
  for (const s of [-1, 1]) {
    const sh = neck.clone().addScaledVector(up, -0.06).add(v(0, 0, s * 0.2));
    let elbow, hand;
    if (arms === 'up') {
      elbow = sh.clone().add(v(0.22, -0.12, s * 0.05));
      hand = elbow.clone().add(v(0.18, 0.2, -s * 0.06));
    } else {
      elbow = sh.clone().add(v(0.12, -0.26, s * 0.04));
      hand = elbow.clone().add(v(0.3, 0.02, 0));
    }
    body.push(limb(sh, elbow, 0.05), limb(elbow, hand, 0.045));
    const hipS = v(0.02, 0.04, s * 0.11);
    let knee, foot;
    if (legs === 'straight') {
      knee = hipS.clone().add(v(0.46, 0.06, s * 0.02));
      foot = knee.clone().add(v(0.4, -0.12, 0));
    } else {
      knee = hipS.clone().add(v(0.44, 0.02, s * 0.03));
      foot = knee.clone().add(v(0.04, -0.42, 0));
    }
    body.push(limb(hipS, knee, 0.075), limb(knee, foot, 0.06));
    body.push(place(new THREE.BoxGeometry(0.26, 0.08, 0.11), { pos: [foot.x + 0.08, foot.y - 0.02, foot.z] }));
  }
  const bodyMesh = mk(g, merge(body), M.crew);
  const head = mk(g, new THREE.SphereGeometry(0.095, 16, 12), M.skin, { pos: headC.toArray() });
  // 坦克帽（带耳机的软质头盔，顶部有防撞棱）
  const helmet = [place(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), { pos: headC.toArray() })];
  for (const dz of [-0.035, 0, 0.035]) {
    helmet.push(place(new THREE.TorusGeometry(0.108, 0.012, 6, 16, Math.PI), { pos: [headC.x, headC.y + 0.005, headC.z + dz], rot: [0, 0, 0] }));
  }
  for (const s of [-1, 1]) helmet.push(place(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), { pos: [headC.x, headC.y - 0.01, headC.z + s * 0.1], rot: [Math.PI / 2, 0, 0] }));
  mk(g, merge(helmet), M.helmet);
  g.userData.parts = [bodyMesh, head];
  return g;
}

export function buildInternals(hull, turretYaw, turret, reg, M) {
  const out = {};

  // —— 驾驶员（车体前部居中，半躺姿）
  const driverG = group(hull, 'driverGroup');
  const driver = crewFigure(M, { recline: 0.45, arms: 'forward', legs: 'straight' });
  driver.position.set(1.8, 0.58, 0);
  driverG.add(driver);
  reg.module('driver', driver);
  const dseat = mk(driverG, new THREE.BoxGeometry(0.4, 0.08, 0.42), M.seat, { pos: [1.82, 0.54, 0] });
  const dback = mk(driverG, new THREE.BoxGeometry(0.08, 0.5, 0.4), M.seat, { pos: [1.64, 0.78, 0] });
  dback.rotation.z = 0.45;
  dseat.castShadow = false;
  // 操纵杆
  for (const s of [-1, 1]) mk(driverG, new THREE.CylinderGeometry(0.018, 0.018, 0.35, 8), M.darkMetal, { pos: [2.4, 0.72, s * 0.2], rot: [0, 0, 0.35] });
  reg.explodeGroup(driverG, {
    id: 'driver',
    name: '驾驶员',
    sub: '车体前部居中',
    desc: 'T-80 的驾驶员位于车体前部正中，采用半躺坐姿以降低车体高度，通过舱盖前方的潜望镜观察。两侧是兼作弹架的前部油箱。',
    offset: [0.7, 1.75, 0],
    label: [1.7, 1.25, 0],
  });

  // —— 前部油箱弹架（“油箱-弹架”，左右各一，内置弹药）
  for (const side of [-1, 1]) {
    const key = side < 0 ? 'L' : 'R';
    const g = group(hull, 'tankRack' + key);
    const prof = [
      [1.36, 0.52],
      [2.6, 0.52],
      [2.6, 0.9],
      [2.18, 1.1],
      [1.36, 1.1],
    ];
    const z0 = side < 0 ? -0.94 : 0.38, z1 = side < 0 ? -0.38 : 0.94;
    const tank = mk(g, profileExtrude(prof, z0, z1), M.fuel);
    reg.module('fuel_front', tank);
    // 嵌在油箱里的弹药（竖放）
    const zc = side * 0.36;
    const items = group(g, 'rackAmmo' + key);
    for (let i = 0; i < 3; i++) {
      const x = 1.52 + i * 0.3;
      const c = staticRound('c', i === 2 ? '3BK18M' : '3BM46');
      c.rotation.z = Math.PI / 2;
      c.position.set(x, 0.55, zc);
      items.add(c);
      const p = staticRound('p', i === 2 ? '3BK18M' : '3BM46');
      p.rotation.z = Math.PI / 2;
      p.scale.setScalar(0.92);
      p.position.set(x + 0.15, 0.53, zc - side * 0.02);
      items.add(p);
    }
    reg.module('rack_front', items);
    reg.explodeGroup(g, {
      id: 'tankRack' + key,
      name: side < 0 ? '左前油箱弹架' : '右前油箱弹架',
      sub: '燃油 + 非机械化弹药',
      desc: '驾驶员两侧的油箱同时是弹架，内有竖放的弹丸和发射药筒。它们不在自动装弹机中，需要人工转入转盘；位于车体前部，正面被击穿时风险较高。',
      offset: [0.35, 1.0, side * 1.05],
      label: [1.9, 1.0, side * 0.7],
    });
  }

  // 蓄电池
  const batt = group(hull, 'batteries');
  for (const side of [-1, 1]) mk(batt, new RoundedBoxGeometry(0.3, 0.28, 0.3, 2, 0.02), M.electronics, { pos: [1.15, 0.67, side * 0.82] });
  reg.module('batteries', batt);

  // —— 战斗室后部弹架（竖放在动力舱隔板前）
  const fcRack = group(hull, 'fcRack');
  const fcItems = group(fcRack, 'fcRackItems');
  const fcTypes = ['3BM46', '3OF26', '3BM42', '3BK18M'];
  fcTypes.forEach((t, i) => {
    const z = -0.72 + i * 0.46;
    const c = staticRound('c', t);
    c.rotation.z = Math.PI / 2;
    c.position.set(-1.08, 0.53, z);
    fcItems.add(c);
    const p = staticRound('p', t);
    p.rotation.z = Math.PI / 2;
    p.position.set(-1.12, 0.53, z + 0.2);
    p.scale.setScalar(0.95);
    fcItems.add(p);
  });
  reg.module('rack_fc', fcItems);
  reg.explodeGroup(fcRack, {
    id: 'fcRack',
    name: '战斗室后部弹架',
    sub: '非机械化弹药',
    desc: '动力舱隔板前竖放的备用弹药。T-80U 系列全车携弹 45 发，其中 28 发在自动装弹机转盘里，其余分布在油箱弹架和战斗室内。',
    offset: [-0.35, 1.15, 0],
    label: [-1.1, 1.0, 0],
  });

  // —— 动力舱：GTD-1250 燃气轮机
  const engineG = group(hull, 'engineGroup');
  const eng = new THREE.Group();
  engineG.add(eng);
  const ec = 0.9;
  const engParts = [
    place(cylX(0.26, 0.3, 0.5, 28), { pos: [-1.72, ec, 0] }), // 压气机
    place(cylX(0.34, 0.34, 0.46, 28), { pos: [-2.2, ec, 0] }), // 燃烧室
    place(cylX(0.3, 0.26, 0.4, 28), { pos: [-2.63, ec, 0] }), // 涡轮
    place(new THREE.BoxGeometry(0.34, 0.5, 0.62), { pos: [-3.0, ec + 0.04, 0] }), // 减速器
    place(cylX(0.18, 0.2, 0.2, 20), { pos: [-1.38, ec, 0] }), // 进气口
  ];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    engParts.push(place(cylX(0.05, 0.05, 0.4, 10), { pos: [-2.2, ec + Math.cos(a) * 0.34, Math.sin(a) * 0.34] }));
  }
  mk(eng, merge(engParts), M.engine);
  // 排气管道（通向车尾百叶窗）
  mk(eng, new THREE.BoxGeometry(0.5, 0.3, 1.0), M.engineHot, { pos: [-3.15, 1.2, 0] });
  mk(eng, new THREE.TorusGeometry(0.22, 0.03, 8, 20, Math.PI), M.steel, { pos: [-1.95, ec + 0.2, 0.3], rot: [0, Math.PI / 2, 0] });
  reg.module('engine', eng);
  reg.explodeGroup(engineG, {
    id: 'engine',
    name: 'GTD-1250 燃气轮机',
    sub: '1250 马力 · 纵置',
    desc: 'T-80 系列标志性的燃气轮机动力，功率 1250 马力，功重比约 26.6 马力/吨。启动快、低温性能好，但油耗高；排气从车尾的百叶窗排出。T-80U-E1 以其替换了 T-80BV 原有的发动机。',
    offset: [-0.35, 1.3, 0],
    label: [-2.2, ec + 0.35, 0],
  });

  // 空气滤清器（旋风式）
  const air = group(engineG, 'airCleaner');
  for (const side of [-1, 1]) {
    const b = mk(air, new RoundedBoxGeometry(0.9, 0.34, 0.48, 2, 0.03), M.gearbox, { pos: [-1.95, 1.16, side * 0.74] });
    for (let i = 0; i < 4; i++) mk(air, cylZ(0.05, 0.05, 10), M.darkMetal, { pos: [-2.28 + i * 0.22, 1.34, side * 0.74] });
    b.castShadow = true;
  }

  // 传动：左右行星变速箱 + 中间传动箱 + 侧减速器
  const trans = group(hull, 'transmission');
  const tparts = [];
  for (const s of [-1, 1]) {
    tparts.push(place(cylZ(0.26, 0.4, 24), { pos: [-3.02, 0.74, s * 0.78] }));
    tparts.push(place(cylZ(0.17, 0.26, 20), { pos: [-3.02, 0.58, s * 1.12] }));
  }
  tparts.push(place(new THREE.BoxGeometry(0.32, 0.36, 1.08), { pos: [-3.02, 0.68, 0] }));
  const tMesh = mk(trans, merge(tparts), M.gearbox);
  reg.module('transmission', tMesh);
  reg.explodeGroup(trans, {
    id: 'transmission',
    name: '行星变速箱与侧传动',
    sub: '后置传动 · 后置主动轮',
    desc: '左右两套行星变速箱（4 前进挡 / 1 倒挡）经侧减速器驱动车尾的主动轮，同时承担转向功能。',
    offset: [-1.15, 0.3, 0],
    label: [-3.02, 0.9, 0.78],
  });

  // 动力舱油箱（下部 + 翼子板内）
  const fuelR = group(hull, 'fuelRear');
  for (const s of [-1, 1]) {
    mk(fuelR, new RoundedBoxGeometry(1.05, 0.4, 0.46, 2, 0.03), M.fuel, { pos: [-1.95, 0.76, s * 0.74] });
    const x0 = s < 0 ? -2.85 : -3.3;
    mk(fuelR, new RoundedBoxGeometry(-1.4 - x0, 0.34, 0.44, 2, 0.03), M.fuel, { pos: [(x0 - 1.4) / 2, 1.18, s * 1.32] });
  }
  reg.module('fuel_rear', fuelR);
  reg.explodeGroup(fuelR, {
    id: 'fuelRear',
    name: '动力舱油箱',
    sub: '车体后部与翼子板内',
    desc: '燃气轮机油耗较大，T-80 在动力舱两侧和翼子板内布置了多个油箱，并可在车尾外挂附加油桶。',
    offset: [0, 0.85, 0],
    label: [-2.4, 1.2, 1.32],
  });

  // 辅助动力装置 GTA-18A（左后翼子板内）
  const apuG = group(hull, 'apu');
  const apu = mk(apuG, new RoundedBoxGeometry(0.44, 0.32, 0.42, 2, 0.03), M.engine, { pos: [-3.12, 1.18, -1.32] });
  mk(apuG, cylX(0.07, 0.07, 0.2, 12), M.engineHot, { pos: [-3.38, 1.24, -1.32] });
  reg.module('apu', apu);

  // —— 炮塔内：炮手、车长、座椅、火控设备
  const gunnerG = group(turretYaw, 'gunnerGroup');
  const gunner = crewFigure(M, { recline: 0.1, arms: 'up' });
  gunner.position.set(0.0, -0.36, -0.53);
  gunnerG.add(gunner);
  reg.module('gunner', gunner);
  mk(gunnerG, new THREE.BoxGeometry(0.36, 0.06, 0.38), M.seat, { pos: [0.0, -0.4, -0.53] });
  mk(gunnerG, new THREE.BoxGeometry(0.06, 0.42, 0.36), M.seat, { pos: [-0.22, -0.16, -0.53] });
  reg.explodeGroup(gunnerG, {
    id: 'gunner',
    name: '炮手',
    sub: '火炮左侧',
    desc: '炮手坐在火炮左侧，通过 1G46 瞄准镜/热像仪瞄准、激光测距并击发；弹种选择与装填也由炮手在控制盒上完成。',
    offset: [0.25, 2.15, -0.55],
    label: [0.0, 0.25, -0.53],
  });

  const cmdrG = group(turretYaw, 'commanderGroup');
  const cmdr = crewFigure(M, { recline: 0.06, arms: 'forward' });
  cmdr.position.set(-0.2, -0.3, 0.53);
  cmdrG.add(cmdr);
  reg.module('commander', cmdr);
  mk(cmdrG, new THREE.BoxGeometry(0.36, 0.06, 0.38), M.seat, { pos: [-0.2, -0.34, 0.53] });
  mk(cmdrG, new THREE.BoxGeometry(0.06, 0.42, 0.36), M.seat, { pos: [-0.42, -0.1, 0.53] });
  reg.explodeGroup(cmdrG, {
    id: 'commander',
    name: '车长',
    sub: '火炮右侧 · 指挥塔下',
    desc: '车长坐在火炮右侧的指挥塔下，负责搜索目标、指示炮手并操作 NSVT 机枪；必要时可以接替炮手射击。',
    offset: [0.25, 2.15, 0.55],
    label: [-0.2, 0.35, 0.53],
  });

  // 火控/电子设备（炮塔内）
  const fcsG = group(turret, 'fcsGroup');
  const sightBody = mk(fcsG, cylX(0.07, 0.07, 0.3, 14), M.electronics, { pos: [0.42, 0.42, -0.52] });
  sightBody.rotation.z = Math.PI / 2;
  const eyepiece = mk(fcsG, new THREE.BoxGeometry(0.16, 0.12, 0.12), M.electronics, { pos: [0.16, 0.3, -0.55] });
  reg.module('gunner_sight', sightBody);
  reg.module('gunner_sight', eyepiece);
  const comp = mk(fcsG, new RoundedBoxGeometry(0.3, 0.26, 0.2, 2, 0.02), M.electronics, { pos: [0.5, 0.08, -0.92] });
  reg.module('fcs', comp);
  const trav = mk(fcsG, new RoundedBoxGeometry(0.26, 0.24, 0.22, 2, 0.02), M.gearbox, { pos: [0.8, -0.14, -0.56] });
  reg.module('traverse', trav);
  const radio = mk(fcsG, new RoundedBoxGeometry(0.36, 0.3, 0.24, 2, 0.02), M.electronics, { pos: [-0.85, 0.28, 0.82] });
  reg.module('radio', radio);
  mk(fcsG, new THREE.BoxGeometry(0.2, 0.14, 0.1), M.electronics, { pos: [0.1, 0.25, -0.9] }); // 装填控制盒

  // 车内部件不投射阴影（外壳已经投影），减少阴影渲染开销
  for (const g of [driverG, batt, fcRack, engineG, trans, fuelR, apuG, gunnerG, cmdrG, fcsG]) g.traverse((o) => (o.castShadow = false));
  hull.getObjectByName('tankRackL')?.traverse((o) => (o.castShadow = false));
  hull.getObjectByName('tankRackR')?.traverse((o) => (o.castShadow = false));

  out.driver = driver;
  out.gunner = gunner;
  out.commander = cmdr;
  out.engine = eng;
  return out;
}
