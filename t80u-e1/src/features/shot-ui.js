// 入射分析与模块损伤共用的界面片段：弹种/距离选择、准星与悬停提示、结果卡片。
import { AMMO, AMMO_ORDER, penAt } from '../data/ammo.js';
import { ZONES } from '../data/armor.js';
import { OUTCOME, zoneLabel, STATE_TEXT, crewStateText } from './shooter.js';

const f0 = (x) => Math.round(x).toLocaleString('zh-CN');

export function ammoPickerHtml(shooter, idPrefix) {
  const s = shooter.settings;
  return `
    <div class="ammo-list" id="${idPrefix}Ammo">${AMMO_ORDER.map((id) => {
      const a = AMMO[id];
      return `<button type="button" class="ammo-card" data-ammo="${id}" aria-pressed="${s.ammo === id}" style="--sw:${a.color}">
        <span class="sw"></span><span class="nm">${a.short}</span><span class="ct">${f0(penAt(a, s.distance))}</span>
        <span class="ty">${a.type.split(' ')[0]}</span></button>`;
    }).join('')}</div>
    <div class="field">
      <label for="${idPrefix}Dist">射击距离</label><output id="${idPrefix}DistOut" class="num"></output>
      <input id="${idPrefix}Dist" type="range" min="0" max="3000" step="50" value="${s.distance}" />
    </div>`;
}

/** 绑定弹种卡片与距离滑块；onChange 在设置变化后调用 */
export function bindAmmoPicker(root, shooter, idPrefix, onChange) {
  const s = shooter.settings;
  const out = root.querySelector(`#${idPrefix}DistOut`);
  const dist = root.querySelector(`#${idPrefix}Dist`);
  const refresh = () => {
    const a = AMMO[s.ammo];
    out.textContent = `${s.distance} m · 穿深 ${f0(penAt(a, s.distance))} mm`;
    for (const b of root.querySelectorAll(`#${idPrefix}Ammo [data-ammo]`)) {
      b.setAttribute('aria-pressed', String(b.dataset.ammo === s.ammo));
      b.querySelector('.ct').textContent = `${f0(penAt(AMMO[b.dataset.ammo], s.distance))}`;
    }
  };
  for (const b of root.querySelectorAll(`#${idPrefix}Ammo [data-ammo]`))
    b.addEventListener('click', () => {
      s.ammo = b.dataset.ammo;
      refresh();
      onChange?.();
    });
  dist.addEventListener('input', () => {
    s.distance = Number(dist.value);
    refresh();
    onChange?.();
  });
  refresh();
}

export function reticleHtml() {
  return `
    <div class="reticle" id="reticle" hidden>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="13" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M22 2v10M22 32v10M2 22h10M32 22h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="22" cy="22" r="1.8" fill="currentColor"/>
      </svg>
    </div>
    <div class="hover-tip" id="hoverTip" hidden></div>`;
}

/** 预览结论：pen / maybe / nopen / rico / he / none */
export function previewVerdict(res) {
  if (!res || !res.entry) return { key: 'none' };
  if (res.ammo.kind === 'he') {
    return res.outcome === 'he_pen' ? { key: 'pen', text: '高爆可击穿' } : { key: 'he', text: '外部爆炸（可伤及外部模块）' };
  }
  if (res.outcome === 'nohull') return { key: 'nopen', text: '只穿过外挂件' };
  if (res.outcome === 'module') return { key: 'he', text: '命中外部模块' };
  const pen = res.outcome === 'penetrated' || res.outcome === 'overpen';
  const margin = pen ? res.penAtBoundary : -(res.resist - res.pen0);
  let key = pen ? 'pen' : 'nopen';
  if (Math.abs(margin) < res.pen0 * 0.06) key = 'maybe';
  const r = res.ricochetChance;
  const text = { pen: '可击穿', nopen: '无法击穿', maybe: '临界' }[key];
  return { key: r >= 0.5 ? 'rico' : key, text: r > 0 ? `${text} · 跳弹 ${Math.round(r * 100)}%` : text, margin };
}

export function updateHover(app, hudRoot, e, res) {
  const ret = hudRoot.querySelector('#reticle');
  const tip = hudRoot.querySelector('#hoverTip');
  if (!ret || !tip) return;
  const rect = app.viewport.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  ret.hidden = false;
  ret.style.left = `${x}px`;
  ret.style.top = `${y}px`;
  const v = previewVerdict(res);
  const colors = { pen: 'var(--bad)', maybe: 'var(--warn)', nopen: 'var(--ok)', rico: 'var(--rico)', he: 'var(--warn)', none: 'var(--ink-3)' };
  ret.style.setProperty('--ret', colors[v.key]);
  if (!res?.entry) {
    tip.hidden = true;
    return;
  }
  const e0 = res.entry;
  const zoneName = e0.zone ? zoneLabel(e0.zone, e0.point, app.tank) : app.tank.reg.modules.get(e0.module)?.name || '—';
  const resist = res.ammo.kind === 'he' ? res.resist : res.resist;
  tip.innerHTML = `
    <div class="ht-zone"></div>
    <div class="ht-row"><span>入射角</span><b>${e0.angle.toFixed(1)}°</b></div>
    <div class="ht-row"><span>等效防护</span><b>${f0(resist)} mm</b></div>
    <div class="ht-row"><span>穿深</span><b>${f0(res.pen0)} mm</b></div>
    <div class="ht-row"><span>判定</span><b style="color:${colors[v.key]}">${v.text}</b></div>`;
  tip.querySelector('.ht-zone').textContent = zoneName;
  tip.hidden = false;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let tx = x + 26, ty = y + 18;
  if (tx + tw > rect.width - 8) tx = x - tw - 26;
  if (ty + th > rect.height - 8) ty = y - th - 18;
  tip.style.left = `${tx}px`;
  tip.style.top = `${ty}px`;
}

