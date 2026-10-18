import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* ===== Calibration, measured from verniercaliper.glb (model units) ===== */
const MODEL = "./verniercaliper.glb";
const MM = 31.2;             // 1 model unit = 31.2 mm (fitted to the vernier's 39 mm span)
const ZERO_X = -1.128;       // x of the vernier zero line when the jaws are closed
const FACE_X = -1.521;       // inner face of both jaws when closed
const FACE_Z = 0.366;        // z where the fixed and moving jaw blades overlap
const ROOT_Y = -0.17;        // just below the beam, where both jaw faces start
const TRAVEL = 3.47;         // how far the moving jaw can slide (units)
const MOVING = ["cube004_2", "cylinder_3"];   // slider body and thumb knob
const HIDE = ["circle_4", "cylinder001_5"];   // stray parts (the black circle)

const $ = id => document.getElementById(id);
const say = t => { const s = $("status"); if (s) s.textContent = t; };
const viewer = $("viewer");
if (!viewer) throw new Error('index.html needs an element with id="viewer".');

/* ===== Scene (pure black) ===== */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.style.touchAction = "none";
viewer.appendChild(renderer.domElement);

/* Studio lighting: soft key, cool fill, and edge lights that give metal its bright highlights. */
scene.add(new THREE.HemisphereLight(0xffffff, 0x222831, 0.9));
[[2.6, 0xffffff, 3, 5, 7], [1.3, 0xdce9ff, -5, 2, 4], [2.4, 0xffffff, 1, -3, -5], [1.2, 0xffffff, -2, 5, -3]]
  .forEach(([p, c, x, y, z]) => {
    const l = new THREE.DirectionalLight(c, p);
    l.position.set(x, y, z);
    scene.add(l);
  });

const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const ANISO = renderer.capabilities.getMaxAnisotropy();

/* Mirror-polished silver for the measured objects. */
const silver = new THREE.MeshPhysicalMaterial({
  color: 0xf4f6f8, metalness: 1, roughness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.06,
  envMap: env, envMapIntensity: 1.7
});

/* ===== Controls =====
   Mouse: drag = move, right-drag = rotate, wheel = zoom.
   Touch: pinch = zoom, one finger = the view travels the way your finger moves
   (finger left -> you travel left, toward the jaws). */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.zoomToCursor = true;
controls.screenSpacePanning = true;
controls.minDistance = 0.3;
controls.maxDistance = 30;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_PAN };   // one finger handled below
let moved = false, fly = null;
controls.addEventListener("start", () => { moved = true; fly = null; });

let rig, slider, ready = false, W = 6, H = 2.5;
let shape = null, obj = null;

const v3 = new THREE.Vector3(), u3 = new THREE.Vector3();
const fingers = new Map();
const el = renderer.domElement;
el.addEventListener("pointerdown", e => e.pointerType === "touch" && fingers.set(e.pointerId, [e.clientX, e.clientY]));
el.addEventListener("pointermove", e => {
  const f = fingers.get(e.pointerId);
  if (!f) return;
  const dx = e.clientX - f[0], dy = e.clientY - f[1];
  f[0] = e.clientX; f[1] = e.clientY;
  if (fingers.size !== 1 || !ready) return;
  const d = camera.position.distanceTo(controls.target);
  const k = (1.6 * 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / viewer.clientHeight;
  camera.updateMatrixWorld(true);
  v3.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(dx * k);    // finger right -> camera right
  u3.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(-dy * k);   // finger up    -> camera up
  v3.add(u3);
  const t = controls.target;
  const nx = THREE.MathUtils.clamp(t.x + v3.x, -W / 2, W / 2), ny = THREE.MathUtils.clamp(t.y + v3.y, -H, H);
  camera.position.x += nx - t.x; camera.position.y += ny - t.y; camera.position.z += v3.z;
  t.set(nx, ny, t.z + v3.z);
  moved = true; fly = null;
});
["pointerup", "pointercancel"].forEach(n => el.addEventListener(n, e => fingers.delete(e.pointerId)));

/* ===== Main scale: drawn in code, dark steel with black engraved lines ===== */
function scaleMaterial(wMm, hMm, pxMm, draw) {
  const c = document.createElement("canvas");
  c.width = Math.round(wMm * pxMm);
  c.height = Math.round(hMm * pxMm);
  const g = c.getContext("2d");
  g.scale(c.width / wMm, c.height / hMm);
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return new THREE.MeshStandardMaterial({ map: t, metalness: 0.55, roughness: 0.38, envMap: env, envMapIntensity: 0.9 });
}

const RULER_LEFT = ZERO_X - 0.25;
const HIDDEN_MM = 2.1;       // bottom strip of the plate that the vernier face covers

function buildRuler(mesh) {
  mesh.updateWorldMatrix(true, false);
  const mw = mesh.matrixWorld, inv = mw.clone().invert();
  const b = new THREE.Box3().setFromObject(mesh);
  const p = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    v3.fromBufferAttribute(p, i).applyMatrix4(mw);
    v3.x = Math.max(v3.x, RULER_LEFT);
    uv.setXY(i, (v3.x - RULER_LEFT) / (b.max.x - RULER_LEFT), (v3.y - b.min.y) / (b.max.y - b.min.y));
    v3.applyMatrix4(inv);
    p.setXYZ(i, v3.x, v3.y, v3.z);
  }
  p.needsUpdate = uv.needsUpdate = true;
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();

  const w = (b.max.x - RULER_LEFT) * MM, h = (b.max.y - b.min.y) * MM, zx = (ZERO_X - RULER_LEFT) * MM;
  const base = h - HIDDEN_MM;                   // ticks start where the vernier face ends
  const font = "Arial, Helvetica, sans-serif";
  mesh.material = scaleMaterial(w, h, Math.min(30, 4096 / w), g => {
    const s = g.createLinearGradient(0, 0, 0, h);
    s.addColorStop(0, "#8d97a1"); s.addColorStop(0.25, "#a7b0b9"); s.addColorStop(0.55, "#8a949e"); s.addColorStop(1, "#6d7882");
    g.fillStyle = s;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 0.2) {          // fine brushed-steel grain
      g.fillStyle = (y * 5) % 2 < 1 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
      g.fillRect(0, y, w, 0.06);
    }
    g.fillStyle = "#000";
    g.textAlign = "center";
    g.font = `700 4.6px ${font}`;
    for (let mm = 0; zx + mm <= w - 0.5; mm++) {
      const cm = mm % 10 === 0, len = cm ? 5.6 : mm % 5 === 0 ? 3.9 : 2.6, tw = cm ? 0.24 : mm % 5 === 0 ? 0.18 : 0.14;
      g.fillRect(zx + mm - tw / 2, base - len, tw, len);
      if (cm) g.fillText(String(mm / 10), zx + mm, base - len - 0.9);
    }
    g.font = `700 3px ${font}`;
    g.fillText("cm", 3.4, base - 6.5);
    g.fillRect(0, base - 0.12, w, 0.12);        // baseline
  });
}

