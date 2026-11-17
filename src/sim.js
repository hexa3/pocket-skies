// Pure simulation: no three.js, no DOM. Units are meters in island-local space.
// Island top surface is y = 0, centred on the origin, +z points toward the player.

export const K = {
  ISLAND_R: 0.2,
  DOME_R: 0.27,      // sun travels on this dome
  MIN_EL: 0.12,      // lowest sun elevation (rad)
  CLOUD_Y: [0.12, 0.22],
  CLOUD_MAX_R: 0.25,
  RAIN: 0.2,         // moisture / s while under a cloud
  EVAP_LIT: 0.05,
  EVAP_SHADE: 0.015,
  GROW: 1 / 5,       // 5 s of happiness to bloom
  DECAY: 0.04,
  LO: 0.2,           // minimum moisture for bloom & fern
  HI: 1.0,           // above this = flooded
  DRY: 0.25,         // cactus needs moisture below this
  M_MAX: 1.15,
  PLANT_EYE: 0.03,   // height the light test is taken from
};

export const NEEDS = {
  bloom:  { light: true,  water: 'moist', label: 'Sunbloom' },
  fern:   { light: false, water: 'moist', label: 'Shade fern' },
  cactus: { light: true,  water: 'dry',   label: 'Sun cactus' },
};

export function sunFromAngles(az, el, out = { x: 0, y: 0, z: 0 }) {
  out.x = Math.sin(az) * Math.cos(el) * K.DOME_R;
  out.y = Math.sin(el) * K.DOME_R;
  out.z = Math.cos(az) * Math.cos(el) * K.DOME_R;
  return out;
}

// Project an arbitrary point onto the sun dome, respecting minimum elevation.
export function constrainSun(p) {
  let len = Math.hypot(p.x, p.y, p.z);
  if (len < 1e-5) { p.x = 0; p.y = K.DOME_R; p.z = 0; return p; }
  let el = Math.asin(Math.max(-1, Math.min(1, p.y / len)));
  const az = Math.atan2(p.x, p.z);
  if (el < K.MIN_EL) el = K.MIN_EL;
  if (el > Math.PI / 2 - 0.02) el = Math.PI / 2 - 0.02;
  return sunFromAngles(az, el, p);
}

export function constrainCloud(p) {
  p.y = Math.max(K.CLOUD_Y[0], Math.min(K.CLOUD_Y[1], p.y));
  const r = Math.hypot(p.x, p.z);
  if (r > K.CLOUD_MAX_R) { p.x *= K.CLOUD_MAX_R / r; p.z *= K.CLOUD_MAX_R / r; }
  return p;
}

// Rocks are stacks of spheres; the same spheres are used for visuals and light tests.
export function rockSpheres(rock) {
  const w = rock.w || 1;
  const n = Math.max(1, Math.round(rock.h / 0.028));
  const r0 = 0.034 * w;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const r = r0 * (1 - 0.32 * t);
    const y = r0 * 0.55 + t * Math.max(0, rock.h - r0 * 0.55 - r * 0.8);
    const j = Math.sin(i * 2.3 + rock.x * 50 + rock.z * 31) * 0.006;
    const k = Math.cos(i * 1.7 + rock.z * 47) * 0.006;
    parts.push({ x: rock.x + j * t, y, z: rock.z + k * t, r });
  }
  return parts;
}

export const cloudSphere = (c) => ({ x: c.x, y: c.y, z: c.z, r: c.r * 0.75 });

function segHitsSphere(px, py, pz, sx, sy, sz, s) {
  const dx = sx - px, dy = sy - py, dz = sz - pz;
  const cx = s.x - px, cy = s.y - py, cz = s.z - pz;
  const dd = dx * dx + dy * dy + dz * dz;
  let t = (cx * dx + cy * dy + cz * dz) / dd;
  t = Math.max(0, Math.min(1, t));
  const qx = dx * t - cx, qy = dy * t - cy, qz = dz * t - cz;
  return qx * qx + qy * qy + qz * qz < s.r * s.r;
}

export function isLit(plant, sun, occluders) {
  for (const s of occluders) {
    if (segHitsSphere(plant.x, K.PLANT_EYE, plant.z, sun.x, sun.y, sun.z, s)) return false;
  }
  return true;
}

export function isWet(plant, clouds) {
  for (const c of clouds) if (Math.hypot(plant.x - c.x, plant.z - c.z) < c.r) return true;
  return false;
}

export function happy(plant) {
  const n = NEEDS[plant.t];
  const lightOk = n.light ? plant.lit : !plant.lit;
  const waterOk = n.water === 'dry' ? plant.m < K.DRY : plant.m >= K.LO && plant.m <= K.HI;
  return { lightOk, waterOk, ok: lightOk && waterOk };
}

export function waterState(plant) {
  const n = NEEDS[plant.t];
  if (n.water === 'dry') return plant.m < K.DRY ? 'ok' : (plant.m > K.HI ? 'flooded' : 'wet');
  if (plant.m > K.HI) return 'flooded';
  if (plant.m < K.LO) return 'thirsty';
  return 'ok';
}

// Advance the whole garden. Returns array of plants that just bloomed.
export function step(state, dt) {
  const occ = [];
  for (const r of state.rocks) for (const s of rockSpheres(r)) occ.push(s);
  for (const c of state.clouds) occ.push(cloudSphere(c));
  const bloomed = [];
  for (const p of state.plants) {
    p.lit = isLit(p, state.sun, occ);
    p.wet = isWet(p, state.clouds);
    if (p.wet) p.m += K.RAIN * dt;
    p.m -= (p.lit ? K.EVAP_LIT : K.EVAP_SHADE) * dt;
    p.m = Math.max(0, Math.min(K.M_MAX, p.m));
    if (p.bloomed) continue;
    const h = happy(p);
    p.happy = h.ok;
    if (h.ok) p.g += K.GROW * dt;
    else p.g = Math.max(0, p.g - K.DECAY * dt);
    if (p.g >= 1) { p.g = 1; p.bloomed = true; bloomed.push(p); }
  }
  return bloomed;
}

export function makeState(level) {
  const sun = level.sun.pos ? { ...level.sun.pos } : sunFromAngles(level.sun.az, level.sun.el);
  return {
    sun,
    plants: level.plants.map((p) => ({ t: p.t, x: p.x, z: p.z, m: p.m ?? 0.5, g: 0, bloomed: false, lit: false, wet: false, happy: false })),
    rocks: level.rocks.map((r) => ({ ...r })),
    clouds: level.clouds.map((c) => ({ x: c.x, y: c.y, z: c.z, r: c.r ?? 0.045 })),
  };
}

export const allBloomed = (s) => s.plants.every((p) => p.bloomed);

export function starsFor(time, par) {
  if (time <= par) return 3;
  if (time <= par * 2) return 2;
  return 1;
}
