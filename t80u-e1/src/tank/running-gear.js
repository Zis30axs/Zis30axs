// 行走装置：每侧 6 个挂胶负重轮、5 个托带轮、前诱导轮、后主动轮、扭杆平衡肘与减振器，以及实例化的履带板。
import * as THREE from 'three';
import { RUNNING as R, HULL as H } from './dims.js';
import { beltPath, merge, place, cylZ } from './geom.js';
import { Batch, boltGeo } from './detail.js';
import { rod } from './hull.js';
import { mk, group } from './registry.js';

/** 沿 Z 轴旋转成形：profile 为 [r, z] */
function latheZ(profile, seg = 36) {
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 0.0001), z)), seg);
  g.rotateX(Math.PI / 2); // 旋转轴 +Y → +Z
  return g;
}

function roadWheelGeos() {
  // 双轮盘：每片宽约 0.16，中间留 0.12 间隙给履带诱导齿
  const metal = [];
  const rubber = [];
  for (const s of [-1, 1]) {
    const zc = s * 0.145;
    metal.push(place(cylZ(0.29, 0.15, 40), { pos: [0, 0, zc] }));
    // 外侧盘面：轮辋凸缘 + 下凹轮盘 + 轮毂
    const dish = latheZ(
      [
        [0.292, 0],
        [0.286, 0.014],
        [0.262, 0.016],
        [0.25, 0.006],
        [0.14, 0.0],
        [0.1, 0.022],
        [0.082, 0.04],
        [0.0001, 0.042],
      ],
      40,
    );
    if (s < 0) dish.rotateY(Math.PI); // 旋转而不是镜像，保持三角形朝向
    dish.translate(0, 0, zc + s * 0.075);
    metal.push(dish);
    // 盘面螺栓圈与轮毂盖
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const b = boltGeo(0.012, 0.014).clone();
      b.rotateX(s * Math.PI / 2);
      b.translate(Math.cos(a) * 0.205, Math.sin(a) * 0.205, zc + s * 0.078);
      metal.push(b);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const b = boltGeo(0.011, 0.012).clone();
      b.rotateX(s * Math.PI / 2);
      b.translate(Math.cos(a) * 0.058, Math.sin(a) * 0.058, zc + s * 0.117);
      metal.push(b);
    }
    // 挂胶轮胎（圆角截面）
    rubber.push(
      place(
        latheZ(
          [
            [0.288, -0.068],
            [0.316, -0.071],
            [0.33, -0.06],
            [0.336, -0.03],
            [0.336, 0.03],
            [0.33, 0.06],
            [0.316, 0.071],
            [0.288, 0.068],
          ],
          48,
        ),
        { pos: [0, 0, zc] },
      ),
    );
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
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const parts = [];
  for (const s of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelOffset: -0.006, bevelSegments: 1 });
    g.translate(0, 0, s * 0.19 - 0.0225);
    parts.push(g);
    // 齿圈固定螺栓
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2;
      const b = boltGeo(0.013, 0.014).clone();
      b.rotateX(s * Math.PI / 2);
      b.translate(Math.cos(a) * 0.25, Math.sin(a) * 0.25, s * (0.19 + 0.028));
      parts.push(b);
    }
  }
  parts.push(cylZ(0.26, 0.34, 36));
  for (const s of [-1, 1]) {
    const dome = latheZ([[0.2, 0], [0.19, 0.03], [0.12, 0.07], [0.06, 0.09], [0.0001, 0.095]], 32);
    if (s < 0) dome.rotateY(Math.PI);
    parts.push(dome.translate(0, 0, s * 0.21));
  }
  parts.push(cylZ(0.14, 0.44, 24));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(place(cylZ(0.016, 0.5, 6), { pos: [Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0] }));
  }
  return merge(parts);
}

function idlerGeo() {
  const parts = [];
  for (const s of [-1, 1]) {
    const zc = s * 0.14;
    parts.push(place(cylZ(R.idler.r, 0.12, 40), { pos: [0, 0, zc] }));
    const dish = latheZ([[R.idler.r, 0], [R.idler.r - 0.02, 0.012], [0.2, 0.004], [0.1, 0.02], [0.0001, 0.03]], 40);
    if (s < 0) dish.rotateY(Math.PI); // 旋转而不是镜像，保持三角形朝向
    dish.translate(0, 0, zc + s * 0.06);
    parts.push(dish);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push(place(cylZ(0.045, 0.125, 14), { pos: [Math.cos(a) * 0.17, Math.sin(a) * 0.17, zc] }));
    }
  }
  parts.push(cylZ(0.09, 0.48, 18));
  return merge(parts);
}

