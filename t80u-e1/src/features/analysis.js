// 入射分析：防护热图 + 悬停预判 + 点击射击，逐层列出视线厚度与等效厚度。
import { AMMO } from '../data/ammo.js';
import { Heatmap } from './heatmap.js';
import { ammoPickerHtml, bindAmmoPicker, reticleHtml, updateHover, hideHover, resultHtml, fillZoneCell } from './shot-ui.js';

export const ANALYSIS_VIEW = { pos: [7.4, 3.3, -6.8], target: [0.6, 1.25, 0] };

export class AnalysisMode {
  constructor(app) {
    this.app = app;
    this.heat = new Heatmap(app);
    this.heatOn = true;
    this.last = null;
    this.pending = null;
    this.lastPreview = 0;
  }

  enter() {
    const app = this.app;
    app.labels.setOpacity(0);
    app.damage.ensureIntact();
    app.xray.set('off');
    this.heat.setAmmo(app.shooter.ammo, app.shooter.settings.distance);
    if (this.heatOn) this.heat.enable();
    app.flyTo(ANALYSIS_VIEW.pos, ANALYSIS_VIEW.target);
    app.hud.innerHTML = reticleHtml();
    this.render();
  }

  exit() {
    this.heat.disable();
    hideHover(this.app.hud);
  }

  onTheme() {
    this.heat.onTheme();
  }

  resetView() {
    this.app.flyTo(ANALYSIS_VIEW.pos, ANALYSIS_VIEW.target);
  }

  render() {
    const app = this.app;
    app.panelBody.innerHTML = `
      <div>
        <div class="eyebrow">PROTECTION ANALYSIS</div>
        <h2>入射分析</h2>
      </div>
      <p class="lede">从当前视角对准车体任意位置：入射角越大，炮弹要穿过的视线厚度越大。热图按所选弹种和距离实时标出能否击穿，点击即可射击并查看逐层计算。</p>
      <div class="section">
        <div class="section-title">弹种与距离<span class="aside">数字为该距离穿深 mm</span></div>
        ${ammoPickerHtml(app.shooter, 'an')}
      </div>
      <div class="section">
        <label class="toggle">防护热图<input type="checkbox" id="anHeat" ${this.heatOn ? 'checked' : ''} /></label>
        <div class="legend">
          <span><i style="--lc:var(--bad)"></i>可击穿</span>
          <span><i style="--lc:var(--warn)"></i>临界</span>
          <span><i style="--lc:var(--ok)"></i>无法击穿</span>
          <span><i class="stripe" style="--lc:var(--rico)"></i>可能跳弹</span>
        </div>
      </div>
      <div class="section" id="anResult"></div>
      <div class="btn-row">
        <button type="button" class="btn" id="anClear">清除弹痕</button>
        <button type="button" class="btn" id="anRepair">修复车辆</button>
        <button type="button" class="btn btn-quiet" id="anToDamage">查看模块损伤 →</button>
      </div>
      <p class="note">计算方法：视线厚度 = 名义厚度 ÷ cos(入射角)；等效厚度 = 视线厚度 × 材料系数（对穿甲弹与破甲弹不同）。“接触-5”对破甲弹削弱约 60%，对穿甲弹约 30%（需要一定倾角），串联战斗部可先行引爆它；破甲射流每穿过 1 m 空气间隙损失约 30%。数据为公开资料的简化估算。</p>
    `;
    const $ = (s) => app.panelBody.querySelector(s);
    bindAmmoPicker(app.panelBody, app.shooter, 'an', () => {
      this.heat.setAmmo(app.shooter.ammo, app.shooter.settings.distance);
    });
    $('#anHeat').addEventListener('change', (e) => {
      this.heatOn = e.target.checked;
      this.heatOn ? this.heat.enable() : this.heat.disable();
    });
    $('#anClear').addEventListener('click', () => app.shooter.clear());
    $('#anRepair').addEventListener('click', () => {
      app.damage.reset(true);
      app.shooter.clear();
      app.toast('车辆已修复，反应装甲已补齐');
    });
    $('#anToDamage').addEventListener('click', () => app.setMode('damage'));
    this.renderResult();
  }

  renderResult() {
    const el = this.app.panelBody.querySelector('#anResult');
    if (!el) return;
    el.innerHTML = resultHtml(this.app, this.last?.res, this.last?.summary);
    fillZoneCell(el, this.app, this.last?.res);
  }

  onPointerMove(ndc, e) {
    this.pending = { ndc, e };
  }

  onPointerLeave() {
    this.pending = null;
    hideHover(this.app.hud);
  }

  onClick(ndc, e) {
    const app = this.app;
    if (app.damage.destroyed) {
      app.toast('车辆已被摧毁，请先修复车辆', 'warn');
      return;
    }
    const r = app.shooter.fire(ndc);
    if (r.res.outcome === 'miss') return;
    this.last = r;
    this.renderResult();
    if (r.summary?.detonation) app.toast('弹药殉爆！炮塔被抛飞', 'bad', 3500);
    // 立即刷新悬停预判（反应装甲可能已起爆）
    this.pending = { ndc, e };
    this.lastPreview = 0;
  }

  update(dt) {
    this.lastPreview += dt;
    if (this.pending && this.lastPreview > 0.06) {
      this.lastPreview = 0;
      const { ndc, e } = this.pending;
      this.pending = null;
      const res = this.app.shooter.preview(ndc);
      updateHover(this.app, this.app.hud, e, res.entry ? res : null);
    }
  }
}

export { AMMO };
