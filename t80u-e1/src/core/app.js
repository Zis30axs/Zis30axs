// 应用主体：渲染器、场景、相机、交互分发、模式切换与主题。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildTank } from '../tank/tank.js';
import { Effects } from './effects.js';
import { Tweens, Ease } from './tween.js';
import { Labels } from './labels.js';
import { XRay } from '../features/xray.js';
import { DamageModel } from '../features/damage.js';
import { OverviewMode } from '../features/overview.js';
import { ExplodeMode } from '../features/explode.js';
import { LoaderMode } from '../features/loader.js';
import { AnalysisMode } from '../features/analysis.js';
import { DamageMode } from '../features/damage-mode.js';
import { Shooter } from '../features/shooter.js';

const MOBILE_Q = window.matchMedia('(max-width: 760px)');

export class App {
  constructor(root) {
    this.root = root;
    this.viewport = root.querySelector('#viewport');
    this.canvas = root.querySelector('#scene');
    this.panel = root.querySelector('#panel');
    this.panelBody = root.querySelector('#panelBody');
    this.hud = root.querySelector('#hud');
    this.toastEl = root.querySelector('#toast');
    this.timer = new THREE.Timer();
    this.time = 0;

    this.initRenderer();
    this.initScene();
    this.tank = buildTank();
    this.scene.add(this.tank.root);
    this.effects = new Effects(this.scene);
    this.tweens = new Tweens();
    this.labels = new Labels(root.querySelector('#labels'), root.querySelector('#leaders'), this.camera);
    this.labels.setOpacity(0);
    this.xray = new XRay(this.tank);
    this.damage = new DamageModel(this);
    this.readTheme();
    this.shooter = new Shooter(this);

    this.modes = {
      overview: new OverviewMode(this),
      explode: new ExplodeMode(this),
      loader: new LoaderMode(this),
      analysis: new AnalysisMode(this),
      damage: new DamageMode(this),
    };
    this.mode = null;
    this.bindUI();
    this.onResize();
    this.tick = this.tick.bind(this);
  }

  initRenderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.setClearColor(0x000000, 0);
    this.renderer = r;
  }

  initScene() {
    const scene = new THREE.Scene();
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 500);
    this.camera.position.set(8.2, 4.4, 8.8);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0.4, 1.1, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 32;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.screenSpacePanning = true;

    const hemi = new THREE.HemisphereLight(0xe4ecf2, 0x3b3a30, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.position.set(7, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -8;
    sc.right = 8;
    sc.top = 8;
    sc.bottom = -8;
    sc.near = 1;
    sc.far = 40;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    scene.add(sun);
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0xc8d6ff, 0.5);
    fill.position.set(-8, 5, -6);
    scene.add(fill);

    // 地面：阴影接收面 + 渐隐网格
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.32 }));
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    shadowPlane.raycast = () => {};
    scene.add(shadowPlane);
    this.shadowPlane = shadowPlane;
    this.gridUniforms = { uColor: { value: new THREE.Color(0x3a4640) }, uColor2: { value: new THREE.Color(0x56645c) }, uFade: { value: 16 } };
    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: this.gridUniforms,
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
        fragmentShader: /* glsl */ `
          varying vec3 vW;
          uniform vec3 uColor; uniform vec3 uColor2; uniform float uFade;
          float line(vec2 p, float s, float w) {
            vec2 g = abs(fract(p / s - 0.5) - 0.5) * s / fwidth(p);
            return 1.0 - min(min(g.x, g.y) / w, 1.0);
          }
          void main() {
            vec2 p = vW.xz;
            float major = line(p, 5.0, 1.2);
            float a = line(p, 1.0, 1.0) * 0.35 + major * 0.6;
            float d = length(p) / uFade;
            float f = clamp(1.0 - d * d, 0.0, 1.0);
            gl_FragColor = vec4(mix(uColor, uColor2, major), a * f * 0.8);
            #include <colorspace_fragment>
          }`,
      }),
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.002;
    grid.raycast = () => {};
    scene.add(grid);
    this.grid = grid;
  }

  readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const get = (k, d) => (cs.getPropertyValue(k).trim() || d);
    this.gridUniforms.uColor.value.set(get('--scene-grid', '#3a4640'));
    this.gridUniforms.uColor2.value.set(get('--scene-grid-2', '#56645c'));
    this.shadowPlane.material.opacity = parseFloat(get('--scene-shadow', '0.32'));
    this.xray.setEdgeColor(get('--xray-edge', '#9fb7ad'));
    this.themeColors = {
      ok: get('--ok', '#4cb176'),
      warn: get('--warn', '#e3b341'),
      bad: get('--bad', '#e5534b'),
      rico: get('--rico', '#6c8fc7'),
      accent: get('--accent', '#e2873a'),
    };
    this.modes && Object.values(this.modes).forEach((m) => m.onTheme?.());
  }

  bindUI() {
    // 模式切换
    this.tabs = [...this.root.querySelectorAll('[data-mode]')];
    for (const b of this.tabs) b.addEventListener('click', () => this.setMode(b.dataset.mode));
    // 面板折叠（手机底部抽屉）
    const toggle = this.root.querySelector('#panelToggle');
    toggle.addEventListener('click', () => {
      const collapsed = this.panel.classList.toggle('is-collapsed');
      this.root.classList.toggle('panel-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.querySelector('span').textContent = collapsed ? '展开面板' : '收起面板';
      this.onResize();
    });
    // 视图工具
    this.root.querySelector('#btnResetView').addEventListener('click', () => this.mode?.resetView?.());
    this.root.querySelector('#btnTheme').addEventListener('click', () => this.cycleTheme());

    window.addEventListener('resize', () => this.onResize());
    MOBILE_Q.addEventListener?.('change', () => this.onResize());
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.readTheme());
    new MutationObserver(() => this.readTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // 指针：区分点击与拖动
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved < 6 && dt < 700) this.mode?.onClick?.(this.ndc(e), e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      this.mode?.onPointerMove?.(this.ndc(e), e);
    });
    this.canvas.addEventListener('pointerleave', () => this.mode?.onPointerLeave?.());
    window.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return;
      this.mode?.onKey?.(e);
    });
  }

  cycleTheme() {
    const el = document.documentElement;
    const cur = el.getAttribute('data-theme');
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = cur ? (cur === 'dark' ? 'light' : 'dark') : sysDark ? 'light' : 'dark';
    el.setAttribute('data-theme', next);
    try {
      localStorage.setItem('t80-theme', next);
    } catch {
      /* 忽略存储不可用 */
    }
  }

  ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  get isMobile() {
    return MOBILE_Q.matches;
  }

  onResize() {
    const w = this.viewport.clientWidth, h = this.viewport.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 让模型在未被面板遮挡的区域居中
    let ox = 0, oy = 0;
    if (this.isMobile) {
      const ph = this.panel.getBoundingClientRect().height;
      oy = Math.min(h * 0.4, ph * 0.5);
    } else {
      const pw = this.panel.getBoundingClientRect().width;
      ox = Math.min(w * 0.3, (pw + 16) * 0.5);
    }
    this.viewOffset = { x: ox, y: oy };
    if (ox || oy) this.camera.setViewOffset(w, h, ox, oy, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.labels.remeasure();
  }

  setMode(name) {
    if (!this.modes[name]) name = 'overview';
    if (this.mode === this.modes[name]) return;
    const prev = this.mode;
    prev?.exit?.();
    this.mode = this.modes[name];
    this.modeName = name;
    for (const b of this.tabs) {
      const on = b.dataset.mode === name;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    this.root.dataset.mode = name;
    this.hud.innerHTML = '';
    this.panelBody.scrollTop = 0;
    this.mode.enter(prev);
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
    requestAnimationFrame(() => this.onResize());
  }

  /** 竖屏等窄视口下把相机沿视线方向拉远，保证模型完整入画 */
  fitPos(pos, target) {
    const p = new THREE.Vector3(...pos), t = new THREE.Vector3(...target);
    let w = this.viewport.clientWidth, h = this.viewport.clientHeight;
    if (this.isMobile) {
      if (!this.panel.classList.contains('is-collapsed')) h -= this.panel.getBoundingClientRect().height;
    } else w -= this.panel.getBoundingClientRect().width + 24;
    const aspect = Math.max(1, w) / Math.max(1, h);
    if (aspect < 1.25) {
      const k = Math.min(2.3, Math.pow(1.25 / aspect, 0.75));
      p.sub(t).multiplyScalar(k).add(t);
    }
    return p;
  }

  /** 平滑移动相机 */
  flyTo(pos, target, dur = 1.1) {
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone();
    const p1 = this.fitPos(pos, target), t1 = new THREE.Vector3(...target);
    if (this._fly) this.tweens.cancel(this._fly);
    this._fly = this.tweens.add(
      dur,
      (k) => {
        this.camera.position.lerpVectors(p0, p1, k);
        this.controls.target.lerpVectors(t0, t1, k);
      },
      { ease: Ease.inOut },
    );
  }

  toast(msg, kind = 'info', ms = 2600) {
    const el = this.toastEl;
    el.textContent = msg;
    el.dataset.kind = kind;
    el.classList.add('is-on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('is-on'), ms);
  }

  start() {
    let initial = location.hash.slice(1);
    if (!this.modes[initial]) initial = 'overview';
    this.setMode(initial);
    this.root.querySelector('#loading')?.remove();
    requestAnimationFrame(this.tick);
  }

  /** 调试/测试用：以固定步长推进仿真 sec 秒（不渲染） */
  simulate(sec, step = 1 / 30) {
    for (let t = 0; t < sec; t += step) {
      this.time += step;
      this.tweens.update(step);
      this.mode?.update?.(step);
      this.damage.update(step);
      this.effects.update(step);
      this.controls.update();
    }
    this.labels.update();
  }

  tick() {
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    this.time += dt;
    this.tweens.update(dt);
    this.mode?.update?.(dt);
    this.damage.update(dt);
    this.effects.update(dt);
    this.controls.update();
    this.labels.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.tick);
  }
}
