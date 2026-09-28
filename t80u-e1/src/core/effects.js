// 粒子特效：炮口焰、烟、火花、爆炸、火焰；以及闪光点光源。基于精灵池实现。
import * as THREE from 'three';

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 24; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 18 + Math.random() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'effects';
    scene.add(this.group);
    this.tex = {
      glow: radialTexture([
        [0, 'rgba(255,255,255,1)'],
        [0.25, 'rgba(255,240,200,0.9)'],
        [0.6, 'rgba(255,170,60,0.35)'],
        [1, 'rgba(255,120,20,0)'],
      ]),
      spark: radialTexture([
        [0, 'rgba(255,255,255,1)'],
        [0.3, 'rgba(255,220,150,0.8)'],
        [1, 'rgba(255,150,50,0)'],
      ]),
      smoke: smokeTexture(),
    };
    this.pool = [];
    this.active = [];
    this.lights = [];
    this.emitters = [];
    for (let i = 0; i < 3; i++) {
      // 点光源始终保持可见（强度为 0），避免开关光源导致着色器重新编译
      const l = new THREE.PointLight(0xffb060, 0, 12, 2);
      this.group.add(l);
      this.lights.push({ light: l, t: 1, dur: 1, peak: 0 });
    }
  }

  _sprite() {
    let s = this.pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.renderOrder = 10;
    }
    this.group.add(s);
    return s;
  }

  /**
   * 生成一个粒子。
   * @param {object} o {pos, vel, life, size:[s0,s1], color, alpha:[a0,a1], additive, drag, gravity, tex}
   */
  spawn(o) {
    const s = this._sprite();
    const m = s.material;
    m.map = this.tex[o.tex || 'glow'];
    m.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.color.set(o.color ?? 0xffffff);
    m.opacity = o.alpha?.[0] ?? 1;
    m.rotation = Math.random() * Math.PI * 2;
    m.needsUpdate = true;
    s.position.copy(o.pos);
    s.scale.setScalar(o.size?.[0] ?? 0.3);
    this.active.push({
      s,
      vel: o.vel ? o.vel.clone() : new THREE.Vector3(),
      life: o.life ?? 1,
      age: 0,
      size: o.size ?? [0.3, 0.6],
      alpha: o.alpha ?? [1, 0],
      drag: o.drag ?? 0,
      gravity: o.gravity ?? 0,
      spin: (Math.random() - 0.5) * (o.spin ?? 0.6),
    });
  }

  flash(pos, { color = 0xffb060, intensity = 60, dur = 0.15, range = 14 } = {}) {
    const slot = this.lights.reduce((a, b) => (a.light.intensity <= b.light.intensity ? a : b));
    slot.light.position.copy(pos);
    slot.light.color.set(color);
    slot.light.distance = range;
    slot.t = 0;
    slot.dur = dur;
    slot.peak = intensity;
    slot.light.intensity = intensity;
  }

  muzzleBlast(pos, dir) {
    this.flash(pos, { intensity: 120, dur: 0.18, range: 18 });
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    for (let i = 0; i < 14; i++) {
      const v = dir.clone().multiplyScalar(6 + Math.random() * 14);
      v.addScaledVector(side, (Math.random() - 0.5) * 6).y += (Math.random() - 0.5) * 4;
      this.spawn({ pos, vel: v, life: 0.16 + Math.random() * 0.12, size: [0.5, 1.6 + Math.random()], additive: true, color: 0xffd48a, alpha: [1, 0], drag: 5 });
    }
    // 炮口制退形成的侧向焰
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        this.spawn({ pos, vel: side.clone().multiplyScalar(s * (4 + Math.random() * 4)).addScaledVector(dir, 2), life: 0.14, size: [0.4, 1.1], additive: true, color: 0xffb35a, alpha: [0.9, 0], drag: 6 });
      }
    }
    for (let i = 0; i < 18; i++) {
      const v = dir.clone().multiplyScalar(2 + Math.random() * 5).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2));
      this.spawn({ pos: pos.clone().addScaledVector(dir, Math.random() * 1.5), vel: v, life: 2.5 + Math.random() * 2, size: [0.6, 3.2 + Math.random() * 2], tex: 'smoke', color: 0xb8b2a6, alpha: [0.55, 0], drag: 1.6, gravity: -0.25 });
    }
  }

  sparks(pos, normal, n = 20, color = 0xffc070) {
    for (let i = 0; i < n; i++) {
      const v = normal.clone().multiplyScalar(2 + Math.random() * 5).add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6));
      this.spawn({ pos, vel: v, life: 0.35 + Math.random() * 0.4, size: [0.08, 0.02], tex: 'spark', additive: true, color, alpha: [1, 0], gravity: 9, drag: 0.5 });
    }
  }

  impact(pos, normal, { big = false, color = 0xffc070 } = {}) {
    this.flash(pos, { intensity: big ? 90 : 40, dur: big ? 0.25 : 0.12, range: big ? 14 : 8 });
    this.spawn({ pos, life: big ? 0.25 : 0.12, size: [big ? 1.2 : 0.4, big ? 2.6 : 0.9], additive: true, color: 0xffe0a0, alpha: [1, 0] });
    this.sparks(pos, normal, big ? 36 : 18, color);
    for (let i = 0; i < (big ? 10 : 4); i++) {
      this.spawn({
        pos: pos.clone().addScaledVector(normal, 0.1),
        vel: normal.clone().multiplyScalar(0.8 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.8, (Math.random() - 0.5) * 0.8)),
        life: 1.5 + Math.random() * 1.5,
        size: [0.3, big ? 2.4 : 1.2],
        tex: 'smoke',
        color: 0x6f6a62,
        alpha: [0.6, 0],
        drag: 1.2,
        gravity: -0.4,
      });
    }
  }

  explosion(pos, scale = 1) {
    this.flash(pos, { intensity: 400 * scale, dur: 0.6, range: 30, color: 0xffa040 });
    for (let i = 0; i < 40 * scale; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize();
      this.spawn({ pos, vel: dir.multiplyScalar(4 + Math.random() * 10 * scale), life: 0.5 + Math.random() * 0.6, size: [0.8, 3 + Math.random() * 3 * scale], additive: true, color: i % 3 ? 0xff9a3a : 0xffe0a0, alpha: [1, 0], drag: 2.5, gravity: -1 });
    }
    for (let i = 0; i < 30 * scale; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.3, Math.random() - 0.5).normalize();
      this.spawn({ pos, vel: dir.multiplyScalar(2 + Math.random() * 5), life: 3 + Math.random() * 3, size: [1.2, 6 + Math.random() * 4], tex: 'smoke', color: 0x3b3833, alpha: [0.75, 0], drag: 1.1, gravity: -1.2 });
    }
    this.sparks(pos, new THREE.Vector3(0, 1, 0), 60 * scale, 0xffb050);
  }

  /** 持续火焰/烟雾发射器，返回句柄以便停止 */
  fire(pos, { rate = 30, scale = 1, smoke = true } = {}) {
    const e = { pos: pos.clone(), rate, scale, smoke, acc: 0, alive: true };
    this.emitters.push(e);
    return e;
  }
  stop(e) {
    if (e) e.alive = false;
  }
  stopAll() {
    for (const e of this.emitters) e.alive = false;
  }

  update(dt) {
    for (const e of this.emitters) {
      if (!e.alive) continue;
      e.acc += dt * e.rate;
      while (e.acc > 1) {
        e.acc -= 1;
        const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.6 * e.scale, 0, (Math.random() - 0.5) * 0.6 * e.scale);
        this.spawn({ pos: e.pos.clone().add(jitter), vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 1.5, (Math.random() - 0.5) * 0.4), life: 0.6 + Math.random() * 0.5, size: [0.5 * e.scale, 1.4 * e.scale], additive: true, color: Math.random() < 0.5 ? 0xff8a2a : 0xffc060, alpha: [0.9, 0], drag: 0.8 });
        if (e.smoke && Math.random() < 0.5) {
          this.spawn({ pos: e.pos.clone().add(jitter).add(new THREE.Vector3(0, 0.8, 0)), vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.4 + Math.random(), (Math.random() - 0.5) * 0.5), life: 3 + Math.random() * 2, size: [0.8 * e.scale, 4 * e.scale], tex: 'smoke', color: 0x2e2c29, alpha: [0.55, 0], drag: 0.3 });
        }
      }
    }
    this.emitters = this.emitters.filter((e) => e.alive);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        this.group.remove(p.s);
        this.pool.push(p.s);
        this.active.splice(i, 1);
        continue;
      }
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.vel.y -= p.gravity * dt;
      p.s.position.addScaledVector(p.vel, dt);
      p.s.scale.setScalar(p.size[0] + (p.size[1] - p.size[0]) * k);
      p.s.material.opacity = p.alpha[0] + (p.alpha[1] - p.alpha[0]) * k;
      p.s.material.rotation += p.spin * dt;
    }
    for (const l of this.lights) {
      if (l.light.intensity === 0) continue;
      l.t += dt;
      const k = l.t / l.dur;
      l.light.intensity = k >= 1 ? 0 : l.peak * (1 - k) * (1 - k);
    }
  }

  clear() {
    for (const p of this.active) {
      this.group.remove(p.s);
      this.pool.push(p.s);
    }
    this.active = [];
    this.stopAll();
  }
}