export function hideHover(hudRoot) {
  const ret = hudRoot.querySelector('#reticle');
  const tip = hudRoot.querySelector('#hoverTip');
  if (ret) ret.hidden = true;
  if (tip) tip.hidden = true;
}

/** 结果卡片（入射分析的主体内容） */
export function resultHtml(app, res, summary) {
  if (!res) {
    return `<div class="info-card"><h3>在车体上移动准星</h3><p>准星颜色和提示会实时给出入射角、等效防护与判定；点击即以当前弹种和距离射击，结果显示在这里。</p></div>`;
  }
  const out = OUTCOME[res.outcome] || OUTCOME.miss;
  const e = res.entry;
  const zoneName = e?.zone ? zoneLabel(e.zone, e.point, app.tank) : e?.module ? app.tank.reg.modules.get(e.module)?.name : '—';
  let sub = '';
  if (res.outcome === 'penetrated' || res.outcome === 'overpen') sub = `剩余穿深 ${f0(res.penAtBoundary)} mm`;
  else if (res.outcome === 'stopped') sub = `还差 ${f0(res.resist - res.pen0)} mm`;
  else if (res.outcome === 'ricochet') sub = `跳弹概率 ${Math.round(res.ricochetChance * 100)}%`;
  else if (res.outcome === 'he_blast') sub = '冲击波作用于外部模块';
  else if (res.outcome === 'he_pen') sub = '装甲薄于高爆弹的击穿能力';
  const maxv = Math.max(res.pen0, res.resist, 1) * 1.08;
  const rows = res.layers
    .filter((l) => !(l.farWall && res.outcome !== 'overpen'))
    .map((l) => {
      if (l.type === 'era') return `<tr class="era"><td>反应装甲起爆<div class="sub">${ZONES[l.zone].name}</div></td><td class="n">—</td><td class="n">—</td><td class="n">−${Math.round(l.red * 100)}%</td><td class="n">${f0(l.eq)}</td></tr>`;
      if (l.type === 'gap') return `<tr class="era"><td>空气间隙 ${l.gap.toFixed(2)} m<div class="sub">射流衰减</div></td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">${f0(l.eq)}</td></tr>`;
      return `<tr><td>${l.farWall ? '对侧·' : ''}${ZONES[l.zone].name}<div class="sub">${l.matName}</div></td><td class="n">${l.t}</td><td class="n">${f0(l.los)}</td><td class="n">×${l.f.toFixed(2)}</td><td class="n">${f0(l.eq)}</td></tr>`;
    })
    .join('');
  const angle = e?.angle ?? 0;
  const events = summary?.list || [];
  const evHtml = events.length
    ? `<div class="hits">${events
        .sort((a, b) => b.dmg - a.dmg)
        .slice(0, 12)
        .map((ev) => {
          const st = ev.kind === 'crew' ? crewStateText(ev.after) : STATE_TEXT[ev.after];
          return `<div class="hit"><span>${ev.name}<span class="note"> · ${ev.source === 'main' ? '弹体直接命中' : ev.source === 'spall' ? '破片' : ev.source === 'blast' ? '冲击波' : '殉爆'} −${f0(ev.dmg)}</span></span><span class="st st-${ev.after}">${st}</span></div>`;
        })
        .join('')}</div>`
    : `<p class="note">${res.outcome === 'stopped' || res.outcome === 'ricochet' ? '未造成车内损伤。' : '没有模块受损。'}</p>`;
  return `
    <div class="verdict ${out.cls}">
      <div><div class="v-main">${out.text}</div><div class="note">${res.ammo.name} · ${app.shooter.settings.distance} m</div></div>
      <div class="v-sub">${sub}</div>
    </div>
    ${summary?.detonation ? '<div class="verdict pen"><div class="v-main">弹药殉爆</div><div class="v-sub">转盘弹药被引燃，炮塔被抛飞</div></div>' : ''}
    <dl class="kv">
      <dt>命中部位</dt><dd></dd>
      <dt>入射角</dt><dd class="num">${angle.toFixed(1)}°</dd>
      <dt>穿深（${app.shooter.settings.distance} m）</dt><dd class="num">${f0(res.pen0)} mm</dd>
      <dt>等效防护</dt><dd class="num">${f0(res.resist)} mm</dd>
      ${summary?.eraDetonated ? `<dt>反应装甲</dt><dd>${summary.eraDetonated} 块起爆</dd>` : ''}
    </dl>
    <div class="margin-bar" aria-label="防护与穿深对比">
      <div class="mb-armor" style="width:${((res.resist / maxv) * 100).toFixed(1)}%"></div>
      <div class="mb-pen" style="left:${((res.pen0 / maxv) * 100).toFixed(1)}%"></div>
      <div class="mb-lbl"><span>防护 ${f0(res.resist)}</span><span>穿深 ${f0(res.pen0)}</span></div>
    </div>
    ${rows ? `<div class="table-wrap"><table class="layers"><thead><tr><th>装甲层</th><th class="n">名义</th><th class="n">视线</th><th class="n">系数</th><th class="n">等效</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    <div class="section">
      <div class="section-title">车内效果<span class="aside">${summary?.frags?.length ? `破片 ${summary.frags.length} 条` : ''}</span></div>
      ${evHtml}
    </div>`;
}

export function fillZoneCell(root, app, res) {
  const dd = root.querySelector('.kv dd');
  if (!dd || !res?.entry) return;
  const e = res.entry;
  dd.textContent = e.zone ? zoneLabel(e.zone, e.point, app.tank) : app.tank.reg.modules.get(e.module)?.name || '—';
}
