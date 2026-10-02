// 三维标注：HTML 标签 + SVG 引线，按屏幕位置向外侧展开并做简单的防重叠。
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Labels {
  constructor(container, svg, camera) {
    this.container = container;
    this.svg = svg;
    this.camera = camera;
    this.items = [];
    this.opacity = 0;
    this.center = new THREE.Vector3(0, 1.4, 0);
    this.onClick = null;
  }

  clear() {
    for (const it of this.items) {
      it.el.remove();
      it.line.remove();
      it.dot.remove();
    }
    this.items = [];
  }

  add({ id, title, sub, target, local }) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'label3d';
    el.innerHTML = `<span class="label3d-title"></span>${sub ? '<span class="label3d-sub"></span>' : ''}`;
    el.querySelector('.label3d-title').textContent = title;
    if (sub) el.querySelector('.label3d-sub').textContent = sub;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClick?.(id);
    });
    this.container.appendChild(el);
    const ns = 'http://www.w3.org/2000/svg';
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('class', 'leader');
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('class', 'leader-dot');
    dot.setAttribute('r', '3');
    this.svg.appendChild(line);
    this.svg.appendChild(dot);
    const it = { id, el, line, dot, target, local: local.clone(), w: 0, h: 0, active: false };
    this.items.push(it);
    return it;
  }

  setActive(id) {
    for (const it of this.items) {
      it.active = it.id === id;
      it.el.classList.toggle('is-active', it.active);
    }
  }

  setOpacity(o) {
    this.opacity = o;
    this.container.style.opacity = String(o);
    this.svg.style.opacity = String(o);
    this.container.style.pointerEvents = o > 0.5 ? '' : 'none';
    const vis = o > 0.01;
    this.container.hidden = !vis;
    this.svg.style.display = vis ? '' : 'none';
  }

  update() {
    if (this.opacity <= 0.01 || !this.items.length) return;
    const rect = this.container.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    _v.copy(this.center).project(this.camera);
    const cx = (_v.x + 1) * 0.5 * W, cy = (1 - _v.y) * 0.5 * H;
    const placed = [];
    for (const it of this.items) {
      it.target.updateWorldMatrix(true, false);
      _v.copy(it.local).applyMatrix4(it.target.matrixWorld).project(this.camera);
      if (_v.z > 1 || _v.z < -1 || it.forceHidden) {
        it.hidden = true;
        continue;
      }
      it.hidden = false;
      const sx = (_v.x + 1) * 0.5 * W, sy = (1 - _v.y) * 0.5 * H;
      let dx = sx - cx, dy = sy - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      if (!it.w) {
        it.w = it.el.offsetWidth;
        it.h = it.el.offsetHeight;
      }
      const reach = 34 + Math.min(40, len * 0.12);
      const right = dx >= -0.15;
      let lx = sx + dx * reach, ly = sy + dy * reach;
      placed.push({ it, sx, sy, lx, ly, right });
    }
    // 标签矩形互相避让（主要沿纵向推开）
    const boxOf = (p) => {
      const x0 = p.right ? p.lx : p.lx - p.it.w;
      return [x0, p.ly - p.it.h / 2, x0 + p.it.w, p.ly + p.it.h / 2];
    };
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      placed.sort((a, b) => a.ly - b.ly);
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i], b = placed[j];
          const ra = boxOf(a), rb = boxOf(b);
          if (ra[0] > rb[2] + 4 || rb[0] > ra[2] + 4) continue;
          const overlap = Math.min(ra[3], rb[3]) - Math.max(ra[1], rb[1]) + 4;
          if (overlap > 0) {
            a.ly -= overlap / 2;
            b.ly += overlap / 2;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    for (const it of this.items) {
      const vis = !it.hidden;
      it.el.style.display = vis ? '' : 'none';
      it.line.style.display = vis ? '' : 'none';
      it.dot.style.display = vis ? '' : 'none';
    }
    for (const p of placed) {
      const { it } = p;
      let x = p.right ? p.lx : p.lx - it.w;
      let y = p.ly - it.h / 2;
      x = Math.max(4, Math.min(W - it.w - 4, x));
      y = Math.max(4, Math.min(H - it.h - 4, y));
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const ex = p.right ? x : x + it.w;
      const ey = y + it.h / 2;
      it.line.setAttribute('x1', p.sx.toFixed(1));
      it.line.setAttribute('y1', p.sy.toFixed(1));
      it.line.setAttribute('x2', ex.toFixed(1));
      it.line.setAttribute('y2', ey.toFixed(1));
      it.dot.setAttribute('cx', p.sx.toFixed(1));
      it.dot.setAttribute('cy', p.sy.toFixed(1));
    }
  }

  /** 字体或内容变化后重新测量尺寸 */
  remeasure() {
    for (const it of this.items) it.w = 0;
  }
}