/* ===== Load the caliper ===== */
new GLTFLoader().load(MODEL, gltf => {
  try { setup(gltf.scene); } catch (e) { console.error(e); say("Setup problem: " + e.message); }
}, undefined, e => { console.error(e); say("Model failed to load. Check the file name verniercaliper.glb."); });

function setup(model) {
  rig = new THREE.Group();
  rig.add(model);
  scene.add(rig);
  rig.updateMatrixWorld(true);

  const parts = [];
  model.traverse(o => {
    const n = o.name.toLowerCase();
    if (HIDE.includes(n)) o.visible = false;
    if (MOVING.includes(n)) parts.push(o);
    if (!o.isMesh) return;
    o.frustumCulled = false;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {   // polished steel finish
      Object.assign(m, { envMap: env, envMapIntensity: 1.5, metalness: 0.85, roughness: 0.26 });
      m.color.setRGB(1.15, 1.15, 1.2);
      if (m.map) m.map.anisotropy = ANISO;
      m.needsUpdate = true;
    });
  });
  if (parts.length < MOVING.length) throw new Error("moving jaw parts not found in the model");
  const ruler = model.getObjectByName("Object_4");
  if (ruler) buildRuler(ruler);

  slider = new THREE.Group();
  rig.add(slider);
  parts.forEach(o => slider.attach(o));

  const fit = new THREE.Box3();
  rig.traverse(o => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    fit.union(new THREE.Box3().setFromObject(o));
  });
  if (fit.isEmpty()) throw new Error("the model has no visible geometry");
  const size = fit.getSize(new THREE.Vector3());
  W = size.x; H = size.y;
  rig.position.copy(fit.getCenter(new THREE.Vector3())).negate();
  rig.updateMatrixWorld(true);

  ready = true;
  viewFull(true);
  say("Caliper ready. Zoom in on the jaws, or choose an object to measure.");
}

/* ===== Camera ===== */
const dist = span => span / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

function go(pos, tgt, instant) {
  if (instant) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); fly = null; }
  else fly = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1: pos, q1: tgt };
}
function viewFull(instant) {
  if (!ready) return;
  go(new THREE.Vector3(0, 0, dist(Math.max(W / camera.aspect, H) * 1.1) + 1), new THREE.Vector3(), instant);
}
function viewJaws() {
  if (!ready) return;
  const gap = slider.position.x;
  const c = rig.localToWorld(new THREE.Vector3(FACE_X + gap / 2, -0.55, FACE_Z));
  go(new THREE.Vector3(c.x, c.y, c.z + dist(Math.max(2.2, (gap + 1.4) / camera.aspect))), c);
}
$("fitButton").onclick = () => viewFull();
$("jawsButton").onclick = viewJaws;

