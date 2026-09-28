// 射击器：从相机方向发射，调用弹道计算并结算损伤，同时绘制弹着点、弹道、破片等可视化元素。
import * as THREE from 'three';
import { AMMO, penAt } from '../data/ammo.js';
import { ZONES } from '../data/armor.js';
import { traceShot } from './ballistics.js';

export const OUTCOME = {
  penetrated: { text: '击穿', cls: 'pen' },
  overpen: { text: '贯穿车体', cls: 'pen' },
  he_pen: { text: '高爆击穿', cls: 'pen' },
  stopped: { text: '未击穿', cls: 'nopen' },
  ricochet: { text: '跳弹', cls: 'rico' },
  he_blast: { text: '外部爆炸', cls: 'he' },
  nohull: { text: '只穿过外挂件', cls: 'nopen' },
  module: { text: '命中外部模块', cls: 'he' },
  miss: { text: '未命中', cls: '' },
};

export const STATE_TEXT = {
  ok: '正常',
  damaged: '受损',
  critical: '重创',
  destroyed: '损毁',
  dead: '阵亡',
};
export const crewStateText = (st) => ({ ok: '正常', damaged: '轻伤', critical: '重伤', dead: '阵亡' })[st] || STATE_TEXT[st];

/** 分区的中文名（左右侧由命中点判断） */
export function zoneLabel(zoneId, point, tank) {
  const z = ZONES[zoneId];
  if (!z) return '—';
  let name = z.name;
  if (point && /side|cheek|skirt|track|wheel/.test(zoneId)) {
    const local = tank.root.worldToLocal(point.clone());
    name = (local.z < 0 ? '左' : '右') + '·' + name;
  }
  return name;
}

export class Shooter {
  constructor(app) {
    this.app = app;
    this.settings = { ammo: '3BM46', distance: 1000 };
    this.group = new THREE.Group();
    this.group.name = 'shots';
    app.scene.add(this.group);
    this.shots = [];
    this.raycaster = new THREE.Raycaster();
    this.lineMats = {};
  }

  get ammo() {
    return AMMO[this.settings.ammo];
  }

  pen() {
    return penAt(this.ammo, this.settings.distance);
  }

  ray(ndc) {
    this.raycaster.setFromCamera(ndc, this.app.camera);
    return { origin: this.raycaster.ray.origin.clone(), dir: this.raycaster.ray.direction.clone() };
  }

  ctx(dryRun) {
    const d = this.app.damage;
    return { reg: this.app.tank.reg, ammo: this.ammo, distance: this.settings.distance, dryRun, isEraDetonated: (m) => d.isEraDetonated(m) };
  }

  preview(ndc) {
    const { origin, dir } = this.ray(ndc);
    return traceShot(this.ctx(true), origin, dir);
  }

  fire(ndc) {
    const { origin, dir } = this.ray(ndc);
    const res = traceShot(this.ctx(false), origin, dir);
    if (res.outcome === 'miss') return { res, summary: null };
    const summary = this.app.damage.applyShot(res);
    this.visualize(res, summary);
    return { res, summary };
  }

  color(cls) {
    const c = this.app.themeColors;
    return { pen: c.bad, nopen: c.ok, rico: c.rico, he: c.warn }[cls] || c.accent;
  }

  lineMat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!this.lineMats[key]) {
      this.lineMats[key] = opts.dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: opts.opacity ?? 0.9, depthTest: opts.depthTest ?? true })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts.opacity ?? 0.95, depthTest: opts.depthTest ?? true });
    }
    return this.lineMats[key];
  }

  visualize(res, summary) {
    const app = this.app;
    const out = OUTCOME[res.outcome] || OUTCOME.miss;
    const col = this.color(out.cls);
    const shot = new THREE.Group();
    this.group.add(shot);
    const e = res.entry;
    // 来袭弹道（虚线）
    const inc = new THREE.BufferGeometry().setFromPoints([e.point.clone().addScaledVector(res.dir, -5), e.point]);
    const incLine = new THREE.Line(inc, this.lineMat(this.ammo.color, { dashed: true, opacity: 0.85 }));
    incLine.computeLineDistances();
    shot.add(incLine);
    // 弹着点标记（贴在被击中的物体上，随炮塔转动）
    const marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.07, 24), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide }));
    marker.add(ring, dot);
    ring.renderOrder = 20;
    marker.position.copy(e.point).addScaledVector(e.normal, 0.006);
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), e.normal);
    shot.add(marker);
    if (e.object && !e.object.isInstancedMesh) e.object.attach(marker);
    shot.userData.marker = marker;

    // 车内路径 / 跳弹方向
    if (res.outcome === 'ricochet') {
      const refl = res.dir.clone().reflect(e.normal).normalize();
      const g = new THREE.BufferGeometry().setFromPoints([e.point, e.point.clone().addScaledVector(refl, 5)]);
      shot.add(new THREE.Line(g, this.lineMat(col)));
      app.effects.sparks(e.point, refl, 30, 0xffe0a0);
    } else {
      const end = res.exitPoint || res.stop?.point || e.point.clone().addScaledVector(res.dir, 0.3);
      const g = new THREE.BufferGeometry().setFromPoints([e.point, end]);
      shot.add(new THREE.Line(g, this.lineMat(col, { depthTest: false })));
    }
    // 破片
    if (summary?.frags?.length) {
      const pts = [];
      for (const f of summary.frags) pts.push(f.from, f.to);
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const spall = new THREE.LineSegments(g, this.lineMat(app.themeColors.warn, { opacity: 0.8, depthTest: false }));
      spall.renderOrder = 15;
      shot.add(spall);
      const hitPts = summary.frags.flatMap((f) => f.hits.map((h) => h.point));
      if (hitPts.length) {
        const pg = new THREE.BufferGeometry().setFromPoints(hitPts);
        const pm = new THREE.Points(pg, new THREE.PointsMaterial({ color: app.themeColors.bad, size: 6, sizeAttenuation: false, depthTest: false }));
        pm.renderOrder = 16;
        shot.add(pm);
      }
      app.effects.sparks(res.spallOrigin, res.dir, 40, 0xffd080);
    }
    // 高爆冲击波范围
    if (summary?.blast) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(summary.blast.r, 24, 16), new THREE.MeshBasicMaterial({ color: app.themeColors.warn, transparent: true, opacity: 0.12, depthWrite: false }));
      s.position.copy(summary.blast.point);
      shot.add(s);
      app.effects.explosion(summary.blast.point, 0.6);
    }
    // 命中特效与曳光
    const far = e.point.clone().addScaledVector(res.dir, -30);
    app.effects.spawn({ pos: far, vel: res.dir.clone().multiplyScalar(250), life: 0.12, size: [0.25, 0.2], additive: true, color: 0xffe2a0, alpha: [1, 1] });
    if (res.outcome !== 'he_blast') app.effects.impact(e.point, e.normal, { big: out.cls === 'pen' });
    this.shots.push(shot);
    while (this.shots.length > 8) this.removeShot(this.shots.shift());
  }

  removeShot(shot) {
    const m = shot.userData.marker;
    if (m?.parent) m.parent.remove(m);
    shot.parent?.remove(shot);
  }

  clear() {
    for (const s of this.shots) this.removeShot(s);
    this.shots = [];
  }
}
