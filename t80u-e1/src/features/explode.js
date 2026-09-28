// 爆炸拆解图：按部件组沿各自方向分离，带引线标注；可点选部件查看说明。
import * as THREE from 'three';
import { Ease, clamp01 } from '../core/tween.js';

export const EXPLODE_VIEW = { pos: [12.5, 8.6, 13.5], target: [0.2, 2.3, 0] };

// 分离先后顺序（0 最先）：外挂件 → 炮塔/行走 → 武器/观瞄 → 车内
const ORDER = {
  eraHull: 0, eraTurret: 0, skirtL: 0, skirtR: 0, fenderBoxes: 0, drums: 0, smokeL: 0, smokeR: 0, stowage: 0,
  turret: 1, deck: 1, runningL: 1, runningR: 1,
  gun: 2, cupola: 2, gunnerSight: 2,
  carousel: 3, loaderMech: 3, gunner: 3, commander: 3, driver: 3, engine: 3, transmission: 3, fuelRear: 3, tankRackL: 3, tankRackR: 3, fcRack: 3,
};

const GROUPS = [
  ['车体外部', ['eraHull', 'skirtL', 'skirtR', 'runningL', 'runningR', 'fenderBoxes', 'drums', 'deck']],
  ['炮塔与武器', ['turret', 'eraTurret', 'gun', 'cupola', 'gunnerSight', 'smokeL', 'smokeR', 'stowage']],
  ['车内', ['carousel', 'loaderMech', 'gunner', 'commander', 'driver', 'tankRackL', 'tankRackR', 'fcRack', 'engine', 'transmission', 'fuelRear']],
];

export class ExplodeController {
  constructor(app) {
    this.app = app;
    this.groups = app.tank.reg.explode;
    this.byId = new Map(this.groups.map((g) => [g.id, g]));
    this.f = 0;
    this.tw = null;
  }
  set(f) {
    this.f = f;
    for (const g of this.groups) {
      const d = (ORDER[g.id] ?? 1) * 0.12;
      const k = Ease.inOut(clamp01((f - d) / (1 - 0.36)));
      g.obj.position.copy(g.base).addScaledVector(g.offset, k);
    }
  }
  animateTo(f, dur = 1.6) {
    const f0 = this.f;
    if (this.tw) this.app.tweens.cancel(this.tw);
    return new Promise((res) => {
      this.tw = this.app.tweens.add(dur * Math.max(0.25, Math.abs(f - f0)), (k) => this.set(f0 + (f - f0) * k), { ease: Ease.linear, onDone: res });
    });
  }
}

export class ExplodeMode {
  constructor(app) {
    this.app = app;
    this.ctrl = new ExplodeController(app);
    app.explode = this.ctrl;
    this.selected = null;
    this.showLabels = true;
    this.box = new THREE.Box3();
    this.boxHelper = new THREE.Box3Helper(this.box, 0xe0863a);
    this.boxHelper.visible = false;
    this.boxHelper.raycast = () => {};
    app.scene.add(this.boxHelper);
    this.raycaster = new THREE.Raycaster();
  }

  enter() {
    const app = this.app;
    app.xray.set('off');
    app.damage.ensureIntact?.();
    app.flyTo(EXPLODE_VIEW.pos, EXPLODE_VIEW.target, 1.3);
    this.buildLabels();
    this.render();
    this.ctrl.animateTo(1, 1.8);
    this.boxHelper.material.color.set(app.themeColors.accent);
  }

  exit() {
    this.app.labels.setOpacity(0);
    this.app.labels.clear();
    this.boxHelper.visible = false;
    this.ctrl.animateTo(0, 0.9);
  }

  onTheme() {
    this.boxHelper.material.color.set(this.app.themeColors.accent);
  }

  resetView() {
    this.app.flyTo(EXPLODE_VIEW.pos, EXPLODE_VIEW.target);
  }

  buildLabels() {
    const L = this.app.labels;
    L.clear();
    for (const g of this.ctrl.groups) {
      L.add({ id: g.id, title: g.name, sub: g.sub, target: g.obj, local: g.labelAt });
    }
    L.onClick = (id) => this.select(id);
  }

