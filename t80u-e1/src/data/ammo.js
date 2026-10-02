// 弹药数据（公开资料 / 游戏化近似值，仅用于教学演示）。
// kind: 'ke' 动能穿甲；'heat' 单级破甲；'tandem' 串联破甲（炮射导弹）；'he' 高爆。

export const AMMO = {
  '3BM46': {
    id: '3BM46',
    short: '3BM46',
    name: '3BM46 “铅-1”',
    type: '尾翼稳定脱壳穿甲弹 APFSDS',
    kind: 'ke',
    color: '#e0a33c',
    v0: 1700,
    pen: [
      [0, 532],
      [2000, 508],
    ],
    length: 0.74,
    desc: '贫铀合金长杆穿甲弹，弹丸全长约 740 mm。T-80U-E1 改进了装弹机，可以装填这种加长型穿甲弹。',
    rico: [76, 84],
  },
  '3BM42': {
    id: '3BM42',
    short: '3BM42',
    name: '3BM42 “芒果”',
    type: '尾翼稳定脱壳穿甲弹 APFSDS',
    kind: 'ke',
    color: '#c9763a',
    v0: 1700,
    pen: [
      [0, 457],
      [2000, 406],
    ],
    length: 0.574,
    desc: '钨合金弹芯穿甲弹，1986 年列装，弹丸全长约 574 mm，老式装弹机也能装填。',
    rico: [76, 84],
  },
  '3BK18M': {
    id: '3BK18M',
    short: '3BK18M',
    name: '3BK18M',
    type: '尾翼稳定破甲弹 HEAT-FS',
    kind: 'heat',
    color: '#4fb3a9',
    v0: 905,
    pen: [[0, 550]],
    length: 0.68,
    desc: '单级聚能装药破甲弹，破甲深度与射击距离无关。遇到“接触-5”爆炸反应装甲或侧裙间隙时效能会明显下降。',
    rico: [68, 78],
  },
  '3OF26': {
    id: '3OF26',
    short: '3OF26',
    name: '3OF26',
    type: '尾翼稳定杀伤爆破弹 HE-FRAG',
    kind: 'he',
    color: '#a3b152',
    v0: 850,
    pen: [[0, 42]],
    length: 0.67,
    desc: '装填约 3.4 kg A-IX-2 炸药，着发起爆。对主装甲几乎无效，但冲击波和破片可以破坏履带、观瞄设备和身管。',
    rico: [70, 80],
    blastR: 2.2,
  },
  '9M119M1': {
    id: '9M119M1',
    short: '9M119M1',
    name: '9M119M1 “英瓦尔-M”',
    type: '炮射激光驾束制导导弹 ATGM',
    kind: 'tandem',
    color: '#a58bd6',
    v0: 350,
    pen: [[0, 850]],
    length: 0.695,
    desc: '由主炮发射的激光驾束制导导弹，串联聚能战斗部：前置装药先引爆反应装甲，主装药再击穿主装甲。射程 100–5000 m。',
    rico: [72, 82],
    atgm: true,
  },
};

export const AMMO_ORDER = ['3BM46', '3BM42', '3BK18M', '3OF26', '9M119M1'];

/** 给定距离（m）的穿深（mm，0° 均质钢）。 */
export function penAt(ammo, dist) {
  const p = ammo.pen;
  if (p.length === 1) return p[0][1];
  const [[d0, p0], [d1, p1]] = p;
  return Math.max(0, p0 + ((p1 - p0) * (dist - d0)) / (d1 - d0));
}

/** 跳弹概率（线性插值）。 */
export function ricochetChance(ammo, angleDeg) {
  const [a, b] = ammo.rico;
  if (angleDeg <= a) return 0;
  if (angleDeg >= b) return 1;
  return (angleDeg - a) / (b - a);
}

// 转盘初始装填方案（28 发），按位置顺序
export const CAROUSEL_LAYOUT = (() => {
  const pattern = ['3BM46', '3BK18M', '3BM46', '3OF26', '3BM46', '3BM42', '3BK18M', '3BM46', '9M119M1', '3BM46', '3OF26', '3BM42', '3BK18M', '3BM46'];
  return [...pattern, ...pattern].slice(0, 28);
})();
