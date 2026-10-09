import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const V3 = THREE.Vector3, { lerp, clamp } = THREE.MathUtils, D2R = Math.PI / 180;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function pw(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) if (x <= pts[k][0]) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], t = (x - x0) / (x1 - x0);
    return y0 + (y1 - y0) * t * t * (3 - 2 * t);
  }
  return pts[pts.length - 1][1];
}

/* ---------- the stretch: a pointed pull riding on a broad drag, done in the vertex shader ---------- */
const SLOTS = 3;
const GLSL_V = `
uniform vec3 uGp[${SLOTS}]; uniform vec3 uGa[${SLOTS}]; uniform vec3 uGb[${SLOTS}];
uniform float uLoose; uniform float uRigid; uniform vec3 uPivot; uniform mat3 uRot; uniform vec3 uShift;
vec3 clayAxis; float clayAmp;
void clayDeform(inout vec3 p, inout vec3 n) {
  p = uPivot + uRot * (p - uPivot) + uShift; n = uRot * n;
  vec3 q = mix(p, uPivot, uRigid), n0 = n;
  float anchor = smoothstep(-2.4, -1.15, q.y);
  clayAxis = vec3(0.0); clayAmp = 0.0;
  for (int k = 0; k < ${SLOTS}; k++) {
    vec3 r = q - uGp[k];
    float rl = length(r) + 1e-5;
    vec3 d = mix(uGa[k], uGb[k], clamp(1.0 - exp(-rl * 2.4) + uLoose, 0.0, 1.0));
    float e1 = 0.62 * exp(-rl * 3.4) * anchor, e2 = 0.38 * exp(-rl * rl * 1.5) * anchor;
    vec3 g = -(r / rl) * (e1 * 3.4) - 2.0 * r * (e2 * 1.5);
    if (uRigid < 0.5) n -= g * (dot(d, n) / max(0.3, 1.0 + dot(d, g)));
    p += d * (e1 + e2);
    float dn = dot(d, n0);
    vec3 rt = r - n0 * dot(r, n0);
    vec3 t = (d - n0 * dn) + normalize(rt + vec3(1e-5)) * abs(dn);
    float strain = length(d) * length(g) * smoothstep(0.03, 0.2, rl);
    clayAxis += cross(n0, normalize(t + vec3(1e-5))) * strain;
    clayAmp += strain;
  }
  n = normalize(n);
}`;
const VARY = 'varying vec3 vWAxO; varying vec3 vWAxV; varying vec3 vRest; varying float vWAmp;';
const WRINKLE = `
{
  float wAmp = clamp(vWAmp * 0.5 - 0.08, 0.0, 1.0) * uWrinkle;
  float wl = length(vWAxO);
  if (wAmp > 0.003 && wl > 1e-5) {
    vec3 axO = vWAxO / wl;
    float warp = sin(dot(vRest, vec3(3.1, 4.7, 2.3))) * 0.55 + sin(dot(vRest, vec3(-5.3, 2.1, 6.7))) * 0.3;
    float ph = dot(vRest, axO) * 19.0 + warp;
    normal = normalize(normal + normalize(vWAxV) * (cos(ph) + 0.45 * cos(ph * 2.3 + 1.7)) * wAmp * 0.3);
  }
}`;
const SSS = `
totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.3, 0.18) * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2) * uSSS;`;

