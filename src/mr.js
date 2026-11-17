import * as THREE from 'three';

// Mixed-reality placement: hit-test against real surfaces, show detected planes,
// anchor the island to your real desk and remember it across sessions (persistent anchors).
const ANCHOR_KEY = 'pocketskies.anchor';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } };

export class MRPlacement {
  constructor(scene) {
    this.scene = scene;
    this.session = null; this.hitSource = null; this.anchor = null;
    this.placing = false; this.wantConfirm = false; this.hasHit = false; this.lastHit = null;
    this.status = '';
    this.reticle = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.2, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd25e, transparent: true, opacity: 0.8, depthWrite: false }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.01, 16).rotateX(-Math.PI / 2), ring.material);
    this.reticle.add(ring, dot); this.reticle.visible = false;
    scene.add(this.reticle);
    this.planeGroup = new THREE.Group(); scene.add(this.planeGroup);
    this.planeMeshes = new Map();
    this.planeMat = new THREE.LineBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.55 });
  }

  async start(session, refSpace) {
    this.session = session; this.ref = refSpace;
    this.placing = true; this.anchor = null; this.hasHit = false; this.status = 'searching';
    try {
      const viewer = await session.requestReferenceSpace('viewer');
      this.hitSource = await session.requestHitTestSource?.({ space: viewer }) ?? null;
    } catch { this.hitSource = null; }
    // Restore the island to where you left it last time.
    const uuid = lsGet(ANCHOR_KEY);
    if (uuid && session.restorePersistentAnchor) {
      try {
        this.anchor = await session.restorePersistentAnchor(uuid);
        this.placing = false; this.status = 'restored';
      } catch { lsSet(ANCHOR_KEY, null); }
    }
  }
  end() {
    this.hitSource?.cancel?.(); this.hitSource = null; this.session = null; this.anchor = null;
    this.placing = false; this.reticle.visible = false; this.planeGroup.clear(); this.planeMeshes.clear();
  }
  // Ask to (re)place: drops the old anchor.
  async replace() {
    if (!this.session) return;
    const uuid = lsGet(ANCHOR_KEY);
    if (uuid && this.session.deletePersistentAnchor) { try { await this.session.deletePersistentAnchor(uuid); } catch { /* ignore */ } }
    lsSet(ANCHOR_KEY, null);
    try { this.anchor?.delete?.(); } catch { /* ignore */ }
    this.anchor = null; this.placing = true; this.hasHit = false; this.status = 'searching';
  }
  confirm() { if (this.placing) this.wantConfirm = true; }

  drawPlanes(frame) {
    const planes = frame.detectedPlanes;
    if (!planes) return;
    const seen = new Set();
    planes.forEach((plane) => {
      seen.add(plane);
      if (plane.orientation && plane.orientation !== 'horizontal') return;
      let line = this.planeMeshes.get(plane);
      if (!line || line.userData.t !== plane.lastChangedTime) {
        if (line) this.planeGroup.remove(line);
        const pts = plane.polygon.map((p) => new THREE.Vector3(p.x, 0.002, p.z));
        if (pts.length) pts.push(pts[0].clone());
        line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.planeMat);
        line.matrixAutoUpdate = false; line.userData.t = plane.lastChangedTime;
        this.planeMeshes.set(plane, line); this.planeGroup.add(line);
      }
      const pose = frame.getPose(plane.planeSpace, this.ref);
      if (pose) line.matrix.fromArray(pose.transform.matrix);
    });
    for (const [p, l] of this.planeMeshes) if (!seen.has(p)) { this.planeGroup.remove(l); this.planeMeshes.delete(p); }
  }

  // Returns {pos, yaw} where the island base should sit, or null to leave the board alone.
  update(frame, headPos, headFwd) {
    if (!this.session) return null;
    this.planeGroup.visible = this.placing;
    if (this.placing) {
      this.drawPlanes(frame);
      let hit = null;
      if (this.hitSource) {
        const res = frame.getHitTestResults(this.hitSource);
        for (const r of res) {
          const pose = r.getPose(this.ref); if (!pose) continue;
          const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
          const up = new THREE.Vector3(0, 1, 0).transformDirection(m);
          if (up.y < 0.85) continue; // horizontal surfaces only (desk, table, floor)
          const p = new THREE.Vector3().setFromMatrixPosition(m);
          if (p.y > headPos.y - 0.12 || p.distanceTo(headPos) > 2.5) continue;
          hit = p; break;
        }
      }
      this.hasHit = !!hit;
      if (hit) this.lastHit = hit;
      const pos = hit || (this.lastHit && this.lastHit.distanceTo(headPos) < 2.5 ? this.lastHit : null);
      const yaw = Math.atan2(headPos.x - (pos ? pos.x : 0), headPos.z - (pos ? pos.z : 0));
      this.reticle.visible = !!hit;
      if (hit) { this.reticle.position.copy(hit); this.reticle.rotation.y = yaw; }
      if (this.wantConfirm) {
        this.wantConfirm = false;
        const p = pos || headPos.clone().addScaledVector(headFwd, 0.45).add(new THREE.Vector3(0, -0.5, 0));
        this.placing = false; this.reticle.visible = false; this.status = pos ? 'anchored' : 'floating';
        this.anchorAt(frame, p, yaw);
        this.onPlaced?.();
        return { pos: p, yaw, placed: true };
      }
      return pos ? { pos, yaw, preview: true } : null;
    }
    if (this.anchor) {
      const pose = frame.getPose(this.anchor.anchorSpace, this.ref);
      if (pose) {
        const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        const f = new THREE.Vector3(0, 0, 1).transformDirection(m);
        return { pos: p, yaw: Math.atan2(f.x, f.z) };
      }
    }
    return null;
  }

  anchorAt(frame, p, yaw) {
    if (!frame.createAnchor) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    try {
      const pr = frame.createAnchor(new XRRigidTransform({ x: p.x, y: p.y, z: p.z }, { x: q.x, y: q.y, z: q.z, w: q.w }), this.ref);
      pr?.then(async (a) => {
        this.anchor = a;
        if (a.requestPersistentHandle) { try { lsSet(ANCHOR_KEY, await a.requestPersistentHandle()); } catch { /* not persistent */ } }
      }).catch(() => {});
    } catch { /* anchors unsupported */ }
  }
}
