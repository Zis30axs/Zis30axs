// 材质：涂装（可切换三色迷彩）、橡胶、钢、玻璃、内部件等。
import * as THREE from 'three';

// 紧凑的 3D simplex 噪声（Ashima Arts, MIT）
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// 所有涂装材质共享的迷彩与风化参数
export const camoUniforms = {
  uCamoMix: { value: 0 },
  uCamo1: { value: new THREE.Color(0x4f5b35) }, // 4BO 绿
  uCamo2: { value: new THREE.Color(0x8c7b50) }, // 沙黄
  uCamo3: { value: new THREE.Color(0x24251f) }, // 黑
  uWear: { value: 1 },
  uDirt: { value: 0.55 },
  uDirtColor: { value: new THREE.Color(0x6e6048) },
};

/**
 * 涂装着色器：可切换的三色迷彩、细微的明暗不均、靠近地面的泥土、朝上表面的积尘；
 * cast = true 时模拟铸钢表面的粗糙起伏（用于铸造炮塔）。
 */
function applyPaintShader(mat, { cast = false } = {}) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, camoUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCamoPos;\nvarying vec3 vWPos;\nvarying float vUpN;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vCamoPos = position;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vUpN = normalize(mat3(modelMatrix) * objectNormal).y;`,
      );
    let frag = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCamoPos;
varying vec3 vWPos;
varying float vUpN;
uniform float uCamoMix; uniform vec3 uCamo1; uniform vec3 uCamo2; uniform vec3 uCamo3; uniform float uWear;
uniform float uDirt; uniform vec3 uDirtColor;
${NOISE_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 q = vCamoPos;
  float n = snoise(q * 0.55) * 0.65 + snoise(q * 1.4 + 7.3) * 0.35;
  float m = snoise(q * 0.5 + 19.1) * 0.7 + snoise(q * 1.7 - 3.1) * 0.3;
  vec3 camo = uCamo1;
  camo = mix(camo, uCamo2, smoothstep(0.30, 0.34, n));
  camo = mix(camo, uCamo3, smoothstep(0.38, 0.42, m));
  diffuseColor.rgb = mix(diffuseColor.rgb, camo, uCamoMix);
  // 细微的明暗不均
  float w = snoise(q * 6.0) * 0.5 + snoise(q * 22.0) * 0.25;
  diffuseColor.rgb *= 1.0 + w * 0.07 * uWear;
  // 泥土：越靠近地面越重，带斑驳噪声；朝上的表面积一层薄尘
  float dn = 0.55 + 0.45 * snoise(vWPos * 2.3 + 4.1);
  float dirt = (1.0 - smoothstep(0.15, 1.05, vWPos.y)) * dn;
  dirt += smoothstep(0.75, 1.0, vUpN) * 0.16 * (0.6 + 0.4 * snoise(vWPos * 3.1));
  diffuseColor.rgb = mix(diffuseColor.rgb, uDirtColor, clamp(dirt * uDirt, 0.0, 0.75));
}`,
      );
    if (cast) {
      frag = frag
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + snoise(vCamoPos * 9.0) * 0.07, 0.0, 1.0);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
{
  // 铸钢表面的细小起伏
  vec3 cp = vCamoPos * 24.0;
  vec3 nb = vec3(snoise(cp), snoise(cp + 11.7), snoise(cp + 23.1)) + 0.5 * vec3(snoise(cp * 2.3 + 5.0), snoise(cp * 2.3 + 17.0), snoise(cp * 2.3 + 31.0));
  normal = normalize(normal + nb * 0.035);
}`,
        );
    }
    shader.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => (cast ? 'paint-cast-v2' : 'paint-v2');
}

export function createMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);

  const paint = std({ color: 0x4f5b35, roughness: 0.78, metalness: 0.12 });
  applyPaintShader(paint);
  const paintCast = std({ color: 0x4f5b35, roughness: 0.84, metalness: 0.1 });
  applyPaintShader(paintCast, { cast: true });
  const paintDark = std({ color: 0x3c4629, roughness: 0.8, metalness: 0.12 });
  applyPaintShader(paintDark);
  const paintDarkDouble = std({ color: 0x353e25, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide });

  const m = {
    paint,
    paintCast,
    paintDark,
    paintDarkDouble,
    rubber: std({ color: 0x1f2120, roughness: 0.95, metalness: 0 }),
    skirt: std({ color: 0x2b2e28, roughness: 0.93, metalness: 0, side: THREE.DoubleSide }),
    cable: std({ color: 0x3a3833, roughness: 0.55, metalness: 0.7 }),
    redLens: std({ color: 0x8a1a12, roughness: 0.2, metalness: 0.1, emissive: 0x4a0a05, emissiveIntensity: 0.6 }),
    tarp: std({ color: 0x55573f, roughness: 0.98, metalness: 0 }),
    strap: std({ color: 0x3e3a2c, roughness: 0.9, metalness: 0 }),
    steel: std({ color: 0x6d6c66, roughness: 0.45, metalness: 0.75 }),
    trackSteel: std({ color: 0x3f3d39, roughness: 0.62, metalness: 0.7 }),
    darkMetal: std({ color: 0x2a2b28, roughness: 0.55, metalness: 0.6 }),
    glass: std({ color: 0x0b1820, roughness: 0.06, metalness: 0.9, emissive: 0x0d2a36, emissiveIntensity: 0.6 }),
    lens: std({ color: 0x1a0f08, roughness: 0.05, metalness: 1.0, emissive: 0x3a1a05, emissiveIntensity: 0.5 }),
    wood: std({ color: 0x6b5236, roughness: 0.9, metalness: 0 }),
    canvas: std({ color: 0x3b4130, roughness: 0.97, metalness: 0 }),
    light: std({ color: 0xf2efe0, roughness: 0.2, metalness: 0.2, emissive: 0x6d6a55, emissiveIntensity: 0.3 }),
    // 内部件
    interior: std({ color: 0x8fa69b, roughness: 0.7, metalness: 0.15 }),
    alum: std({ color: 0xa4a9ab, roughness: 0.42, metalness: 0.75 }),
    alumDouble: std({ color: 0x9aa0a2, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide }),
    brass: std({ color: 0x8f7843, roughness: 0.35, metalness: 0.85 }),
    chargeCase: std({ color: 0xb4a178, roughness: 0.85, metalness: 0 }),
    engine: std({ color: 0x8b8e87, roughness: 0.45, metalness: 0.7 }),
    engineHot: std({ color: 0x6d5a4a, roughness: 0.55, metalness: 0.6 }),
    fuel: std({ color: 0x6f7d6a, roughness: 0.6, metalness: 0.3 }),
    gearbox: std({ color: 0x5f6560, roughness: 0.5, metalness: 0.6 }),
    electronics: std({ color: 0x3c4a44, roughness: 0.6, metalness: 0.3 }),
    crew: std({ color: 0x2f3a45, roughness: 0.9, metalness: 0 }),
    skin: std({ color: 0xc8a288, roughness: 0.8, metalness: 0 }),
    helmet: std({ color: 0x252827, roughness: 0.85, metalness: 0 }),
    seat: std({ color: 0x3d3a33, roughness: 0.85, metalness: 0.05 }),
  };
  return m;
}

// 外部（会在 X 光下变透明）的材质键名
export const EXTERIOR_KEYS = ['paint', 'paintCast', 'paintDark', 'rubber', 'skirt', 'steel', 'trackSteel', 'darkMetal', 'glass', 'lens', 'wood', 'canvas', 'light', 'cable', 'redLens', 'tarp', 'strap'];
