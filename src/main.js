import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { K, NEEDS, makeState, step, allBloomed, starsFor, constrainCloud, constrainSun } from './sim.js';
import { LEVELS, dailyLevel, todayKey } from './levels.js';
import { makeSky, makeIsland, makeDecor, makeScenery, makeRock, CloudView, SunView, PlantView, Burst, makeDomeGuide } from './world.js';
import { Card, Button } from './ui.js';
import { initAudio, sfx, setRain, setMuted, isMuted } from './audio.js';

// ======================= Renderer / scene =======================
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 200);
const sky = makeSky(); scene.add(sky);
const scenery = makeScenery(scene);
const hemi = new THREE.HemisphereLight(0xdfefff, 0x6a5a4a, 0.9); scene.add(hemi);

const board = new THREE.Group();
board.position.set(0, 0.95, -0.5);
scene.add(board);
const island = makeIsland(); board.add(island);
const content = new THREE.Group(); board.add(content);
const domeGuide = makeDomeGuide(); board.add(domeGuide);

const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.0015;
board.add(sunLight); board.add(sunLight.target);
function setShadowBounds(s) {
  const c = sunLight.shadow.camera, b = 0.34 * s;
  c.left = -b; c.right = b; c.top = b; c.bottom = -b; c.near = 0.01; c.far = 1.5 * s; c.updateProjectionMatrix();
}
setShadowBounds(1);

const sunView = new SunView(); board.add(sunView.group);
const burst = new Burst(board);

