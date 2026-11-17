// The Sky Spirit must be able to solve every island on its own: an autopilot that only
// follows plan() (teleporting the object it names) must bloom everything.
import { makeState, step, allBloomed } from '../src/sim.js';
import { LEVELS, dailyLevel } from '../src/levels.js';
import { plan } from '../src/agent.js';

function autopilot(def, maxT = 400) {
  const st = makeState(def);
  let t = 0;
  while (t < maxT && !allBloomed(st)) {
    const a = plan(st);
    if (a?.kind === 'sun') Object.assign(st.sun, { x: a.to.x, y: a.to.y, z: a.to.z });
    if (a?.kind === 'cloud') Object.assign(st.clouds[a.index], { x: a.to.x, y: a.to.y, z: a.to.z });
    for (let i = 0; i < 5; i++) { step(st, 0.1); t += 0.1; }
  }
  return { ok: allBloomed(st), t };
}
let fail = 0, worst = 0;
for (const L of LEVELS) { const r = autopilot(L); worst = Math.max(worst, r.t); if (!r.ok) { fail++; console.log('SPIRIT FAILED', L.id); } else console.log(L.id, Math.round(r.t) + 's'); }
for (let d = 0; d < 365; d++) {
  const key = new Date(Date.UTC(2026, 10, 1) + d * 864e5).toISOString().slice(0, 10);
  const r = autopilot(dailyLevel(key)); worst = Math.max(worst, r.t);
  if (!r.ok) { fail++; if (fail < 15) console.log('SPIRIT FAILED daily', key); }
}
console.log(`spirit autopilot: ${fail} failures, slowest ${Math.round(worst)}s`);
process.exit(fail ? 1 : 0);