/* ===== Jaw slider (only while no object is held) ===== */
const jawSlider = $("jawSlider"), jawValue = $("jawValue");
jawSlider.addEventListener("input", () => {
  const val = Number(jawSlider.value);
  jawValue.textContent = val + "%";
  if (ready && !obj) slider.position.x = (val / 100) * TRAVEL;
});

/* ===== Objects: the jaws always close exactly on the first size ===== */
const SHAPES = {
  sphere:   { f: ["Diameter"],                  max: 60,  geo: a => new THREE.SphereGeometry(a / 2, 96, 64),               h: a => a },
  cube:     { f: ["Side"],                      max: 100, geo: a => new THREE.BoxGeometry(a, a, a),                         h: a => a },
  cylinder: { f: ["Diameter", "Height"],        max: 100, geo: (a, b) => new THREE.CylinderGeometry(a / 2, a / 2, b, 96),   h: (a, b) => b },
  cuboid:   { f: ["Length", "Width", "Height"], max: 100, geo: (a, b, c) => new THREE.BoxGeometry(a, c, b),                 h: (a, b, c) => c },
  cone:     { f: ["Base diameter", "Height"],   max: 100, geo: (a, b) => new THREE.ConeGeometry(a / 2, b, 96),              h: (a, b) => b }
};

function readDims() {
  const sh = SHAPES[shape];
  const d = sh.f.map((_, i) => parseFloat($("dim" + "ABC"[i]).value));
  const limit = Math.min(sh.max, Math.floor(TRAVEL * MM));
  if (d.some(x => !(x >= 1 && x <= sh.max))) { say(`Enter sizes between 1 and ${sh.max} mm.`); return null; }
  if (d[0] > limit) { say(`The jaws open to ${limit} mm at most. Reduce the first size.`); return null; }
  return d;
}

function place() {
  if (!obj || !ready) return;
  const d = readDims();
  if (!d) return;
  const sh = SHAPES[shape], v = d.map(x => x / MM);
  obj.geometry.dispose();
  obj.geometry = sh.geo(...v);
  slider.position.x = v[0];                               // jaw faces exactly one object-size apart
  const h = sh.h(...v);
  let y = (shape === "cone" ? ROOT_Y - 0.05 : ROOT_Y) - h / 2;   // cone hangs point-down from its base
  if (shape === "sphere") y = Math.max(y, -1.05);         // keep the widest part inside the jaw faces
  obj.rotation.set(0, 0, shape === "cone" ? Math.PI : 0);
  obj.position.set(FACE_X + v[0] / 2, y, FACE_Z);         // touching the fixed jaw face
  $("measurementAnswer").textContent = sh.f.map((n, i) => `${n}: ${d[i]} mm`).join(",  ");
  say(`Object is held between the jaws. Measured size: ${d[0]} mm.`);
}

function selectShape(s) {
  if (!ready) { say("Wait for the caliper to load."); return; }
  shape = s;
  if (!obj) { obj = new THREE.Mesh(new THREE.BufferGeometry(), silver); rig.add(obj); }
  document.querySelectorAll("[data-shape]").forEach(b => b.classList.toggle("active", b.dataset.shape === s));
  "ABC".split("").forEach((k, i) => {
    const on = i < SHAPES[s].f.length;
    $("field" + k).hidden = !on;
    if (on) $("label" + k).textContent = SHAPES[s].f[i] + " (mm)";
  });
  $("objectPanel").hidden = false;
  $("jawControlPanel").hidden = true;
  place();
}

function removeObject() {
  if (!obj) return;
  rig.remove(obj);
  obj.geometry.dispose();
  obj = shape = null;
  document.querySelectorAll("[data-shape]").forEach(b => b.classList.remove("active"));
  $("objectPanel").hidden = true;
  $("jawControlPanel").hidden = false;
  slider.position.x = Math.min(TRAVEL, Math.max(0, slider.position.x));
  const pct = Math.round((slider.position.x / TRAVEL) * 100);
  jawSlider.value = pct;
  jawValue.textContent = pct + "%";
  say("Object removed. Move the jaws freely.");
}

document.querySelectorAll("[data-shape]").forEach(b => (b.onclick = () => selectShape(b.dataset.shape)));
["dimA", "dimB", "dimC"].forEach(id => $(id).addEventListener("input", place));
$("removeButton").onclick = removeObject;

/* ===== Resize and render ===== */
new ResizeObserver(() => {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  if (ready && !moved) viewFull(true);
}).observe(viewer);

(function animate(now) {
  requestAnimationFrame(animate);
  if (fly) {
    const k = Math.min(1, (now - fly.t0) / 500), e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.q0, fly.q1, e);
    if (k === 1) fly = null;
  }
  controls.update();
  renderer.render(scene, camera);
})(performance.now());