// Pulsing tutorial halo ("pinch me")
const halo = new THREE.Mesh(new THREE.RingGeometry(0.034, 0.04, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
halo.visible = false; board.add(halo);

// ======================= Save data =======================
const SAVE_KEY = 'pocketskies.v1';
let save = { stars: {}, best: {}, streak: 0, lastDaily: '', sizeBig: false, muted: false };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch { /* private mode */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ } };
setMuted(save.muted);

// ======================= Level state =======================
let levelDef, state, plantViews = [], cloudViews = [], grabbables = [];
let timer = 0, started = false, won = false, wonTime = 0, menuOpen = false, paused = false, everGrabbed = false;
let introT = 0;

function levelIndex() { return LEVELS.findIndex((l) => l.id === levelDef?.id); }

function loadLevel(def) {
  levelDef = def;
  state = makeState(def);
  content.clear();
  plantViews = state.plants.map((p) => { const v = new PlantView(p); content.add(v.group); return v; });
  for (const r of state.rocks) content.add(makeRock(r));
  content.add(makeDecor(state, def.id + (def.daily || '')));
  cloudViews = state.clouds.map((c) => { const v = new CloudView(c); content.add(v.group); return v; });
  grabbables = [
    { kind: 'sun', pos: state.sun, r: 0.045, view: sunView },
    ...cloudViews.map((v) => ({ kind: 'cloud', pos: v.cloud, r: v.cloud.r * 1.25, view: v })),
  ];
  timer = 0; started = false; won = false; introT = 0;
  for (const i of inputs) i.held = null;
  mouse.held = null;
  setMenu(false);
  btnNext.pulse = false;
  drawInfo(true);
  setRain(state.clouds.length ? 0.6 : 0);
}

function nextLevel() {
  const i = levelIndex();
  if (levelDef.daily) return loadLevel(LEVELS[0]);
  if (i >= LEVELS.length - 1) return loadLevel(dailyLevel());
  loadLevel(LEVELS[i + 1]);
}

function onWin() {
  won = true; wonTime = timer;
  const id = levelDef.id === 'daily' ? 'daily:' + levelDef.daily : levelDef.id;
  const stars = starsFor(timer, levelDef.par);
  save.stars[id] = Math.max(save.stars[id] || 0, stars);
  save.best[id] = Math.min(save.best[id] ?? 1e9, timer);
  if (levelDef.daily) {
    const today = levelDef.daily;
    const y = new Date(Date.parse(today) - 864e5).toISOString().slice(0, 10);
    if (save.lastDaily !== today) { save.streak = save.lastDaily === y ? save.streak + 1 : 1; save.lastDaily = today; }
  }
  persist();
  sfx('win');
  for (const p of state.plants) burst.emit(p.x, 0.06, p.z, 0xffd25e, 30, 0.15);
  btnNext.pulse = true;
  refreshGrid();
  drawInfo(true);
}

// ======================= UI =======================
const info = new Card(0.36, 0.13);
info.group.position.set(0, 0.31, -0.3);
board.add(info.group);
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
let infoKey = '';
function drawInfo(force) {
  const n = state.plants.filter((p) => p.bloomed).length, N = state.plants.length;
  const t = won ? wonTime : timer;
  const key = `${levelDef.id}|${n}|${Math.floor(t)}|${won}|${paused}|${save.streak}`;
  if (!force && key === infoKey) return;
  infoKey = key;
  const x = info.begin(), W = info.canvas.width, H = info.canvas.height, P = 26;
  const idx = levelIndex();
  const title = levelDef.daily ? levelDef.name : `${idx + 1}. ${levelDef.name}`;
  info.text(title, P, P - 4, { size: 34, weight: 800 });
  const sid = levelDef.daily ? 'daily:' + levelDef.daily : levelDef.id;
  const best = save.stars[sid] || 0;
  if (best) info.text('★'.repeat(best), W - P, P - 2, { size: 30, align: 'right', color: '#ffd25e' });
  if (won) {
    const s = starsFor(wonTime, levelDef.par);
    info.text(`All bloomed in ${fmt(wonTime)}!  ${starStr(s)}`, P, 70, { size: 30, color: '#9dffb5', weight: 700 });
    let msg = levelDef.daily ? `Daily streak: ${save.streak} day${save.streak === 1 ? '' : 's'}. Come back tomorrow for a new island.` : (s < 3 ? `Beat ${fmt(levelDef.par)} for three stars (RETRY), or poke NEXT for a new island.` : 'Perfect! Poke NEXT for a new island.');
    info.text(msg, P, 112, { size: 22, color: '#cfe0ff', maxW: W - P * 2 });
  } else {
    info.text(levelDef.hint, P, 62, { size: 22, color: '#dbe6ff', maxW: W - P * 2, weight: 500 });
    const foot = paused ? 'Paused' : `Blooms ${n}/${N}   ·   ${fmt(t)}   ·   par ${fmt(levelDef.par)}`;
    info.text(foot, P, H - 44, { size: 22, color: '#ffd25e' });
  }
  info.end();
}

// ---- console (bottom-front) ----
const consoleGrp = new THREE.Group();
consoleGrp.position.set(0, -0.055, 0.255);
consoleGrp.rotation.x = -0.85;
board.add(consoleGrp);
const buttons = [];
const addBtn = (label, onPress, parent, x, y, w = 0.064, h = 0.036, opts) => {
  const b = new Button(label, w, h, onPress, opts); b.group.position.set(x, y, 0); parent.add(b.group); buttons.push(b); return b;
};
const cw = 0.068;
const btnLevels = addBtn('Islands', () => setMenu(!menuOpen), consoleGrp, -2.5 * cw, 0);
const btnRetry = addBtn('Retry', () => loadLevel(levelDef.daily ? dailyLevel(levelDef.daily) : levelDef), consoleGrp, -1.5 * cw, 0);
const btnNext = addBtn('Next', () => nextLevel(), consoleGrp, -0.5 * cw, 0, 0.064, 0.036, { accent: 'rgba(40,120,80,0.95)' });
const btnSize = addBtn(save.sizeBig ? 'Smaller' : 'Bigger', () => { save.sizeBig = !save.sizeBig; persist(); applySize(); if (renderer.xr.isPresenting) needsRecenter = true; }, consoleGrp, 0.5 * cw, 0);
const btnCenter = addBtn('Recenter', () => { needsRecenter = true; }, consoleGrp, 1.5 * cw, 0);
const btnSound = addBtn(save.muted ? 'Sound off' : 'Sound on', () => { save.muted = !save.muted; setMuted(save.muted); persist(); btnSound.set(save.muted ? 'Sound off' : 'Sound on'); }, consoleGrp, 2.5 * cw, 0);

function applySize() {
  const s = save.sizeBig ? 1.45 : 1;
  board.scale.setScalar(s);
  setShadowBounds(s);
  btnSize.set(save.sizeBig ? 'Smaller' : 'Bigger');
}

// ---- level grid ----
const grid = new THREE.Group();
grid.position.set(0, 0.13, 0.08);
grid.rotation.x = -0.25;
board.add(grid);
const gridBg = new Card(0.4, 0.235, { bg: 'rgba(14,18,34,0.94)' });
gridBg.mesh.position.z = -0.006; grid.add(gridBg.group);
{
  const x = gridBg.begin();
  gridBg.text('Choose an island', 24, 14, { size: 26, weight: 800 });
  gridBg.end();
}
const tiles = [];
const TW = 0.088, TH = 0.05, GAP = 0.007;
for (let i = 0; i < 12; i++) {
  const c = i % 4, r = Math.floor(i / 4);
  const x = (c - 1.5) * (TW + GAP), y = 0.05 - r * (TH + GAP) - 0.012;
  let b;
  if (i < 10) b = addBtn(`${i + 1}`, () => loadLevel(LEVELS[i]), grid, x, y, TW, TH, { sub: '' });
  else if (i === 10) b = addBtn('Daily', () => loadLevel(dailyLevel()), grid, x, y, TW, TH, { sub: '', accent: 'rgba(120,70,150,0.95)' });
  else b = addBtn('Back', () => setMenu(false), grid, x, y, TW, TH, { accent: 'rgba(70,70,90,0.95)' });
  tiles.push(b);
}
function refreshGrid() {
  LEVELS.forEach((l, i) => tiles[i].set(`${i + 1} ${l.name}`, save.stars[l.id] ? '★'.repeat(save.stars[l.id]) : 'new'));
  const dk = 'daily:' + todayKey();
  tiles[10].set('Daily', save.stars[dk] ? `${starStr(save.stars[dk])}` : `streak ${save.streak}`);
}
refreshGrid();
function setMenu(open) {
  menuOpen = open;
  grid.visible = open;
  content.visible = !open;
  sunView.group.visible = !open;
  for (const i of inputs) i.held = null;
  btnLevels.set(open ? 'Close' : 'Islands');
}

let pressCool = 0;
function pressButton(b) {
  if (pressCool > 0 || !b.active()) return false;
  pressCool = 0.35; initAudio(); sfx('click'); b.press(); return true;
}

// ======================= XR input =======================
const handFactory = new XRHandModelFactory();
const ctrlFactory = new XRControllerModelFactory();
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const raycaster = new THREE.Raycaster();

function makeCursor() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false }));
  m.renderOrder = 10; m.visible = false; scene.add(m); return m;
}
function makeRay() {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8 }));
  l.visible = false; return l;
}
const inputs = [0, 1].map((i) => {
  const controller = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  const hand = renderer.xr.getHand(i);
  grip.add(ctrlFactory.createControllerModel(grip));
  hand.add(handFactory.createHandModel(hand, 'mesh'));
  scene.add(controller, grip, hand);
  const inp = { i, controller, grip, hand, isHand: false, connected: false, source: null, held: null, poke: new Set(), ray: makeRay(), cursor: makeCursor(), target: null };
  controller.add(inp.ray);
  controller.addEventListener('connected', (e) => { inp.connected = true; inp.isHand = !!e.data.hand; inp.source = e.data; });
  controller.addEventListener('disconnected', () => { inp.connected = false; inp.held = null; inp.cursor.visible = false; inp.ray.visible = false; });
  controller.addEventListener('selectstart', () => onSelectStart(inp));
  controller.addEventListener('selectend', () => onSelectEnd(inp));
  return inp;
});

