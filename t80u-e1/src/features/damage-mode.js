// 模块损伤：X 光下显示乘员与各模块的损伤状态，可以直接瞄准车内模块射击。
import * as THREE from 'three';
import { STATE_COLORS } from './xray.js';
import { STATE_TEXT, crewStateText, OUTCOME } from './shooter.js';
import { ammoPickerHtml, bindAmmoPicker, reticleHtml, updateHover, hideHover } from './shot-ui.js';
import { findModule } from '../tank/registry.js';

export const DAMAGE_VIEW = { pos: [6.2, 5.6, 6.4], target: [0.2, 1.1, 0] };

const cssHex = (n) => '#' + n.toString(16).padStart(6, '0');

export class DamageMode {
  constructor(app) {
    this.app = app;
    this.last = null;
    this.pending = null;
    this.lastPreview = 0;
    this.selected = null;
    this.box = new THREE.Box3();
    this.helper = new THREE.Box3Helper(this.box, 0xe0863a);
    this.helper.visible = false;
    this.helper.raycast = () => {};
    app.scene.add(this.helper);
    this.raycaster = new THREE.Raycaster();
  }

  enter() {
    const app = this.app;
    app.labels.setOpacity(0);
    app.xray.set('modules');
    app.xray.setGhostOpacity(0.12);
    app.xray.applyModuleColors(app.damage.states());
    app.flyTo(DAMAGE_VIEW.pos, DAMAGE_VIEW.target);
    app.hud.innerHTML = reticleHtml();
    this.render();
    this.off = app.damage.onChange(() => this.refresh());
    this.helper.material.color.set(app.themeColors.accent);
  }

  exit() {
    this.off?.();
    this.helper.visible = false;
    this.app.xray.setGhostOpacity(0.14);
    this.app.xray.set('off');
    hideHover(this.app.hud);
  }

  onTheme() {
    this.helper.material.color.set(this.app.themeColors.accent);
  }

  resetView() {
    this.app.flyTo(DAMAGE_VIEW.pos, DAMAGE_VIEW.target);
  }

  render() {
    const app = this.app;
    app.panelBody.innerHTML = `
      <div>
        <div class="eyebrow">MODULE DAMAGE</div>
        <h2>模块损伤</h2>
      </div>
      <p class="lede">X 光视图中每个乘员和模块都按损伤状态着色。击穿后，弹体和破片沿各自路径命中模块；转盘里的发射药被引燃时会殉爆，这是 T-80 系列最致命的弱点。</p>
      <div class="vehicle-state" id="dmState"></div>
      <div class="legend">
        ${['ok', 'damaged', 'critical', 'destroyed'].map((s) => `<span><i style="--lc:${cssHex(STATE_COLORS[s])}"></i>${STATE_TEXT[s]}</span>`).join('')}
      </div>
      <div class="section">
        <div class="section-title">射击设置<span class="aside">点击车体射击</span></div>
        ${ammoPickerHtml(app.shooter, 'dm')}
      </div>
      <div class="section" id="dmLast"></div>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" id="dmRepair">修复全部</button>
        <button type="button" class="btn" id="dmClear">清除弹痕</button>
      </div>
      <div class="section">
        <div class="section-title">模块状态<span class="aside">点击名称定位</span></div>
        <div class="modlist" id="dmList"></div>
      </div>
      <div class="section">
        <div class="section-title">射击记录</div>
        <div class="shot-log" id="dmLog"></div>
      </div>
      <p class="note">耐久与殉爆概率为教学用的简化数值：弹体直接命中造成大量伤害，破片按能量造成伤害；油箱会吸收部分破片，发射药筒被命中时有较高概率殉爆。</p>
    `;
    const $ = (s) => app.panelBody.querySelector(s);
    bindAmmoPicker(app.panelBody, app.shooter, 'dm');
    $('#dmRepair').addEventListener('click', () => {
      app.damage.reset(true);
      app.shooter.clear();
      this.last = null;
      app.toast('全部模块已修复');
    });
    $('#dmClear').addEventListener('click', () => app.shooter.clear());
    this.refresh();
  }

