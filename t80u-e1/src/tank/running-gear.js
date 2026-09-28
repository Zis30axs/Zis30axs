// 行走装置：每侧 6 个负重轮、5 个托带轮、前诱导轮、后主动轮，以及实例化的履带板。
import * as THREE from 'three';
import { RUNNING as R, HULL as H } from './dims.js';
import { beltPath, merge, place, cylZ } from './geom.js';
import { mk, group } from './registry.js';

function roadWheelGeos() {
  // 双轮盘：每片宽 0.17，中间留 0.12 间隙给履带诱导齿
  const metal = [];
  const rubber = [];
  for (const s of [-1, 1]) {
    const zc = s * 0.145;
    metal.push(place(cylZ(0.298, 0.17, 36), { pos: [0, 0, zc] }));
    const dish = new THREE.LatheGeometry(
      [
        [0.298, 0],
        [0.27, 0.012],
        [0.15, 0.004],
        [0.105, 0.03],
        [0.07, 0.05],
        [0.0001, 0.05],
      ].map(([r, h]) => new THREE.Vector2(r, h)),
      36,
    );
    dish.rotateX(s > 0 ? Math.PI / 2 : -Math.PI / 2);
    dish.translate(0, 0, zc + s * 0.085);
    metal.push(dish);
    rubber.push(place(cylZ(R.wheelR, 0.14, 40), { pos: [0, 0, zc] }));
  }
  // 轮毂螺栓
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (const s of [-1, 1]) metal.push(place(cylZ(0.014, 0.03, 6), { pos: [Math.cos(a) * 0.085, Math.sin(a) * 0.085, s * (0.145 + 0.085 + 0.045)] }));
  }
  return { metal: merge(metal), rubber: merge(rubber) };
}

function sprocketGeo() {
  const teeth = 13, rRoot = 0.29, rTip = 0.345;
  const shape = new THREE.Shape();
  const N = teeth * 8;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ph = (i % 8) / 8;
    const bump = ph < 0.2 || ph > 0.8 ? 1 : ph < 0.35 ? 1 - (ph - 0.2) / 0.15 : ph > 0.65 ? (ph - 0.65) / 0.15 : 0;
    const r = rRoot + (rTip - rRoot) * bump;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const parts = [];
  for (const s of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false });
    g.translate(0, 0, s * 0.19 - 0.0225);
    parts.push(g);
  }
  parts.push(cylZ(0.26, 0.34, 32));
  parts.push(place(cylZ(0.14, 0.52, 20), {}));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(place(cylZ(0.016, 0.56, 6), { pos: [Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0] }));
  }
  return merge(parts);
}

