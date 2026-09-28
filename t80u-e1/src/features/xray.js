// X 光透视：外部材质半透明 + 装甲轮廓线；模块模式下按损伤状态着色内部模块。
import * as THREE from 'three';

export const STATE_COLORS = {
  ok: 0xd9e1dc,
  damaged: 0xf0b429,
  critical: 0xf07a2a,
  destroyed: 0xe5484d,
  dead: 0x8a1f24,
};

export class XRay {
  constructor(tank) {
    this.tank = tank;
    this.mode = 'off';
    this.edges = null;
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x9fb7ad, transparent: true, opacity: 0.55, depthWrite: false });
    this.saved = new Map();
    this.moduleMats = new Map(); // mesh → {orig, state}
    this.ghostOpacity = 0.14;
  }

  _buildEdges() {
    this.edges = [];
    const seen = new Set();
    for (const mesh of this.tank.reg.armor) {
      if (mesh.isInstancedMesh || seen.has(mesh)) continue;
      seen.add(mesh);
      const z = mesh.userData.zone;
      if (z && ['wheel', 'track', 'barrel', 'smoke', 'fitting'].includes(z)) continue;
      const geo = new THREE.EdgesGeometry(mesh.geometry, 28);
      const line = new THREE.LineSegments(geo, this.edgeMat);
      line.raycast = () => {};
      line.visible = false;
      line.renderOrder = 5;
      mesh.add(line);
      this.edges.push(line);
    }
  }

  setEdgeColor(hex) {
    this.edgeMat.color.set(hex);
  }

  /** mode: 'off' | 'ghost' | 'modules' */
  set(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const on = mode !== 'off';
    if (on && !this.edges) this._buildEdges();
    for (const m of this.tank.exteriorMaterials) {
      if (on) {
        if (!this.saved.has(m)) this.saved.set(m, { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
        m.transparent = true;
        m.opacity = this.ghostOpacity;
        m.depthWrite = false;
      } else if (this.saved.has(m)) {
        Object.assign(m, this.saved.get(m));
      }
      m.needsUpdate = true;
    }
    if (this.edges) for (const e of this.edges) e.visible = on;
    this.applyModuleColors();
  }

  /** 调整外壳透明度（不触发着色器重编译）；接近不透明时恢复深度写入并淡出轮廓线 */
  setGhostOpacity(o) {
    this.ghostOpacity = o;
    if (this.mode === 'off') return;
    const solid = o > 0.97;
    for (const m of this.tank.exteriorMaterials) {
      m.opacity = o;
      m.depthWrite = solid;
    }
    this.edgeMat.opacity = 0.55 * (1 - Math.min(1, o * 1.1));
    if (this.edges) for (const e of this.edges) e.visible = !solid;
  }

  /** 模块着色：modules 模式下按状态着色，否则恢复原材质 */
  applyModuleColors(states) {
    if (states) this.lastStates = states;
    for (const [id, mod] of this.tank.reg.modules) {
      const st = this.lastStates?.[id] ?? 'ok';
      // 完好的外部模块（履带、身管、观瞄等）保持半透明外观，受损后才着色
      const colorize = this.mode === 'modules' && !(mod.external && st === 'ok');
      for (const root of mod.roots) {
        root.traverse((o) => {
          if (!o.isMesh) return;
          let rec = this.moduleMats.get(o);
          if (colorize) {
            if (!rec) {
              rec = { orig: o.material };
              this.moduleMats.set(o, rec);
            }
            const col = STATE_COLORS[st] ?? STATE_COLORS.ok;
            const key = st + (mod.kind || '');
            o.material = this._stateMat(key, col, mod.kind);
          } else if (rec) {
            o.material = rec.orig;
            this.moduleMats.delete(o);
          }
        });
      }
    }
  }

  _stateMat(key, col, kind) {
    this._mats ??= new Map();
    if (!this._mats.has(key)) {
      const m = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: kind === 'ammo' || kind === 'crew' ? 0.35 : 0.22,
        roughness: 0.6,
        metalness: 0.05,
      });
      this._mats.set(key, m);
    }
    return this._mats.get(key);
  }
}