  refresh() {
    const app = this.app;
    const body = app.panelBody;
    const st = app.damage.vehicleStatus();
    const stEl = body.querySelector('#dmState');
    if (!stEl) return;
    stEl.style.setProperty('--vs', `var(--${st.level})`);
    stEl.innerHTML = `<span class="vs-dot"></span><div class="vs-text"><b></b><span class="vs-tags"></span></div>`;
    stEl.querySelector('b').textContent = st.title;
    stEl.querySelector('.vs-tags').textContent = st.tags.length ? st.tags.join(' · ') : '所有乘员和模块完好';

    const list = body.querySelector('#dmList');
    list.innerHTML = app.damage
      .categories()
      .map(
        (g) => `<div class="modgroup"><h4>${g.name}</h4>${g.mods
          .map((m) => {
            const pct = Math.max(0, (m.hp / m.maxHp) * 100);
            const col = cssHex(STATE_COLORS[m.state] ?? STATE_COLORS.ok);
            const txt = m.kind === 'crew' ? crewStateText(m.state) : STATE_TEXT[m.state];
            const fire = app.damage.fires.has(m.id) ? '<span class="fire">起火</span>' : '';
            return `<button type="button" class="modrow ${this.selected === m.id ? 'is-active' : ''}" data-mod="${m.id}"><span class="mn">${m.name}${fire}</span><span class="hpbar"><i style="--hp:${pct.toFixed(0)}%;--hc:${col}"></i></span><span class="ms st-${m.state}">${txt}</span></button>`;
          })
          .join('')}</div>`,
      )
      .join('');
    for (const b of list.querySelectorAll('[data-mod]')) b.addEventListener('click', () => this.select(b.dataset.mod));

    const last = body.querySelector('#dmLast');
    if (this.last) {
      const out = OUTCOME[this.last.res.outcome];
      const ev = this.last.summary?.list || [];
      last.innerHTML = `<div class="verdict ${out.cls}"><div><div class="v-main">${out.text}</div><div class="note">${this.last.res.ammo.name}</div></div><div class="v-sub">${ev.length ? `${ev.length} 个模块受影响` : '无车内损伤'}${this.last.summary?.frags?.length ? ` · 破片 ${this.last.summary.frags.length} 条` : ''}</div></div>`;
    } else last.innerHTML = '';
    const log = body.querySelector('#dmLog');
    log.innerHTML = app.damage.log.length
      ? app.damage.log.map((l) => `<div><span>${l.ammo} · ${OUTCOME[l.outcome]?.text ?? l.outcome}</span><span>${l.status}</span></div>`).join('')
      : '<div><span>还没有射击</span><span></span></div>';
  }

  select(id) {
    this.selected = id;
    const m = this.app.damage.get(id);
    this.box.makeEmpty();
    for (const r of m.roots) if (r.visible) this.box.union(new THREE.Box3().setFromObject(r));
    this.helper.visible = !this.box.isEmpty();
    this.helperT = 2.5;
    for (const b of this.app.panelBody.querySelectorAll('[data-mod]')) b.classList.toggle('is-active', b.dataset.mod === id);
  }

  onPointerMove(ndc, e) {
    this.pending = { ndc, e };
  }

  onPointerLeave() {
    this.pending = null;
    hideHover(this.app.hud);
  }

  onClick(ndc) {
    const app = this.app;
    if (app.damage.destroyed) {
      app.toast('车辆已被摧毁，点“修复全部”恢复', 'warn');
      return;
    }
    const r = app.shooter.fire(ndc);
    if (r.res.outcome === 'miss') return;
    this.last = r;
    this.refresh();
    if (r.summary?.detonation) app.toast('弹药殉爆！炮塔被抛飞', 'bad', 3500);
  }

  /** 光标下第一个可见模块（忽略装甲，用于 X 光瞄准提示） */
  moduleUnder(ndc) {
    this.raycaster.setFromCamera(ndc, this.app.camera);
    const hits = this.raycaster.intersectObjects(this.app.tank.reg.moduleRoots, true);
    for (const h of hits) {
      let o = h.object, vis = true;
      while (o) {
        if (!o.visible) vis = false;
        o = o.parent;
      }
      if (!vis) continue;
      const mod = findModule(h.object);
      if (mod) return this.app.damage.get(mod.id);
    }
    return null;
  }

  update(dt) {
    if (this.helper.visible) {
      this.helperT -= dt;
      if (this.helperT <= 0) this.helper.visible = false;
    }
    this.lastPreview += dt;
    if (this.pending && this.lastPreview > 0.06) {
      this.lastPreview = 0;
      const { ndc, e } = this.pending;
      this.pending = null;
      const res = this.app.shooter.preview(ndc);
      updateHover(this.app, this.app.hud, e, res.entry ? res : null);
      const mod = this.moduleUnder(ndc);
      const tip = this.app.hud.querySelector('#hoverTip');
      if (tip && !tip.hidden && mod) {
        const row = document.createElement('div');
        row.className = 'ht-row';
        row.innerHTML = '<span>瞄准模块</span><b></b>';
        row.querySelector('b').textContent = mod.name;
        tip.appendChild(row);
      }
    }
  }
}