const joint = (inp, name) => { const j = inp.hand.joints?.[name]; return j && j.visible !== false ? j : null; };
function pinchPoint(inp, out) {
  if (inp.isHand) {
    const a = joint(inp, 'index-finger-tip'), b = joint(inp, 'thumb-tip');
    if (!a || !b) return null;
    a.getWorldPosition(out); b.getWorldPosition(tmpV2);
    return out.add(tmpV2).multiplyScalar(0.5);
  }
  return inp.grip.getWorldPosition(out);
}
function worldRay(inp, o, d) {
  inp.controller.getWorldPosition(o);
  inp.controller.getWorldQuaternion(tmpQ);
  d.set(0, 0, -1).applyQuaternion(tmpQ);
}
const toLocal = (w) => board.worldToLocal(w.clone());
function localRay(o, d) {
  const lo = board.worldToLocal(o.clone());
  const ld = board.worldToLocal(o.clone().add(d)).sub(lo).normalize();
  return { o: lo, d: ld };
}
function raySphere(o, d, c, r) {
  const t = tmpV2.copy(c).sub(o).dot(d);
  if (t < 0) return -1;
  const d2 = tmpV2.copy(c).sub(o).lengthSq() - t * t;
  return d2 < r * r ? t : -1;
}
const activeButtons = () => buttons.filter((b) => b.active());
const scaleNow = () => board.scale.x;

