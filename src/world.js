import * as THREE from 'three';
import { K, NEEDS, rockSpheres, waterState, happy } from './sim.js';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...extra });

function jitter(geo, amt, seed = 1, keepTop = false) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (keepTop && y > -0.0001) continue;
    const n = Math.sin(x * 91.7 + z * 53.3 + seed) * Math.cos(z * 77.1 - y * 33.7 + seed * 2.1);
    p.setXYZ(i, x + n * amt, y + n * amt * 0.6, z + Math.cos(n * 9.3) * amt * 0.5);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------- Sky (gradient dome above a sea of clouds) ----------------
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: 1 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uSun; uniform float uDay;
      void main(){
        float y = vDir.y;
        vec3 zenDay = vec3(0.30,0.55,0.92), horDay = vec3(0.78,0.88,0.98);
        vec3 zenDusk = vec3(0.22,0.20,0.45), horDusk = vec3(1.0,0.62,0.45);
        vec3 zen = mix(zenDusk, zenDay, uDay), hor = mix(horDusk, horDay, uDay);
        vec3 col = mix(hor, zen, smoothstep(0.0, 0.7, y));
        vec3 sea = mix(vec3(0.85,0.72,0.80), vec3(0.93,0.95,1.0), uDay);
        col = mix(col, sea, smoothstep(0.02, -0.12, y));
        float s = max(dot(normalize(vDir), normalize(uSun)), 0.0);
        col += vec3(1.0,0.85,0.55) * (pow(s, 64.0)*0.8 + pow(s, 6.0)*0.18);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// ---------------- Island ----------------
export function makeIsland(radius = K.ISLAND_R, seed = 1, detail = 1) {
  const g = new THREE.Group();
  const top = new THREE.CylinderGeometry(radius, radius * 0.97, 0.02, 48 * detail, 1);
  top.translate(0, -0.01, 0);
  const grass = new THREE.Mesh(jitter(top, 0.002, seed, true), flat(0x7cc46a));
  grass.receiveShadow = true;
  g.add(grass);
  const under = new THREE.ConeGeometry(radius * 0.97, radius * 0.8, 24, 4);
  under.rotateX(Math.PI); under.translate(0, -0.02 - radius * 0.4, 0);
  const dirt = new THREE.Mesh(jitter(under, radius * 0.06, seed), flat(0x9b6b4a));
  g.add(dirt);
  const rim = new THREE.TorusGeometry(radius * 0.985, 0.006, 6, 64); rim.rotateX(Math.PI / 2); rim.translate(0, -0.004, 0);
  g.add(new THREE.Mesh(rim, flat(0x5ea552)));
  return g;
}

export function makeScenery(scene) {
  const grp = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.4, d = 7 + (i % 3) * 3;
    const isl = makeIsland(0.6 + (i % 4) * 0.35, i + 3, 0.5);
    isl.position.set(Math.sin(a) * d, -1.2 + (i % 4) * 1.1, Math.cos(a) * d);
    isl.userData.bob = i;
    for (let k = 0; k < 3; k++) {
      const tree = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), flat(0x3f8f4f));
      tree.position.set(Math.sin(k * 2.2 + i) * 0.3, 0.2, Math.cos(k * 2.2 + i) * 0.3);
      isl.add(tree);
    }
    grp.add(isl);
  }
  for (let i = 0; i < 14; i++) {
    const c = makeCloudMesh(0.6 + (i % 3) * 0.4, false);
    const a = i * 2.4, d = 12 + (i % 5) * 4;
    c.position.set(Math.sin(a) * d, -2.5 + (i % 4) * 0.4, Math.cos(a) * d);
    grp.add(c);
  }
  scene.add(grp);
  return grp;
}

// ---------------- Rock ----------------
export function makeRock(rock) {
  const g = new THREE.Group();
  rockSpheres(rock).forEach((s, i) => {
    const geo = jitter(new THREE.DodecahedronGeometry(s.r, 0), s.r * 0.12, i + rock.x * 10);
    const m = new THREE.Mesh(geo, flat(i % 2 ? 0x8d8f9e : 0x9fa1b0));
    m.position.set(s.x, s.y, s.z); m.rotation.set(i * 0.7, i * 1.3, 0);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  });
  return g;
}

