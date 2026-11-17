// Checks that every plant in every level (and a year of daily islands) can have its
// light need met: some sun position + cloud arrangement makes it lit/shaded as required
// without a cloud raining on it (rain can always be applied earlier and moved away).
import { K, NEEDS, sunFromAngles, rockSpheres, cloudSphere, isLit, isWet, makeState } from '../src/sim.js';
import { LEVELS, dailyLevel } from '../src/levels.js';

const parks = [];
for (let a = 0; a < 16; a++) for (const d of [0.25, 0.12, 0.06]) for (const y of K.CLOUD_Y) parks.push({ x: Math.sin(a * Math.PI / 8) * d, y, z: Math.cos(a * Math.PI / 8) * d, r: 0.045 });

function plantSolvable(st, p) {
  const rockOcc = st.rocks.flatMap(rockSpheres);
  const needLit = NEEDS[p.t].light;
  for (let az = 0; az < 24; az++) for (let e = 0; e < 8; e++) {
    const sun = sunFromAngles(az * Math.PI / 12, K.MIN_EL + e * 0.18);
    if (isLit(p, sun, rockOcc) === needLit) return true;          // clouds parked far away
    if (!needLit && st.clouds.length) {                            // cloud parasol
      for (const c of parks) {
        if (isWet(p, [c])) continue;
        if (!isLit(p, sun, [...rockOcc, cloudSphere(c)])) return true;
      }
    }
  }
  return false;
}
let fail = 0, n = 0;
const check = (L) => {
  const st = makeState(L);
  st.plants.forEach((p, i) => { n++; if (!plantSolvable(st, p)) { fail++; console.log('UNSOLVABLE', L.id, L.daily || '', i, p.t); } });
  for (const p of st.plants) for (const r of st.rocks.flatMap(rockSpheres)) if (Math.hypot(p.x - r.x, p.z - r.z) < r.r) { fail++; console.log('PLANT IN ROCK', L.id, L.daily || ''); }
};
LEVELS.forEach(check);
for (let d = 0; d < 365; d++) check(dailyLevel(new Date(Date.UTC(2026, 10, 1) + d * 864e5).toISOString().slice(0, 10)));
console.log(`${n} plants checked, ${fail} problems`);
process.exit(fail ? 1 : 0);
