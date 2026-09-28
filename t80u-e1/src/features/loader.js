// 装填与击发：把“选弹 → 转盘 → 提升 → 推弹 → 闭锁 → 击发 → 后坐 → 抛残底”编排成可播放、可拖动的时间轴。
// 每个步骤的 apply(k) 只根据进度 k 设定绝对状态，因此可以任意跳转（先复位到起点，再依次应用各步）。
import * as THREE from 'three';
import { AMMO, AMMO_ORDER, CAROUSEL_LAYOUT } from '../data/ammo.js';
import { GUN, LOADER, DEG } from '../tank/dims.js';
import { Ease, seg, lerp } from '../core/tween.js';

const STEP_ANGLE = (Math.PI * 2) / LOADER.slots;

// 自动镜头（炮塔坐标系）
const CAM = {
  carousel: { pos: [-2.5, 2.5, -2.4], target: [-0.3, -0.6, 0] },
  breech: { pos: [-2.35, 1.95, -2.05], target: [-0.55, 0.12, 0] },
  gunSide: { pos: [2.6, 3.4, -11.5], target: [2.6, 0.2, 0] },
  muzzle: { pos: [6.5, 0.95, -2.9], target: [6.95, 0.42, 0] },
};
// 各镜头对应的外壳透明度（外部动作看外观，内部机构看透视）
const SHELL = { carousel: 0.07, breech: 0.07, gunSide: 1, muzzle: 1 };

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

class Sequence {
  constructor(steps) {
    let t = 0;
    for (const s of steps) {
      s.start = t;
      t += s.dur;
      s.end = t;
    }
    this.steps = steps;
    this.total = t;
  }
  indexAt(t) {
    for (let i = 0; i < this.steps.length; i++) if (t < this.steps[i].end) return i;
    return this.steps.length - 1;
  }
}

export class LoaderMode {
  constructor(app) {
    this.app = app;
    this.L = app.tank.loader;
    this.state = { chamberType: null, catcherHasStub: false };
    this.selected = '3BM46';
    this.speed = 0.5;
    this.autoCam = true;
    this.showCrew = false;
    this.pauseEachStep = false;
    this.playing = false;
    this.t = 0;
    this.plan = null;
    this.seq = null;
    this.fired = new Set();
    this.lastStep = -1;
    this.buildLaser();
    this.L.setWedge(0); // 初始状态：膛内无弹，炮闩打开待装填
  }

  // ———————————————————— 3D 辅助 ————————————————————
  buildLaser() {
    const geo = new THREE.CylinderGeometry(0.008, 0.008, 1, 6, 1, true);
    geo.rotateZ(-Math.PI / 2);
    geo.translate(0.5, 0, 0);
    this.laserMat = new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    this.laser = new THREE.Mesh(geo, this.laserMat);
    this.laser.scale.x = 90;
    this.laser.position.set(0.79, 0.93, -0.6);
    this.laser.visible = false;
    this.laser.raycast = () => {};
    this.app.tank.turret.add(this.laser);
    // 导弹尾焰
    const tex = this.app.effects.tex.glow;
    this.exhaust = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffb070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.exhaust.scale.setScalar(0.5);
    this.exhaust.visible = false;
  }

  /** 显示/隐藏与装填无关的车内部件（乘员、座椅、火控设备、油箱弹架等） */
  crewVisible(v) {
    const root = this.app.tank.root;
    for (const n of ['driverGroup', 'gunnerGroup', 'commanderGroup', 'fcsGroup', 'tankRackL', 'tankRackR', 'batteries', 'fcRack']) {
      const o = root.getObjectByName(n);
      if (o) o.visible = v;
    }
  }

  resetFlying() {
    const L = this.L;
    for (const id of Object.keys(L.flying)) {
      const p = L.flying[id];
      p.visible = false;
      p.position.set(0, 0, 0);
      for (const pt of p.petals || []) {
        pt.position.set(0, 0, 0);
        pt.rotation.set(0, 0, 0);
        pt.visible = true;
      }
    }
    if (this.exhaust.parent) this.exhaust.parent.remove(this.exhaust);
    this.exhaust.visible = false;
  }

  snapshot() {
    return {
      beta: this.L.angle,
      aim: this.app.tank.elevation,
      contents: this.L.snapshotContents(),
      chamberType: this.state.chamberType,
      catcherHasStub: this.state.catcherHasStub,
    };
  }

  resetTo(s) {
    const L = this.L, tank = this.app.tank;
    this.resetFlying();
    L.resetCassettes(s.contents);
    L.setAngle(s.beta);
    tank.setGunElevation(s.aim);
    tank.gun.recoil.position.x = 0;
    L.setRammer(0);
    L.setStopper(false);
    L.setWedge(s.chamberType ? 1 : 0);
    L.showChamber(s.chamberType, s.chamberType ? 'round' : 'none');
    L.catcherStub.visible = s.catcherHasStub;
    L.catcherStub.position.set(0.04, -0.02, 0);
    L.flyingStub.visible = false;
    this.laser.visible = false;
  }

