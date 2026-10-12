
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/loaders/GLTFLoader.js';

const viewer = document.getElementById('viewer');
const loading = document.getElementById('loading');
const status = document.getElementById('status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080c12);

const camera = new THREE.PerspectiveCamera(
  45,
  viewer.clientWidth / viewer.clientHeight,
  0.1,
  1000
);
camera.position.set(0, 4, 9);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewer.clientWidth, viewer.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewer.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x344050, 2));

const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(4, 8, 6);
scene.add(light);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.minDistance = 2;
controls.maxDistance = 30;

const grid = new THREE.GridHelper(12, 12, 0x40516a, 0x253244);
scene.add(grid);

const objects = [];
let currentSphere = null;
let caliper = null;

const loader = new GLTFLoader();

loader.load(
  './verniercaliper.glb',
  (gltf) => {
    caliper = gltf.scene;
    caliper.scale.setScalar(1);
    caliper.position.set(0, 0.2, 0);
    scene.add(caliper);
    loading.style.display = 'none';
    status.textContent =
      'Caliper loaded. Drag to rotate and pinch to zoom.';
  },
  undefined,
  (error) => {
    loading.textContent =
      'Caliper model could not load. Check that verniercaliper.glb is in the repository root.';
    status.textContent = 'Check the model filename and repository location.';
    console.error(error);
  }
);

function addSphere() {
  const diameter = Number(document.getElementById('diameter').value);

  if (!Number.isFinite(diameter) || diameter < 1 || diameter > 100) {
    status.textContent = 'Enter a diameter between 1 and 100 mm.';
    return;
  }

  if (currentSphere) {
    scene.remove(currentSphere);
    currentSphere.geometry.dispose();
    currentSphere.material.dispose();
  }

  const geometry = new THREE.SphereGeometry(0.5, 48, 32);
  const material = new THREE.MeshStandardMaterial({
    color: 0xb9c6d5,
    metalness: 0.8,
    roughness: 0.23
  });

  currentSphere = new THREE.Mesh(geometry, material);
  currentSphere.scale.setScalar(diameter / 20);
  currentSphere.position.set(0, 1, 0);
  scene.add(currentSphere);
  objects.push(currentSphere);

  status.textContent =
    `Sphere created. Diameter: ${diameter} mm.`;
}

document.getElementById('addSphere').addEventListener('click', addSphere);

document.getElementById('updateSphere').addEventListener('click', () => {
  if (!currentSphere) {
    addSphere();
    return;
  }

  const diameter = Number(document.getElementById('diameter').value);

  if (!Number.isFinite(diameter) || diameter < 1 || diameter > 100) {
    status.textContent = 'Enter a diameter between 1 and 100 mm.';
    return;
  }

  currentSphere.scale.setScalar(diameter / 20);
  status.textContent = `Sphere diameter set to ${diameter} mm.`;
});

document.getElementById('resetView').addEventListener('click', () => {
  camera.position.set(0, 4, 9);
  controls.target.set(0, 0, 0);
  controls.update();
});

function resize() {
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener('resize', resize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