/* ---------- lat/long grid the skin is sculpted on ---------- */
const GW = 320, GH = 160, NCELL = GW * GH;
const thetaAt = i => -Math.PI + 2 * Math.PI * i / GW, phiAt = j => -Math.PI / 2 + Math.PI * j / (GH - 1);
function dirAt(i, j, out) { const t = thetaAt(i), p = phiAt(j), c = Math.cos(p); return out.set(c * Math.sin(t), Math.sin(p), c * Math.cos(t)); }
function dirOf(th, ph, out = new V3()) { const t = th * D2R, p = ph * D2R, c = Math.cos(p); return out.set(c * Math.sin(t), Math.sin(p), c * Math.cos(t)); }
function distLine(line, x, y) {
  let d = 1e9;
  for (let i = 0; i + 1 < line.length; i++) {
    const xi = line[i][0], yi = line[i][1], ex = line[i + 1][0] - xi, ey = line[i + 1][1] - yi, wx = x - xi, wy = y - yi;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-9), 0, 1);
    d = Math.min(d, (wx - ex * t) ** 2 + (wy - ey * t) ** 2);
  }
  return Math.sqrt(d);
}
function blur(A, passes) {
  const T = new Float32Array(NCELL);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < GH; j++) { const r = j * GW; for (let i = 0; i < GW; i++) T[r + i] = 0.25 * A[r + (i ? i - 1 : GW - 1)] + 0.5 * A[r + i] + 0.25 * A[r + (i < GW - 1 ? i + 1 : 0)]; }
    for (let j = 0; j < GH; j++) { const u = Math.max(0, j - 1) * GW, d = Math.min(GH - 1, j + 1) * GW, r = j * GW; for (let i = 0; i < GW; i++) A[r + i] = 0.25 * T[u + i] + 0.5 * T[r + i] + 0.25 * T[d + i]; }
  }
  return A;
}
function sampleGrid(A, th, ph) {
  const x = (th * D2R + Math.PI) / (2 * Math.PI) * GW, y = (ph * D2R + Math.PI / 2) / Math.PI * (GH - 1);
  const i = Math.floor(x), j = clamp(Math.floor(y), 0, GH - 2), u = x - i, v = y - j, w = k => ((k % GW) + GW) % GW;
  return lerp(lerp(A[j * GW + w(i)], A[j * GW + w(i + 1)], u), lerp(A[(j + 1) * GW + w(i)], A[(j + 1) * GW + w(i + 1)], u), v);
}
function gridGeometry(R, C) {
  const cols = GW + 1, pos = new Float32Array(cols * GH * 3), col = new Float32Array(cols * GH * 3), d = new V3();
  for (let j = 0; j < GH; j++) for (let i = 0; i <= GW; i++) {
    const src = j * GW + (i % GW), v = j * cols + i, r = R[src];
    dirAt(i, j, d);
    pos[v * 3] = d.x * r; pos[v * 3 + 1] = d.y * r; pos[v * 3 + 2] = d.z * r;
    col[v * 3] = C[src * 3]; col[v * 3 + 1] = C[src * 3 + 1]; col[v * 3 + 2] = C[src * 3 + 2];
  }
  const idx = new Uint32Array(GW * (GH - 1) * 6);
  let k = 0;
  for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols + 1, e = a + cols;
    idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = a; idx[k++] = c; idx[k++] = e;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}