  // ———————————————————— 编排 ————————————————————
  /** kind: 'load+fire' | 'load' | 'fire' | 'fire+load' */
  buildPlan(kind) {
    const start = this.snapshot();
    const steps = [];
    let chamber = start.chamberType;
    let stub = start.catcherHasStub;
    const parts = kind.split('+');
    let loadInfo = null;
    for (const p of parts) {
      if (p === 'load') {
        if (chamber) continue;
        const r = this.loadSteps(start, stub);
        if (!r) continue;
        steps.push(...r.steps);
        loadInfo = r;
        chamber = this.selected;
        stub = false;
      } else if (p === 'fire') {
        if (!chamber) continue;
        steps.push(...this.fireSteps(start, chamber));
        chamber = null;
        stub = true;
      }
    }
    if (!steps.length) return null;
    return { kind, start, steps, end: { chamberType: chamber, catcherHasStub: stub }, loadInfo };
  }

  loadSteps(start, hadStub) {
    const L = this.L, tank = this.app.tank;
    const type = this.selected;
    const near = L.nearest(type, start.beta);
    if (!near) return null;
    const j = near.index;
    const c = L.cassettes[j];
    const beta0 = start.beta, beta1 = beta0 + near.delta;
    const n = Math.round(Math.abs(near.delta) / STEP_ANGLE);
    const rotDur = n > 0 ? Math.abs(near.delta) / LOADER.rotSpeed + 0.35 : 0.5;
    const dir = near.delta > 0 ? '逆时针' : '顺时针';
    const a = AMMO[type];
    const aim = start.aim;
    const load = GUN.loadAngle;
    const RAM = L.RAM_DIST;
    const steps = [
      {
        id: 'select', phase: 'load', cam: 'carousel', dur: 0.8,
        title: '选择弹种',
        desc: n > 0
          ? `炮手在装填控制盒上选定 ${a.name}。控制系统记着 28 个弹匣各装什么弹，自动找出离装填位最近的一发：${j + 1} 号弹匣，需要${dir}转 ${n} 格。`
          : `炮手在装填控制盒上选定 ${a.name}。控制系统记着 28 个弹匣各装什么弹；这一发正好在装填位，转盘不用转动。`,
        apply() {},
      },
      {
        id: 'lock', phase: 'load', cam: 'breech', dur: 0.9,
        title: '火炮转到装填角并锁定',
        desc: '稳定器把火炮带到固定的装填角，液压闭锁器把它锁住，让药室与输弹线对准。上一发射击后炮闩已经自动打开，处于待装填状态。',
        apply(k) {
          tank.setGunElevation(lerp(aim, load, Ease.inOut(k)));
          L.setStopper(k > 0.8);
        },
      },
      {
        id: 'rotate', phase: 'load', cam: 'carousel', dur: rotDur,
        title: n > 0 ? `转盘${dir}转动 ${n} 格` : '转盘就位',
        desc: `转盘以约 26°/s 的速度转动（每格 12.9°），把选中的弹匣送到炮塔后部的装填位。${n > 0 ? `本次转 ${n} 格，约 ${rotDur.toFixed(1)} 秒；转得越少，装填越快。` : '目标弹匣已在装填位。'}`,
        apply(k) {
          L.setAngle(lerp(beta0, beta1, Ease.inOutQuad(k)));
        },
      },
      {
        id: 'lift', phase: 'load', cam: 'breech', dur: 1.5,
        title: '提升弹匣并展开',
        desc: '液压提升机把整个弹匣从转盘里提起，送到炮尾正后方的输弹线上。上升途中，竖放的药筒托架绕铰链翻转 90°，与水平放置的弹丸排成一条直线。',
        apply(k) {
          L.setLift(j, Ease.inOut(k));
          c.setUnfold(Ease.inOut(seg(k, 0.45, 1)));
        },
      },
      {
        id: 'ram', phase: 'load', cam: 'breech', dur: 1.05,
        title: '一次推弹入膛',
        desc: '链式推弹机伸出，先推动药筒贴住弹丸，再把两者一起推进药室。T-80 只需一个推弹行程，T-72 的装弹机则要分两次推弹。',
        apply(k) {
          const d = RAM * Ease.inOut(k);
          c.setRam(d);
          L.setRammer(d);
          const inChamber = k >= 0.999;
          if (c.proj) c.proj.visible = !inChamber;
          if (c.charge) c.charge.visible = !inChamber;
          L.showChamber(type, inChamber ? 'round' : 'none');
        },
      },
      {
        id: 'retract', phase: 'load', cam: 'breech', dur: 0.75,
        title: '推弹机回收，炮闩关闭',
        desc: '推弹机缩回。药筒金属底托越过抽筒子后，立楔式炮闩在弹簧力作用下上升关闭，药室闭锁。',
        apply(k) {
          L.setRammer(RAM * (1 - Ease.inOut(k)));
          L.setWedge(Ease.out(seg(k, 0.35, 0.62)));
        },
      },
      {
        id: 'stub', phase: 'load', cam: 'breech', dur: hadStub ? 0.7 : 0.35,
        title: hadStub ? '残底放回空弹匣' : '弹匣已清空',
        desc: hadStub
          ? '上一发射击后被收集器接住的药筒金属底托，此时落进刚腾空的弹匣，随弹匣一起回到转盘，战斗中不会抛到车外。'
          : '这是本轮第一发，收集器里没有残底，空弹匣直接复位。',
        apply(k) {
          if (hadStub) {
            L.catcherStub.visible = k < 0.999;
            const e = Ease.in(k);
            L.catcherStub.position.set(lerp(0.04, 0.005, e), lerp(-0.02, -0.22, e), 0);
            c.setContent(type, k >= 0.999 ? 'stub' : 'empty');
          } else c.setContent(type, 'empty');
          c.setUnfold(1);
        },
      },
      {
        id: 'lower', phase: 'load', cam: 'carousel', dur: 1.3,
        title: '弹匣折叠并降回转盘',
        desc: '药筒托架折回竖直位置，提升机把弹匣降回转盘上的原位，转盘随时可以再次转动。',
        apply(k) {
          c.setUnfold(1 - Ease.inOut(seg(k, 0, 0.5)));
          L.setLift(j, 1 - Ease.inOut(seg(k, 0.2, 1)));
          if (k >= 1) c.setUnfold(0);
        },
      },
      {
        id: 'unlock', phase: 'load', cam: 'gunSide', dur: 0.7,
        title: '解锁，火炮回到瞄准线',
        desc: '闭锁器松开，火炮在稳定器带动下回到炮手的瞄准线，装填完成。不计转盘转动，一次装填约 6–7 秒；战斗射速约每分钟 7–8 发。',
        apply(k) {
          L.setStopper(k < 0.15);
          tank.setGunElevation(lerp(load, aim, Ease.inOut(k)));
        },
      },
    ];
    return { steps, slot: j, n, delta: near.delta, rotDur };
  }

