// T-80U-E1 主要尺寸（米）。车体坐标系：+X 向前，+Y 向上，+Z 指向车体右侧，原点在地面投影中心。
// 数值依据公开资料（车体长约 7.0 m，全宽约 3.6 m，全高约 2.2 m，离地间隙约 0.45 m）做了简化。
export const DEG = Math.PI / 180;

export const HULL = {
  belly: 0.45, // 车底离地
  sponsonFloor: 0.98, // 翼子板（悬伸部）底面
  roof: 1.42, // 车体顶甲
  halfIn: 1.08, // 下车体半宽（两条履带之间）
  halfOut: 1.7, // 上车体半宽（含翼子板；加侧裙全宽约 3.56 m）
  noseX: 3.45,
  noseY: 0.86,
  ufpSlope: 22 * DEG, // 上装甲板与水平面夹角（即与铅垂线 68°）
  lfpSlope: 30 * DEG, // 下装甲板与水平面夹角（与铅垂线 60°）
  rearTopX: -3.4,
  rearKneeX: -3.5,
  rearKneeY: 0.8,
  rearBottomX: -3.28,
  bulkheadX: -1.25, // 动力舱隔板
};
HULL.ufpTopX = HULL.noseX - (HULL.roof - HULL.noseY) / Math.tan(HULL.ufpSlope);
HULL.lfpBottomX = HULL.noseX - (HULL.noseY - HULL.belly) / Math.tan(HULL.lfpSlope);
HULL.ufpXAt = (y) => HULL.noseX - (y - HULL.noseY) / Math.tan(HULL.ufpSlope);
HULL.rearXAt = (y) => HULL.rearTopX + ((HULL.rearKneeX - HULL.rearTopX) * (HULL.roof - y)) / (HULL.roof - HULL.rearKneeY);

export const TURRET = {
  x: 0.05, // 座圈中心 X
  ringR: 1.08, // 座圈半径（约 2.16 m 直径）
};

export const GUN = {
  trunnion: [0.72, 0.42], // 耳轴（炮塔坐标）
  breechFace: -0.8, // 炮尾环后端面，沿炮轴（相对耳轴）
  breechFront: -0.2, // 炮尾环前端（身管起点）
  chamberRear: -0.48, // 药室后端（输弹到位后药筒底托所在位置，炮闩前面）
  muzzle: 5.35, // 炮口（相对耳轴），2A46M-4 身管长约 6 m
  loadAngle: 3 * DEG, // 固定装填角（示意）
  minElev: -5 * DEG,
  maxElev: 15 * DEG,
  recoil: 0.3,
};

export const RUNNING = {
  trackZ: 1.4, // 履带中心线
  trackW: 0.58,
  trackT: 0.07,
  wheelR: 0.335,
  wheelY: 0.405,
  wheelXs: [2.02, 1.24, 0.46, -0.32, -1.1, -1.88],
  idler: { x: 2.98, y: 0.56, r: 0.29 },
  sprocket: { x: -3.02, y: 0.58, r: 0.31 },
  rollerR: 0.1,
  rollerY: 0.8,
  rollerXs: [1.72, 0.85, -0.02, -0.89, -1.76],
};

// 自动装弹机（Korzina 转盘式）
export const LOADER = {
  slots: 28,
  hingeR: 0.87, // 铰链（弹丸底端）半径
  floorY: -0.92, // 转盘底面（炮塔坐标，座圈平面为 0）
  axisH: 0.075, // 弹丸轴线距托盘底高度
  chargeLen: 0.42,
  chargeR: 0.077,
  chargeGap: 0.085, // 药筒立放时底端与弹轴的间距
  rotSpeed: 26 * DEG, // 转盘转速 26°/s
};