/* stacked ellipses, bottom to top: fn(y, theta) -> [halfWidth, halfDepth, centreZ] */
function ringGeo(y0, y1, rows, segs, fn) {
  const cols = segs + 1, pos = new Float32Array(cols * rows * 3), idx = new Uint32Array(segs * (rows - 1) * 6);
  for (let j = 0; j < rows; j++) for (let i = 0; i <= segs; i++) {
    const y = lerp(y0, y1, j / (rows - 1)), th = -Math.PI + 2 * Math.PI * i / segs, [a, c, zc] = fn(y, th), v = j * cols + i;
    pos[v * 3] = a * Math.sin(th); pos[v * 3 + 1] = y; pos[v * 3 + 2] = zc + c * Math.cos(th);
  }
  let k = 0;
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < segs; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols + 1, e = a + cols;
    idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = a; idx[k++] = c; idx[k++] = e;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

const SKIN = new THREE.Color(0xC2855A), BLUSH = new THREE.Color(0xC96C55), LIP = new THREE.Color(0xA95B54), SEAM = new THREE.Color(0x4A1C16);
const BROW = new THREE.Color(0x1F1511), MOLE = new THREE.Color(0x2B170E), HAIR = new THREE.Color(0x130C09), HAIR_HI = new THREE.Color(0x2E1D14);
const EYE_R = 0.175, EYE_TH = 19.5, EYE_PH = 8;
const BROWS = [[5.5, 23.5], [13, 26.5], [24, 27], [34.5, 24.5]];
const SMIRK = [[-10, -35.5], [-5, -37.6], [1, -38], [7, -36.6], [11.5, -33.6]];
const MOLES = [[13, -9, 1.8], [-13, -10, 1.4], [-44, -8, 1.4], [-38, -31, 1.4]];
const g2 = (th, ph, t0, p0, st, sp) => { const u = (th - t0) * Math.cos(p0 * D2R) / st, v = (ph - p0) / sp; return Math.exp(-u * u - v * v); };

export function mountHero(canvas, host) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  const FOV = 28, camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);

  scene.add(new THREE.HemisphereLight(0xdcefff, 0x9fb7c9, 0.75));
  const key = new THREE.DirectionalLight(0xfff3df, 2.5);
  key.position.set(-2.6, 3.4, 4.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 6; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03;
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 2.6, bottom: -3.6, near: 0.5, far: 16 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(3.6, 1.8, -3); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffd9bd, 0.5); fill.position.set(3, -0.4, 4); scene.add(fill);

  const slots = Array.from({ length: SLOTS }, () => ({ p: new V3(0, 99, 0), drag: new V3(), world: new V3(), a: new V3(), va: new V3(), b: new V3(), vb: new V3(), held: false }));
  const U = { uGp: { value: slots.map(s => s.p) }, uGa: { value: slots.map(s => s.a) }, uGb: { value: slots.map(s => s.b) } };
  function soften(mat, o = {}) {
    const own = o.own || {
      uLoose: { value: o.loose || 0 }, uPivot: { value: o.pivot || new V3() }, uRot: { value: new THREE.Matrix3() }, uShift: { value: new V3() },
      uWrinkle: { value: o.wrinkle ?? 1 }, uSSS: { value: o.sss ?? 0 }, uRigid: { value: o.rigid ? 1 : 0 }
    };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U, own);
      if (o.depth) {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GLSL_V)
          .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); vec3 clayN = vec3(0.0, 1.0, 0.0); clayDeform(transformed, clayN);');
        return;
      }
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GLSL_V + VARY)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 clayP = vec3(position); clayDeform(clayP, objectNormal);\nvRest = position; vWAxO = clayAxis; vWAxV = normalMatrix * clayAxis; vWAmp = clayAmp;')
        .replace('#include <begin_vertex>', 'vec3 transformed = clayP;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + VARY + ' uniform float uWrinkle; uniform float uSSS;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WRINKLE)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + SSS);
    };
    mat.customProgramCacheKey = () => 'zj' + (o.depth ? 'D' : 'M');
    mat.userData.own = own;
    return mat;
  }
  const soft = (o = {}) => new THREE.MeshPhysicalMaterial({
    color: o.color ?? 0xffffff, vertexColors: !!o.vc, roughness: o.rough ?? 0.6, metalness: 0, clearcoat: o.coat ?? 0.1, clearcoatRoughness: 0.5,
    sheen: o.sheenAmt ?? 0.45, sheenRoughness: 0.5, sheenColor: new THREE.Color(o.sheen ?? 0xff9c7c)
  });
  const head = new THREE.Group();
  scene.add(head);
  const pickables = [];
  function addMesh(geo, mat, o = {}) {
    soften(mat, o);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.customDepthMaterial = soften(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { depth: true, own: mat.userData.own });
    head.add(mesh);
    if (o.pick !== false) pickables.push(mesh);
    return mesh;
  }

  /* ---------- skin: egg head, features pressed in ---------- */
  const R = new Float32Array(NCELL), d = new V3();
  {
    const wBrow = new Float32Array(NCELL), wLip = new Float32Array(NCELL), wSeam = new Float32Array(NCELL), wMole = new Float32Array(NCELL);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const id = j * GW + i, th = thetaAt(i) / D2R, ph = phiAt(j) / D2R, ath = Math.abs(th);
      dirAt(i, j, d);
      let r = 1 / Math.sqrt((d.x / 0.9) ** 2 + d.y * d.y + (d.z / 0.9) ** 2);
      const dn = Math.max(0, -d.y);
      r *= 1 + 0.04 * dn * dn * dn - 0.07 * dn * dn * d.x * d.x;
      r += 0.035 * g2(ath, ph, 31, -19, 16, 14);
      r -= 0.04 * g2(ath, ph, EYE_TH, EYE_PH, 14, 14);
      r += 0.17 * g2(th, ph, 0, -11, 7.2, 8.2) + 0.05 * g2(th, ph, 0, 2, 5, 10);
      const bw = smooth(4.3, 2.1, distLine(BROWS, ath, ph));
      r += 0.035 * bw; wBrow[id] = bw;
      const sd = distLine(SMIRK, th, ph);                                     /* closed smirk, one corner up */
      r -= 0.022 * Math.exp(-((sd / 1.3) ** 2));
      r += 0.014 * g2(th, ph, 0.5, -42.5, 8, 2.8);
      wSeam[id] = Math.exp(-((sd / 0.95) ** 2));
      wLip[id] = Math.max(g2(th, ph, 0.5, -41.5, 8.5, 2.6), 0.6 * g2(th, ph, 0.5, -35, 8, 1.8));
      for (const [t0, p0, rad] of MOLES) {
        const w = smooth(rad, rad * 0.45, Math.hypot((th - t0) * Math.cos(p0 * D2R), ph - p0));
        if (w > 0) { wMole[id] = Math.max(wMole[id], w); r += 0.006 * w; }
      }
      R[id] = r;
    }
    blur(R, 1);
    const Rs = blur(R.slice(), 10), C = new Float32Array(NCELL * 3), col = new THREE.Color();
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const id = j * GW + i, th = thetaAt(i) / D2R, ph = phiAt(j) / D2R, ath = Math.abs(th);
      col.copy(SKIN).lerp(BLUSH, 0.3 * g2(ath, ph, 33, -15, 13, 12) + 0.2 * g2(th, ph, 0, -12, 6, 6));
      col.lerp(LIP, 0.4 * wLip[id]).lerp(SEAM, 0.85 * wSeam[id]).lerp(BROW, wBrow[id]).lerp(MOLE, 0.95 * wMole[id]);
      const de = Math.hypot((ath - EYE_TH) * Math.cos(EYE_PH * D2R), ph - EYE_PH);
      const shade = clamp(1 + (R[id] - Rs[id]) * 6, 0.72, 1.08) * (1 - 0.26 * Math.exp(-(((de - 12.2) / 2.6) ** 2)));
      C[id * 3] = col.r * shade; C[id * 3 + 1] = col.g * shade; C[id * 3 + 2] = col.b * shade;
    }
    addMesh(gridGeometry(R, C), soft({ vc: true }), { sss: 0.55 });
  }

  /* ---------- eyes with lazy lids that blink ---------- */
  const eyeOwns = [], lidOwns = [];
  {
    const white = new THREE.Color(0xF5F2EB), ring = new THREE.Color(0x20120A), iris = new THREE.Color(0x5A3519), pupil = new THREE.Color(0x060403), c = new THREE.Color();
    const lidMat = () => soft({ color: SKIN.clone().multiplyScalar(0.93).getHex() });
    for (const s of [-1, 1]) {
      const Ce = dirOf(s * EYE_TH, EYE_PH).multiplyScalar(sampleGrid(R, s * EYE_TH, EYE_PH) - 0.035);
      const g = new THREE.SphereGeometry(EYE_R, 56, 40).rotateX(Math.PI / 2), p = g.attributes.position, col = new Float32Array(p.count * 3);
      for (let k = 0; k < p.count; k++) {
        const ang = Math.acos(clamp(p.getZ(k) / EYE_R, -1, 1));
        c.copy(white).multiplyScalar(1 - 0.16 * smooth(0.8, 1.6, ang)).lerp(ring, smooth(0.6, 0.55, ang)).lerp(iris, smooth(0.52, 0.42, ang) * 0.92).lerp(pupil, smooth(0.27, 0.22, ang));
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.translate(Ce.x, Ce.y, Ce.z);
      const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.04 });
      addMesh(g, mat, { pivot: Ce.clone(), pick: false, wrinkle: 0, rigid: true });
      eyeOwns.push(mat.userData.own);
      const lid = new THREE.SphereGeometry(EYE_R * 1.085, 36, 14, 0, Math.PI * 2, 0, 1.18).rotateX(0.42).translate(Ce.x, Ce.y, Ce.z);
      const lm = lidMat();
      addMesh(lid, lm, { pivot: Ce.clone(), pick: false, wrinkle: 0, rigid: true });
      lidOwns.push(lm.userData.own);
    }
  }

  /* ---------- ears ---------- */
  {
    const skin = soft({ color: SKIN.clone().lerp(BLUSH, 0.25).getHex() }), inner = soft({ color: SKIN.clone().lerp(BLUSH, 0.5).multiplyScalar(0.72).getHex() });
    for (const s of [-1, 1]) {
      const at = dirOf(s * 90, 1).multiplyScalar(sampleGrid(R, s * 90, 1));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, -s * 0.3, 0, 'YXZ'));
      addMesh(new THREE.SphereGeometry(1, 32, 24).applyMatrix4(new THREE.Matrix4().compose(at.clone().add(new V3(s * 0.035, 0, -0.03)), q, new V3(0.075, 0.2, 0.15))), skin, { sss: 0.9 });
      addMesh(new THREE.SphereGeometry(1, 24, 18).applyMatrix4(new THREE.Matrix4().compose(at.clone().add(new V3(s * 0.085, -0.005, 0)), q, new V3(0.035, 0.115, 0.08))), inner, { sss: 0.5 });
    }
  }

  /* ---------- hair: dark cap, big round curls ---------- */
  {
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + rnd() * (b - a);
    const hl = th => pw(th, [[0, 40], [28, 39], [56, 30], [74, 10], [97, -3], [126, -22], [180, -30]]);
    const cl = th => pw(th, [[0, 40], [40, 40], [76, 33], [180, 14]]);
    const blobs = [];
    for (let k = 0, tries = 0; k < 120 && tries < 20000; tries++) {
      const th = rr(-180, 180), ph = Math.asin(rr(0.1, 1)) / D2R;
      if (ph < cl(Math.abs(th)) + 1) continue;
      blobs.push({ d: dirOf(th, ph), s: rr(6, 9.5) * D2R, a: rr(0.09, 0.16) }); k++;
    }
    for (let k = 0; k < 9; k++) blobs.push({ d: dirOf(-33 + k * 8.2 + rr(-1.5, 1.5), hl(0) + rr(0, 4)), s: rr(6, 8) * D2R, a: rr(0.09, 0.13) });
    const Rh = new Float32Array(NCELL), C = new Float32Array(NCELL * 3), col = new THREE.Color(), fade = SKIN.clone().lerp(HAIR, 0.86);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const id = j * GW + i, th = Math.abs(thetaAt(i)) / D2R, ph = phiAt(j) / D2R;
      const edge = smooth(0, 2.5, ph - hl(th)), tw = smooth(-6, 10, ph - cl(th));
      dirAt(i, j, d);
      let L = 0;
      if (edge > 0) for (const b of blobs) {
        const ang = Math.acos(clamp(d.dot(b.d), -1, 1));
        if (ang < b.s * 2.6) L = Math.max(L, b.a * Math.exp(-((ang / b.s) ** 2)));
      }
      Rh[id] = R[id] - 0.05 + edge * (0.05 + 0.026 + tw * 0.05 + L);
      col.copy(fade).lerp(HAIR, tw).lerp(HAIR_HI, clamp(L * 5 - 0.15, 0, 1) * 0.5);
      C[id * 3] = col.r; C[id * 3 + 1] = col.g; C[id * 3 + 2] = col.b;
    }
    addMesh(gridGeometry(Rh, C), soft({ vc: true, rough: 0.64, coat: 0.06, sheen: 0x4a3628, sheenAmt: 0.12 }), { loose: 0.12, wrinkle: 0.5 });
  }

  /* ---------- neck, tee ---------- */
  addMesh(ringGeo(-2.1, -0.62, 60, 80, y => [
    pw(y, [[-2.1, 1.25], [-1.62, 0.9], [-1.4, 0.52], [-1.2, 0.42], [-0.95, 0.39], [-0.62, 0.37]]),
    pw(y, [[-2.1, 0.6], [-1.5, 0.47], [-1.0, 0.42], [-0.62, 0.4]]),
    pw(y, [[-2.1, -0.26], [-1.5, -0.22], [-0.62, -0.1]])
  ]), soft({ color: SKIN.clone().multiplyScalar(0.96).getHex() }), { sss: 0.4 });
  const tee = soft({ color: 0x1D2942, rough: 0.8, coat: 0.03, sheen: 0x5a6a92, sheenAmt: 0.5 });
  addMesh(ringGeo(-6, -1.34, 50, 80, y => [
    pw(y, [[-6, 1.72], [-2.5, 1.72], [-2.0, 1.62], [-1.7, 1.36], [-1.47, 0.86], [-1.34, 0.55]]),
    pw(y, [[-6, 0.82], [-2.0, 0.8], [-1.7, 0.7], [-1.34, 0.55]]),
    pw(y, [[-6, -0.28], [-1.34, -0.22]])
  ]), tee);
  const collar = new THREE.TorusGeometry(1, 0.09, 14, 64).rotateX(Math.PI / 2);
  collar.applyMatrix4(new THREE.Matrix4().compose(new V3(0, -1.33, -0.22), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, 0, 0)), new V3(0.57, 0.8, 0.57)));
  addMesh(collar, soft({ color: 0x26344F, rough: 0.8, coat: 0.03, sheen: 0x5a6a92 }));

  /* ---------- a plain straw hat, off until it is thrown on ---------- */
  const hatOwns = [], hatMeshes = [];
  {
    const prof = [[0, 0.5], [0.3, 0.49], [0.52, 0.4], [0.63, 0.2], [0.66, 0.03], [1.18, 0], [1.24, -0.03], [1.18, -0.07], [0.62, -0.05], [0, -0.05]].map(p => new THREE.Vector2(p[0], p[1]));
    const place = new THREE.Matrix4().compose(new V3(0, 0.9, -0.04), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.13, 0, 0.05)), new V3(1, 1, 1));
    const pivot = new V3(0, 0.95, 0);
    const straw = soft({ color: 0xE3BC5F, rough: 0.85, coat: 0, sheenAmt: 0.2, sheen: 0xfff0b8 }), band = soft({ color: 0xC8372B, rough: 0.7, coat: 0.05, sheenAmt: 0.2 });
    hatMeshes.push(addMesh(new THREE.LatheGeometry(prof, 56).applyMatrix4(place), straw, { rigid: true, pivot, wrinkle: 0 }));
    hatMeshes.push(addMesh(new THREE.CylinderGeometry(0.672, 0.69, 0.14, 56, 1, true).translate(0, 0.1, 0).applyMatrix4(place), band, { rigid: true, pivot, wrinkle: 0 }));
    hatOwns.push(straw.userData.own, band.userData.own);
    for (const m of hatMeshes) m.visible = false;
  }
  let hatOn = false, hatY = 0, hatV = 0;

  /* ---------- grabbing ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), mouse = new THREE.Vector2();
  const plane = new THREE.Plane(), hitW = new V3(), tmp = new V3(), qInv = new THREE.Quaternion(), ZERO = new V3();
  let grab = null, active = true, pointerId = null;
  const toNdc = (cx, cy) => { const r = canvas.getBoundingClientRect(); return ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height * 2 - 1)); };
  const hitAt = (cx, cy) => { ray.setFromCamera(toNdc(cx, cy), camera); return ray.intersectObjects(pickables, false)[0]; };
  host.addEventListener('touchstart', e => { if (e.touches.length === 1 && hitAt(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault(); }, { passive: false });
  host.addEventListener('pointerdown', e => {
    const hit = hitAt(e.clientX, e.clientY);
    if (!hit) return;
    pointerId = e.pointerId;
    host.classList.add('grabbing');
    hitW.copy(hit.point);
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(tmp).negate(), hitW);
    let best = null, least = Infinity;
    for (const s of slots) { const en = s.a.lengthSq() + s.b.lengthSq(); if (!s.held && en < least) { least = en; best = s; } }
    grab = best || slots[0];
    grab.p.copy(head.worldToLocal(hit.point.clone()));
    for (const v of [grab.a, grab.b, grab.va, grab.vb, grab.drag, grab.world]) v.set(0, 0, 0);
    grab.held = true;
    e.preventDefault();
  });
  addEventListener('pointermove', e => {
    toNdc(e.clientX, e.clientY);
    if (!grab) { mouse.copy(ndc); host.classList.toggle('grabbable', active && !!hitAt(e.clientX, e.clientY)); return; }
    if (e.pointerId !== pointerId) return;
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, tmp)) grab.world.copy(tmp.sub(hitW));
  });
  const release = e => { if (!grab || (e && e.pointerId !== pointerId)) return; grab.held = false; grab = null; host.classList.remove('grabbing'); };
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  addEventListener('blur', () => release());

  function spring(x, v, target, k, c, dt) {
    v.x += ((target.x - x.x) * k - v.x * c) * dt; v.y += ((target.y - x.y) * k - v.y * c) * dt; v.z += ((target.z - x.z) * k - v.z * c) * dt;
    x.x += v.x * dt; x.y += v.y * dt; x.z += v.z * dt;
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const half = Math.tan(FOV / 2 * D2R), visH = Math.max(2.3 / 0.37, 2.7 / camera.aspect), lookY = -2.5 + visH / 2;
    camera.position.set(0, lookY, visH / 2 / half);
    camera.lookAt(0, lookY, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const clock = new THREE.Clock(), eyeM = new THREE.Matrix4(), eyeE = new THREE.Euler(), headOff = new V3(), headVel = new V3(), give = new V3();
  let lookX = 0, lookY = 0, eyeYaw = 0, eyeYawV = 0, eyePitch = 0, eyePitchV = 0, nextBlink = 2.5, blink = 0, raf = 0;
  function step(dt, t) {
    if (!grab) { lookX += (mouse.x - lookX) * 0.07; lookY += (mouse.y - lookY) * 0.07; }
    const lead = slots.find(s => s.held);
    spring(headOff, headVel, lead ? give.copy(lead.world).multiplyScalar(0.12) : ZERO, 110, 8, dt);
    head.position.set(headOff.x, headOff.y + Math.sin(t * 1.25) * 0.012, headOff.z);
    head.rotation.set(-lookY * 0.07 - headOff.y * 0.2, lookX * 0.16 + headOff.x * 0.26, -headOff.x * 0.07);
    if (lead) lead.drag.copy(lead.world).sub(headOff).applyQuaternion(qInv.copy(head.quaternion).invert());
    let jx = 0, jy = 0;
    for (const s of slots) {
      if (s.held) {
        const fa = 1 - Math.exp(-dt * 48), fb = 1 - Math.exp(-dt * 15);
        s.va.copy(s.drag).sub(s.a).multiplyScalar(fa / dt); s.a.lerp(s.drag, fa);
        s.vb.copy(s.drag).sub(s.b).multiplyScalar(fb / dt); s.b.lerp(s.drag, fb);
      } else for (let n = 0; n < 2; n++) { spring(s.a, s.va, ZERO, 380, 8, dt / 2); spring(s.b, s.vb, ZERO, 150, 5, dt / 2); }
      jx += s.va.x; jy += s.va.y;
    }
    const gx = lead ? clamp(lead.p.x + lead.a.x, -1.5, 1.5) * 0.3 : lookX * 0.5, gy = lead ? clamp(lead.p.y + lead.a.y, -1.5, 1.5) * 0.3 : (lookY + 0.25) * 0.36;
    eyeYawV += ((gx + jx * 0.012 - eyeYaw) * 150 - eyeYawV * 8) * dt; eyeYaw += eyeYawV * dt;
    eyePitchV += ((gy + jy * 0.012 - eyePitch) * 150 - eyePitchV * 8) * dt; eyePitch += eyePitchV * dt;
    eyeM.makeRotationFromEuler(eyeE.set(-eyePitch, eyeYaw, 0));
    for (const o of eyeOwns) o.uRot.value.setFromMatrix4(eyeM);
    nextBlink -= dt;
    if (nextBlink < 0) { blink = 1; nextBlink = 2 + Math.random() * 4; }
    blink = Math.max(0, blink - dt * 7);
    eyeM.makeRotationX(Math.sin(blink * Math.PI) * 1.05);
    for (const o of lidOwns) o.uRot.value.setFromMatrix4(eyeM);
    if (hatOn) { hatV += (-170 * hatY - 9 * hatV) * dt; hatY += hatV * dt; for (const o of hatOwns) o.uShift.value.set(0, hatY, 0); }
  }
  function frame() {
    raf = 0;
    if (!active) return;
    const dt = Math.min(clock.getDelta(), 1 / 30);
    step(dt, clock.elapsedTime);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return {
    setActive(on) { active = on; if (on && !raf) { clock.getDelta(); frame(); } },
    wearHat() { for (const m of hatMeshes) m.visible = true; hatOn = true; hatY = 2.4; hatV = 0; },
    get hatOn() { return hatOn; },
    snapshot(size = 512) {
      const prev = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio(), cam2 = camera.clone();
      cam2.aspect = 1; cam2.position.set(0, 0.16, 6.1); cam2.lookAt(0, 0.16, 0); cam2.updateProjectionMatrix();
      renderer.setPixelRatio(1); renderer.setSize(size, size, false); renderer.render(scene, cam2);
      const url = canvas.toDataURL('image/png');
      renderer.setPixelRatio(pr); renderer.setSize(prev.x, prev.y, false); renderer.render(scene, camera);
      return url;
    },
    debug: { slots, head, camera, step: (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) step(dt, clock.elapsedTime + i * dt); renderer.render(scene, camera); } }
  };
}
