// Trailer director: drives the emulated Quest 3 (head, right hand, pinches, pokes) through real
// gameplay on a fixed timeline. Runs inside test/xr.html?capture, one call per captured frame.
// Nothing here edits game state directly except: loading levels (scene cuts), toggling options,
// a labelled time-lapse speed, and seeding a returning player's save for the "come back" scene.
export function makeDirector() {
  const ps = window.__ps, dev = window.__device, T = ps.THREE;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const L = (x, y, z) => ps.board.localToWorld(V(x, y, z));
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const clamp01 = (u) => Math.max(0, Math.min(1, u));
  const hand = dev.hands.right, left = dev.hands.left;
  const rIdx = () => ps.inputs.findIndex((i) => i.source?.handedness === 'right');
  const HEAD = V(0, 1.12, -1.4);
  const cap = document.getElementById('cap'), card = document.getElementById('card');
  let capText = '';
  const caption = (s) => { if (s !== capText) { capText = s; cap.style.opacity = s ? 1 : 0; if (s) cap.textContent = s; } };

  function look(target, pos = HEAD) {
    const m = new T.Matrix4().lookAt(pos, target, V(0, 1, 0));
    const q = new T.Quaternion().setFromRotationMatrix(m);
    dev.position.set(pos.x, pos.y, pos.z); dev.quaternion.set(q.x, q.y, q.z, q.w);
  }
  function jointW(name) { const k = rIdx(); const j = k >= 0 && ps.inputs[k].hand.joints[name]; return j ? j.getWorldPosition(V(0, 0, 0)) : null; }
  function pinchW() { const a = jointW('index-finger-tip'), b = jointW('thumb-tip'); return a && b ? a.add(b).multiplyScalar(0.5) : null; }
  // put the pinch point (or index fingertip) at a world position
  function handTo(w, tip = false) {
    const cur = tip ? jointW('index-finger-tip') : pinchW(); if (!cur) return;
    const hp = V(hand.position.x, hand.position.y, hand.position.z);
    const off = cur.sub(hp);
    hand.position.set(w.x - off.x, w.y - off.y, w.z - off.z);
  }
  const REST = () => L(0.36, 0.02, 0.12); // off to the right, never through the console
  const sunW = () => { const s = ps.state.sun; return L(s.x, s.y, s.z); };
  const cloudW = (i = 0) => { const c = ps.state.clouds[i]; return L(c.x, c.y, c.z); };
  const btnW = (b, push = 0) => { const p = b.group.getWorldPosition(V(0, 0, 0)); const n = V(0, 0, 1).transformDirection(b.group.matrixWorld); return p.addScaledVector(n, push); };
  const pinch = (v) => hand.updatePinchValue(v);

  // ---- tiny timeline helpers ----
  const segs = [], once = [];
  const seg = (t0, t1, fn) => segs.push({ t0, t1, fn });
  const at = (t, fn) => once.push({ t, fn, done: false });
  const islandCenter = () => L(0, 0.0, -0.04);
  let headTarget = null;
  // Move the hand from wherever it is to target() over [t0,t1].
  function moveHand(t0, t1, target, tip = false) {
    let from = null;
    seg(t0, t1, (u) => { const cur = tip ? jointW('index-finger-tip') : pinchW(); if (!from) from = cur || REST(); handTo(from.clone().lerp(target(), ease(u)), tip); });
    at(t1 + 0.001, () => { from = null; });
  }
  // Pinch an object, then carry it so it ends at the wanted LOCAL position.
  function grabAndDrag(t0, t1, objW, endLocalFn, gain) {
    let startHand = null, startObj = null;
    at(t0, () => { pinch(1); });
    seg(t0 + 0.15, t1, (u) => {
      if (!startHand) { startHand = pinchW(); startObj = objW(); }
      const endL = endLocalFn(); const endW = L(endL.x, endL.y, endL.z);
      const handEnd = startHand.clone().add(endW.clone().sub(startObj).multiplyScalar(1 / gain));
      handTo(startHand.clone().lerp(handEnd, ease(u)));
    });
    at(t1 + 0.05, () => { pinch(0); startHand = null; });
  }
  function poke(t0, button) {
    moveHand(t0, t0 + 1.0, () => btnW(button(), 0.05), true);
    moveHand(t0 + 1.0, t0 + 1.35, () => btnW(button(), -0.012), true);
    moveHand(t0 + 1.35, t0 + 1.7, () => btnW(button(), 0.06), true);
  }

  // ================= SCRIPT =================
  // S1: place the island on the real desk
  at(0, () => { caption('Pocket Skies — a tiny island on your real desk.'); left.position.set(-0.5, 0.4, -1.0); });
  seg(0, 3.0, (u) => { headTarget = V(0.35 - 0.35 * ease(u), 1.0 - 0.27 * ease(u), -1.9); });
  at(0.2, () => handTo(L(0.1, -0.15, 0.32)));
  at(3.0, () => pinch(1)); at(3.25, () => pinch(0));
  seg(3.0, 999, () => { if (!ps.mr.placing) headTarget = islandCenter(); });
  // S2: First Light — the ghost hand teaches, then you do it
  at(5.2, () => caption('No manuals. A ghost hand shows you the gesture...'));
  moveHand(9.0, 10.3, () => sunW());
  at(10.0, () => caption('...pinch the sun and lift it. The shadows move for real.'));
  grabAndDrag(10.4, 12.4, sunW, () => V(0.0, 0.235, 0.1), 1.7);
  moveHand(12.6, 13.6, REST);
  // win ~17.6 -> ghost shows the poke on NEXT; we poke it
  at(17.0, () => caption('Your first flower — in about ten seconds.'));
  poke(18.0, () => ps.btns.btnNext);
  // S3: First Rain
  at(19.8, () => caption('Pinch a cloud to drag the rain.'));
  moveHand(20.0, 21.2, () => cloudW(0));
  grabAndDrag(21.3, 23.3, () => cloudW(0), () => V(0, ps.state.clouds[0].y, 0), 1);
  moveHand(23.5, 24.5, REST);
  at(24.5, () => caption('A low sun throws the cloud\'s shadow aside, so the flower gets rain AND light.'));
  // S4: Two Sides
  at(31.0, () => { ps.loadLevel(ps.LEVELS[4]); caption('Every plant wants something different...'); });
  moveHand(31.4, 32.6, () => sunW());
  at(33.0, () => caption('...one sun has to please them all.'));
  grabAndDrag(32.8, 35.0, sunW, () => V(0.25, 0.075, 0.03), 1.7);
  moveHand(35.2, 36.2, REST);
  // S5: Grand Garden + Sky Spirit
  at(42.5, () => { ps.loadLevel(ps.LEVELS[9]); caption('Stuck? The Sky Spirit reads your garden and plans the next move.'); });
  poke(43.5, () => ps.btnHint);
  at(47.5, () => caption('...and if your hands get tired, it can do it for you.'));
  poke(48.0, () => ps.btnHint);
  moveHand(49.8, 50.6, REST);
  at(51.0, () => { window.__capture.speed = 6; caption('(time-lapse: following the Sky Spirit\'s plan)'); });
  // the spirit loop: Hint, then Do it, every 2 s of game time until the garden is in full bloom
  let phase2At = null;
  seg(51.2, 140, (u, t) => {
    const done = ps.state.plants.every((p) => p.bloomed);
    if (done) {
      if (phase2At === null) { window.__capture.speed = 1; caption('Butterflies visit every flower you bloom.'); phase2At = t + 4.5; phase2(phase2At); }
      return;
    }
    const k = (t - 51.2) % 2.0, prev = ((t - 51.2) - 1 / 24 * window.__capture.speed) % 2.0;
    if (k < prev) ps.btnHint.press();                       // new cycle: ask for a hint
    else if (k >= 0.4 && prev < 0.4 && ps.btnHint.label === 'Do it') ps.btnHint.press(); // let the spirit do it
  });
  function phase2(T) {
    // S6: hands-free head gaze
    at(T, () => { ps.save.headGaze = true; ps.refreshTiles(); ps.loadLevel(ps.LEVELS[0]); left.position.set(-0.5, 0.2, -1.0); hand.position.set(0.5, 0.2, -1.0); caption('Fully playable with NO hands: look at the sun to pick it up...'); gazeOn = [T, T + 12.5]; });
    let gz0 = null;
    seg(T + 0.2, T + 1.6, () => { headTarget = sunW(); });
    at(T + 1.6, () => { gz0 = headTarget.clone(); caption('...look where it should go, hold still to drop it.'); });
    seg(T + 1.6, T + 3.8, (u) => { headTarget = gz0.clone().lerp(L(0.0, 0.0, 0.16), ease(u)); });
    seg(T + 3.8, T + 8.0, () => { headTarget = L(0.0, 0.0, 0.16); });
    seg(T + 8.0, T + 12.5, () => { headTarget = islandCenter(); });
    at(T + 9.0, () => caption('Plus one-handed play, far pinch, eye-gaze + pinch, high contrast and a bigger island.'));
    // S7: reason to come back
    const R = T + 13.5;
    at(R, () => {
      ps.save.headGaze = false;
      Object.assign(ps.save, { stars: Object.fromEntries(ps.LEVELS.map((l, i) => [l.id, i < 8 ? 3 : 2])), streak: 6, dailyCount: 6, lastDaily: new Date().toISOString().slice(0, 10) });
      ps.rebuildGarden(); ps.refreshTiles(); ps.loadLevel(ps.dailyLevel());
      caption('Every star plants a flower in your garden. Daily Islands grow your streak tree.');
    });
    seg(R, R + 8.5, (u) => { const a = -0.5 + u; headTarget = L(Math.sin(a) * 0.12, 0.02, 0); });
    at(R + 5.0, () => { ps.openMenu('levels'); caption('A brand-new island every day, the same for everyone.'); });
    at(R + 8.0, () => ps.openMenu(null));
    // S8: end card
    at(R + 9.5, () => { caption(''); card.style.opacity = 1; window.__trailerEnd = R + 14; });
  }
  let gazeOn = [0, 0];

  return function direct(t) {
    for (const o of once) if (!o.done && t >= o.t) { o.done = true; o.fn(); }
    for (const s of segs) if (t >= s.t0 && t <= s.t1) s.fn(clamp01((t - s.t0) / (s.t1 - s.t0)), t);
    const tgt = headTarget || V(0.35, 1.0, -1.9);
    // gentle seated sway so it feels like a real head
    const sway = V(Math.sin(t * 0.7) * 0.006, Math.sin(t * 0.9) * 0.004, 0);
    if (t > gazeOn[0] && t < gazeOn[1]) look(tgt, HEAD); else look(tgt, HEAD.clone().add(sway));
  };
}
export const TRAILER_LENGTH = 98;