/** 履带板：金属部分（板体、导齿、端连接器、履带销）与橡胶垫分成两个几何 */
function trackLinkGeos(pitch) {
  const L = pitch * 0.9, W = R.trackW;
  const horn = new THREE.ExtrudeGeometry(new THREE.Shape([[-0.038, 0.012], [0.038, 0.012], [0.022, 0.095], [-0.022, 0.095]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.05, bevelEnabled: false });
  horn.translate(0, 0, -0.025);
  const metal = [
    place(new THREE.BoxGeometry(L, 0.03, W - 0.06), { pos: [0, -0.004, 0] }),
    place(new THREE.BoxGeometry(L * 0.82, 0.014, 0.17), { pos: [0, 0.018, -0.145] }),
    place(new THREE.BoxGeometry(L * 0.82, 0.014, 0.17), { pos: [0, 0.018, 0.145] }),
    horn,
    place(new THREE.BoxGeometry(0.064, 0.05, 0.042), { pos: [L / 2, 0, -(W / 2 - 0.01)] }),
    place(new THREE.BoxGeometry(0.064, 0.05, 0.042), { pos: [L / 2, 0, W / 2 - 0.01] }),
    place(cylZ(0.015, W - 0.02, 8), { pos: [L * 0.3, 0, 0] }),
    place(cylZ(0.015, W - 0.02, 8), { pos: [-L * 0.3, 0, 0] }),
    place(cylZ(0.024, 0.2, 10), { pos: [L * 0.3, 0.004, -0.15] }),
    place(cylZ(0.024, 0.2, 10), { pos: [-L * 0.3, 0.004, 0.15] }),
  ];
  const rubber = [place(new THREE.BoxGeometry(L * 0.64, 0.03, 0.2), { pos: [0, -0.034, -0.15] }), place(new THREE.BoxGeometry(L * 0.64, 0.03, 0.2), { pos: [0, -0.034, 0.15] })];
  return { metal: merge(metal), rubber: merge(rubber) };
}

export function buildRunningGear(hullGroup, reg, M) {
  const wheels = roadWheelGeos();
  const sprGeo = sprocketGeo();
  const idGeo = idlerGeo();
  const rollerCap = (s) => {
    const g = latheZ([[R.rollerR, 0], [0.06, 0.02], [0.0001, 0.03]], 20);
    if (s < 0) g.rotateY(Math.PI);
    return g.translate(0, 0, s * 0.1);
  };
  const rollerMetal = merge([cylZ(R.rollerR, 0.2, 24), cylZ(0.04, 0.34, 10), rollerCap(1), rollerCap(-1)]);
  const rollerRubber = latheZ([[R.rollerR - 0.004, -0.06], [R.rollerR + 0.012, -0.055], [R.rollerR + 0.014, 0], [R.rollerR + 0.012, 0.055], [R.rollerR - 0.004, 0.06]], 28);

  const sides = {};
  for (const side of [-1, 1]) {
    const key = side < 0 ? 'L' : 'R';
    const moduleId = side < 0 ? 'track_l' : 'track_r';
    const g = group(hullGroup, 'runningGear' + key);
    const det = new Batch();
    const z = side * R.trackZ;
    const zHull = side * (H.halfIn + 0.02);
    const spinners = []; // {obj, r}

    const addWheel = (x, y, r, metalGeo, rubberGeo, metalMat = M.paint) => {
      const w = new THREE.Group();
      w.position.set(x, y, z);
      g.add(w);
      const a = mk(w, metalGeo, metalMat);
      reg.armorMesh(a, 'wheel');
      reg.module(moduleId, a);
      if (rubberGeo) {
        const b = mk(w, rubberGeo, M.rubber);
        reg.armorMesh(b, 'wheel');
        reg.module(moduleId, b);
      }
      spinners.push({ obj: w, r });
      return w;
    };

    R.wheelXs.forEach((x, i) => {
      addWheel(x, R.wheelY, R.wheelR, wheels.metal, wheels.rubber);
      // 扭杆平衡肘（从车体伸向轮毂）与轴座
      const a = rod([x + 0.34, R.wheelY + 0.1, zHull + side * 0.045], [x, R.wheelY, zHull + side * 0.045], 0.045, 10);
      det.add(a.geo, M.darkMetal, a.t);
      det.add(cylZ(0.075, 0.1, 16), M.paintDark, { pos: [x + 0.34, R.wheelY + 0.1, zHull + side * 0.03] });
      // 第 1、2、6 负重轮装有液压减振器
      if (i === 0 || i === 1 || i === 5) {
        const lo = [x + 0.14, R.wheelY + 0.1, zHull + side * 0.1], hi = [x + 0.36, 0.86, zHull + side * 0.1];
        const body = rod(lo, [lo[0] + (hi[0] - lo[0]) * 0.6, lo[1] + (hi[1] - lo[1]) * 0.6, lo[2]], 0.048, 12);
        const shaft = rod([lo[0] + (hi[0] - lo[0]) * 0.5, lo[1] + (hi[1] - lo[1]) * 0.5, lo[2]], hi, 0.022, 8);
        det.add(body.geo, M.paintDark, body.t);
        det.add(shaft.geo, M.steel, shaft.t);
        det.add(new THREE.BoxGeometry(0.1, 0.06, 0.08), M.paintDark, { pos: [hi[0], hi[1] + 0.03, hi[2] - side * 0.02] });
      }
    });
    addWheel(R.idler.x, R.idler.y, R.idler.r, idGeo, null);
    addWheel(R.sprocket.x, R.sprocket.y, R.sprocket.r, sprGeo, null, M.darkMetal);
    for (const x of R.rollerXs) {
      addWheel(x, R.rollerY, R.rollerR, rollerMetal, rollerRubber);
      det.add(new THREE.BoxGeometry(0.09, 0.11, 0.2), M.paintDark, { pos: [x, R.rollerY + 0.02, zHull + side * 0.08] });
    }
    // 诱导轮曲臂式张紧机构
    const crank = rod([R.idler.x, R.idler.y, zHull + side * 0.07], [R.idler.x + 0.24, R.idler.y + 0.12, zHull + side * 0.07], 0.05, 12);
    det.add(crank.geo, M.darkMetal, crank.t);
    det.add(new THREE.BoxGeometry(0.18, 0.2, 0.1), M.paintDark, { pos: [R.idler.x + 0.26, R.idler.y + 0.14, zHull + side * 0.04] });
    // 主动轮侧减速器壳
    det.add(cylZ(0.2, 0.16, 24), M.paintDark, { pos: [R.sprocket.x, R.sprocket.y, zHull + side * 0.06] });

    // 履带：包络路径 + 实例化履带板（金属 + 橡胶垫）
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
    const linkGeos = trackLinkGeos(pitch);
    const inst = new THREE.InstancedMesh(linkGeos.metal, M.trackSteel, count);
    const pads = new THREE.InstancedMesh(linkGeos.rubber, M.rubber, count);
    for (const im of [inst, pads]) {
      im.castShadow = true;
      im.receiveShadow = true;
      g.add(im);
    }
    reg.armorMesh(inst, 'track');
    reg.module(moduleId, inst);
    reg.module(moduleId, pads);
    pads.raycast = () => {}; // 橡胶垫只用于显示与着色，不参与弹道

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
        pads.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
      pads.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      pads.computeBoundingSphere();
    };
    setLinks(0);
    det.build(g, { name: 'runningDetails' });

    sides[key] = { group: g, spinners, setLinks, offset: 0 };
    reg.explodeGroup(g, {
      id: 'running' + key,
      name: side < 0 ? '左侧行走装置' : '右侧行走装置',
      sub: '6 负重轮 · 5 托带轮 · 后置主动轮',
      desc: '扭杆独立悬挂，每侧 6 个挂胶负重轮、5 个托带轮，第 1、2、6 负重轮装液压减振器；前部为曲臂张紧的诱导轮、后部为主动轮。履带宽 580 mm，采用橡胶金属铰链并装有橡胶垫。',
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
