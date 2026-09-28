// 注册表：装甲网格、模块、爆炸图分组、零件信息。构建模型时由各部件函数填充。
import * as THREE from 'three';
import { MODULE_DEFS } from '../data/modules.js';

export class Registry {
  constructor() {
    /** 参与弹道分析的装甲网格（userData.zone 或 userData.zones） */
    this.armor = [];
    /** id → 模块对象 */
    this.modules = new Map();
    /** 模块根节点（射线检测时递归，命中后沿父级查找 userData.module） */
    this.moduleRoots = [];
    /** 爆炸图分组 */
    this.explode = [];
    /** 所有可拾取的网格（爆炸图点选） */
    this.parts = [];
    for (const d of MODULE_DEFS) {
      this.modules.set(d.id, { ...d, maxHp: d.hp, roots: [], state: 'ok' });
    }
  }

  armorMesh(mesh, zone) {
    mesh.userData.zone = zone;
    this.armor.push(mesh);
    return mesh;
  }

  /** 多分区网格：zones[materialIndex] = 分区 id */
  armorZones(mesh, zones) {
    mesh.userData.zones = zones;
    this.armor.push(mesh);
    return mesh;
  }

  module(id, obj) {
    const m = this.modules.get(id);
    if (!m) throw new Error('unknown module ' + id);
    obj.userData.module = id;
    m.roots.push(obj);
    this.moduleRoots.push(obj);
    return obj;
  }

  /**
   * 注册爆炸图分组。
   * @param {THREE.Object3D} obj 分组容器（其 position 会被改写）
   * @param {object} info {id, name, sub, desc, offset:[x,y,z], label?:[x,y,z] 局部坐标标注点}
   */
  explodeGroup(obj, info) {
    const g = {
      ...info,
      obj,
      base: obj.position.clone(),
      offset: new THREE.Vector3(...info.offset),
      labelAt: new THREE.Vector3(...(info.label || [0, 0, 0])),
    };
    obj.userData.explodeId = info.id;
    this.explode.push(g);
    return g;
  }
}

/** 创建带名字的网格并加入父级。 */
export function mk(parent, geo, mat, { pos, rot, name, cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  if (pos) mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  if (name) mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

export function group(parent, name, pos) {
  const g = new THREE.Group();
  g.name = name || '';
  if (pos) g.position.set(...pos);
  parent.add(g);
  return g;
}

/** 沿父级查找模块 id（以及弹药仓位信息） */
export function findModule(obj) {
  let o = obj;
  let cassette = null;
  while (o) {
    if (o.userData.cassette !== undefined && cassette === null) cassette = o.userData.cassette;
    if (o.userData.module) return { id: o.userData.module, cassette, rack: o.userData.rackItem ?? null };
    o = o.parent;
  }
  return null;
}
