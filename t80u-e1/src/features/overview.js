// 总览：整车外观、主要性能参数、炮塔/火炮姿态与显示选项。
import { camoUniforms } from '../tank/materials.js';
import { DEG, GUN } from '../tank/dims.js';

export const HOME_VIEW = { pos: [8.2, 4.4, 8.8], target: [0.4, 1.1, 0] };

const SPECS = [
  ['乘员', '3 人（车长、炮手、驾驶员）'],
  ['战斗全重', '约 46 t'],
  ['发动机', 'GTD-1250 燃气轮机，1250 马力'],
  ['最大速度', '70 km/h（公路）'],
  ['主炮', '2A46M-4 125 mm 滑膛炮'],
  ['携弹量', '45 发，其中转盘 28 发'],
  ['火炮俯仰', '−5° ～ +15°'],
  ['辅助武器', '7.62 mm PKT、12.7 mm NSVT'],
  ['防护', '复合装甲 + “接触-5”反应装甲'],
  ['火控', '1G46 瞄准镜 + 第二代热像仪'],
];

const TOUR = [
  ['explode', '爆炸拆解', '把整车拆成 20 余个部件，点选查看用途'],
  ['loader', '装填与击发', '转盘选弹、提升、推弹到击发的完整流程'],
  ['analysis', '入射分析', '指哪打哪：入射角、等效厚度与穿深判定'],
  ['damage', '模块损伤', '透视乘员与模块，查看破片造成的损伤'],
];

export class OverviewMode {
  constructor(app) {
    this.app = app;
    this.autoRotate = false;
    this.driving = false;
    this.xray = false;
    this.first = true;
  }

  enter() {
    const app = this.app;
    app.labels.setOpacity(0);
    app.xray.set(this.xray ? 'ghost' : 'off');
    if (this.first) {
      app.camera.position.copy(app.fitPos(HOME_VIEW.pos, HOME_VIEW.target));
      app.controls.target.set(...HOME_VIEW.target);
      this.first = false;
    } else app.flyTo(HOME_VIEW.pos, HOME_VIEW.target);
    this.render();
  }

  exit() {
    this.app.controls.autoRotate = false;
  }

  resetView() {
    this.app.flyTo(HOME_VIEW.pos, HOME_VIEW.target);
  }

  render() {
    const app = this.app;
    const t = app.tank;
    app.panelBody.innerHTML = `
      <div>
        <div class="eyebrow">Т-80УЕ-1 · 2005 年列装</div>
        <h2>T-80U-E1 主战坦克</h2>
      </div>
      <p class="lede">俄军在 2005 年采用的 T-80 改进型：把退役 T-80UD 的炮塔装到 T-80BV 车体上，同时加装第二代热像仪、能装填加长穿甲弹的改进型装弹机、车体“接触-5”反应装甲，并换装 1250 马力燃气轮机。产量不足百辆。</p>
      <div class="section">
        <div class="section-title">主要参数</div>
        <dl class="kv">${SPECS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      </div>
      <div class="section">
        <div class="section-title">姿态</div>
        <div class="field">
          <label for="ovYaw">炮塔方向</label><output id="ovYawOut" class="num">0°</output>
          <input id="ovYaw" type="range" min="-180" max="180" step="1" value="${Math.round(t.yaw / DEG)}" />
        </div>
        <div class="field">
          <label for="ovElev">火炮俯仰</label><output id="ovElevOut" class="num">0°</output>
          <input id="ovElev" type="range" min="${GUN.minElev / DEG}" max="${GUN.maxElev / DEG}" step="0.5" value="${(t.elevation / DEG).toFixed(1)}" />
        </div>
      </div>
      <div class="section">
        <div class="section-title">显示</div>
        <label class="toggle">X 光透视（显示车内布置）<input type="checkbox" id="ovXray" ${this.xray ? 'checked' : ''} /></label>
        <label class="toggle">三色迷彩涂装<input type="checkbox" id="ovCamo" ${camoUniforms.uCamoMix.value > 0.5 ? 'checked' : ''} /></label>
        <label class="toggle">自动环绕<input type="checkbox" id="ovRotate" ${this.autoRotate ? 'checked' : ''} /></label>
        <label class="toggle">履带行驶动画<input type="checkbox" id="ovDrive" ${this.driving ? 'checked' : ''} /></label>
      </div>
      <div class="section">
        <div class="section-title">功能导览</div>
        <div class="hits">${TOUR.map(([m, n, d]) => `<button type="button" class="hit tour" data-go="${m}" style="text-align:left;border:0;color:inherit;cursor:pointer"><span><b>${n}</b><br><span class="note">${d}</span></span><span class="st" aria-hidden="true">→</span></button>`).join('')}</div>
      </div>
      <p class="note">拖动旋转视角，滚轮/双指缩放，右键或双指平移。性能与装甲数据来自公开资料并经过简化，仅用于教学演示。</p>
    `;
    const $ = (s) => app.panelBody.querySelector(s);
    const yaw = $('#ovYaw'), elev = $('#ovElev');
    const upd = () => {
      t.setTurretYaw(Number(yaw.value) * DEG);
      t.setGunElevation(Number(elev.value) * DEG);
      $('#ovYawOut').textContent = `${yaw.value}°`;
      $('#ovElevOut').textContent = `${Number(elev.value).toFixed(1)}°`;
    };
    yaw.addEventListener('input', upd);
    elev.addEventListener('input', upd);
    upd();
    $('#ovXray').addEventListener('change', (e) => {
      this.xray = e.target.checked;
      app.xray.set(this.xray ? 'ghost' : 'off');
    });
    $('#ovCamo').addEventListener('change', (e) => {
      camoUniforms.uCamoMix.value = e.target.checked ? 1 : 0;
    });
    $('#ovRotate').addEventListener('change', (e) => {
      this.autoRotate = e.target.checked;
      app.controls.autoRotate = this.autoRotate;
      app.controls.autoRotateSpeed = 0.7;
    });
    $('#ovDrive').addEventListener('change', (e) => {
      this.driving = e.target.checked;
    });
    for (const b of app.panelBody.querySelectorAll('[data-go]')) b.addEventListener('click', () => app.setMode(b.dataset.go));
    app.controls.autoRotate = this.autoRotate;
  }

  update(dt) {
    if (this.driving) this.app.tank.running.drive(dt * 2.2);
  }
}
