import * as THREE from 'three';

// "Show, don't tell": a glowing hand icon that demonstrates the gesture on the real object.
// Kinds: 'pinch' (pinch `from`, carry along a dashed arc to `to`, release) and 'poke' (press a button).
const UP = new THREE.Vector3(0, 1, 0);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function handTexture(kind) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  const stroke = (draw, w) => {
    x.strokeStyle = 'rgba(10,20,40,0.85)'; x.lineWidth = w + 14; draw(); x.stroke();
    x.strokeStyle = '#eaf8ff'; x.lineWidth = w; draw(); x.stroke();
  };
  // palm + curled fingers
  const palm = () => { x.beginPath(); x.moveTo(150, 205); x.quadraticCurveTo(205, 200, 205, 150); x.lineTo(200, 120); x.quadraticCurveTo(180, 100, 150, 112); };
  const curl = (y) => () => { x.beginPath(); x.moveTo(200, y); x.quadraticCurveTo(170, y - 8, 158, y + 14); };
  if (kind === 'poke') {
    stroke(() => { x.beginPath(); x.moveTo(150, 140); x.lineTo(150, 40); }, 30); // index pointing up
    stroke(() => { x.beginPath(); x.moveTo(125, 175); x.quadraticCurveTo(100, 160, 108, 140); }, 26); // thumb
    stroke(palm, 34); [140, 165, 188].forEach((y) => stroke(curl(y), 22));
  } else {
    const closed = kind === 'closed';
    // index finger (top) and thumb (bottom) forming a C, tips touching when closed
    stroke(() => { x.beginPath(); x.moveTo(170, 118); x.quadraticCurveTo(110, closed ? 70 : 40, 62, closed ? 108 : 70); }, 28);
    stroke(() => { x.beginPath(); x.moveTo(160, 190); x.quadraticCurveTo(110, closed ? 170 : 200, 66, closed ? 118 : 160); }, 30);
    stroke(palm, 34); [138, 160].forEach((y) => stroke(curl(y), 22));
    if (closed) { // spark where the fingertips meet
      const g = x.createRadialGradient(64, 113, 0, 64, 113, 40);
      g.addColorStop(0, 'rgba(255,230,140,1)'); g.addColorStop(1, 'rgba(255,210,94,0)');
      x.fillStyle = g; x.beginPath(); x.arc(64, 113, 40, 0, 7); x.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class GhostHand {
  constructor(parent) {
    this.group = new THREE.Group();
    this.tex = { open: handTexture('open'), closed: handTexture('closed'), poke: handTexture('poke') };
    this.mat = new THREE.SpriteMaterial({ map: this.tex.open, transparent: true, depthTest: false, depthWrite: false });
    this.icon = new THREE.Sprite(this.mat);
    this.icon.scale.setScalar(0.075); this.icon.renderOrder = 40;
    // the sprite's pinch point is at canvas (64,113): offset so the fingertips sit on the target
    this.icon.center.set(64 / 256, 1 - 113 / 256);
    this.group.add(this.icon);
    this.path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.008, gapSize: 0.006, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false }));
    this.path.renderOrder = 39;
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.022, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false }));
    this.arrow.renderOrder = 39;
    this.target = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.018, 32), this.arrow.material);
    this.target.renderOrder = 39;
    this.group.add(this.path, this.arrow, this.target);
    this.group.visible = false;
    parent.add(this.group);
    this.t = 0; this.kind = null;
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.normal = new THREE.Vector3(0, 0, 1);
  }
  show(kind, from, to, normal) {
    const same = this.kind === kind && this.from.distanceTo(from) < 1e-3 && this.to.distanceTo(to || from) < 1e-3;
    if (same && this.group.visible) return;
    this.kind = kind; this.from.copy(from); this.to.copy(to || from);
    if (normal) this.normal.copy(normal).normalize();
    this.t = 0; this.group.visible = true;
    const showPath = kind === 'pinch' && this.from.distanceTo(this.to) > 0.01;
    this.path.visible = this.arrow.visible = this.target.visible = showPath;
    if (showPath) {
      const mid = this.from.clone().add(this.to).multiplyScalar(0.5); mid.y += 0.04;
      this.curve = new THREE.QuadraticBezierCurve3(this.from.clone(), mid, this.to.clone());
      this.path.geometry.setFromPoints(this.curve.getPoints(24)); this.path.computeLineDistances();
      this.arrow.position.copy(this.curve.getPoint(0.94));
      this.arrow.quaternion.setFromUnitVectors(UP, this.curve.getTangent(0.94));
      this.target.position.copy(this.to);
    }
  }
  hide() { this.group.visible = false; this.kind = null; }
  update(dt, camLocal) {
    if (!this.group.visible) return;
    this.t += dt;
    let op = 1, tex = this.tex.open;
    const p = this.icon.position;
    if (this.kind === 'pinch') {
      const L = 3.6, t = this.t % L;
      const start = this.from.clone().add(new THREE.Vector3(0.025, 0.04, 0.05));
      if (t < 0.7) { p.lerpVectors(start, this.from, ease(t / 0.7)); op = Math.min(1, t / 0.3); }
      else if (t < 1.0) { p.copy(this.from); tex = t > 0.82 ? this.tex.closed : this.tex.open; }
      else if (t < 2.4) { p.copy(this.curve ? this.curve.getPoint(ease((t - 1.0) / 1.4)) : this.from); tex = this.tex.closed; }
      else if (t < 2.7) { p.copy(this.to); tex = t < 2.5 ? this.tex.closed : this.tex.open; }
      else if (t < 3.1) { p.copy(this.to); op = 1 - (t - 2.7) / 0.4; }
      else { op = 0; }
    } else if (this.kind === 'poke') {
      tex = this.tex.poke;
      const L = 2.2, t = this.t % L;
      let d = 0.07;
      if (t < 0.5) { d = 0.07 - 0.05 * ease(t / 0.5); op = t / 0.5; }
      else if (t < 0.8) d = 0.02 - 0.03 * ((t - 0.5) / 0.3);
      else if (t < 1.2) d = -0.01 + 0.06 * ((t - 0.8) / 0.4);
      else { d = 0.05; op = Math.max(0, 1 - (t - 1.2) / 0.4); }
      p.copy(this.from).addScaledVector(this.normal, d);
      this.icon.center.set(150 / 256, 1 - 40 / 256); // fingertip of the pointing icon
    }
    if (this.kind === 'pinch') this.icon.center.set(64 / 256, 1 - 113 / 256);
    if (this.mat.map !== tex) { this.mat.map = tex; this.mat.needsUpdate = true; }
    this.mat.opacity = op;
    const pulse = 0.55 + 0.3 * Math.sin(this.t * 4);
    this.path.material.opacity = this.arrow.material.opacity = pulse;
    if (camLocal) this.target.lookAt(this.group.parent.localToWorld(camLocal.clone()));
  }
}
