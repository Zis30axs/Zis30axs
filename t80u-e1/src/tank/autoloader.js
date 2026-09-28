// “Korzina”转盘式自动装弹机：28 个铰接 L 形弹匣（弹丸水平径向、药筒竖立在外圈），
// 液压提升机、链式推弹机、残底收集器，以及膛内弹药。提供供时间轴调用的“设定状态”接口。
import * as THREE from 'three';
import { LOADER as L, GUN, DEG } from './dims.js';
import { AMMO, CAROUSEL_LAYOUT } from '../data/ammo.js';
import { projectileMesh, chargeMesh, stubMesh, staticRound } from './ammo-models.js';
import { cylX, cylZ, merge, place } from './geom.js';
import { mk, group } from './registry.js';

const STEP = (Math.PI * 2) / L.slots;
const Y_HINGE = L.floorY + L.axisH; // 弹匣铰链（弹轴）在转盘中的高度
const S_HINGE = GUN.breechFace - 0.04 - 0.03 - 0.74; // 提升到位时铰链沿炮轴的位置（相对耳轴）
const CHARGE_BASE = L.chargeGap + L.chargeLen; // 药筒底端距铰链
export const RAM_DIST = CHARGE_BASE + (GUN.chamberRear - S_HINGE); // 推弹行程

const templates = new Map();
function tpl(kind, id) {
  const key = kind + id;
  if (!templates.has(key)) templates.set(key, kind === 'p' ? projectileMesh(id) : chargeMesh(id));
  return templates.get(key);
}
/** 克隆模板（共享几何与材质）；弹托花瓣的引用需要重新映射 */
function cloneRound(kind, id) {
  const src = tpl(kind, id);
  const c = src.clone(true);
  const map = (o) => c.children[src.children.indexOf(o)];
  if (src.petals) c.petals = src.petals.map(map);
  if (src.stub) c.stub = map(src.stub);
  if (src.caseMeshes) c.caseMeshes = src.caseMeshes.map(map);
  return c;
}

let _trayGeo = null, _ctrayGeo = null;
function trayGeo() {
  _trayGeo ??= merge([
    place(new THREE.BoxGeometry(0.78, 0.012, 0.085), { pos: [-0.42, -L.axisH + 0.006, 0] }),
    place(new THREE.BoxGeometry(0.02, 0.07, 0.1), { pos: [-0.02, -0.04, 0] }),
  ]);
  return _trayGeo;
}
function chargeTrayGeo() {
  _ctrayGeo ??= merge([
    place(new THREE.CylinderGeometry(L.chargeR + 0.012, L.chargeR + 0.012, L.chargeLen, 14, 1, true, 0, Math.PI), { pos: [0, L.chargeGap + L.chargeLen / 2, 0] }),
    place(new THREE.BoxGeometry(0.1, 0.012, 0.12), { pos: [0.02, L.chargeGap - 0.012, 0] }),
  ]);
  return _ctrayGeo;
}

class Cassette {
  constructor(index, M) {
    this.index = index;
    this.obj = new THREE.Group();
    this.obj.name = 'cassette' + index;
    this.obj.userData.cassette = index;
    // 弹丸托盘（沿 -X 朝向转盘中心）
    mk(this.obj, trayGeo(), M.alumDouble, { cast: false });
    // 药筒托架（铰接，可展开）
    this.pivot = new THREE.Group();
    this.obj.add(this.pivot);
    mk(this.pivot, chargeTrayGeo(), M.alumDouble, { cast: false });
    this.projHolder = new THREE.Group();
    this.projHolder.rotation.y = Math.PI; // 弹丸 +X → 指向 -X（转盘中心）
    this.obj.add(this.projHolder);
    this.chargeHolder = new THREE.Group();
    this.chargeHolder.rotation.z = Math.PI / 2; // 药筒 +X → 竖直向上
    this.pivot.add(this.chargeHolder);
    this.stub = stubMesh();
    this.stub.rotation.z = Math.PI / 2;
    this.stub.position.y = CHARGE_BASE - 0.07;
    this.pivot.add(this.stub);
    this.type = null;
    this.state = 'empty';
    this.proj = null;
    this.charge = null;
  }

