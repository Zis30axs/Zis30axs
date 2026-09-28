// 装甲材料与分区数据（简化估算值，仅用于教学演示）。
// 每个分区给出沿表面法线的名义厚度（mm）分层；视线厚度 = 名义厚度 / cos(入射角)。
// ke / ce：对动能弹（穿甲弹）与化学能弹（破甲弹/导弹）的等效系数（相对轧制均质钢 RHA）。

export const ARMOR_MATERIALS = {
  rha: { name: '轧制均质钢', ke: 1.0, ce: 1.0 },
  cast: { name: '铸造装甲钢', ke: 0.94, ce: 0.94 },
  stb: { name: '玻璃纤维层压板 (STB)', ke: 0.5, ce: 1.3 },
  cell: { name: '胞状铸块填充层', ke: 0.6, ce: 1.8 },
  rubber: { name: '橡胶-织物', ke: 0.05, ce: 0.15 },
  alum: { name: '铝合金', ke: 0.35, ce: 0.5 },
  track: { name: '履带钢', ke: 0.8, ce: 0.8 },
  steelThin: { name: '结构钢', ke: 0.8, ce: 0.8 },
  era: { name: '接触-5 反应块', ke: 1.0, ce: 1.0 },
};

// era：爆炸反应装甲；boundary：乘员舱外壳（击穿后进入车内）；
// surface：几何体只是表面（厚度由数据给定），其“出射面”视为从内部命中对侧装甲；
// backing：热图估算时一并计入的后方装甲；gap：与后方装甲的间距（米，用于破甲射流衰减估算）。
export const ZONES = {
  hull_ufp: { name: '车体上装甲板', layers: [['rha', 80], ['stb', 105], ['rha', 20]], boundary: true },
  hull_lfp: { name: '车体下装甲板', layers: [['rha', 80]], boundary: true },
  dozer: { name: '推土铲', layers: [['rha', 20]], backing: 'hull_lfp', gap: 0.05 },
  hull_side: { name: '车体侧装甲', layers: [['rha', 80]], boundary: true },
  hull_side_rear: { name: '动力舱侧装甲', layers: [['rha', 60]], boundary: true },
  sponson_floor: { name: '翼子板底甲', layers: [['rha', 20]], boundary: true },
  hull_roof: { name: '车体顶装甲', layers: [['rha', 30]], boundary: true },
  engine_deck: { name: '动力舱顶盖', layers: [['rha', 20]], boundary: true },
  hull_rear: { name: '车体后装甲', layers: [['rha', 50]], boundary: true },
  hull_floor: { name: '车底装甲', layers: [['rha', 20]], boundary: true },

  turret_cheek: {
    name: '炮塔正面（复合装甲）',
    layers: [['cast', 150], ['cell', 330], ['cast', 100]],
    boundary: true,
    surface: true,
  },
  turret_front_center: { name: '炮塔正面炮口开口', layers: [['cast', 120]], boundary: true, surface: true },
  turret_side_front: { name: '炮塔侧面（前部）', layers: [['cast', 160]], boundary: true, surface: true },
  turret_side_rear: { name: '炮塔侧面（后部）', layers: [['cast', 110]], boundary: true, surface: true },
  turret_rear: { name: '炮塔后部', layers: [['cast', 65]], boundary: true, surface: true },
  turret_roof: { name: '炮塔顶装甲', layers: [['cast', 45]], boundary: true, surface: true },
  mantlet: { name: '火炮防盾', layers: [['cast', 180]], backing: 'turret_front_center', gap: 0.05 },
  cupola: { name: '车长指挥塔', layers: [['cast', 80]], boundary: true },

  era_turret: { name: '接触-5 反应装甲（炮塔）', layers: [['rha', 20]], era: true, backing: 'turret_cheek', gap: 0.15 },
  era_roof: { name: '接触-5 反应装甲（炮塔顶）', layers: [['rha', 12]], era: true, backing: 'turret_roof', gap: 0.05 },
  era_hull: { name: '接触-5 反应装甲（上装甲板）', layers: [['rha', 15]], era: true, backing: 'hull_ufp', gap: 0.02 },
  era_skirt: { name: '接触-5 反应装甲（侧裙）', layers: [['rha', 10]], era: true, backing: 'hull_side', gap: 0.55 },

  skirt: { name: '橡胶侧裙板', layers: [['rubber', 10]], backing: 'hull_side', gap: 0.6 },
  box: { name: '外部储物箱', layers: [['steelThin', 3]], backing: 'turret_side_rear', gap: 0.25 },
  hull_box: { name: '翼子板储物箱/油箱', layers: [['steelThin', 3]], backing: 'hull_side', gap: 0.3 },
  drum: { name: '外挂油桶', layers: [['steelThin', 2]], backing: 'hull_rear', gap: 0.3 },
  smoke: { name: '烟幕弹发射器', layers: [['rha', 5]], backing: 'turret_side_front', gap: 0.1 },
  sight_box: { name: '瞄准镜装甲罩', layers: [['rha', 30]], backing: 'turret_roof', gap: 0.05 },
  barrel: { name: '主炮身管', layers: [['rha', 30]] },
  track: { name: '履带', layers: [['track', 25]], backing: 'hull_side', gap: 0.3 },
  wheel: { name: '负重轮', layers: [['alum', 40]], backing: 'hull_side', gap: 0.3 },
  fitting: { name: '附件', layers: [['steelThin', 5]] },
};

/** 计算分区对某弹种类型（'ke' | 'ce'）的法向等效厚度（mm RHA）。 */
export function zoneNormalEq(zoneId, kind) {
  const z = ZONES[zoneId];
  if (!z) return 0;
  let s = 0;
  for (const [mat, t] of z.layers) s += t * ARMOR_MATERIALS[mat][kind];
  return s;
}

export function zoneNominal(zoneId) {
  const z = ZONES[zoneId];
  return z ? z.layers.reduce((s, [, t]) => s + t, 0) : 0;
}
