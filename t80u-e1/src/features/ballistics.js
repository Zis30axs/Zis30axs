// 弹道与终点效应计算：沿射线穿过各装甲分区，计算入射角、视线厚度、等效厚度、
// 反应装甲与间隙效应、跳弹概率，击穿后生成破片锥并判定模块损伤。
import * as THREE from 'three';
import { ZONES, ARMOR_MATERIALS } from '../data/armor.js';
import { penAt, ricochetChance } from '../data/ammo.js';
import { findModule } from '../tank/registry.js';

const DEG = 180 / Math.PI;
const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = false;

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** “接触-5”对不同弹种的削弱比例（对穿甲弹依赖倾角） */
export function eraReduction(ammo, angleDeg) {
  switch (ammo.kind) {
    case 'ke':
      return 0.32 * smoothstep(8, 35, angleDeg);
    case 'heat':
      return 0.6;
    case 'tandem':
      return 0.05;
    default:
      return 0;
  }
}

export const kindKey = (ammo) => (ammo.kind === 'ke' || ammo.kind === 'he' ? 'ke' : 'ce');
/** 破甲射流在空气间隙中的衰减（每米） */
export const JET_AIR_LOSS = 0.3;

function isVisible(o) {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

function zoneOfHit(h) {
  const u = h.object.userData;
  if (u.zones) return u.zones[h.face.materialIndex] ?? u.zones[0];
  return u.zone;
}

const _m4 = new THREE.Matrix4();
const _n3 = new THREE.Matrix3();
function worldNormal(h) {
  const n = h.face.normal.clone();
  if (h.object.isInstancedMesh && h.instanceId !== undefined) {
    h.object.getMatrixAt(h.instanceId, _m4);
    _m4.premultiply(h.object.matrixWorld);
  } else _m4.copy(h.object.matrixWorld);
  _n3.getNormalMatrix(_m4);
  return n.applyMatrix3(_n3).normalize();
}

/** 在射线检测期间把相关材质临时设为双面，以便检测到出射面 */
function withDoubleSide(objects, fn) {
  const changed = [];
  const visit = (m) => {
    if (m && m.side !== THREE.DoubleSide) {
      changed.push([m, m.side]);
      m.side = THREE.DoubleSide;
    }
  };
  for (const o of objects) {
    o.traverse((x) => {
      if (!x.isMesh) return;
      if (Array.isArray(x.material)) x.material.forEach(visit);
      else visit(x.material);
    });
  }
  try {
    return fn();
  } finally {
    for (const [m, s] of changed) m.side = s;
  }
}

function collectHits(reg, origin, dir, far = 40) {
  raycaster.set(origin, dir);
  raycaster.near = 0;
  raycaster.far = far;
  const hits = [];
  for (const h of raycaster.intersectObjects(reg.armor, false)) {
    if (!isVisible(h.object)) continue;
    h.kind = 'armor';
    hits.push(h);
  }
  for (const h of raycaster.intersectObjects(reg.moduleRoots, true)) {
    if (!isVisible(h.object)) continue;
    const mod = findModule(h.object);
    if (!mod) continue;
    h.kind = 'module';
    h.mod = mod;
    hits.push(h);
  }
  hits.sort((a, b) => a.distance - b.distance);
  return hits;
}

/**
 * 追踪一发弹。
 * @param {object} ctx {reg, ammo, distance, dryRun, rng}
 * outcome: 'miss' 未命中 | 'ricochet' 跳弹 | 'stopped' 未击穿 | 'penetrated' 击穿 | 'overpen' 贯穿车体
 *        | 'nohull' 只穿过外挂件 | 'module' 只命中外部模块 | 'he_blast' 高爆弹外部爆炸 | 'he_pen' 高爆弹击穿
 */
export function traceShot(ctx, origin, dir) {
  const { reg, ammo } = ctx;
  const rng = ctx.rng || Math.random;
  const kind = kindKey(ammo);
  const pen0 = penAt(ammo, ctx.distance);
  const res = {
    ammo,
    pen0,
    pen: pen0,
    origin: origin.clone(),
    dir: dir.clone(),
    entry: null,
    layers: [],
    eraHits: [],
    outcome: 'miss',
    ricochetChance: 0,
    resist: 0,
    boundary: null,
    stop: null,
    moduleHits: [],
    exitPoint: null,
    spallOrigin: null,
    penAtBoundary: 0,
  };
  const reachable = [...reg.armor, ...reg.moduleRoots];
  withDoubleSide(reachable, () => {
    const hits = collectHits(reg, origin, dir);
    let pen = pen0;
    let inside = false;
    let fuzed = false;
    let lastExit = null;
    let resist = 0;
    let resistFrozen = false;
    const entered = new Set();
    const modSeen = new Set();
    const addResist = (x) => {
      if (!resistFrozen) resist += x;
    };
    const jetGap = (point, zone) => {
      if (!(fuzed && ammo.kind !== 'ke' && lastExit)) return;
      const gap = lastExit.distanceTo(point);
      if (gap > 0.02) {
        const before = pen;
        pen *= Math.max(0, 1 - JET_AIR_LOSS * gap);
        const row = { type: 'gap', zone, name: '空气间隙', gap, eq: before - pen, inside };
        res.layers.push(row);
        addResist(row.eq);
      }
    };
    const recordModule = (h, info) => {
      const def = reg.modules.get(info.id);
      const key = info.id + ':' + (info.cassette ?? '') + ':' + h.object.id + ':' + (h.instanceId ?? '');
      if (!def || modSeen.has(key)) return null;
      modSeen.add(key);
      const hit = { id: info.id, cassette: info.cassette, object: h.object, instanceId: h.instanceId, point: h.point.clone(), by: 'main', pen };
      res.moduleHits.push(hit);
      return def;
    };

    for (const h of hits) {
      if (h.kind === 'module') {
        // 同时是装甲的网格在装甲分支中处理
        if (h.object.userData.zone || h.object.userData.zones) continue;
        const def = reg.modules.get(h.mod.id);
        if (!def || (!inside && !def.external)) continue;
        if (ammo.kind === 'he') continue;
        jetGap(h.point, null);
        lastExit = h.point.clone();
        if (!recordModule(h, h.mod)) continue;
        if (!res.entry) {
          res.entry = { point: h.point.clone(), normal: worldNormal(h), zone: null, module: h.mod.id, angle: 0, object: h.object };
          fuzed = ammo.kind !== 'ke';
        }
        pen -= (def.absorb || 10) * (kind === 'ke' ? 1 : 1.4);
        if (pen <= 0) {
          pen = 0;
          res.stop = { point: h.point.clone(), module: h.mod.id };
          res.outcome = inside ? 'penetrated' : 'module';
          break;
        }
        continue;
      }

      // —— 装甲 ——
      const mesh = h.object;
      const zoneId = zoneOfHit(h);
      const zone = ZONES[zoneId];
      if (!zone) continue;
      const n = worldNormal(h);
      let cosI = -n.dot(dir);
      const key = mesh.id + ':' + (h.instanceId ?? '');
      let farWall = false;
      if (cosI <= 0) {
        // 出射面：已进入的实体板件直接跳过；“表面型”炮塔外壳的出射面相当于从内部命中对侧装甲
        if (entered.has(key)) {
          entered.delete(key);
          continue;
        }
        if (zone.surface && inside) {
          farWall = true;
          cosI = -cosI;
        } else continue;
      }
      if (inside && zone.boundary) farWall = true;
      const angle = Math.acos(Math.min(1, cosI)) * DEG;

      if (!res.entry) {
        res.entry = { point: h.point.clone(), normal: n.clone(), zone: zoneId, angle, object: mesh, instanceId: h.instanceId };
        res.ricochetChance = ricochetChance(ammo, angle);
        if (!ctx.dryRun && res.ricochetChance > 0 && rng() < res.ricochetChance) {
          res.outcome = 'ricochet';
          res.stop = { point: h.point.clone(), zone: zoneId };
          return;
        }
        if (ammo.kind !== 'ke') fuzed = true;
        if (ammo.kind === 'he') {
          // 高爆弹：着发起爆；只有很薄的主装甲会被冲击波击穿
          let eq = 0;
          for (const [mat, t] of zone.layers) {
            const row = layerRow(zoneId, mat, t, cosI, ammo);
            res.layers.push(row);
            eq += row.eq;
          }
          res.resist = eq;
          if (pen >= eq && zone.boundary) {
            res.outcome = 'he_pen';
            res.boundary = { zone: zoneId, point: h.point.clone() };
            res.spallOrigin = h.point.clone().addScaledVector(dir, 0.12);
          } else res.outcome = 'he_blast';
          res.stop = { point: h.point.clone(), zone: zoneId };
          res.pen = Math.max(0, pen - eq);
          return;
        }
      } else jetGap(h.point, zoneId);

      const penBefore = pen;
      // 爆炸反应装甲
      if (zone.era) {
        const red = eraReduction(ammo, angle);
        pen *= 1 - red;
        const row = { type: 'era', zone: zoneId, name: zone.name, red, eq: penBefore - pen, angle };
        res.layers.push(row);
        addResist(row.eq);
        res.eraHits.push(mesh);
      }
      // 各层视线厚度与等效厚度
      let eq = 0, los = 0;
      for (const [mat, t] of zone.layers) {
        const row = layerRow(zoneId, mat, t, cosI, ammo);
        row.farWall = farWall;
        row.angle = angle;
        res.layers.push(row);
        eq += row.eq;
        los += row.los;
      }
      addResist(eq);
      // 外部模块（履带、负重轮、身管……）同时作为装甲
      const modInfo = findModule(mesh);
      if (modInfo && (inside || reg.modules.get(modInfo.id)?.external)) recordModule(h, modInfo);

      if (pen >= eq) {
        pen -= eq;
        const exit = h.point.clone().addScaledVector(dir, los / 1000);
        lastExit = exit;
        if (!zone.surface) entered.add(key);
        if (farWall) {
          res.exitPoint = exit;
          res.outcome = 'overpen';
          break;
        }
        if (zone.boundary && !inside) {
          inside = true;
          resistFrozen = true;
          res.boundary = { zone: zoneId, point: h.point.clone(), angle };
          res.spallOrigin = exit.clone().addScaledVector(dir, 0.03);
          res.penAtBoundary = pen;
        }
      } else {
        const frac = pen / Math.max(eq, 1);
        res.stop = { point: h.point.clone().addScaledVector(dir, (los / 1000) * frac), zone: zoneId, farWall };
        pen = 0;
        resistFrozen = true;
        res.outcome = inside ? 'penetrated' : 'stopped';
        break;
      }
    }
    res.pen = pen;
    res.resist = resist;
    if (res.outcome === 'miss' && res.entry) res.outcome = inside ? 'penetrated' : res.entry.module ? 'module' : 'nohull';
  });
  return res;
}

function layerRow(zoneId, mat, t, cosI, ammo) {
  const los = t / Math.max(cosI, 0.06);
  const f = ARMOR_MATERIALS[mat][kindKey(ammo)];
  return { type: 'layer', zone: zoneId, mat, matName: ARMOR_MATERIALS[mat].name, t, los, eq: los * f, f };
}

/**
 * 击穿后的破片锥。返回每条破片的路径与命中的模块。
 */
export function spallCone(ctx, origin, dir, { count, cone, energy, maxLen = 3.2 }) {
  const { reg } = ctx;
  const rng = ctx.rng || Math.random;
  const frags = [];
  const up = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(dir, up).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u).normalize();
  const coneRad = cone / DEG;
  const reachable = [...reg.armor, ...reg.moduleRoots];
  withDoubleSide(reachable, () => {
    for (let i = 0; i < count; i++) {
      // 在锥内均匀取方向
      const cosT = 1 - rng() * (1 - Math.cos(coneRad));
      const sinT = Math.sqrt(1 - cosT * cosT);
      const phi = rng() * Math.PI * 2;
      const d = dir.clone().multiplyScalar(cosT).addScaledVector(u, Math.cos(phi) * sinT).addScaledVector(v, Math.sin(phi) * sinT).normalize();
      let e = energy * (0.35 + rng() * 0.65);
      const hits = collectHits(reg, origin, d, maxLen);
      const frag = { from: origin.clone(), to: origin.clone().addScaledVector(d, maxLen), hits: [] };
      const seen = new Set();
      for (const h of hits) {
        if (h.kind === 'armor') {
          frag.to = h.point.clone();
          break;
        }
        const def = reg.modules.get(h.mod.id);
        const key = h.mod.id + ':' + (h.mod.cassette ?? '') + ':' + h.object.id;
        if (!def || seen.has(key)) continue;
        seen.add(key);
        frag.hits.push({ id: h.mod.id, cassette: h.mod.cassette, object: h.object, point: h.point.clone(), energy: e });
        e -= (def.absorb || 10) * 0.9;
        if (def.kind === 'fuel' && rng() < 0.6) e = 0;
        if (e <= 4) {
          frag.to = h.point.clone();
          break;
        }
      }
      frags.push(frag);
    }
  });
  return frags;
}
