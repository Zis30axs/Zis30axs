// 内部/外部模块定义（用于模块损伤）。hp 为耐久值；kind 决定受损后的特殊效果。
export const MODULE_CATS = [
  ['crew', '乘员'],
  ['weapon', '武器'],
  ['ammo', '弹药'],
  ['mobility', '动力与行走'],
  ['fcs', '火控与观瞄'],
  ['other', '其他'],
];

export const MODULE_DEFS = [
  { id: 'driver', name: '驾驶员', cat: 'crew', hp: 100, kind: 'crew', absorb: 8 },
  { id: 'gunner', name: '炮手', cat: 'crew', hp: 100, kind: 'crew', absorb: 8 },
  { id: 'commander', name: '车长', cat: 'crew', hp: 100, kind: 'crew', absorb: 8 },

  { id: 'barrel', name: '主炮身管', cat: 'weapon', hp: 120, external: true, absorb: 40 },
  { id: 'breech', name: '炮尾与炮闩', cat: 'weapon', hp: 160, absorb: 60 },
  { id: 'coax', name: 'PKT 并列机枪', cat: 'weapon', hp: 40, absorb: 5 },
  { id: 'nsvt', name: 'NSVT 高射机枪', cat: 'weapon', hp: 40, external: true, absorb: 5 },
  { id: 'autoloader', name: '装弹机构（提升机/推弹机）', cat: 'weapon', hp: 120, absorb: 15 },

  { id: 'carousel', name: '转盘弹药（28 发）', cat: 'ammo', hp: 80, kind: 'ammo', absorb: 20, detonate: 0.55 },
  { id: 'rack_front', name: '前部油箱弹架', cat: 'ammo', hp: 60, kind: 'ammo', absorb: 20, detonate: 0.45 },
  { id: 'rack_fc', name: '战斗室弹架', cat: 'ammo', hp: 60, kind: 'ammo', absorb: 20, detonate: 0.5 },

  { id: 'engine', name: 'GTD-1250 燃气轮机', cat: 'mobility', hp: 180, absorb: 45, fire: 0.18 },
  { id: 'transmission', name: '行星变速箱（左/右）', cat: 'mobility', hp: 160, absorb: 50 },
  { id: 'fuel_front', name: '前部油箱（油箱弹架）', cat: 'mobility', hp: 120, kind: 'fuel', absorb: 35, fire: 0.22 },
  { id: 'fuel_rear', name: '动力舱油箱', cat: 'mobility', hp: 120, kind: 'fuel', absorb: 35, fire: 0.28 },
  { id: 'track_l', name: '左侧履带与行走装置', cat: 'mobility', hp: 90, external: true, absorb: 20 },
  { id: 'track_r', name: '右侧履带与行走装置', cat: 'mobility', hp: 90, external: true, absorb: 20 },
  { id: 'apu', name: 'GTA-18A 辅助动力装置', cat: 'mobility', hp: 60, absorb: 15, fire: 0.1 },

  { id: 'gunner_sight', name: '炮手瞄准镜（1G46 / 热像仪）', cat: 'fcs', hp: 60, external: true, absorb: 10 },
  { id: 'cmdr_sight', name: '车长观瞄装置', cat: 'fcs', hp: 50, external: true, absorb: 8 },
  { id: 'traverse', name: '炮塔方向机', cat: 'fcs', hp: 80, absorb: 20 },
  { id: 'elevation', name: '火炮高低机', cat: 'fcs', hp: 80, absorb: 20 },
  { id: 'fcs', name: '弹道计算机与稳定器', cat: 'fcs', hp: 60, absorb: 10 },

  { id: 'radio', name: '电台', cat: 'other', hp: 50, absorb: 10 },
  { id: 'batteries', name: '蓄电池组', cat: 'other', hp: 60, absorb: 15 },
];