// Find what a pinch would act on right now.
function findTarget(origin, dir, pinchW) {
  let best = null;
  if (pinchW && !menuOpen) {
    for (const g of grabbables) {
      const d = board.localToWorld(tmpV.set(g.pos.x, g.pos.y, g.pos.z)).distanceTo(pinchW);
      if (d < g.r * scaleNow() && (!best || d < best.d)) best = { type: 'grab', g, mode: 'direct', d };
    }
    if (best) return best;
  }
  if (!origin) return null;
  raycaster.set(origin, dir); raycaster.far = 3;
  const hits = raycaster.intersectObjects(activeButtons().map((b) => b.mesh), false);
  if (hits.length) best = { type: 'button', b: hits[0].object.userData.button, mode: 'ray', d: hits[0].distance };
  if (!menuOpen) {
    for (const g of grabbables) {
      const c = board.localToWorld(new THREE.Vector3(g.pos.x, g.pos.y, g.pos.z));
      const t = raySphere(origin, dir, c, g.r * 1.15 * scaleNow());
      if (t >= 0 && (!best || t < best.d)) best = { type: 'grab', g, mode: 'ray', d: t };
    }
  }
  return best;
}

function beginHold(holder, target, pinchW, origin, dir) {
  const g = target.g;
  const h = { g, mode: target.mode, offset: new THREE.Vector3(), start: new THREE.Vector3(g.pos.x, g.pos.y, g.pos.z), handStart: new THREE.Vector3() };
  if (target.mode === 'direct') {
    const pl = toLocal(pinchW);
    h.handStart.copy(pl);
    h.offset.copy(h.start).sub(pl);
  } else {
    const r = localRay(origin, dir);
    h.handStart.copy(r.o);
    const hit = rayPlaneY(r, g.pos.y);
    if (hit) h.offset.copy(h.start).sub(hit);
    if (holder.isMouse) {
      h.planeN = r.d.clone().negate();
      h.planeHit = rayPlane(r, h.start, h.planeN) || h.start.clone();
    }
  }
  holder.held = h;
  if (!started) { started = true; }
  everGrabbed = true;
  sfx('grab');
  pulse(holder, 0.5, 30);
}
function rayPlaneY(r, y) {
  if (Math.abs(r.d.y) < 1e-4) return null;
  const t = (y - r.o.y) / r.d.y; if (t < 0) return null;
  return r.o.clone().addScaledVector(r.d, t);
}
function rayPlane(r, p, n) {
  const den = r.d.dot(n); if (Math.abs(den) < 1e-5) return null;
  const t = tmpV2.copy(p).sub(r.o).dot(n) / den; if (t < 0) return null;
  return r.o.clone().addScaledVector(r.d, t);
}

function updateHold(holder, pinchW, origin, dir) {
  const h = holder.held; if (!h) return;
  const g = h.g, p = g.pos;
  const target = new THREE.Vector3();
  if (h.mode === 'direct') {
    if (!pinchW) return;
    const pl = toLocal(pinchW);
    if (g.kind === 'cloud') target.copy(pl).add(h.offset);
    else target.copy(h.start).addScaledVector(pl.sub(h.handStart), 1.7);
  } else {
    const r = localRay(origin, dir);
    if (g.kind === 'cloud') {
      const hit = rayPlaneY(r, p.y); if (!hit) return;
      target.copy(hit).add(h.offset); target.y = p.y;
    } else if (holder.isMouse) {
      const hit = rayPlane(r, h.start, h.planeN); if (!hit) return;
      target.copy(h.start).addScaledVector(hit.sub(h.planeHit), 1.4);
    } else {
      // far pinch on the sun: relative hand motion, amplified
      target.copy(h.start).addScaledVector(r.o.clone().sub(h.handStart), 2.6);
    }
  }
  if (g.kind === 'cloud') constrainCloud(target); else constrainSun(target);
  p.x = target.x; p.y = target.y; p.z = target.z;
}

