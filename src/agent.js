// The Sky Spirit: a context-aware planning agent. It reads the live garden state, works out
// why each plant is unhappy, searches sun positions / cloud placements with the real light
// model, and proposes ONE concrete move (object + destination) with a plain-language reason.
import { K, NEEDS, sunFromAngles, rockSpheres, cloudSphere, isLit, isWet, happy, constrainCloud } from './sim.js';

const NAME = { bloom: 'sunbloom', fern: 'fern', cactus: 'cactus' };
const where = (p) => {
  const fb = p.z > 0.06 ? 'front' : p.z < -0.06 ? 'back' : '';
  const lr = p.x > 0.06 ? 'right' : p.x < -0.06 ? 'left' : '';
  return fb || lr ? `${fb}${fb && lr ? '-' : ''}${lr}` : 'middle';
};
const label = (p) => `the ${where(p)} ${NAME[p.t]}`;

const SUN_GRID = [];
for (let a = 0; a < 32; a++) for (let e = 0; e < 9; e++) SUN_GRID.push(sunFromAngles((a / 32) * Math.PI * 2, K.MIN_EL + e * 0.16));

function lightNeedMet(p, sun, occ) { return isLit(p, sun, occ) === NEEDS[p.t].light; }

// Score a sun position: how many unbloomed plants get the light they want (focus plant must).
function scoreSun(state, sun, occ, focus) {
  if (!lightNeedMet(focus, sun, occ)) return -1;
  let s = 0;
  for (const p of state.plants) if (!p.bloomed && p !== focus && lightNeedMet(p, sun, occ)) s++;
  return s;
}

function bestSun(state, focus, occ) {
  let best = null, bestScore = -1, bestDist = 1e9;
  for (const sun of SUN_GRID) {
    const sc = scoreSun(state, sun, occ, focus);
    if (sc < 0) continue;
    const d = Math.hypot(sun.x - state.sun.x, sun.y - state.sun.y, sun.z - state.sun.z);
    if (sc > bestScore || (sc === bestScore && d < bestDist)) { best = sun; bestScore = sc; bestDist = d; }
  }
  return best;
}

// Where can a cloud go so it no longer rains on `avoid` plants (and ideally not on any dry-lover)?
function parkSpot(state, cloud, avoid) {
  let best = null, bestD = 1e9;
  for (let a = 0; a < 24; a++) for (const d of [0.24, 0.2, 0.15]) {
    const c = { x: Math.sin(a * Math.PI / 12) * d, y: cloud.y, z: Math.cos(a * Math.PI / 12) * d, r: cloud.r };
    if (avoid.some((p) => isWet(p, [c]))) continue;
    if (state.plants.some((p) => !p.bloomed && (NEEDS[p.t].water === 'dry' || p.m > K.HI - 0.1) && isWet(p, [c]))) continue;
    const dd = Math.hypot(c.x - cloud.x, c.z - cloud.z);
    if (dd < bestD) { best = c; bestD = dd; }
  }
  return best;
}

export function plan(state) {
  const todo = state.plants.filter((p) => !p.bloomed);
  if (!todo.length) return null;
  const rockOcc = state.rocks.flatMap(rockSpheres);
  const occ = [...rockOcc, ...state.clouds.map(cloudSphere)];
  const cloudIdx = (c) => state.clouds.indexOf(c);
  // Prefer plants closest to blooming, then fix the most urgent problem on that plant.
  todo.sort((a, b) => b.g - a.g);
  let fallback = null;
  for (const p of todo) {
    const h = happy(p), need = NEEDS[p.t];
    // 1) flooded / too wet for a cactus: move the rain away
    const tooWet = need.water === 'dry' ? p.m >= K.DRY : p.m > K.HI - 0.05;
    const raining = state.clouds.filter((c) => isWet(p, [c]));
    if (tooWet && raining.length) {
      const c = raining[0], spot = parkSpot(state, c, [p]);
      if (spot) return { kind: 'cloud', index: cloudIdx(c), to: spot, say: need.water === 'dry' ? `${cap(label(p))} wants dry soil. Move this cloud away from it.` : `${cap(label(p))} is drowning! Pull this cloud off it.` };
    }
    // 2) thirsty: bring the nearest cloud overhead
    if (need.water === 'moist' && p.m < K.LO + 0.05 && !p.wet && state.clouds.length) {
      const c = [...state.clouds].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      const to = constrainCloud({ x: p.x, y: c.y, z: p.z });
      return { kind: 'cloud', index: cloudIdx(c), to, say: `${cap(label(p))} is thirsty. Drift this cloud over it, then move it away before it floods.` };
    }
    // 3) wrong light: search the sky
    if (!h.lightOk) {
      const sun = bestSun(state, p, occ);
      if (sun) {
        const why = need.light ? (rockOcc.length && !isLit(p, state.sun, rockOcc) ? 'is stuck in a rock\'s shadow' : 'needs sunlight') : 'is getting sunburnt';
        const how = need.light ? 'Swing the sun here to light it.' : 'Drop the sun here so a shadow covers it.';
        return { kind: 'sun', to: sun, say: `${cap(label(p))} ${why}. ${how}` };
      }
      // fern with no rock shade: use a cloud as a parasol (shadow on it, rain beside it)
      if (!need.light && state.clouds.length) {
        for (const sun of SUN_GRID) {
          if (sun.y > 0.2) continue;
          for (const c0 of state.clouds) {
            for (let k = 0.04; k <= 0.12; k += 0.02) {
              const dir = { x: sun.x - p.x, z: sun.z - p.z }, L = Math.hypot(dir.x, dir.z) || 1;
              const c = constrainCloud({ x: p.x + (dir.x / L) * k, y: c0.y, z: p.z + (dir.z / L) * k }); c.r = c0.r;
              if (isWet(p, [c])) continue;
              const others = state.clouds.filter((o) => o !== c0).map(cloudSphere);
              if (!isLit(p, sun, [...rockOcc, ...others, cloudSphere(c)])) {
                if (Math.hypot(state.sun.x - sun.x, state.sun.y - sun.y, state.sun.z - sun.z) > 0.04)
                  return { kind: 'sun', to: sun, say: `No rocks to hide ${label(p)}. First lower the sun here...` };
                return { kind: 'cloud', index: cloudIdx(c0), to: c, say: `...now park this cloud so its shadow (not its rain) covers ${label(p)}.` };
              }
            }
          }
        }
      }
    }
    // 4) cactus still too wet but nothing raining: it just needs sun & time
    if (h.lightOk && !h.waterOk && need.water === 'dry') fallback ||= { kind: 'wait', say: `${cap(label(p))} is drying out in the sun. Give it a few seconds.` };
    else if (h.ok) fallback ||= { kind: 'wait', say: `${cap(label(p))} is happy and growing. Watch its green ring fill.` };
    else if (need.water === 'moist' && p.m < K.LO + 0.05 && p.wet) fallback ||= { kind: 'wait', say: `Rain is soaking ${label(p)}. Keep it there a moment.` };
  }
  return fallback || { kind: 'wait', say: 'Everything is on track. Let the garden grow.' };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