// ---------------- Cloud ----------------
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x334455, emissiveIntensity: 0.25 });
function makeCloudMesh(r, shadows = true) {
  const g = new THREE.Group();
  const puffs = [[0, 0, 0, 0.62], [0.45, -0.1, 0.1, 0.48], [-0.45, -0.08, -0.05, 0.5], [0.1, 0.25, -0.1, 0.45], [-0.15, -0.05, 0.4, 0.42], [0.2, -0.05, -0.42, 0.42]];
  for (const [x, y, z, s] of puffs) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), cloudMat);
    m.position.set(x * r, y * r, z * r); m.castShadow = shadows;
    g.add(m);
  }
  g.scale.y = 0.75;
  return g;
}

export class CloudView {
  constructor(cloud) {
    this.cloud = cloud;
    this.group = new THREE.Group();
    this.body = makeCloudMesh(cloud.r);
    this.group.add(this.body);
    // rain
    this.N = 36;
    const pos = new Float32Array(this.N * 6);
    this.drops = [];
    for (let i = 0; i < this.N; i++) this.drops.push(this.newDrop(true));
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.7 }));
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
    // footprint ring on ground (shows where rain lands)
    const ring = new THREE.RingGeometry(cloud.r * 0.92, cloud.r, 40); ring.rotateX(-Math.PI / 2);
    this.foot = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0x4f8fff, transparent: true, opacity: 0.45, depthWrite: false }));
    this.group.add(this.foot);
    this.hover = 0;
  }
  newDrop(init) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * this.cloud.r * 0.9;
    return { x: Math.sin(a) * d, z: Math.cos(a) * d, y: init ? -Math.random() * this.cloud.y : -this.cloud.r * 0.2, v: 0.35 + Math.random() * 0.15 };
  }
  update(dt, t, held) {
    const c = this.cloud;
    this.group.position.set(c.x, c.y, c.z);
    const p = this.rainGeo.attributes.position.array;
    for (let i = 0; i < this.N; i++) {
      const d = this.drops[i];
      d.y -= d.v * dt;
      if (d.y < -c.y) this.drops[i] = this.newDrop(false);
      const q = this.drops[i];
      p.set([q.x, q.y, q.z, q.x, q.y - 0.012, q.z], i * 6);
    }
    this.rainGeo.attributes.position.needsUpdate = true;
    this.foot.position.y = -c.y + 0.002;
    const target = held ? 1.12 : this.hover ? 1.07 : 1;
    const s = this.body.scale.x + (target - this.body.scale.x) * Math.min(1, dt * 12);
    this.body.scale.set(s, s * 0.75, s);
    this.body.position.y = Math.sin(t * 1.3 + c.x * 20) * 0.003;
    this.foot.material.opacity = held || this.hover ? 0.8 : 0.4;
  }
}

// ---------------- Sun ----------------
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.25, 'rgba(255,210,110,0.55)'); gr.addColorStop(1, 'rgba(255,180,80,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export class SunView {
  constructor() {
    this.group = new THREE.Group();
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.02, 2), new THREE.MeshBasicMaterial({ color: 0xffd25e }));
    this.group.add(this.core);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.scale.setScalar(0.11);
    this.group.add(this.glow);
    // rays ring
    const rays = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const r = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.014, 4), new THREE.MeshBasicMaterial({ color: 0xffc23d }));
      const a = (i / 10) * Math.PI * 2; r.position.set(Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0); r.rotation.z = a - Math.PI / 2;
      rays.add(r);
    }
    this.rays = rays; this.group.add(rays);
    this.hover = 0;
  }
  update(dt, t, sun, camPosLocal, held) {
    this.group.position.set(sun.x, sun.y, sun.z);
    this.rays.lookAt(this.group.parent.localToWorld(camPosLocal.clone()));
    this.rays.children.forEach((r, i) => r.scale.setScalar(1 + 0.15 * Math.sin(t * 3 + i)));
    const target = held ? 1.3 : this.hover ? 1.15 : 1;
    const s = this.core.scale.x + (target - this.core.scale.x) * Math.min(1, dt * 12);
    this.core.scale.setScalar(s); this.glow.scale.setScalar(0.11 * s * (1 + 0.04 * Math.sin(t * 2)));
  }
}

// Faint dome guide shown while the sun is held.
export function makeDomeGuide() {
  const geo = new THREE.SphereGeometry(K.DOME_R, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2 - K.MIN_EL);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd27a, wireframe: true, transparent: true, opacity: 0.12, depthWrite: false }));
  m.visible = false;
  return m;
}