  fireSteps(start, type) {
    const L = this.L, tank = this.app.tank, gun = tank.gun, app = this.app;
    const a = AMMO[type];
    const fly = L.flying[type];
    const petals = fly.petals || [];
    const R = GUN.recoil;
    const muzzleX = GUN.muzzle;
    const self = this;
    // 残底抛出路径（炮塔坐标）：起点为药室后端（瞄准俯仰角下），终点为收集器
    const pitchM = new THREE.Matrix4().compose(gun.pitch.position, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, start.aim)), new THREE.Vector3(1, 1, 1));
    const s0 = new THREE.Vector3(GUN.chamberRear + 0.07, 0, 0).applyMatrix4(pitchM);
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, start.aim)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)));
    L.catcherStub.parent.updateWorldMatrix(true, false);
    const catcherLocal = new THREE.Matrix4().copy(L.frame.matrix).multiply(L.catcherStub.parent.matrix);
    const s1 = new THREE.Vector3(0.04, -0.02, 0).applyMatrix4(catcherLocal);
    const q1 = new THREE.Quaternion().setFromRotationMatrix(catcherLocal);
    const isKE = a.kind === 'ke', isATGM = a.kind === 'tandem';

    const steps = [
      {
        id: 'lase', phase: 'fire', cam: 'gunSide', dur: 1.2,
        title: '激光测距与弹道解算',
        desc: isATGM
          ? '炮手用 1G46 测距并锁定目标。发射 9M119M1 时，瞄准镜会向目标投射一束调制激光，导弹尾部的接收器沿这束激光飞行，也就是激光驾束制导。'
          : '炮手用 1G46 瞄准镜的激光测距仪测距；弹道计算机综合弹种、距离、横风、耳轴倾斜和药温，算出射角与提前量，稳定器把火炮调到解算位置。',
        apply(k) {
          self.laser.visible = k > 0.12 && k < 0.88;
          self.laser.rotation.z = start.aim;
          self.laserMat.opacity = 0.55 + 0.35 * Math.sin(k * 40);
        },
      },
      {
        id: 'fire', phase: 'fire', cam: 'gunSide', dur: 1.0,
        title: '电击发',
        desc: isATGM
          ? '按下击发按钮，二级抛射装药把导弹以较低速度推出炮管；出膛后导弹自带的火箭发动机再点火。可燃药筒完全燃烧，只剩金属底托。'
          : `按下击发按钮，电底火点燃发射药。可燃药筒连同装药完全燃烧，只留下金属底托；火药燃气推动弹丸在约 6 m 长的身管内加速，出膛速度约 ${a.v0} m/s，身管随即后坐。`,
        events: [
          { at: 0.12, fn: () => app.effects.flash(gun.recoil.localToWorld(new THREE.Vector3(-0.3, 0, 0)), { intensity: 30, dur: 0.12, range: 3 }) },
          {
            at: 0.5,
            fn: () => {
              const p = gun.pitch.localToWorld(new THREE.Vector3(muzzleX + 0.1, 0, 0));
              const d = gun.pitch.localToWorld(new THREE.Vector3(muzzleX + 1.1, 0, 0)).sub(p).normalize();
              if (isATGM) app.effects.flash(p, { intensity: 50, dur: 0.2 });
              else app.effects.muzzleBlast(p, d);
            },
          },
        ],
        apply(k) {
          const ign = k >= 0.12;
          L.showChamber(type, ign ? 'stub' : 'round');
          fly.visible = ign && k < 0.62;
          const kb = seg(k, 0.12, 0.5);
          fly.position.x = k <= 0.5 ? lerp(GUN.chamberRear + LOADER.chargeLen, muzzleX - 0.2, kb * kb) : muzzleX - 0.2 + (k - 0.5) * 80;
          const r = isATGM ? R * 0.5 : R;
          gun.recoil.position.x = -(k < 0.12 ? 0 : r * Ease.out(seg(k, 0.12, 0.45)));
        },
      },
      {
        id: 'exit', phase: 'fire', cam: 'muzzle', dur: isATGM ? 3.0 : 2.6,
        title: '出膛瞬间（慢动作）',
        desc: isKE
          ? '慢动作回放：穿甲弹离开炮口后，三瓣式弹托在迎面气流作用下张开脱落，只剩细长的穿甲杆以约 1.7 km/s 的速度飞向目标。'
          : isATGM
            ? '慢动作回放：导弹出膛后展开鸭翼与尾翼，发动机点火，沿激光束飞行，最大射程约 5 km。'
            : '慢动作回放：弹丸离开炮口后，尾部折叠的稳定翼张开，依靠尾翼稳定飞行。',
        apply(k) {
          fly.visible = k < 0.995;
          // 前 70% 缓慢移出炮口（便于观察弹托分离），之后加速飞离
          const slow = isATGM ? 3.2 : 2.4;
          fly.position.x = muzzleX + 0.05 + (k < 0.7 ? (k / 0.7) * slow : slow + Math.pow((k - 0.7) / 0.3, 2) * 40);
          self.laser.visible = isATGM && k < 0.99;
          if (isATGM) {
            if (self.exhaust.parent !== fly) fly.add(self.exhaust);
            self.exhaust.visible = k > 0.12 && k < 0.995;
            self.exhaust.position.set(-0.08, 0, 0);
            self.exhaust.scale.setScalar(0.35 + 0.15 * Math.sin(k * 90));
          }
          const sp = seg(k, 0.06, 0.8);
          for (const pt of petals) {
            const ang = pt.userData.petalAngle;
            if (ang === undefined) {
              pt.visible = sp < 0.08;
              continue;
            }
            const rad = new THREE.Vector3(0, -Math.sin(ang), Math.cos(ang));
            pt.position.set(-sp * 1.6, rad.y * sp * 0.9, rad.z * sp * 0.9);
            pt.rotation.x = sp * 1.2 * (ang > Math.PI ? -1 : 1);
            pt.visible = true;
          }
        },
      },
      {
        id: 'counter', phase: 'fire', cam: 'breech', dur: 1.3,
        title: '复进、开闩、抛出残底',
        desc: '后坐约 300 mm 后，复进机把炮身推回原位。复进到位前半自动机构打开炮闩，抽筒子把药筒金属底托向后抛出，由残底收集器接住，等到下一次装填时放回空弹匣。',
        apply(k) {
          const r = isATGM ? R * 0.5 : R;
          gun.recoil.position.x = -r * (1 - Ease.inOut(seg(k, 0, 0.7)));
          L.setWedge(1 - seg(k, 0.55, 0.7));
          const ek = seg(k, 0.66, 1);
          L.showChamber(type, ek > 0 ? 'none' : 'stub');
          L.flyingStub.visible = ek > 0 && ek < 1;
          if (ek > 0) {
            const e = Ease.out(ek);
            L.flyingStub.position.lerpVectors(s0, s1, e);
            L.flyingStub.position.y += Math.sin(ek * Math.PI) * 0.18;
            L.flyingStub.quaternion.slerpQuaternions(q0, q1, e);
          }
          L.catcherStub.visible = ek >= 1;
          L.catcherStub.position.set(0.04, -0.02, 0);
          fly.visible = false;
        },
      },
    ];
    return steps;
  }

  // ———————————————————— 播放控制 ————————————————————
  defaultKind() {
    return this.state.chamberType ? 'fire+load' : 'load+fire';
  }

  prepare(kind = this.defaultKind()) {
    this.plan = this.buildPlan(kind);
    this.seq = this.plan ? new Sequence(this.plan.steps) : null;
    this.t = 0;
    this.playing = false;
    this.fired.clear();
    this.lastStep = -1;
    this.renderSteps();
    this.renderHud();
    this.refreshStatus();
  }

  start(kind) {
    if (this.inProgress()) this.resetTo(this.plan.start);
    this.prepare(kind);
    if (!this.seq) {
      this.app.toast(`转盘里已经没有 ${AMMO[this.selected].name} 了，请先补充弹药或换一种弹。`, 'warn');
      return;
    }
    this.play();
  }

  inProgress() {
    return this.seq && this.t > 0 && this.t < this.seq.total;
  }

  play() {
    if (!this.seq) this.prepare();
    if (!this.seq) return;
    if (this.t >= this.seq.total) this.prepare();
    this.playing = true;
    this.updateHudButtons();
  }

  pause() {
    this.playing = false;
    this.updateHudButtons();
  }

  seek(t, silent = true) {
    if (!this.seq) return;
    this.t = THREE.MathUtils.clamp(t, 0, this.seq.total);
    // 跳转后，已经过的一次性特效不再触发
    this.fired.clear();
    for (const s of this.seq.steps) for (const [i, ev] of (s.events || []).entries()) if (s.start + ev.at * s.dur <= this.t) this.fired.add(s.id + i);
    this.renderAt(this.t);
    if (silent) this.lastStep = this.seq.indexAt(this.t);
    this.syncUi(true);
  }

  stepBy(d) {
    if (!this.seq) return;
    const i = this.seq.indexAt(this.t);
    const within = this.t - this.seq.steps[i].start;
    let target = i + d;
    if (d < 0 && within > 0.25) target = i;
    target = THREE.MathUtils.clamp(target, 0, this.seq.steps.length - 1);
    this.pause();
    this.seek(this.seq.steps[target].start + 1e-4);
    this.moveCam(this.seq.steps[target]);
  }

  renderAt(t) {
    const p = this.plan;
    this.resetTo(p.start);
    for (const s of this.seq.steps) {
      if (t >= s.end) s.apply(1);
      else {
        if (t > s.start) s.apply((t - s.start) / s.dur);
        break;
      }
    }
  }

  finish() {
    const p = this.plan;
    this.renderAt(this.seq.total);
    this.state.chamberType = p.end.chamberType;
    this.state.catcherHasStub = p.end.catcherHasStub;
    this.playing = false;
    const msg = {
      'load+fire': '装填并击发完成',
      'fire+load': `击发完成，已装填 ${AMMO[this.state.chamberType]?.short ?? ''}`,
      load: `装填完成：膛内为 ${AMMO[this.state.chamberType]?.short ?? ''}`,
      fire: '击发完成',
    }[p.kind];
    this.prepare();
    this.app.toast(msg, 'info', 2000);
  }

  moveCam(step) {
    if (!this.autoCam || !step?.cam) return;
    const c = CAM[step.cam];
    const yaw = this.app.tank.turretYaw;
    yaw.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3(...c.pos).applyMatrix4(yaw.matrixWorld);
    const tgt = new THREE.Vector3(...c.target).applyMatrix4(yaw.matrixWorld);
    this.app.flyTo(pos.toArray(), tgt.toArray(), 1.0);
  }

  /** 外壳透明度随当前步骤平滑变化 */
  updateShell(dt) {
    if (!this.seq) return;
    const cam = this.seq.steps[this.seq.indexAt(this.t)]?.cam;
    const target = this.t > 0 || this.playing ? SHELL[cam] ?? 0.07 : 0.07;
    const cur = this.app.xray.ghostOpacity;
    if (Math.abs(target - cur) > 0.002) this.app.xray.setGhostOpacity(cur + (target - cur) * Math.min(1, dt * 4));
  }

  update(dt) {
    if (this.seq && !this.playing) this.updateShell(dt);
    if (!this.seq || !this.playing) return;
    const prev = this.t;
    let next = this.t + dt * this.speed;
    const i0 = this.seq.indexAt(prev);
    // 每步暂停
    if (this.pauseEachStep && prev < this.seq.steps[i0].end && next >= this.seq.steps[i0].end && i0 < this.seq.steps.length - 1) {
      next = this.seq.steps[i0].end - 1e-4;
      this.playing = false;
    }
    this.t = Math.min(next, this.seq.total);
    // 触发一次性特效
    for (const s of this.seq.steps) {
      (s.events || []).forEach((ev, i) => {
        const at = s.start + ev.at * s.dur;
        if (at > prev && at <= this.t && !this.fired.has(s.id + i)) {
          this.fired.add(s.id + i);
          ev.fn();
        }
      });
    }
    this.renderAt(this.t);
    const idx = this.seq.indexAt(this.t);
    if (idx !== this.lastStep) {
      this.lastStep = idx;
      this.moveCam(this.seq.steps[idx]);
    }
    this.updateShell(dt);
    if (this.t >= this.seq.total) {
      this.finish();
      return;
    }
    this.syncUi();
    if (!this.playing) this.updateHudButtons();
  }

  // ———————————————————— 模式进入/退出 ————————————————————
  enter() {
    const app = this.app;
    app.labels.setOpacity(0);
    app.damage.ensureIntact?.();
    app.xray.set('ghost');
    app.xray.setGhostOpacity(0.07);
    this.crewVisible(this.showCrew);
    this.render();
    if (!this.seq || !this.inProgress()) this.prepare();
    this.resetView();
    this.onControlStart = () => {
      if (this.playing && this.autoCam) {
        this.autoCam = false;
        const cb = this.app.panelBody.querySelector('#ldAutoCam');
        if (cb) cb.checked = false;
      }
    };
    app.controls.addEventListener('start', this.onControlStart);
  }

  exit() {
    const app = this.app;
    if (this.inProgress()) {
      this.resetTo(this.plan.start);
    }
    this.playing = false;
    this.seq = null;
    this.plan = null;
    this.crewVisible(true);
    app.xray.setGhostOpacity(0.14);
    app.xray.set('off');
    app.controls.removeEventListener('start', this.onControlStart);
  }

  resetView() {
    const yaw = this.app.tank.turretYaw;
    yaw.updateWorldMatrix(true, false);
    const c = CAM.breech;
    this.app.flyTo(new THREE.Vector3(...c.pos).applyMatrix4(yaw.matrixWorld).toArray(), new THREE.Vector3(...c.target).applyMatrix4(yaw.matrixWorld).toArray());
  }

  onKey(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      this.playing ? this.pause() : this.play();
    } else if (e.code === 'ArrowRight') this.stepBy(1);
    else if (e.code === 'ArrowLeft') this.stepBy(-1);
  }

  refill() {
    if (this.inProgress()) this.resetTo(this.plan.start);
    this.L.resetCassettes(CAROUSEL_LAYOUT.map((type) => ({ type, state: 'full' })));
    this.render();
    this.prepare();
    this.app.toast('转盘已补满 28 发');
  }

  // ———————————————————— 界面 ————————————————————
  render() {
    const app = this.app;
    app.panelBody.innerHTML = `
      <div>
        <div class="eyebrow">AUTOLOADER · 装填与击发</div>
        <h2>从转盘选弹到击发</h2>
      </div>
      <p class="lede">T-80U-E1 用“Korzina”转盘式自动装弹机取代装填手：28 发分装式弹药呈 L 形排在战斗室底部，炮手选定弹种后，装填、闭锁、抛残底全部自动完成。</p>
      <div class="section">
        <div class="section-title">弹种（点击切换）<span class="aside">转盘余量</span></div>
        <div class="ammo-list" id="ldAmmo"></div>
        <div class="ammo-detail" id="ldAmmoDetail"></div>
      </div>
      <div class="section">
        <div class="section-title">转盘俯视图<span class="aside" id="ldLoadSlot"></span></div>
        <div class="carousel-wrap">
          <svg class="carousel-svg" id="ldMap" viewBox="-62 -62 124 124" role="img" aria-label="转盘弹匣分布"></svg>
          <div class="carousel-info" id="ldMapInfo"></div>
        </div>
        <div class="status-line" id="ldStatus"></div>
      </div>
      <div class="section">
        <div class="btn-row" id="ldActions"></div>
        <label class="toggle">自动镜头<input type="checkbox" id="ldAutoCam" ${this.autoCam ? 'checked' : ''} /></label>
        <label class="toggle">显示乘员与其他车内部件<input type="checkbox" id="ldCrew" ${this.showCrew ? 'checked' : ''} /></label>
        <label class="toggle">每步结束后暂停<input type="checkbox" id="ldPause" ${this.pauseEachStep ? 'checked' : ''} /></label>
      </div>
      <div class="section">
        <div class="section-title">流程<span class="aside" id="ldTotal"></span></div>
        <ol class="steps" id="ldSteps"></ol>
      </div>
      <p class="note">时间按真实节奏估算（出膛慢动作除外），可用底部时间轴拖动、逐步查看；空格键播放/暂停，←/→ 切换步骤。</p>
    `;
    const $ = (s) => app.panelBody.querySelector(s);
    $('#ldAutoCam').addEventListener('change', (e) => {
      this.autoCam = e.target.checked;
      if (this.autoCam && this.seq) this.moveCam(this.seq.steps[this.seq.indexAt(this.t)]);
    });
    $('#ldCrew').addEventListener('change', (e) => {
      this.showCrew = e.target.checked;
      this.crewVisible(this.showCrew);
    });
    $('#ldPause').addEventListener('change', (e) => (this.pauseEachStep = e.target.checked));
    this.renderAmmo();
    this.renderMap();
  }

  renderAmmo() {
    const el = this.app.panelBody.querySelector('#ldAmmo');
    if (!el) return;
    el.innerHTML = AMMO_ORDER.map((id) => {
      const a = AMMO[id];
      const n = this.L.countOf(id);
      return `<button type="button" class="ammo-card" data-ammo="${id}" aria-pressed="${this.selected === id}" style="--sw:${a.color}" ${n ? '' : 'disabled'}>
        <span class="sw"></span><span class="nm">${a.short}</span><span class="ct">×${n}</span>
        <span class="ty">${a.type.split(' ')[0]}</span></button>`;
    }).join('');
    for (const b of el.querySelectorAll('[data-ammo]')) b.addEventListener('click', () => this.selectAmmo(b.dataset.ammo));
    const a = AMMO[this.selected];
    const d = this.app.panelBody.querySelector('#ldAmmoDetail');
    d.innerHTML = `<strong>${a.name}</strong> · ${a.type}<br>${a.desc}`;
  }

  selectAmmo(id) {
    if (this.selected === id) return;
    this.selected = id;
    if (this.playing || this.inProgress()) {
      this.app.toast(`下一次装填将改用 ${AMMO[id].name}`);
      this.renderAmmo();
      this.renderMap();
      return;
    }
    this.prepare();
    this.renderAmmo();
    this.renderMap();
    if (this.state.chamberType && this.state.chamberType !== id) this.app.toast(`膛内还有一发 ${AMMO[this.state.chamberType].short}，击发后才会装填 ${AMMO[id].short}`, 'info', 3200);
  }

  renderMap() {
    const svg = this.app.panelBody.querySelector('#ldMap');
    if (!svg) return;
    const slots = [];
    for (let i = 0; i < LOADER.slots; i++) slots.push(`<circle class="slot" data-i="${i}" r="4.6"></circle>`);
    svg.innerHTML = `
      <circle class="ring" r="53"></circle><circle class="ring" r="27" stroke-dasharray="2 3"></circle>
      <text x="0" y="-55.5" text-anchor="middle">前</text>
      <path class="load-mark" d="M0 51 l-5 8 h10 z"></path>
      <circle class="target" id="ldTarget" r="7.5"></circle>
      ${slots.join('')}
      <text x="0" y="3" text-anchor="middle" id="ldMapAngle"></text>`;
    this.mapSlots = [...svg.querySelectorAll('.slot')];
    this.updateMap();
  }

  updateMap() {
    if (!this.mapSlots) return;
    const L = this.L;
    const R = 44;
    const beta = L.angle;
    for (const el of this.mapSlots) {
      const i = Number(el.dataset.i);
      const c = L.cassettes[i];
      const th = i * STEP_ANGLE - beta;
      el.setAttribute('cx', (R * Math.sin(th)).toFixed(2));
      el.setAttribute('cy', (-R * Math.cos(th)).toFixed(2));
      const lifted = L.lifted === i;
      el.setAttribute('class', 'slot' + (c.state === 'full' && !lifted ? '' : c.state === 'stub' ? ' stub' : ' empty'));
      el.style.fill = c.state === 'full' && !lifted ? AMMO[c.type].color : '';
    }
    const tgt = this.app.panelBody.querySelector('#ldTarget');
    const info = this.plan?.loadInfo;
    if (tgt) {
      if (info) {
        const th = info.slot * STEP_ANGLE - beta;
        tgt.setAttribute('cx', (R * Math.sin(th)).toFixed(2));
        tgt.setAttribute('cy', (-R * Math.cos(th)).toFixed(2));
        tgt.style.display = '';
      } else tgt.style.display = 'none';
    }
    const ang = this.app.panelBody.querySelector('#ldMapAngle');
    if (ang) ang.textContent = `${Math.round((((beta / DEG) % 360) + 360) % 360)}°`;
    const ls = this.app.panelBody.querySelector('#ldLoadSlot');
    if (ls) ls.textContent = `装填位：${L.slotAtLoading() + 1} 号`;
  }

  refreshStatus() {
    const body = this.app.panelBody;
    const info = body.querySelector('#ldMapInfo');
    if (!info) return;
    const p = this.plan;
    const a = AMMO[this.selected];
    const li = p?.loadInfo;
    let html = '';
    if (li) {
      const dir = li.delta > 0 ? '逆时针' : '顺时针';
      html = `下一发 <b>${a.short}</b><br>取自 <b>${li.slot + 1}</b> 号弹匣<br>${li.n ? `${dir}转 <b>${li.n}</b> 格 · 约 <b>${li.rotDur.toFixed(1)}</b> s` : '已在装填位，无需转动'}`;
    } else if (!this.L.countOf(this.selected)) {
      html = `转盘里已没有 <b>${a.short}</b><br>请换一种弹或补充弹药`;
    } else html = `膛内已装填<br>击发后装填 <b>${a.short}</b>`;
    info.innerHTML = html;
    const st = body.querySelector('#ldStatus');
    const ch = this.state.chamberType;
    st.innerHTML = `<span class="pill ${ch ? 'accent' : ''}"><i></i>膛内：${ch ? AMMO[ch].short : '空'}</span>
      <span class="pill ${this.state.catcherHasStub ? 'warn' : ''}"><i></i>残底收集器：${this.state.catcherHasStub ? '有残底' : '空'}</span>`;
    // 操作按钮
    const act = body.querySelector('#ldActions');
    const canLoad = !!this.L.countOf(this.selected);
    if (ch) {
      act.innerHTML = `<button type="button" class="btn btn-primary" data-run="fire+load" ${canLoad ? '' : 'disabled'}>击发并装填 ${a.short}</button>
        <button type="button" class="btn" data-run="fire">仅击发</button>
        <button type="button" class="btn btn-quiet" data-run="refill">补充弹药</button>`;
    } else {
      act.innerHTML = `<button type="button" class="btn btn-primary" data-run="load+fire" ${canLoad ? '' : 'disabled'}>装填并击发</button>
        <button type="button" class="btn" data-run="load" ${canLoad ? '' : 'disabled'}>仅装填</button>
        <button type="button" class="btn btn-quiet" data-run="refill">补充弹药</button>`;
    }
    for (const b of act.querySelectorAll('[data-run]'))
      b.addEventListener('click', () => {
        if (b.dataset.run === 'refill') this.refill();
        else this.start(b.dataset.run);
      });
    this.renderAmmo();
  }

  renderSteps() {
    const body = this.app.panelBody;
    const ol = body.querySelector('#ldSteps');
    if (!ol) return;
    if (!this.seq) {
      ol.innerHTML = '<li><div class="st-title">转盘里没有所选弹种，无法装填。</div></li>';
      return;
    }
    let html = '';
    let phase = null;
    this.seq.steps.forEach((s, i) => {
      if (s.phase !== phase) {
        phase = s.phase;
        html += `<li class="phase-head" aria-hidden="true">${phase === 'load' ? '装填' : '击发'}</li>`;
      }
      html += `<li data-step="${i}"><div class="st-title"><span>${s.title}</span><span class="t">${s.dur.toFixed(1)} s</span></div><div class="st-desc">${s.desc}</div><i class="st-bar"></i></li>`;
    });
    ol.innerHTML = html;
    for (const li of ol.querySelectorAll('li[data-step]'))
      li.addEventListener('click', () => {
        const s = this.seq.steps[Number(li.dataset.step)];
        this.pause();
        this.seek(s.start + 1e-4);
        this.moveCam(s);
      });
    const tot = body.querySelector('#ldTotal');
    if (tot) tot.textContent = `共 ${this.seq.total.toFixed(1)} s`;
    this.syncUi(true);
  }

  renderHud() {
    const hud = this.app.hud;
    if (!this.seq) {
      hud.innerHTML = '';
      return;
    }
    hud.innerHTML = `
      <div class="timeline" id="tl">
        <div class="tl-now"><b id="tlTitle"></b><span class="num" id="tlTime"></span></div>
        <div class="tl-controls">
          <button type="button" class="icon-btn" id="tlPrev" title="上一步" aria-label="上一步"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 5v14M18 6l-8 6 8 6z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></button>
          <button type="button" class="icon-btn play" id="tlPlay" title="播放/暂停" aria-label="播放"></button>
          <button type="button" class="icon-btn" id="tlNext" title="下一步" aria-label="下一步"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M17 5v14M6 6l8 6-8 6z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></button>
        </div>
        <div class="tl-track" id="tlTrack">
          ${this.seq.steps.map((s) => `<div class="tl-seg ${s.phase}" style="--w:${s.dur.toFixed(2)}" title="${s.title}"><i class="fill"></i></div>`).join('')}
          <i class="tl-head" id="tlHead"></i>
        </div>
        <div class="tl-speed" role="group" aria-label="播放速度">
          ${[0.25, 0.5, 1].map((v) => `<button type="button" data-speed="${v}" aria-pressed="${this.speed === v}">${v}×</button>`).join('')}
        </div>
      </div>`;
    const $ = (s) => hud.querySelector(s);
    $('#tlPlay').addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    $('#tlPrev').addEventListener('click', () => this.stepBy(-1));
    $('#tlNext').addEventListener('click', () => this.stepBy(1));
    for (const b of hud.querySelectorAll('[data-speed]'))
      b.addEventListener('click', () => {
        this.speed = Number(b.dataset.speed);
        for (const x of hud.querySelectorAll('[data-speed]')) x.setAttribute('aria-pressed', String(x === b));
      });
    const track = $('#tlTrack');
    const seekFromEvent = (e) => {
      const r = track.getBoundingClientRect();
      const x = THREE.MathUtils.clamp((e.clientX - r.left) / r.width, 0, 1);
      // 由于各段之间有 2px 间隙，这里按时长比例近似换算
      this.seek(x * this.seq.total - 1e-4);
    };
    track.addEventListener('pointerdown', (e) => {
      this.pause();
      seekFromEvent(e);
      track.setPointerCapture(e.pointerId);
      const mv = (ev) => seekFromEvent(ev);
      const up = () => {
        track.removeEventListener('pointermove', mv);
        track.removeEventListener('pointerup', up);
        if (this.seq) this.moveCam(this.seq.steps[this.seq.indexAt(this.t)]);
      };
      track.addEventListener('pointermove', mv);
      track.addEventListener('pointerup', up);
    });
    this.segEls = [...hud.querySelectorAll('.tl-seg .fill')];
    this.updateHudButtons();
    this.syncUi(true);
  }

  updateHudButtons() {
    const b = this.app.hud.querySelector('#tlPlay');
    if (!b) return;
    b.innerHTML = this.playing
      ? '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>';
    b.setAttribute('aria-label', this.playing ? '暂停' : '播放');
  }

  syncUi(force = false) {
    if (!this.seq) return;
    const idx = this.seq.indexAt(this.t);
    const s = this.seq.steps[idx];
    const k = THREE.MathUtils.clamp((this.t - s.start) / s.dur, 0, 1);
    const body = this.app.panelBody;
    const hud = this.app.hud;
    // 时间轴
    const title = hud.querySelector('#tlTitle');
    if (title) {
      title.textContent = this.t <= 0 && !this.playing ? `准备：${this.plan.kind === 'fire+load' ? '击发并装填' : this.plan.kind === 'load+fire' ? '装填并击发' : this.plan.kind === 'load' ? '装填' : '击发'}` : `${idx + 1}. ${s.title}`;
      hud.querySelector('#tlTime').textContent = `${this.t.toFixed(1)} / ${this.seq.total.toFixed(1)} s`;
      const head = hud.querySelector('#tlHead');
      const track = hud.querySelector('#tlTrack');
      head.style.left = `${(this.t / this.seq.total) * (track.clientWidth - 2)}px`;
      this.seq.steps.forEach((st, i) => {
        const f = this.t >= st.end ? 1 : this.t <= st.start ? 0 : (this.t - st.start) / st.dur;
        if (this.segEls?.[i]) this.segEls[i].style.transform = `scaleX(${f.toFixed(3)})`;
      });
    }
    // 步骤列表
    const lis = body.querySelectorAll('#ldSteps li[data-step]');
    if (lis.length) {
      lis.forEach((li, i) => {
        const cur = i === idx && (this.t > 0 || this.playing);
        li.classList.toggle('is-current', cur);
        li.classList.toggle('is-done', i < idx || this.t >= this.seq.total);
        if (cur) li.querySelector('.st-bar').style.transform = `scaleX(${k.toFixed(3)})`;
      });
      if (force || idx !== this._lastListIdx) {
        this._lastListIdx = idx;
        const cur = lis[idx];
        if (cur && (this.t > 0 || this.playing)) {
          const box = body.getBoundingClientRect(), r = cur.getBoundingClientRect();
          if (r.top < box.top + 40 || r.bottom > box.bottom - 20) body.scrollTo({ top: body.scrollTop + r.top - box.top - box.height * 0.35, behavior: 'smooth' });
        }
      }
    }
    this.updateMap();
  }
}