function pulse(holder, v, ms) {
  try { holder.source?.gamepad?.hapticActuators?.[0]?.pulse(v, ms); } catch { /* no haptics */ }
}

function onSelectStart(inp) {
  initAudio();
  const pw = pinchPoint(inp, new THREE.Vector3());
  const o = new THREE.Vector3(), d = new THREE.Vector3(); worldRay(inp, o, d);
  const t = findTarget(o, d, pw);
  if (!t) return;
  if (t.type === 'button') { pressButton(t.b); pulse(inp, 0.3, 20); return; }
  beginHold(inp, t, pw, o, d);
}
function onSelectEnd(inp) {
  if (inp.held) { sfx('drop'); inp.held = null; }
}

// ======================= Desktop / mouse =======================
const mouse = { isMouse: true, held: null, orbit: null, ndc: new THREE.Vector2(), over: null };
const orbit = { yaw: 0, pitch: 0.5, dist: 0.88 };
function mouseRay(e, o, d) {
  mouse.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse.ndc, camera);
  o.copy(raycaster.ray.origin); d.copy(raycaster.ray.direction);
}
const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', (e) => {
  if (renderer.xr.isPresenting) return;
  initAudio();
  const o = new THREE.Vector3(), d = new THREE.Vector3(); mouseRay(e, o, d);
  const t = findTarget(o, d, null);
  if (t?.type === 'button') { pressButton(t.b); return; }
  if (t?.type === 'grab') { beginHold(mouse, t, null, o, d); cvs.setPointerCapture(e.pointerId); return; }
  mouse.orbit = { x: e.clientX, y: e.clientY, yaw: orbit.yaw, pitch: orbit.pitch };
  cvs.setPointerCapture(e.pointerId);
});
cvs.addEventListener('pointermove', (e) => {
  if (renderer.xr.isPresenting) return;
  const o = new THREE.Vector3(), d = new THREE.Vector3(); mouseRay(e, o, d);
  if (mouse.held) updateHold(mouse, null, o, d);
  else if (mouse.orbit) {
    orbit.yaw = THREE.MathUtils.clamp(mouse.orbit.yaw - (e.clientX - mouse.orbit.x) * 0.005, -1.2, 1.2);
    orbit.pitch = THREE.MathUtils.clamp(mouse.orbit.pitch + (e.clientY - mouse.orbit.y) * 0.004, 0.05, 1.2);
  } else mouse.over = findTarget(o, d, null);
  cvs.style.cursor = mouse.held ? 'grabbing' : mouse.over ? (mouse.over.type === 'button' ? 'pointer' : 'grab') : 'default';
});
const endMouse = () => { if (mouse.held) sfx('drop'); mouse.held = null; mouse.orbit = null; };
cvs.addEventListener('pointerup', endMouse);
cvs.addEventListener('pointercancel', endMouse);
cvs.addEventListener('wheel', (e) => { orbit.dist = THREE.MathUtils.clamp(orbit.dist + e.deltaY * 0.0006, 0.4, 1.3); }, { passive: true });
addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') btnRetry.press();
  if (e.key === 'n' || e.key === 'N') btnNext.press();
  if (e.key === 'l' || e.key === 'L') btnLevels.press();
  if (e.key === 'm' || e.key === 'M') btnSound.press();
});
function placeDesktopCamera() {
  const s = scaleNow();
  const c = board.position.clone().add(new THREE.Vector3(0, 0.1 * s, 0));
  const dist = orbit.dist * s;
  camera.position.set(c.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * dist, c.y + Math.sin(orbit.pitch) * dist, c.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * dist);
  camera.lookAt(c);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
document.addEventListener('visibilitychange', () => { paused = document.hidden; });

// ======================= Sessions =======================
let needsRecenter = false, mrMode = false, recenterFrames = 0;
const overlay = document.getElementById('overlay');
async function startSession(mode) {
  initAudio();
  if (!navigator.xr) return;
  try {
    const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    mrMode = mode === 'immersive-ar';
    sky.visible = scenery.visible = !mrMode;
    renderer.setClearAlpha(mrMode ? 0 : 1);
    await renderer.xr.setSession(session);
    renderer.xr.setFoveation?.(1);
    needsRecenter = true; recenterFrames = 0;
    overlay.classList.add('hidden');
    session.addEventListener('visibilitychange', () => { paused = session.visibilityState !== 'visible'; });
    session.addEventListener('end', () => {
      sky.visible = scenery.visible = true; mrMode = false; paused = false;
      board.position.set(0, 0.95, -0.5); board.rotation.set(0, 0, 0);
      overlay.classList.remove('hidden');
    });
  } catch (err) { console.warn(err); alert('Could not start XR session: ' + err.message); }
}
function recenter(frame) {
  const ref = renderer.xr.getReferenceSpace();
  const pose = frame?.getViewerPose(ref);
  if (!pose) return false;
  const p = pose.transform.position, q = pose.transform.orientation;
  const head = new THREE.Vector3(p.x, p.y, p.z);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
  fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1); fwd.normalize();
  const s = scaleNow();
  board.position.copy(head).addScaledVector(fwd, 0.4 + 0.08 * (s - 1)).add(new THREE.Vector3(0, -0.33 * s, 0));
  board.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
  return true;
}
document.getElementById('btn-vr').addEventListener('click', () => startSession('immersive-vr'));
document.getElementById('btn-mr').addEventListener('click', () => startSession('immersive-ar'));
document.getElementById('btn-web').addEventListener('click', () => { initAudio(); overlay.classList.add('hidden'); });
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (ok) document.getElementById('btn-vr').disabled = false; }).catch(() => {});
  navigator.xr.isSessionSupported('immersive-ar').then((ok) => { if (ok) document.getElementById('btn-mr').disabled = false; }).catch(() => {});
}