// ---------------- Plant ----------------
const ICON_CACHE = new Map();
function iconTexture(type, lightOk, waterOk) {
  const key = `${type}${+lightOk}${+waterOk}`;
  if (ICON_CACHE.has(key)) return ICON_CACHE.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const n = NEEDS[type];
  const badge = (cx, ok) => {
    x.beginPath(); x.arc(cx, 64, 54, 0, Math.PI * 2);
    x.fillStyle = 'rgba(20,24,40,0.82)'; x.fill();
    x.lineWidth = 9; x.strokeStyle = ok ? '#5dff8a' : '#ff8a5d'; x.stroke();
  };
  // light icon
  badge(64, lightOk);
  if (n.light) {
    x.fillStyle = '#ffd25e'; x.beginPath(); x.arc(64, 64, 17, 0, 7); x.fill();
    x.strokeStyle = '#ffd25e'; x.lineWidth = 6;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(64 + Math.cos(a) * 25, 64 + Math.sin(a) * 25); x.lineTo(64 + Math.cos(a) * 35, 64 + Math.sin(a) * 35); x.stroke(); }
  } else { // shade: crescent moon
    x.fillStyle = '#b9c6ff'; x.beginPath(); x.arc(64, 64, 28, 0, 7); x.fill();
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(78, 54, 24, 0, 7); x.fill();
    x.globalCompositeOperation = 'source-over';
  }
  // water icon
  badge(192, waterOk);
  const drop = () => { x.beginPath(); x.moveTo(192, 30); x.bezierCurveTo(214, 60, 220, 72, 210, 86); x.arc(192, 78, 20, 0.4, Math.PI - 0.4); x.bezierCurveTo(164, 72, 170, 60, 192, 30); };
  if (n.water === 'moist') { drop(); x.fillStyle = '#5aa8ff'; x.fill(); }
  else { drop(); x.lineWidth = 6; x.strokeStyle = '#e9a86b'; x.stroke(); x.beginPath(); x.moveTo(166, 96); x.lineTo(218, 36); x.strokeStyle = '#ff8a5d'; x.lineWidth = 8; x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  ICON_CACHE.set(key, t);
  return t;
}

const ringMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uG: { value: 0 }, uM: { value: 0 }, uLo: { value: K.LO }, uHi: { value: K.HI }, uGold: { value: 0 }, uMax: { value: K.M_MAX } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `
    varying vec2 vUv; uniform float uG,uM,uLo,uHi,uGold,uMax;
    void main(){
      vec2 p = vUv*2.-1.; float r = length(p);
      float a = fract(atan(p.x, p.y)/6.2831853 + 1.0);
      vec4 c = vec4(0.);
      if (r > 0.78 && r < 1.0) {
        vec3 g = mix(vec3(0.45,1.0,0.55), vec3(1.0,0.82,0.3), uGold);
        c = a < uG ? vec4(g, 0.95) : vec4(0.1,0.12,0.15,0.45);
      } else if (r > 0.5 && r < 0.7) {
        float mm = uM/uMax;
        bool band = a >= uLo/uMax && a <= uHi/uMax;
        if (a < mm) c = mm*uMax > uHi ? vec4(0.55,0.35,1.0,0.95) : vec4(0.35,0.65,1.0,0.95);
        else c = band ? vec4(0.25,0.4,0.3,0.6) : vec4(0.1,0.12,0.15,0.4);
      }
      if (c.a < 0.01) discard;
      gl_FragColor = c;
    }`,
});

const COL = {
  bloom: { stem: 0x4fae4f, head: 0xff7fb0 },
  fern: { stem: 0x2f8a5c, head: 0x7fffe0 },
  cactus: { stem: 0x55a865, head: 0xff6fa0 },
};
const FLOOD = new THREE.Color(0x6a7fd8), THIRST = new THREE.Color(0xb59a52), BURN = new THREE.Color(0xc9a24b);