  render() {
    const app = this.app;
    const names = new Map(this.ctrl.groups.map((g) => [g.id, g.name]));
    app.panelBody.innerHTML = `
      <div>
        <div class="eyebrow">EXPLODED VIEW</div>
        <h2>爆炸拆解图</h2>
      </div>
      <p class="lede">整车按结构拆成 ${this.ctrl.groups.length} 个部件组：外挂的反应装甲和侧裙最先分离，随后是炮塔与行走装置，最后露出转盘式自动装弹机、乘员和动力舱。</p>
      <div class="section">
        <div class="field">
          <label for="exF">拆解程度</label><output id="exOut" class="num">0%</output>
          <input id="exF" type="range" min="0" max="100" step="1" value="${Math.round(this.ctrl.f * 100)}" />
        </div>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="exOpen">拆解</button>
          <button type="button" class="btn" id="exClose">组装</button>
        </div>
        <label class="toggle">显示部件标注<input type="checkbox" id="exLabels" ${this.showLabels ? 'checked' : ''} /></label>
      </div>
      <div class="info-card" id="exInfo"></div>
      ${GROUPS.map(
        ([title, ids]) => `
        <div class="section">
          <div class="section-title">${title}</div>
          <div class="part-list">${ids
            .filter((id) => names.has(id))
            .map((id) => `<button type="button" data-part="${id}" aria-pressed="${this.selected === id}">${names.get(id)}</button>`)
            .join('')}</div>
        </div>`,
      ).join('')}
      <p class="note">点击模型上的部件或标注查看说明；拆解状态下可自由旋转观察。</p>
    `;
    const $ = (s) => app.panelBody.querySelector(s);
    this.slider = $('#exF');
    this.out = $('#exOut');
    this.slider.addEventListener('input', () => {
      if (this.ctrl.tw) app.tweens.cancel(this.ctrl.tw);
      this.ctrl.set(Number(this.slider.value) / 100);
    });
    $('#exOpen').addEventListener('click', () => this.ctrl.animateTo(1));
    $('#exClose').addEventListener('click', () => this.ctrl.animateTo(0));
    $('#exLabels').addEventListener('change', (e) => (this.showLabels = e.target.checked));
    for (const b of app.panelBody.querySelectorAll('[data-part]')) b.addEventListener('click', () => this.select(b.dataset.part, true));
    this.renderInfo();
  }

  renderInfo() {
    const el = this.app.panelBody.querySelector('#exInfo');
    if (!el) return;
    const g = this.selected && this.ctrl.byId.get(this.selected);
    if (!g) {
      el.innerHTML = `<h3>点选一个部件</h3><p>在模型或右侧列表中选择部件，这里会显示它的名称、型号和作用。</p>`;
      return;
    }
    el.innerHTML = `<div class="sub"></div><h3></h3><p></p>`;
    el.querySelector('.sub').textContent = g.sub || '';
    el.querySelector('h3').textContent = g.name;
    el.querySelector('p').textContent = g.desc || '';
    for (const b of this.app.panelBody.querySelectorAll('[data-part]')) b.setAttribute('aria-pressed', String(b.dataset.part === g.id));
  }

  select(id, focus = false) {
    this.selected = id;
    this.app.labels.setActive(id);
    this.renderInfo();
    const g = this.ctrl.byId.get(id);
    this.boxHelper.visible = !!g;
    if (focus && g && this.ctrl.f > 0.5) {
      const c = new THREE.Vector3();
      this.box.setFromObject(g.obj).getCenter(c);
      const dir = this.app.camera.position.clone().sub(this.app.controls.target).normalize();
      const size = this.box.getSize(new THREE.Vector3()).length();
      const dist = THREE.MathUtils.clamp(size * 2.2, 4, 14);
      this.app.flyTo(c.clone().addScaledVector(dir, dist).toArray(), c.toArray(), 0.9);
    }
  }

  onClick(ndc) {
    const app = this.app;
    this.raycaster.setFromCamera(ndc, app.camera);
    const hits = this.raycaster.intersectObject(app.tank.root, true);
    for (const h of hits) {
      if (!h.object.visible || h.object.isLine || h.object.isLineSegments) continue;
      let o = h.object;
      while (o && o.userData.explodeId === undefined) o = o.parent;
      if (o) {
        this.select(o.userData.explodeId);
        return;
      }
    }
    this.select(null);
  }

  update() {
    const app = this.app;
    const f = this.ctrl.f;
    if (this.slider && document.activeElement !== this.slider) this.slider.value = String(Math.round(f * 100));
    if (this.out) this.out.textContent = `${Math.round(f * 100)}%`;
    app.labels.setOpacity(this.showLabels ? clamp01((f - 0.55) / 0.3) : 0);
    // 左右成对的部件只标注朝向相机的一侧
    const camZ = app.camera.position.z - app.controls.target.z;
    for (const it of app.labels.items) {
      const m = /^(.*)([LR])$/.exec(it.id);
      if (m && ['skirt', 'running', 'smoke', 'tankRack'].includes(m[1])) it.forceHidden = (m[2] === 'L') === camZ > 0;
    }
    if (this.boxHelper.visible && this.selected) {
      const g = this.ctrl.byId.get(this.selected);
      if (g) this.box.setFromObject(g.obj);
    }
  }
}
