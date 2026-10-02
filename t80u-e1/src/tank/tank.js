// 组装整车，返回场景对象与各子系统的引用。
import * as THREE from 'three';
import { createMaterials, EXTERIOR_KEYS } from './materials.js';
import { Registry } from './registry.js';
import { buildHull } from './hull.js';
import { buildRunningGear } from './running-gear.js';
import { buildTurretShell, buildTurretFittings } from './turret.js';
import { buildGun } from './gun.js';
import { buildAutoloader } from './autoloader.js';
import { buildInternals } from './internals.js';
import { HULL, TURRET, GUN } from './dims.js';

export function buildTank() {
  const M = createMaterials();
  const reg = new Registry();
  const root = new THREE.Group();
  root.name = 'T-80U-E1';

  const hull = buildHull(root, reg, M);
  const running = buildRunningGear(hull.hull, reg, M);

  // 座圈（车体上的环形座圈，可在拆解图中看到）
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(TURRET.ringR + 0.02, TURRET.ringR + 0.02, 0.06, 64, 1, true), M.steel);
  ring.material = M.steel;
  ring.position.set(TURRET.x, HULL.roof - 0.02, 0);
  hull.body.add(ring);

  const turretYaw = new THREE.Group();
  turretYaw.name = 'turretYaw';
  turretYaw.position.set(TURRET.x, HULL.roof, 0);
  root.add(turretYaw);
  const turret = new THREE.Group();
  turret.name = 'turret';
  turretYaw.add(turret);

  const shell = buildTurretShell(turret, reg, M);
  // 炮塔底部环形底板（封闭座圈外的空腔）
  const bottomShape = new THREE.Shape(shell.rings[0].map((p) => new THREE.Vector2(p.x, -p.z)));
  const hole = new THREE.Path();
  hole.absarc(0, 0, TURRET.ringR - 0.02, 0, Math.PI * 2, true);
  bottomShape.holes.push(hole);
  const bottom = new THREE.Mesh(new THREE.ShapeGeometry(bottomShape, 48), M.paintDark);
  bottom.material = M.paintDarkDouble;
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = shell.rings[0][0].y + 0.001;
  turret.add(bottom);

  const fittings = buildTurretFittings(turret, reg, M);
  const gun = buildGun(turret, reg, M);
  const loader = buildAutoloader(turretYaw, turret, gun, reg, M);
  const internals = buildInternals(hull.hull, turretYaw, turret, reg, M);

  reg.explodeGroup(turret, {
    id: 'turret',
    name: '铸造炮塔',
    sub: '源自 T-80UD · 复合装甲',
    desc: 'T-80U-E1 将退役 T-80UD 的炮塔装到 T-80BV 车体上。铸造炮塔正面两侧内嵌胞状填充块复合装甲，外挂“接触-5”；炮手在左、车长在右。',
    offset: [0, 3.05, 0],
    label: [-0.9, 0.62, -0.7],
  });

  // 投影
  root.traverse((o) => {
    if (o.isMesh && o.castShadow === undefined) o.castShadow = true;
  });

  const exteriorMaterials = EXTERIOR_KEYS.map((k) => M[k]).concat([M.paintDarkDouble]);

  const api = {
    root,
    reg,
    M,
    hull,
    running,
    turretYaw,
    turret,
    shell,
    fittings,
    gun,
    loader,
    internals,
    exteriorMaterials,
    yaw: 0,
    elevation: 0,
    setTurretYaw(a) {
      this.yaw = a;
      turretYaw.rotation.y = a;
    },
    setGunElevation(e) {
      this.elevation = THREE.MathUtils.clamp(e, GUN.minElev, GUN.maxElev);
      gun.pitch.rotation.z = this.elevation;
    },
  };
  return api;
}