export class PlantView {
  constructor(plant) {
    this.plant = plant;
    this.group = new THREE.Group();
    this.group.position.set(plant.x, 0, plant.z);
    this.mats = [];
    const c = COL[plant.t];
    this.base = new THREE.Color(c.stem);
    const stemMat = flat(c.stem); this.mats.push(stemMat);
    this.body = new THREE.Group(); this.group.add(this.body);
    this.flower = new THREE.Group(); this.flower.scale.setScalar(0.001);
    if (plant.t === 'bloom') {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0035, 1, 6).translate(0, 0.5, 0), stemMat);
      stem.scale.y = 0.05; this.stem = stem; this.body.add(stem);
      for (const s of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), stemMat);
        leaf.scale.set(1.6, 0.35, 0.7); leaf.position.set(s * 0.01, 0.015, 0); leaf.rotation.z = s * 0.5;
        leaf.castShadow = true; this.body.add(leaf);
      }
      this.bud = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), flat(0xa7d88a));
      this.body.add(this.bud);
      const petal = flat(c.head, { emissive: c.head, emissiveIntensity: 0.25 });
      for (let i = 0; i < 6; i++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), petal);
        const a = i / 6 * Math.PI * 2; p.position.set(Math.cos(a) * 0.009, 0, Math.sin(a) * 0.009); p.scale.set(1, 0.35, 0.6); p.rotation.y = -a;
        this.flower.add(p);
      }
      this.flower.add(new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), flat(0xffd24d, { emissive: 0xffaa00, emissiveIntensity: 0.4 })));
      this.body.add(this.flower);
    } else if (plant.t === 'fern') {
      this.fronds = [];
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.055, 4).translate(0, 0.0275, 0), stemMat);
        const a = i / 6 * Math.PI * 2; f.rotation.order = 'YXZ'; f.rotation.y = a; f.rotation.x = 0.55 + (i % 2) * 0.2;
        f.scale.set(1, 1, 0.35); f.castShadow = true;
        this.fronds.push(f); this.body.add(f);
      }
      const spore = flat(c.head, { emissive: c.head, emissiveIntensity: 1 });
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), spore);
        const a = i / 6 * Math.PI * 2; s.position.set(Math.sin(a) * 0.03, 0.05, Math.cos(a) * 0.03);
        this.flower.add(s);
      }
      this.body.add(this.flower);
    } else {
      const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.035, 4, 8).translate(0, 0.028, 0), stemMat);
      trunk.castShadow = true; this.body.add(trunk);
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.014, 3, 6), stemMat);
        arm.position.set(s * 0.016, 0.032 + s * 0.006, 0); arm.castShadow = true; this.body.add(arm);
      }
      const fl = flat(c.head, { emissive: c.head, emissiveIntensity: 0.3 });
      for (let i = 0; i < 5; i++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), fl);
        const a = i / 5 * Math.PI * 2; p.position.set(Math.cos(a) * 0.006, 0, Math.sin(a) * 0.006); p.scale.set(1, 0.4, 0.6);
        this.flower.add(p);
      }
      this.flower.position.y = 0.058;
      this.body.add(this.flower);
    }
    this.body.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    this.ringMat = ringMat();
    if (NEEDS[plant.t].water === 'dry') { this.ringMat.uniforms.uLo.value = 0; this.ringMat.uniforms.uHi.value = K.DRY; }
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.068).rotateX(-Math.PI / 2), this.ringMat);
    ring.position.y = 0.0015; ring.renderOrder = 2;
    this.group.add(ring);

    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(plant.t, false, false), depthTest: true, transparent: true }));
    this.icon.scale.set(0.036, 0.018, 1); this.icon.position.y = 0.1; this.icon.renderOrder = 3;
    this.group.add(this.icon);
    this.iconKey = '';
    this.pop = 0;
    this.shown = 0;
  }
  update(dt, t) {
    const p = this.plant;
    const h = happy(p);
    const key = `${+h.lightOk}${+h.waterOk}`;
    if (key !== this.iconKey && !p.bloomed) { this.icon.material.map = iconTexture(p.t, h.lightOk, h.waterOk); this.icon.material.needsUpdate = true; this.iconKey = key; }
    this.shown += (p.g - this.shown) * Math.min(1, dt * 6);
    const g = this.shown;
    const ws = waterState(p);
    // body growth
    if (p.t === 'bloom') {
      const hgt = 0.02 + 0.04 * g;
      this.stem.scale.y = hgt; this.bud.position.y = hgt; this.flower.position.y = hgt;
      this.bud.scale.setScalar(0.6 + g * 0.8);
      this.body.scale.setScalar(1);
    } else if (p.t === 'fern') {
      this.body.scale.set(0.45 + 0.55 * g, 0.35 + 0.65 * g, 0.45 + 0.55 * g);
    } else {
      this.body.scale.set(0.8 + 0.2 * g, 0.45 + 0.55 * g, 0.8 + 0.2 * g);
    }
    // droop & tint
    const col = this.base.clone();
    let droop = 0;
    if (!p.bloomed) {
      if (ws === 'flooded') { col.lerp(FLOOD, 0.6); droop = 0.35; }
      else if (ws === 'thirsty') { col.lerp(THIRST, 0.55); droop = 0.25; }
      else if (p.t === 'fern' && p.lit) col.lerp(BURN, 0.4);
    }
    for (const m of this.mats) m.color.lerp(col, Math.min(1, dt * 4));
    this.body.rotation.z += ((droop ? Math.sin(t * 0.7 + p.x * 40) * 0.05 + droop : Math.sin(t * 1.1 + p.x * 40) * 0.04) - this.body.rotation.z) * Math.min(1, dt * 3);
    // bloom pop
    if (p.bloomed) {
      this.pop = Math.min(1, this.pop + dt * 2.2);
      const k = this.pop; const s = 1 + Math.sin(k * Math.PI) * 0.6;
      this.flower.scale.setScalar(Math.max(0.001, k * s));
      if (this.bud) this.bud.visible = false;
      this.flower.rotation.y += dt * 0.5;
      this.icon.visible = false;
      this.ringMat.uniforms.uGold.value = 1;
    } else {
      this.flower.scale.setScalar(0.001);
      this.icon.position.y = 0.1 + Math.sin(t * 2 + p.x * 30) * 0.003;
    }
    this.ringMat.uniforms.uG.value = g;
    this.ringMat.uniforms.uM.value = p.m;
  }
}