function idlerGeo() {
  const parts = [];
  for (const s of [-1, 1]) {
    const zc = s * 0.14;
    parts.push(place(cylZ(R.idler.r, 0.12, 36), { pos: [0, 0, zc] }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const hole = place(cylZ(0.045, 0.13, 12), { pos: [Math.cos(a) * 0.17, Math.sin(a) * 0.17, zc] });
      parts.push(hole);
    }
  }
  parts.push(cylZ(0.09, 0.48, 18));
  return merge(parts);
}

function trackLinkGeo(pitch) {
  const L = pitch * 0.94, W = R.trackW;
  const parts = [
    new THREE.BoxGeometry(L, 0.04, W), // 履带板
    place(new THREE.BoxGeometry(L * 0.55, 0.03, W * 0.36), { pos: [0, -0.034, -W * 0.25] }), // 橡胶垫
    place(new THREE.BoxGeometry(L * 0.55, 0.03, W * 0.36), { pos: [0, -0.034, W * 0.25] }),
    place(new THREE.BoxGeometry(L * 0.5, 0.075, 0.05), { pos: [0, 0.055, 0] }), // 诱导齿
    place(new THREE.CylinderGeometry(0.022, 0.022, W + 0.04, 8), { pos: [L * 0.48, 0, 0], rot: [Math.PI / 2, 0, 0] }),
  ];
  return merge(parts);
}

export function buildRunningGear(hullGroup, reg, M) {
  const wheels = roadWheelGeos();
  const sprGeo = sprocketGeo();
  const idGeo = idlerGeo();
  const rollerMetal = merge([cylZ(R.rollerR, 0.2, 20), place(cylZ(0.04, 0.34, 10), { pos: [0, 0, 0] })]);
  const rollerRubber = cylZ(R.rollerR + 0.012, 0.12, 20);

  const sides = {};
  for (const side of [-1, 1]) {
    const key = side < 0 ? 'L' : 'R';
    const moduleId = side < 0 ? 'track_l' : 'track_r';
    const g = group(hullGroup, 'runningGear' + key);
    const z = side * R.trackZ;
    const spinners = []; // {obj, r}

    const addWheel = (x, y, r, metalGeo, rubberGeo, zone) => {
      const w = new THREE.Group();
      w.position.set(x, y, z);
      g.add(w);
      const a = mk(w, metalGeo, M.paint);
      reg.armorMesh(a, zone);
      reg.module(moduleId, a);
      if (rubberGeo) {
        const b = mk(w, rubberGeo, M.rubber);
        reg.armorMesh(b, zone);
        reg.module(moduleId, b);
      }
      spinners.push({ obj: w, r });
      return w;
    };

    for (const x of R.wheelXs) {
      addWheel(x, R.wheelY, R.wheelR, wheels.metal, wheels.rubber, 'wheel');
      // 扭杆平衡肘
      const arm = mk(g, new THREE.BoxGeometry(0.42, 0.09, 0.08), M.darkMetal, { pos: [x + 0.2, R.wheelY + 0.06, side * (H.halfIn + 0.05)] });
      arm.rotation.z = -0.3;
    }
    addWheel(R.idler.x, R.idler.y, R.idler.r, idGeo, null, 'wheel');
    const spr = addWheel(R.sprocket.x, R.sprocket.y, R.sprocket.r, sprGeo, null, 'wheel');
    spr.children[0].material = M.darkMetal;
    for (const x of R.rollerXs) addWheel(x, R.rollerY, R.rollerR, rollerMetal, rollerRubber, 'wheel');

    // 履带：包络路径 + 实例化履带板
    const half = R.trackT / 2;
    const circles = [
      ...[...R.wheelXs].reverse().map((x) => ({ x, y: R.wheelY, r: R.wheelR + half })),
      { x: R.idler.x, y: R.idler.y, r: R.idler.r + half },
      ...R.rollerXs.map((x) => ({ x, y: R.rollerY, r: R.rollerR + half })),
      { x: R.sprocket.x, y: R.sprocket.y, r: R.sprocket.r + half },
    ];
    const path = beltPath(circles);
    const count = Math.round(path.total / 0.165);
    const pitch = path.total / count;
    const linkGeo = trackLinkGeo(pitch);
    const inst = new THREE.InstancedMesh(linkGeo, M.trackSteel, count);
    inst.castShadow = true;
    inst.receiveShadow = true;
    g.add(inst);
    reg.armorMesh(inst, 'track');
    reg.module(moduleId, inst);

    const m4 = new THREE.Matrix4();
    const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
    const setLinks = (offset) => {
      for (let i = 0; i < count; i++) {
        const { p, t } = path.at(offset + i * pitch);
        X.set(t.x, t.y, 0);
        Y.set(-t.y, t.x, 0);
        m4.makeBasis(X, Y, Z);
        m4.setPosition(p.x, p.y, z);
        inst.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
    };
    setLinks(0);

    sides[key] = { group: g, spinners, setLinks, offset: 0 };
    reg.explodeGroup(g, {
      id: 'running' + key,
      name: side < 0 ? '左侧行走装置' : '右侧行走装置',
      sub: '6 负重轮 · 5 托带轮 · 后置主动轮',
      desc: '扭杆独立悬挂，每侧 6 个挂胶负重轮、5 个托带轮，前部为诱导轮、后部为主动轮；履带宽 580 mm，采用橡胶金属铰链并可加装橡胶垫。',
      offset: [0, -0.05, side * 2.1],
      label: [0.5, 0.35, z + side * 0.3],
    });
  }

  /** 行驶动画：dist 为本帧前进距离（米，正值向前） */
  const drive = (dist) => {
    for (const k of ['L', 'R']) {
      const s = sides[k];
      s.offset -= dist;
      s.setLinks(s.offset);
      for (const sp of s.spinners) sp.obj.rotation.z -= dist / sp.r;
    }
  };

  return { sides, drive };
}
