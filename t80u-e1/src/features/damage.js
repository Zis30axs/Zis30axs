// 模块损伤模型：耐久、状态、起火、弹药殉爆（炮塔抛飞），以及整车状态评估。
import * as THREE from 'three';
import { spallCone, kindKey } from './ballistics.js';
import { MODULE_CATS } from '../data/modules.js';

const rand = Math.random;

export class DamageModel {
  constructor(app) {
    this.app = app;
    this.tank = app.tank;
    this.reg = app.tank.reg;
    this.listeners = new Set();
    this.detonatedEra = new Set();
    this.fires = new Map(); // moduleId → {emitter, t}
    this.hiddenRounds = [];
    this.destroyed = false;
    this.toss = null;
    this.log = [];
    this.box = new THREE.Box3();
    for (const m of this.reg.modules.values()) {
      m.hp = m.maxHp;
      m.state = 'ok';
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    this.app.xray.applyModuleColors(this.states());
    for (const fn of this.listeners) fn();
  }

  get(id) {
    return this.reg.modules.get(id);
  }

  states() {
    const o = {};
    for (const [id, m] of this.reg.modules) o[id] = m.state;
    return o;
  }

  isEraDetonated(mesh) {
    return this.detonatedEra.has(mesh);
  }

  stateOf(m) {
    if (m.hp <= 0) return m.kind === 'crew' ? 'dead' : 'destroyed';
    if (m.hp >= m.maxHp - 0.01) return 'ok';
    if (m.kind === 'crew') return m.hp > 60 ? 'damaged' : 'critical';
    return m.hp > m.maxHp * 0.45 ? 'damaged' : 'critical';
  }

  /** 对模块造成伤害，返回 {before, after} 状态 */
  hurt(id, dmg) {
    const m = this.get(id);
    if (!m || dmg <= 0) return null;
    const before = m.state;
    m.hp = Math.max(0, m.hp - dmg);
    m.state = this.stateOf(m);
    return { id, before, after: m.state, dmg };
  }

  // ———————————————— 射击结算 ————————————————
  /**
   * 结算一次射击：反应装甲起爆、主弹体/射流命中、破片、冲击波、起火与殉爆。
   * 返回用于界面展示的摘要。
   */
  applyShot(res) {
    const app = this.app;
    const ammo = res.ammo;
    const kind = kindKey(ammo);
    const summary = { events: new Map(), frags: [], detonation: false, fires: [], eraDetonated: 0, blast: null };
    const add = (r, source) => {
      if (!r) return;
      const cur = summary.events.get(r.id);
      if (cur) {
        cur.dmg += r.dmg;
        cur.after = r.after;
      } else summary.events.set(r.id, { ...r, source });
    };
    const ctx = { reg: this.reg, rng: rand };

    // 反应装甲起爆
    for (const mesh of res.eraHits) {
      if (this.detonatedEra.has(mesh)) continue;
      this.detonatedEra.add(mesh);
      mesh.visible = false;
      summary.eraDetonated++;
      const p = new THREE.Vector3();
      mesh.getWorldPosition(p);
      app.effects.explosion(p, 0.35);
    }

    const mainDmg = ammo.kind === 'ke' ? 165 : 135;
    // 主弹体 / 射流直接命中
    for (const h of res.moduleHits) {
      const def = this.get(h.id);
      if (!def) continue;
      add(this.hurt(h.id, mainDmg), 'main');
      this.checkSpecial(def, h, 1.25, summary);
    }

    // 击穿后的破片
    if (res.spallOrigin && (res.outcome === 'penetrated' || res.outcome === 'overpen' || res.outcome === 'he_pen')) {
      let opts;
      if (ammo.kind === 'ke') opts = { count: Math.round(THREE.MathUtils.clamp(10 + res.penAtBoundary / 14, 10, 40)), cone: 22, energy: 72 };
      else if (ammo.kind === 'he') opts = { count: 30, cone: 75, energy: 50 };
      else opts = { count: Math.round(THREE.MathUtils.clamp(6 + res.penAtBoundary / 25, 6, 22)), cone: 12, energy: 58 };
      const frags = spallCone(ctx, res.spallOrigin, res.dir, opts);
      summary.frags = frags;
      for (const f of frags) {
        for (const h of f.hits) {
          const def = this.get(h.id);
          if (!def) continue;
          add(this.hurt(h.id, h.energy), 'spall');
          this.checkSpecial(def, h, 0.7 * (h.energy / opts.energy), summary);
        }
      }
      // 高爆弹击穿：车内超压
      if (ammo.kind === 'he') this.overpressure(res.spallOrigin, 3.2, 170, summary, add, (d) => d.kind === 'crew');
    }

    // 高爆弹外部爆炸：冲击波与破片损伤外部模块
    if (res.outcome === 'he_blast' && res.stop) {
      summary.blast = { point: res.stop.point.clone(), r: ammo.blastR || 2.2 };
      this.overpressure(res.stop.point, ammo.blastR || 2.2, 140, summary, add, (d) => d.external);
    }

    if (summary.detonation) this.detonate(summary);
    summary.list = [...summary.events.values()].map((e) => ({ ...e, name: this.get(e.id).name, kind: this.get(e.id).kind }));
    summary.status = this.vehicleStatus();
    this.log.unshift({ ammo: ammo.short, outcome: res.outcome, t: new Date(), status: summary.status.title });
    if (this.log.length > 30) this.log.pop();
    this.emit();
    return summary;
  }

  overpressure(point, radius, peak, summary, add, filter) {
    for (const [id, def] of this.reg.modules) {
      if (!filter(def)) continue;
      let dmin = Infinity;
      for (const root of def.roots) {
        if (!root.visible) continue;
        this.box.setFromObject(root);
        if (this.box.isEmpty()) continue;
        dmin = Math.min(dmin, this.box.distanceToPoint(point));
      }
      if (dmin < radius) {
        const k = 1 - dmin / radius;
        add(this.hurt(id, peak * Math.pow(k, 1.3)), 'blast');
        if (def.kind === 'fuel' || def.fire) this.maybeFire(def, (def.fire || 0.2) * k, summary);
      }
    }
  }

  /** 弹药殉爆与起火判定 */
  checkSpecial(def, h, mult, summary) {
    if (def.kind === 'ammo') {
      // 只有命中实际存在的弹丸/药筒才可能殉爆
      const part = h.object?.userData?.ammoPart;
      if (!part) return;
      if (h.cassette !== null && h.cassette !== undefined) {
        const c = this.tank.loader.cassettes[h.cassette];
        if (!c || c.state !== 'full') return;
      }
      const p = Math.min(0.92, (def.detonate || 0.5) * mult * (part === 'charge' ? 1.15 : 0.85));
      if (rand() < p) summary.detonation = true;
      else if (rand() < 0.35) this.maybeFire(def, 1, summary);
    } else if (def.kind === 'fuel' || def.fire) {
      this.maybeFire(def, (def.fire || 0.2) * mult, summary);
    }
  }

  maybeFire(def, p, summary) {
    if (this.fires.has(def.id) || rand() >= p) return;
    const pos = this.moduleCenter(def);
    pos.y = Math.max(pos.y, 1.46);
    const emitter = this.app.effects.fire(pos, { rate: 26, scale: 0.9 });
    this.fires.set(def.id, { emitter, t: 0 });
    summary?.fires.push(def.id);
  }

  moduleCenter(def) {
    const b = new THREE.Box3();
    for (const r of def.roots) b.union(this.box.setFromObject(r));
    return b.isEmpty() ? new THREE.Vector3(0, 1.5, 0) : b.getCenter(new THREE.Vector3());
  }

  /** 弹药殉爆：炮塔被抛飞，乘员全部阵亡 */
  detonate(summary) {
    if (this.destroyed) return;
    this.destroyed = true;
    const tank = this.tank;
    for (const [id, m] of this.reg.modules) {
      if (m.kind === 'crew' || ['carousel', 'autoloader', 'breech', 'fcs', 'traverse', 'elevation', 'radio'].includes(id)) {
        const r = this.hurt(id, 9999);
        if (r) summary.events.set(id, { ...r, source: 'detonation' });
      }
    }
    // 隐藏转盘中的弹药（已被引燃）
    for (const c of tank.loader.cassettes) {
      for (const o of [c.proj, c.charge]) {
        if (o && o.visible) {
          o.visible = false;
          this.hiddenRounds.push(o);
        }
      }
    }
    const ring = new THREE.Vector3();
    tank.turretYaw.getWorldPosition(ring);
    this.app.effects.explosion(ring.clone().add(new THREE.Vector3(0, 0.6, 0)), 2.2);
    this.app.effects.explosion(ring.clone().add(new THREE.Vector3(-0.4, 1.4, 0.3)), 1.2);
    const side = rand() < 0.5 ? -1 : 1;
    this.toss = {
      v: new THREE.Vector3((rand() - 0.5) * 3, 10.5 + rand() * 3, side * (2.6 + rand() * 1.5)),
      w: new THREE.Vector3((rand() - 0.5) * 4, (rand() - 0.5) * 3, (rand() - 0.5) * 4),
    };
    const fire = this.app.effects.fire(ring.clone().add(new THREE.Vector3(0, 0.1, 0)), { rate: 60, scale: 1.6 });
    this.fires.set('__cookoff', { emitter: fire, t: 0, permanent: true });
    summary.detonation = true;
  }

  vehicleStatus() {
    const s = (id) => this.get(id).state;
    const dead = ['driver', 'gunner', 'commander'].filter((id) => s(id) === 'dead');
    const tags = [];
    if (this.destroyed) return { level: 'bad', title: '殉爆 · 车辆被摧毁', tags: ['弹药殉爆', '乘员全部阵亡'] };
    if (dead.length >= 2) return { level: 'bad', title: '乘员伤亡过半 · 失去战斗力', tags: dead.map((id) => this.get(id).name + '阵亡') };
    const mobility = ['engine', 'transmission', 'track_l', 'track_r'].some((id) => s(id) === 'destroyed') || s('driver') === 'dead';
    const fire = ['barrel', 'breech', 'autoloader'].some((id) => s(id) === 'destroyed') || (s('gunner') === 'dead' && s('commander') === 'dead');
    if (mobility) tags.push('丧失机动');
    if (fire) tags.push('丧失火力');
    if (this.fires.size) tags.push('起火');
    for (const id of dead) tags.push(this.get(id).name + '阵亡');
    const any = [...this.reg.modules.values()].some((m) => m.state !== 'ok');
    if (mobility && fire) return { level: 'bad', title: '丧失机动与火力', tags };
    if (mobility || fire) return { level: 'warn', title: mobility ? '丧失机动能力' : '丧失火力', tags };
    if (this.fires.size) return { level: 'warn', title: '车内起火', tags };
    return { level: any ? 'warn' : 'ok', title: any ? '受损 · 仍可作战' : '完好', tags };
  }

  /** 修复模块并清除火灾；full 时同时恢复反应装甲与炮塔 */
  reset(full = true) {
    for (const m of this.reg.modules.values()) {
      m.hp = m.maxHp;
      m.state = 'ok';
    }
    for (const f of this.fires.values()) this.app.effects.stop(f.emitter);
    this.fires.clear();
    for (const o of this.hiddenRounds) o.visible = true;
    this.hiddenRounds = [];
    if (full) {
      for (const mesh of this.detonatedEra) mesh.visible = true;
      this.detonatedEra.clear();
    }
    const t = this.tank.turret;
    t.position.set(0, 0, 0);
    t.rotation.set(0, 0, 0);
    this.toss = null;
    this.destroyed = false;
    this.emit();
  }

  ensureIntact() {
    if (this.destroyed || this.toss) this.reset(true);
  }

  update(dt) {
    if (this.toss) {
      const t = this.tank.turret;
      const { v, w } = this.toss;
      t.position.addScaledVector(v, dt);
      v.y -= 9.8 * dt;
      t.rotation.x += w.x * dt;
      t.rotation.y += w.y * dt;
      t.rotation.z += w.z * dt;
      if (v.y < 0 && t.position.y < -0.95) {
        t.position.y = -0.95;
        this.toss = null;
      }
    }
    if (this.fires.size) {
      this._emitT = (this._emitT || 0) + dt;
      if (this._emitT > 1) {
        this._emitT = 0;
        this.emit();
      }
    }
    for (const [id, f] of this.fires) {
      if (f.permanent) continue;
      f.t += dt;
      if (f.t > 1.5) this.hurt(id, dt * 2.5);
      if (f.t > 14) {
        this.app.effects.stop(f.emitter);
        this.fires.delete(id);
        this.app.toast?.('自动灭火系统已扑灭火灾', 'info', 2200);
        this.emit();
      }
    }
  }

  categories() {
    return MODULE_CATS.map(([cat, name]) => ({ cat, name, mods: [...this.reg.modules.values()].filter((m) => m.cat === cat) }));
  }
}