// ---------------- Petal burst particles ----------------
export class Burst {
  constructor(parent) {
    this.max = 400;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3); this.col = new Float32Array(this.max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(this.geo, new THREE.PointsMaterial({ size: 0.006, vertexColors: true, transparent: true, depthWrite: false }));
    this.pts.frustumCulled = false;
    parent.add(this.pts);
    this.parts = [];
  }
  emit(x, y, z, color, n = 40, speed = 0.12) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      const a = Math.random() * Math.PI * 2, u = Math.random();
      this.parts.push({ x, y, z, vx: Math.cos(a) * speed * u, vy: speed * (0.6 + Math.random()), vz: Math.sin(a) * speed * u, life: 1.2 + Math.random() * 0.8, c });
    }
  }
  update(dt) {
    let j = 0;
    for (const p of this.parts) {
      p.life -= dt; if (p.life <= 0) continue;
      p.vy -= 0.25 * dt; p.vx *= 0.98; p.vz *= 0.98;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      this.parts[j++] = p;
    }
    this.parts.length = j;
    for (let i = 0; i < this.max; i++) {
      const p = this.parts[i];
      if (p) { this.pos.set([p.x, p.y, p.z], i * 3); this.col.set([p.c.r, p.c.g, p.c.b], i * 3); }
      else this.pos.set([0, -99, 0], i * 3);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

// ---------------- Decorative grass, flowers and pebbles (no gameplay effect) ----------------
export function makeDecor(state, seedStr) {
  let h = 7; for (const c of seedStr) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = new THREE.Group();
  const blocked = [...state.plants.map((p) => [p.x, p.z, 0.04]), ...state.rocks.map((r) => [r.x, r.z, 0.045])];
  const spot = (minR = 0, maxR = K.ISLAND_R - 0.012) => {
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, d = minR + Math.sqrt(rnd()) * (maxR - minR);
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (blocked.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > br)) return [x, z];
    }
    return null;
  };
  const N = 140;
  const blade = new THREE.ConeGeometry(0.0022, 0.016, 3).translate(0, 0.008, 0);
  const inst = new THREE.InstancedMesh(blade, flat(0xffffff), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const c = new THREE.Color();
  let n = 0;
  for (let i = 0; i < N; i++) {
    const s = spot(); if (!s) continue;
    e.set((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5); q.setFromEuler(e);
    const k = 0.6 + rnd() * 0.9; sc.set(k, k, k);
    m.compose(pos.set(s[0], 0, s[1]), q, sc); inst.setMatrixAt(n, m);
    inst.setColorAt(n, c.setHSL(0.27 + rnd() * 0.07, 0.45, 0.32 + rnd() * 0.15)); n++;
  }
  inst.count = n; inst.receiveShadow = true;
  g.add(inst);
  const petalCols = [0xfff1a8, 0xffc4e1, 0xc9d6ff, 0xffffff];
  for (let i = 0; i < 10; i++) {
    const s = spot(0.06); if (!s) continue;
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 6, 4), flat(petalCols[i % 4]));
    f.position.set(s[0], 0.004, s[1]); g.add(f);
  }
  for (let i = 0; i < 7; i++) {
    const s = spot(0.08); if (!s) continue;
    const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.004 + rnd() * 0.004, 0), flat(0xb4b2bc));
    p.position.set(s[0], 0.001, s[1]); p.scale.y = 0.5; p.rotation.y = rnd() * 6; p.receiveShadow = true; g.add(p);
  }
  return g;
}