  /** state: 'full' | 'empty' | 'stub' */
  setContent(type, state) {
    if (this.type !== type || !this.proj) {
      if (this.proj) this.projHolder.remove(this.proj);
      if (this.charge) this.chargeHolder.remove(this.charge);
      this.proj = type ? staticRound('p', type) : null;
      this.charge = type ? staticRound('c', type) : null;
      if (this.proj) this.projHolder.add(this.proj);
      if (this.charge) this.chargeHolder.add(this.charge);
      this.type = type;
    }
    this.state = state;
    const full = state === 'full';
    if (this.proj) this.proj.visible = full;
    if (this.charge) this.charge.visible = full;
    this.stub.visible = state === 'stub';
    this.setRam(0);
  }

  setUnfold(u) {
    this.pivot.rotation.z = -u * (Math.PI / 2);
  }

  /** 推弹行程 d（沿弹匣 -X）：药筒先动，贴合弹丸后一起前进 */
  setRam(d) {
    const gapToProj = L.chargeGap + 0.03;
    this.chargeHolder.position.y = L.chargeGap - d;
    this.projHolder.position.x = -0.03 - Math.max(0, d - gapToProj);
  }
}

export function buildAutoloader(turretYaw, turret, gun, reg, M) {
  const carousel = group(turretYaw, 'carousel');
  // 转盘结构
  const floor = mk(carousel, new THREE.RingGeometry(0.18, 1.0, 56, 1), M.alumDouble, { pos: [0, L.floorY - 0.005, 0], rot: [-Math.PI / 2, 0, 0] });
  floor.castShadow = false;
  mk(carousel, new THREE.CylinderGeometry(1.0, 1.0, 0.07, 56, 1, true), M.alumDouble, { pos: [0, L.floorY + 0.03, 0] });
  const topRing = mk(carousel, new THREE.TorusGeometry(L.hingeR + 0.02, 0.02, 6, 56), M.alum, { pos: [0, Y_HINGE + CHARGE_BASE - 0.05, 0], rot: [Math.PI / 2, 0, 0] });
  topRing.castShadow = false;
  mk(carousel, new THREE.CylinderGeometry(0.18, 0.2, 0.1, 24), M.darkMetal, { pos: [0, L.floorY + 0.04, 0] });

  const cassettes = [];
  for (let i = 0; i < L.slots; i++) {
    const c = new Cassette(i, M);
    carousel.add(c.obj);
    placeInSlot(c);
    c.setContent(CAROUSEL_LAYOUT[i], 'full');
    reg.module('carousel', c.obj);
    cassettes.push(c);
  }
  function placeInSlot(c) {
    const a = c.index * STEP;
    if (c.obj.parent !== carousel) carousel.add(c.obj);
    c.obj.position.set(Math.cos(a) * L.hingeR, Y_HINGE, Math.sin(a) * L.hingeR);
    c.obj.rotation.set(0, -a, 0);
    c.setUnfold(0);
    c.setRam(0);
  }

  // 提升到位后的弹匣位姿（炮塔坐标）
  const [tx, ty] = GUN.trunnion;
  const dirLoad = new THREE.Vector3(Math.cos(GUN.loadAngle), Math.sin(GUN.loadAngle), 0);
  const liftPos = new THREE.Vector3(tx, ty, 0).addScaledVector(dirLoad, S_HINGE);
  const liftQuat = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(dirLoad.clone().negate(), new THREE.Vector3(-Math.sin(GUN.loadAngle), Math.cos(GUN.loadAngle), 0), new THREE.Vector3(0, 0, -1)),
  );
  const slotPos = new THREE.Vector3(-L.hingeR, Y_HINGE, 0);
  const slotQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));

  // —— 装弹机构（固定在炮塔上）
  const mech = group(turret, 'loaderMech');
  const frame = new THREE.Group(); // 推弹线坐标系（与提升到位的弹匣重合）
  frame.position.copy(liftPos);
  frame.quaternion.copy(liftQuat);
  mech.add(frame);
  // 提升机导轨
  for (const z of [-0.13, 0.13]) {
    mk(mech, new THREE.BoxGeometry(0.05, liftPos.y - Y_HINGE + 0.4, 0.04), M.steel, { pos: [liftPos.x - 0.12, (liftPos.y + Y_HINGE) / 2 + 0.05, z] });
  }
  const carriage = mk(mech, new THREE.BoxGeometry(0.1, 0.1, 0.34), M.darkMetal, { pos: [liftPos.x - 0.12, Y_HINGE, 0] });
  const liftCyl = mk(mech, new THREE.CylinderGeometry(0.035, 0.035, 0.9, 12), M.steel, { pos: [liftPos.x - 0.2, Y_HINGE + 0.45, 0.2] });
  // 推弹机（链式）
  const housing = mk(frame, new THREE.BoxGeometry(0.16, 0.2, 0.24), M.electronics, { pos: [CHARGE_BASE + 0.1, 0.02, 0] });
  const chainGeo = new THREE.BoxGeometry(0.075, 0.05, 0.06);
  const chain = [];
  for (let i = 0; i < 26; i++) {
    const c = mk(frame, chainGeo, M.darkMetal, { pos: [0, 0, 0], cast: false });
    c.visible = false;
    chain.push(c);
  }
  const head = mk(frame, cylX(0.06, 0.06, 0.04, 16), M.steel, { pos: [CHARGE_BASE + 0.02, 0, 0] });
  // 残底收集器
  const catcher = group(frame, 'catcher', [0.43, 0.22, 0]);
  mk(catcher, new THREE.BoxGeometry(0.24, 0.02, 0.2), M.steel, { pos: [0, -0.1, 0] });
  mk(catcher, new THREE.BoxGeometry(0.24, 0.16, 0.02), M.steel, { pos: [0, -0.02, 0.1] });
  mk(catcher, new THREE.BoxGeometry(0.24, 0.16, 0.02), M.steel, { pos: [0, -0.02, -0.1] });
  const catcherStub = stubMesh();
  catcherStub.position.set(0.04, -0.02, 0); // 沿 +X（残底开口朝前）
  catcher.add(catcherStub);
  catcherStub.visible = false;
  // 被抛出的残底（炮塔坐标系中运动）
  const flyingStub = stubMesh();
  flyingStub.visible = false;
  turret.add(flyingStub);
  // 火炮闭锁器
  const stopper = mk(mech, new THREE.BoxGeometry(0.08, 0.14, 0.08), M.darkMetal, { pos: [0.55, 0.12, -0.28] });

  for (const o of [carriage, housing, head, liftCyl, catcher]) reg.module('autoloader', o);

  reg.explodeGroup(carousel, {
    id: 'carousel',
    name: '转盘式自动装弹机',
    sub: '“Korzina” · 28 发 · 26°/s',
    desc: '转盘位于战斗室底部，28 个铰接弹匣呈 L 形布置：弹丸水平径向摆放，发射药筒竖立在外圈。选定弹种后转盘就近转向，由液压提升机把弹匣送到炮尾后方。',
    offset: [0, 1.35, 0],
    label: [-0.2, Y_HINGE + 0.4, 0.9],
  });
  reg.explodeGroup(mech, {
    id: 'loaderMech',
    name: '提升机 · 推弹机 · 残底收集器',
    sub: '装填机构',
    desc: '液压提升机把弹匣提升到输弹线并展开药筒托架；链式推弹机一次将弹丸和药筒推入药室；射击后抛出的药筒底托被收集器接住，下一次装填时放回空弹匣。',
    offset: [-1.0, -0.7, 0],
    label: [liftPos.x - 0.3, liftPos.y, 0],
  });

  // —— 膛内弹药（随后坐部分运动）
  const chamber = { proj: {}, charge: {} };
  for (const id of Object.keys(AMMO)) {
    const p = cloneRound('p', id);
    p.position.x = GUN.chamberRear + L.chargeLen;
    p.visible = false;
    gun.recoil.add(p);
    chamber.proj[id] = p;
    const c = cloneRound('c', id);
    c.rotation.y = Math.PI;
    c.position.x = GUN.chamberRear + L.chargeLen;
    c.visible = false;
    gun.recoil.add(c);
    chamber.charge[id] = c;
  }
  // 出膛飞行的弹丸（在俯仰坐标系中沿炮轴运动，不随后坐）
  const flying = {};
  for (const id of Object.keys(AMMO)) {
    const p = cloneRound('p', id);
    p.visible = false;
    gun.pitch.add(p);
    flying[id] = p;
  }

  const api = {
    carousel,
    cassettes,
    mech,
    frame,
    catcherStub,
    flyingStub,
    chamber,
    flying,
    stopper,
    STEP,
    RAM_DIST,
    liftPos,
    liftQuat,
    angle: 0,
    lifted: null,

    setAngle(beta) {
      this.angle = beta;
      carousel.rotation.y = beta;
    },
    /** 当前处于装填位置（炮塔后方）的弹匣编号 */
    slotAtLoading(beta = this.angle) {
      return (((Math.round((beta + Math.PI) / STEP) % L.slots) + L.slots) % L.slots);
    },
    /** 让第 i 号弹匣到达装填位所需的转盘角 */
    angleFor(i) {
      return i * STEP - Math.PI;
    },
    /** 查找某弹种距离装填位最近的弹匣，返回 {index, delta} */
    nearest(type, beta = this.angle) {
      let best = null;
      for (const c of cassettes) {
        if (c.type !== type || c.state !== 'full') continue;
        let d = this.angleFor(c.index) - beta;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (!best || Math.abs(d) < Math.abs(best.delta) - 1e-6) best = { index: c.index, delta: d };
      }
      return best;
    },
    countOf(type) {
      return cassettes.filter((c) => c.type === type && c.state === 'full').length;
    },
    /** 提升进度 k∈[0,1]；k=0 时回到转盘 */
    setLift(i, k) {
      const c = cassettes[i];
      if (k <= 0) {
        if (this.lifted === i) {
          placeInSlot(c);
          this.lifted = null;
        }
        carriage.position.y = Y_HINGE;
        return;
      }
      if (c.obj.parent !== turretYaw) turretYaw.add(c.obj);
      this.lifted = i;
      c.obj.position.lerpVectors(slotPos, liftPos, k);
      c.obj.quaternion.slerpQuaternions(slotQuat, liftQuat, k);
      carriage.position.y = c.obj.position.y;
    },
    setRammer(d) {
      head.position.x = CHARGE_BASE + 0.02 - d;
      const start = CHARGE_BASE + 0.02, end = head.position.x;
      const len = start - end;
      const n = Math.min(chain.length, Math.ceil(len / 0.075));
      for (let i = 0; i < chain.length; i++) {
        const vis = i < n;
        chain[i].visible = vis;
        if (vis) chain[i].position.set(end + 0.04 + i * 0.075, 0, 0);
      }
    },
    setWedge(closed) {
      gun.wedge.position.y = THREE.MathUtils.lerp(gun.wedge.userData.openY, gun.wedge.userData.closedY, closed);
    },
    setStopper(on) {
      stopper.position.y = 0.12 + (on ? 0.06 : 0);
    },
    showChamber(type, what) {
      // what: 'none' | 'round' | 'stub'
      for (const id of Object.keys(AMMO)) {
        const p = chamber.proj[id], c = chamber.charge[id];
        p.visible = id === type && what === 'round';
        c.visible = id === type && (what === 'round' || what === 'stub');
        for (const m of c.caseMeshes) m.visible = what === 'round';
      }
    },
    hideFlying() {
      for (const id of Object.keys(flying)) flying[id].visible = false;
    },
    placeInSlot,
    resetCassettes(contents) {
      for (const c of cassettes) {
        placeInSlot(c);
        const s = contents[c.index];
        c.setContent(s.type, s.state);
      }
      this.lifted = null;
      carriage.position.y = Y_HINGE;
    },
    snapshotContents() {
      return cassettes.map((c) => ({ type: c.type, state: c.state }));
    },
  };
  api.setRammer(0);
  api.setWedge(1);
  for (const o of [carousel, mech]) o.traverse((x) => (x.castShadow = false));
  for (const g of [...Object.values(chamber.proj), ...Object.values(chamber.charge)]) g.traverse((x) => (x.castShadow = false));
  return api;
}

export { STEP as SLOT_STEP, DEG };
