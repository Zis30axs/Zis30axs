// 轻量补间与缓动。
export const Ease = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
};

export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** 把全局进度 t 映射到子区间 [a,b] 内的 0..1 */
export const seg = (t, a, b) => clamp01((t - a) / (b - a));
export const lerp = (a, b, t) => a + (b - a) * t;

export class Tweens {
  constructor() {
    this.list = [];
  }
  add(duration, update, { ease = Ease.inOut, delay = 0, onDone } = {}) {
    const tw = { t: -delay, duration: Math.max(1e-4, duration), update, ease, onDone, dead: false };
    this.list.push(tw);
    return tw;
  }
  to(duration, update, opts = {}) {
    return new Promise((resolve) => this.add(duration, update, { ...opts, onDone: resolve }));
  }
  cancel(tw) {
    if (tw) tw.dead = true;
  }
  update(dt) {
    for (const tw of this.list) {
      if (tw.dead) continue;
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.duration);
      tw.update(tw.ease(k), k);
      if (k >= 1) {
        tw.dead = true;
        tw.onDone?.();
      }
    }
    if (this.list.some((t) => t.dead)) this.list = this.list.filter((t) => !t.dead);
  }
}
