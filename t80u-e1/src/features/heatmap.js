// 防护热图：按“从当前视角射击时能否击穿”给装甲表面着色（类似游戏中的防护分析视图）。
// 每个装甲分区一个着色器材质：法向等效厚度 / cos(视线入射角) 与所选弹种的穿深比较。
import * as THREE from 'three';
import { ZONES, zoneNormalEq } from '../data/armor.js';
import { penAt } from '../data/ammo.js';
import { kindKey, JET_AIR_LOSS } from './ballistics.js';

const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 nn = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    nn = mat3(instanceMatrix) * nn;
  #endif
  vec4 w = modelMatrix * p;
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * nn);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uCam;
uniform float uEq;      // 法向等效厚度 (mm)
uniform float uEraMax;  // 反应装甲最大削弱比例
uniform float uEraDep;  // 1 = 削弱效果随倾角变化（对穿甲弹）
uniform float uGap;     // 与主装甲的间隙 (m)
uniform float uPen;     // 穿深 (mm)
uniform float uJet;     // 1 = 破甲射流（受间隙衰减）
uniform float uRicoA;
uniform float uRicoB;
uniform vec3 uColPen;
uniform vec3 uColMaybe;
uniform vec3 uColNo;
uniform vec3 uColRico;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uCam - vW);
  if (!gl_FrontFacing) n = -n;
  float c = clamp(dot(n, v), 0.0, 1.0);
  float ang = degrees(acos(c));
  float eq = uEq / max(c, 0.06);
  float era = uEraMax * mix(1.0, smoothstep(8.0, 35.0, ang), uEraDep);
  float pen = uPen * (1.0 - era) * max(0.0, 1.0 - uJet * ${JET_AIR_LOSS.toFixed(2)} * uGap);
  float r = eq / max(pen, 1.0);
  vec3 col = mix(uColPen, uColMaybe, smoothstep(0.82, 0.97, r));
  col = mix(col, uColNo, smoothstep(1.0, 1.12, r));
  // 可能跳弹：斜条纹
  float rico = smoothstep(uRicoA, uRicoB, ang);
  float stripe = step(0.5, fract((vW.x + vW.y * 0.7 + vW.z) * 7.0));
  col = mix(col, uColRico, rico * mix(0.35, 0.9, stripe));
  float lit = 0.62 + 0.38 * max(dot(n, normalize(vec3(0.35, 0.85, 0.4))), 0.0);
  col *= lit * mix(0.72, 1.0, smoothstep(0.0, 0.35, c));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Heatmap {
  constructor(app) {
    this.app = app;
    this.on = false;
    this.zoneMats = new Map();
    this.saved = new Map();
    this.global = {
      uCam: { value: app.camera.position },
      uPen: { value: 500 },
      uJet: { value: 0 },
      uRicoA: { value: 76 },
      uRicoB: { value: 84 },
      uColPen: { value: new THREE.Color() },
      uColMaybe: { value: new THREE.Color() },
      uColNo: { value: new THREE.Color() },
      uColRico: { value: new THREE.Color() },
    };
    this.neutral = new THREE.MeshStandardMaterial({ color: 0x5d625c, roughness: 0.85, metalness: 0.05 });
    this.onTheme();
  }

  onTheme() {
    const c = this.app.themeColors || { bad: '#e5534b', warn: '#e3b341', ok: '#4cb176', rico: '#6c8fc7' };
    this.global.uColPen.value.set(c.bad);
    this.global.uColMaybe.value.set(c.warn);
    this.global.uColNo.value.set(c.ok);
    this.global.uColRico.value.set(c.rico);
  }

  mat(zoneId) {
    if (!this.zoneMats.has(zoneId)) {
      const m = new THREE.ShaderMaterial({
        uniforms: { ...this.global, uEq: { value: 100 }, uEraMax: { value: 0 }, uEraDep: { value: 0 }, uGap: { value: 0 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
      });
      m.userData.zone = zoneId;
      this.zoneMats.set(zoneId, m);
    }
    return this.zoneMats.get(zoneId);
  }

  setAmmo(ammo, distance) {
    const kind = kindKey(ammo);
    this.global.uPen.value = penAt(ammo, distance);
    this.global.uJet.value = ammo.kind === 'heat' || ammo.kind === 'tandem' ? 1 : 0;
    this.global.uRicoA.value = ammo.rico[0];
    this.global.uRicoB.value = ammo.rico[1];
    for (const [zoneId, m] of this.zoneMats) this.configure(m, zoneId, ammo, kind);
    this.ammo = ammo;
  }

  configure(m, zoneId, ammo, kind) {
    const z = ZONES[zoneId];
    let eq = zoneNormalEq(zoneId, kind);
    if (z.backing) eq += zoneNormalEq(z.backing, kind);
    m.uniforms.uEq.value = eq;
    m.uniforms.uGap.value = z.gap || 0;
    let eraMax = 0, dep = 0;
    if (z.era) {
      if (ammo.kind === 'ke') (eraMax = 0.32), (dep = 1);
      else if (ammo.kind === 'heat') eraMax = 0.6;
      else if (ammo.kind === 'tandem') eraMax = 0.05;
    }
    m.uniforms.uEraMax.value = eraMax;
    m.uniforms.uEraDep.value = dep;
  }

  enable() {
    if (this.on) return;
    this.on = true;
    const armor = new Set(this.app.tank.reg.armor);
    const kind = this.ammo ? kindKey(this.ammo) : 'ke';
    for (const mesh of armor) {
      this.saved.set(mesh, mesh.material);
      if (mesh.userData.zones) mesh.material = mesh.userData.zones.map((z) => this.mat(z));
      else mesh.material = this.mat(mesh.userData.zone);
    }
    if (this.ammo) for (const [zoneId, m] of this.zoneMats) this.configure(m, zoneId, this.ammo, kind);
    // 非装甲的外部小零件改为中性灰，避免干扰读图
    const ext = new Set(this.app.tank.exteriorMaterials);
    this.app.tank.root.traverse((o) => {
      if (!o.isMesh || armor.has(o) || this.saved.has(o)) return;
      if (ext.has(o.material)) {
        this.saved.set(o, o.material);
        o.material = this.neutral;
      }
    });
  }

  disable() {
    if (!this.on) return;
    this.on = false;
    for (const [mesh, m] of this.saved) mesh.material = m;
    this.saved.clear();
  }
}