// ======================= Main loop =======================
const clock = new THREE.Clock();
const camLocal = new THREE.Vector3();
let rainLevel = -1;
const sunWorldDir = new THREE.Vector3();

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  pressCool = Math.max(0, pressCool - dt);
  const xr = renderer.xr.isPresenting;

  if (xr && needsRecenter) { if (recenter(frame) || ++recenterFrames > 90) needsRecenter = false; }
  if (!xr) placeDesktopCamera();

  // ---- XR inputs: hover, holds, poke ----
  for (const g of grabbables) g.view.hover = 0;
  for (const inp of inputs) {
    if (!xr || !inp.connected) { inp.ray.visible = false; inp.cursor.visible = false; continue; }
    const pw = pinchPoint(inp, new THREE.Vector3());
    const o = new THREE.Vector3(), d = new THREE.Vector3(); worldRay(inp, o, d);
    if (inp.held) {
      updateHold(inp, pw, o, d);
      inp.held.g.view.hover = 1;
      inp.ray.visible = inp.held.mode === 'ray';
      if (inp.ray.visible) inp.ray.scale.z = o.distanceTo(board.localToWorld(tmpV.set(inp.held.g.pos.x, inp.held.g.pos.y, inp.held.g.pos.z)));
    } else {
      const tg = findTarget(o, d, pw);
      inp.target = tg;
      if (tg?.type === 'grab') tg.g.view.hover = 1;
      if (tg?.type === 'button') tg.b.hover = 1;
      inp.ray.visible = !!tg && tg.mode === 'ray';
      if (inp.ray.visible) inp.ray.scale.z = tg.d;
    }
    // fingertip cursor + poke buttons
    if (inp.isHand && pw) {
      inp.cursor.visible = true; inp.cursor.position.copy(pw);
      inp.cursor.material.color.set(inp.held ? 0xffd25e : inp.target?.mode === 'direct' ? 0x9dffb5 : 0xffffff);
      const tip = joint(inp, 'index-finger-tip');
      if (tip) {
        const tw = tip.getWorldPosition(new THREE.Vector3());
        for (const b of activeButtons()) {
          const inside = b.pokeTest(tw);
          if (inside) { b.hover = 1; if (!inp.poke.has(b)) { inp.poke.add(b); pressButton(b); } }
          else inp.poke.delete(b);
        }
      }
    } else inp.cursor.visible = false;
  }
  if (!xr && mouse.over?.type === 'grab' && !mouse.held) mouse.over.g.view.hover = 1;
  if (!xr && mouse.over?.type === 'button') mouse.over.b.hover = 1;
  if (mouse.held) mouse.held.g.view.hover = 1;

  // ---- simulation ----
  if (!paused && !menuOpen && !won) {
    if (started) timer += dt;
    const before = state.plants.map((p) => Math.floor(p.g * 4));
    const bloomed = step(state, dt);
    state.plants.forEach((p, i) => { const q = Math.floor(p.g * 4); if (q > before[i] && !p.bloomed) sfx('sprout', i + q); });
    bloomed.forEach((p, i) => {
      const c = { bloom: 0xff7fb0, fern: 0x7fffe0, cactus: 0xff6fa0 }[p.t];
      burst.emit(p.x, 0.05, p.z, c, 45); sfx('bloom', state.plants.indexOf(p));
    });
    if (allBloomed(state)) onWin();
  }

  // ---- visuals ----
  introT = Math.min(1, introT + dt * 2.5);
  const ease = 1 - Math.pow(1 - introT, 3);
  content.scale.setScalar(0.6 + 0.4 * ease);
  const held = (g) => inputs.some((i) => i.held?.g === g) || mouse.held?.g === g;
  for (const v of plantViews) v.update(dt, t);
  cloudViews.forEach((v, i) => v.update(dt, t, held(grabbables[i + 1])));
  const camW = (xr ? renderer.xr.getCamera() : camera).getWorldPosition(new THREE.Vector3());
  camLocal.copy(board.worldToLocal(camW.clone()));
  sunView.update(dt, t, state.sun, camLocal, held(grabbables[0]));
  domeGuide.visible = held(grabbables[0]);
  burst.update(dt);
  for (const b of buttons) b.update(dt, t);
  island.position.y = Math.sin(t * 0.8) * 0.002;

  // tutorial halo on the first islands until the player grabs
  const tutTarget = !started && !menuOpen ? (levelDef.id === 'l1' ? grabbables[0] : levelDef.id === 'l2' ? grabbables[1] : null) : null;
  halo.visible = !!tutTarget;
  if (tutTarget) {
    halo.position.set(tutTarget.pos.x, tutTarget.pos.y, tutTarget.pos.z);
    halo.lookAt(camW);
    const k = (t * 1.2) % 1; halo.scale.setScalar(1 + k * 1.2); halo.material.opacity = 0.9 * (1 - k);
  }

  // sun -> light, sky
  const s = state.sun;
  sunLight.position.set(s.x, s.y, s.z).multiplyScalar(2.2);
  sunLight.target.position.set(0, 0, 0);
  const el = Math.asin(s.y / K.DOME_R);
  const day = THREE.MathUtils.clamp((el - 0.12) / 0.7, 0, 1);
  sunLight.intensity = 1.3 + 1.6 * day;
  sunLight.color.setRGB(1, 0.72 + 0.26 * day, 0.5 + 0.42 * day);
  hemi.intensity = 0.55 + 0.55 * day;
  sky.material.uniforms.uDay.value = day;
  sunWorldDir.set(s.x, s.y, s.z).applyQuaternion(board.quaternion).normalize();
  sky.material.uniforms.uSun.value.copy(sunWorldDir);
  sky.position.copy(camW);
  scenery.children.forEach((c) => { if (c.userData.bob !== undefined) c.position.y += Math.sin(t * 0.3 + c.userData.bob) * 0.0004; });

  // rain audio follows how many clouds are actually raining onto plants
  const r = state.clouds.length ? 0.4 + state.plants.filter((p) => p.wet).length * 0.4 : 0;
  if (Math.abs(r - rainLevel) > 0.01) { setRain(r); rainLevel = r; }

  drawInfo(false);
  renderer.render(scene, camera);
});

applySize();
loadLevel(LEVELS[0]);
window.__ps = { get state() { return state; }, inputs, renderer, camera, board, THREE, loadLevel, LEVELS, dailyLevel, btns: { btnNext, btnRetry, btnLevels } };
