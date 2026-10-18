import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* =========================================================
   VERNIER CALIPER CONFIGURATION
========================================================= */

const MODEL = "./verniercaliper.glb";

const MM = 31.27;
const ZERO_X = -1.1227;
const FACE_X = -1.521;
const FACE_Z = 0.366;
const ROOT_Y = -0.17;
const TRAVEL = 3.47;

const MOVING = ["cube004_2", "cylinder_3"];
const HIDE = ["circle_4", "cylinder001_5"];

const $ = id => document.getElementById(id);

const viewer = $("viewer");

if (!viewer) {
  throw new Error(
    'The viewer element was not found. Check that index.html contains id="viewer".'
  );
}

function say(message) {
  const status = $("status");
  if (status) status.textContent = message;
}

/* =========================================================
   SCENE AND CAMERA
========================================================= */

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  30,
  1,
  0.01,
  1000
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, 2)
);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

/* Reduced exposure prevents the metal from looking white. */
renderer.toneMappingExposure = 1.05;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.domElement.style.display = "block";
renderer.domElement.style.width = "100%";
renderer.domElement.style.height = "100%";
renderer.domElement.style.touchAction = "none";

viewer.appendChild(renderer.domElement);

/* =========================================================
   LIGHTING
   Controlled highlights for realistic metallic surfaces.
========================================================= */

scene.add(
  new THREE.HemisphereLight(
    0xffffff,
    0x242a32,
    1.3
  )
);

function addLight(color, intensity, x, y, z) {
  const light = new THREE.DirectionalLight(
    color,
    intensity
  );

  light.position.set(x, y, z);

  scene.add(light);

  return light;
}

addLight(0xffffff, 3.2, 3, 5, 7);
addLight(0xdceaff, 2.0, -5, 2, 4);
addLight(0xffffff, 2.7, 1, -3, -5);
addLight(0xffffff, 1.1, -2, 5, -3);

/* =========================================================
   ENVIRONMENT REFLECTIONS
========================================================= */

const pmrem = new THREE.PMREMGenerator(renderer);

const environmentScene = new RoomEnvironment();

const environment = pmrem.fromScene(
  environmentScene,
  0.04
).texture;

scene.environment = environment;

environmentScene.dispose();
pmrem.dispose();

/* =========================================================
   MATERIALS
========================================================= */

/* Satin silver steel. */

const silver = new THREE.MeshPhysicalMaterial({
  color: 0xbfc6ce,
  metalness: 0.95,
  roughness: 0.32,
  clearcoat: 0.35,
  clearcoatRoughness: 0.24,
  envMapIntensity: 1.1
});

/* Polished steel for missing or replacement materials. */

const polishedSteel = new THREE.MeshPhysicalMaterial({
  color: 0xb9c1ca,
  metalness: 0.95,
  roughness: 0.3,
  clearcoat: 0.45,
  clearcoatRoughness: 0.2,
  envMapIntensity: 1.15
});

/* Dark steel for darker components. */

const darkSteel = new THREE.MeshStandardMaterial({
  color: 0x454c55,
  metalness: 0.9,
  roughness: 0.36
});

/* Materials for the measuring objects. */

function makeObjectMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.32,
    roughness: 0.26,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.0
  });
}

const objectMaterials = {
  sphere: makeObjectMaterial(0x72c9ff),
  cube: makeObjectMaterial(0xffb45c),
  cylinder: makeObjectMaterial(0x7fe3b1),
  cuboid: makeObjectMaterial(0xc5a0ff),
  cone: makeObjectMaterial(0xff8585)
};

/* =========================================================
   CAMERA CONTROLS
========================================================= */

const controls = new OrbitControls(
  camera,
  renderer.domElement
);

controls.enableDamping = true;
controls.dampingFactor = 0.08;

controls.enableZoom = true;
controls.zoomToCursor = true;
controls.screenSpacePanning = true;

controls.minDistance = 0.15;
controls.maxDistance = 35;

controls.rotateSpeed = 0.8;
controls.panSpeed = 1.0;
controls.zoomSpeed = 0.8;

/*
Mouse:
Left drag   = pan
Middle drag = zoom
Right drag  = rotate
Wheel       = zoom

Touch:
One finger  = custom pan
Two fingers = custom pinch zoom and pan

Touch pointer events are intercepted below, so the custom
touch controls do not run alongside OrbitControls.
*/

controls.mouseButtons = {
  LEFT: THREE.MOUSE.PAN,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE
};

controls.touches = {
  ONE: THREE.TOUCH.PAN,
  TWO: THREE.TOUCH.DOLLY_PAN
};

let moved = false;
let fly = null;

controls.addEventListener("start", () => {
  moved = true;
  fly = null;
});

/* =========================================================
   UTILITIES
========================================================= */

const v3 = new THREE.Vector3();

let W = 6;
let H = 2.5;

let rig = null;
let slider = null;
let ready = false;

let shape = null;
let obj = null;

/* =========================================================
   REALISTIC BRUSHED-METAL SCALE TEXTURE
========================================================= */

const FONT = "Arial, Helvetica, sans-serif";

function steelGradient(g, w, h) {
  const gradient = g.createLinearGradient(
    0,
    0,
    0,
    h
  );

  gradient.addColorStop(0.00, "#87919b");
  gradient.addColorStop(0.14, "#b4bdc6");
  gradient.addColorStop(0.32, "#a0aab4");
  gradient.addColorStop(0.50, "#bfc7cf");
  gradient.addColorStop(0.76, "#929ca6");
  gradient.addColorStop(1.00, "#7e8994");

  g.fillStyle = gradient;
  g.fillRect(0, 0, w, h);

  /* Fine horizontal brushing. */

  for (let y = 0; y < h; y += 0.16) {
    g.fillStyle =
      Math.floor(y * 10) % 2 === 0
        ? "rgba(255,255,255,0.045)"
        : "rgba(20,27,35,0.035)";

    g.fillRect(0, y, w, 0.045);
  }

  /* Narrow metallic highlight. */

  g.fillStyle = "rgba(255,255,255,0.16)";

  g.fillRect(
    0,
    0,
    w,
    Math.max(0.06, h * 0.02)
  );

  /* Darker lower edge. */

  g.fillStyle = "rgba(15,20,26,0.16)";

  g.fillRect(
    0,
    h * 0.97,
    w,
    h * 0.03
  );
}

function drawTexture(wMm, hMm, pxMm, draw) {
  const canvas = document.createElement("canvas");

  canvas.width = Math.max(
    1,
    Math.round(wMm * pxMm)
  );

  canvas.height = Math.max(
    1,
    Math.round(hMm * pxMm)
  );

  const g = canvas.getContext("2d");

  if (!g) {
    throw new Error(
      "Could not create the scale texture."
    );
  }

  g.scale(
    canvas.width / wMm,
    canvas.height / hMm
  );

  draw(g);

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;

  texture.anisotropy =
    renderer.capabilities.getMaxAnisotropy();

  return new THREE.MeshPhysicalMaterial({
    map: texture,
    color: 0xffffff,
    metalness: 0.58,
    roughness: 0.38,
    clearcoat: 0.3,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.7,
    side: THREE.DoubleSide
  });
}

/* =========================================================
   MAIN SCALE
========================================================= */

const RULER_LEFT = ZERO_X - 0.25;

function buildRuler(mesh) {
  mesh.updateWorldMatrix(true, false);

  const worldMatrix = mesh.matrixWorld;
  const inverseMatrix = worldMatrix.clone().invert();

  const bounds = new THREE.Box3().setFromObject(mesh);

  const position = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;

  if (!uv) {
    console.warn(
      "Main scale has no UV attribute. Original scale retained."
    );

    return;
  }

  for (let i = 0; i < position.count; i++) {
    v3.fromBufferAttribute(position, i);
    v3.applyMatrix4(worldMatrix);

    v3.x = Math.max(v3.x, RULER_LEFT);

    uv.setXY(
      i,
      (v3.x - RULER_LEFT) /
        Math.max(
          0.001,
          bounds.max.x - RULER_LEFT
        ),

      (v3.y - bounds.min.y) /
        Math.max(
          0.001,
          bounds.max.y - bounds.min.y
        )
    );

    v3.applyMatrix4(inverseMatrix);

    position.setXYZ(
      i,
      v3.x,
      v3.y,
      v3.z
    );
  }

  position.needsUpdate = true;
  uv.needsUpdate = true;

  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();

  const width =
    (bounds.max.x - RULER_LEFT) * MM;

  const height =
    (bounds.max.y - bounds.min.y) * MM;

  const zero =
    (ZERO_X - RULER_LEFT) * MM;

  mesh.material = drawTexture(
    width,
    height,
    Math.min(30, 4096 / width),
    g => {
      steelGradient(g, width, height);

      g.fillStyle = "#171b20";
      g.textAlign = "center";
      g.textBaseline = "alphabetic";

      g.font = `600 4.2px ${FONT}`;

      for (
        let mm = 0;
        zero + mm <= width - 0.5;
        mm++
      ) {
        const centimetre = mm % 10 === 0;

        const length = centimetre
          ? 5.4
          : mm % 5 === 0
            ? 3.7
            : 2.4;

        const tickWidth = centimetre
          ? 0.17
          : 0.1;

        g.fillRect(
          zero + mm - tickWidth / 2,
          height - length,
          tickWidth,
          length
        );

        if (centimetre) {
          g.fillText(
            String(mm / 10),
            zero + mm,
            height - 6.3
          );
        }
      }

      g.font = `600 3px ${FONT}`;

      g.fillText(
        "cm",
        3,
        height - 6.3
      );

      g.fillStyle = "#777f88";

      g.fillRect(
        0,
        height - 0.15,
        width,
        0.15
      );
    }
  );
}

/*
IMPORTANT:
There is deliberately no buildVernier() overlay here.

Your GLB model already contains its physical vernier scale.
Adding another plane above it created the duplicate scale.
This script keeps the original vernier scale visible.
*/

/* =========================================================
   LOAD CALIPER MODEL
========================================================= */

new GLTFLoader().load(
  MODEL,

  gltf => {
    try {
      setup(gltf.scene);
    } catch (error) {
      console.error(error);

      say(
        "Setup problem: " + error.message
      );
    }
  },

  undefined,

  error => {
    console.error(error);

    say(
      "Model failed to load. Check that verniercaliper.glb " +
      "is in the same folder as script.js."
    );
  }
);

function setup(model) {
  rig = new THREE.Group();

  rig.add(model);
  scene.add(rig);

  rig.updateMatrixWorld(true);

  const movingParts = [];

  model.traverse(mesh => {
    const name = mesh.name.toLowerCase();

    if (HIDE.includes(name)) {
      mesh.visible = false;
    }

    if (MOVING.includes(name)) {
      movingParts.push(mesh);
    }

    if (!mesh.isMesh) return;

    mesh.frustumCulled = false;

    const originalMaterials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    const improvedMaterials = originalMaterials.map(
      original => {
        if (!original) {
          return polishedSteel.clone();
        }

        const material = original.clone();

        /*
        Retain the original map and colour so the downloaded
        model's existing details and markings are preserved.
        */

        if ("metalness" in material) {
          material.metalness = 0.9;
        }

        if ("roughness" in material) {
          material.roughness =
            THREE.MathUtils.clamp(
              material.roughness ?? 0.36,
              0.28,
              0.45
            );
        }

        if ("envMapIntensity" in material) {
          material.envMapIntensity = 1.1;
        }

        if ("clearcoat" in material) {
          material.clearcoat = 0.3;
          material.clearcoatRoughness = 0.24;
        }

        material.needsUpdate = true;

        return material;
      }
    );

    mesh.material = Array.isArray(mesh.material)
      ? improvedMaterials
      : improvedMaterials[0];

    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  if (movingParts.length < MOVING.length) {
    throw new Error(
      "The expected moving jaw parts were not found. " +
      "Check the model's object names."
    );
  }

  /*
  Apply the custom brushed-metal texture to the main scale.
  */

  const ruler = model.getObjectByName("Object_4");

  if (ruler) {
    buildRuler(ruler);
  } else {
    console.warn(
      "Object_4 was not found. The original main scale is retained."
    );
  }

  /*
  Create the moving slider and preserve the initial world
  positions of its parts.
  */

  slider = new THREE.Group();

  rig.add(slider);

  movingParts.forEach(part => {
    slider.attach(part);
  });

  /* Calculate the visible model bounds. */

  const fit = new THREE.Box3();

  rig.updateMatrixWorld(true);

  rig.traverse(mesh => {
    if (!mesh.isMesh || !mesh.visible) return;

    for (
      let parent = mesh.parent;
      parent;
      parent = parent.parent
    ) {
      if (!parent.visible) return;
    }

    fit.union(
      new THREE.Box3().setFromObject(mesh)
    );
  });

  if (fit.isEmpty()) {
    throw new Error(
      "The model contains no visible geometry."
    );
  }

  const size = fit.getSize(
    new THREE.Vector3()
  );

  W = size.x;
  H = size.y;

  rig.position
    .copy(fit.getCenter(new THREE.Vector3()))
    .negate();

  rig.updateMatrixWorld(true);

  ready = true;

  viewFull(true);

  say(
    "Caliper ready. Zoom in on the jaws or select an object to measure."
  );
}

/* =========================================================
   CAMERA AND VIEW HELPERS
========================================================= */

function distanceForSpan(span) {
  return span / (
    2 * Math.tan(
      THREE.MathUtils.degToRad(camera.fov / 2)
    )
  );
}

function go(position, target, instant = false) {
  if (instant) {
    camera.position.copy(position);
    controls.target.copy(target);

    controls.update();

    fly = null;

    return;
  }

  fly = {
    t0: performance.now(),
    p0: camera.position.clone(),
    q0: controls.target.clone(),
    p1: position.clone(),
    q1: target.clone()
  };
}

function viewFull(instant = false) {
  if (!ready) return;

  const span = Math.max(
    W / Math.max(camera.aspect, 0.01),
    H
  ) * 1.2;

  const distance =
    distanceForSpan(span) + 1;

  const target = new THREE.Vector3(
    0,
    0,
    0
  );

  const position = new THREE.Vector3(
    0,
    0,
    distance
  );

  go(position, target, instant);
}

function viewJaws() {
  if (!ready) return;

  const gap = slider.position.x;

  const center = rig.localToWorld(
    new THREE.Vector3(
      FACE_X + gap / 2,
      -0.55,
      FACE_Z
    )
  );

  const distance = distanceForSpan(
    Math.max(
      2.2,
      (gap + 1.4) /
        Math.max(camera.aspect, 0.01)
    )
  );

  const position = new THREE.Vector3(
    center.x,
    center.y,
    center.z + distance
  );

  go(position, center);
}

const fitButton = $("fitButton");
const jawsButton = $("jawsButton");

if (fitButton) {
  fitButton.onclick = () => {
    if (ready) viewFull();
  };
}

if (jawsButton) {
  jawsButton.onclick = viewJaws;
}

/* =========================================================
   CUSTOM TOUCH CONTROLS
   One finger:
   Drag right  = scene moves left.
   Drag down   = scene moves up.

   Two fingers:
   Pinch inward  = zoom out.
   Pinch outward = zoom in.
========================================================= */

const element = renderer.domElement;

const fingers = new Map();

let lastPinchDistance = 0;
let lastPinchMidpoint = null;

/*
Move the camera and controls target together.

The camera moves opposite to the movement of the scene,
which makes the displayed caliper move opposite to your
finger's direction.
*/

function panByPixels(dx, dy) {
  const distance = camera.position.distanceTo(
    controls.target
  );

  const scale =
    (2 * distance *
      Math.tan(
        THREE.MathUtils.degToRad(camera.fov / 2)
      )) /
    Math.max(viewer.clientHeight, 1);

  camera.updateMatrixWorld(true);

  const right = new THREE.Vector3()
    .setFromMatrixColumn(
      camera.matrixWorld,
      0
    );

  const up = new THREE.Vector3()
    .setFromMatrixColumn(
      camera.matrixWorld,
      1
    );

  /*
  Positive dx moves the camera right, so the scene appears
  to move left. Positive dy moves the camera down, so the
  scene appears to move up.
  */

  const movement = right
    .multiplyScalar(dx * scale)
    .add(
      up.multiplyScalar(-dy * scale)
    );

  camera.position.add(movement);
  controls.target.add(movement);

  controls.update();

  moved = true;
  fly = null;
}

function zoomByPinch(previousDistance, currentDistance) {
  if (
    previousDistance <= 0 ||
    currentDistance <= 0
  ) {
    return;
  }

  /*
  Spreading fingers apart should zoom in.
  Bringing fingers closer should zoom out.
  */

  const factor =
    previousDistance / currentDistance;

  const offset = camera.position
    .clone()
    .sub(controls.target);

  const oldDistance = offset.length();

  if (oldDistance <= 0) return;

  const newDistance =
    THREE.MathUtils.clamp(
      oldDistance * factor,
      controls.minDistance,
      controls.maxDistance
    );

  offset.setLength(newDistance);

  camera.position
    .copy(controls.target)
    .add(offset);

  controls.update();

  moved = true;
  fly = null;
}

function getTouchPoints() {
  return [...fingers.values()];
}

function getMidpoint(points) {
  return {
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2
  };
}

function getPinchDistance(points) {
  return Math.hypot(
    points[1].x - points[0].x,
    points[1].y - points[0].y
  );
}

function onTouchPointerDown(event) {
  if (event.pointerType !== "touch") return;

  /*
  Stop OrbitControls from also processing this touch event.
  This prevents two control systems from fighting each other.
  */

  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    element.setPointerCapture(event.pointerId);
  } catch (_) {
    /* Pointer capture may be unavailable in some browsers. */
  }

  fingers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });

  if (fingers.size === 2) {
    const points = getTouchPoints();

    lastPinchDistance =
      getPinchDistance(points);

    lastPinchMidpoint =
      getMidpoint(points);
  }
}

function onTouchPointerMove(event) {
  if (event.pointerType !== "touch") return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const previous = fingers.get(event.pointerId);

  if (!previous) return;

  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;

  fingers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });

  if (fingers.size === 1) {
    panByPixels(dx, dy);
    return;
  }

  if (fingers.size === 2) {
    const points = getTouchPoints();

    const currentDistance =
      getPinchDistance(points);

    const currentMidpoint =
      getMidpoint(points);

    /*
    Two-finger translation also pans the view.
    */

    if (lastPinchMidpoint) {
      panByPixels(
        currentMidpoint.x - lastPinchMidpoint.x,
        currentMidpoint.y - lastPinchMidpoint.y
      );
    }

    /*
    Apply pinch zoom.
    */

    zoomByPinch(
      lastPinchDistance,
      currentDistance
    );

    lastPinchDistance = currentDistance;

    lastPinchMidpoint = currentMidpoint;
  }
}

function onTouchPointerEnd(event) {
  if (event.pointerType !== "touch") return;

  event.preventDefault();
  event.stopImmediatePropagation();

  fingers.delete(event.pointerId);

  if (fingers.size < 2) {
    lastPinchDistance = 0;
    lastPinchMidpoint = null;
  }
}

/*
Capture-phase handlers prevent OrbitControls from processing
the same touch gestures a second time.
*/

element.addEventListener(
  "pointerdown",
  onTouchPointerDown,
  true
);

element.addEventListener(
  "pointermove",
  onTouchPointerMove,
  true
);

element.addEventListener(
  "pointerup",
  onTouchPointerEnd,
  true
);

element.addEventListener(
  "pointercancel",
  onTouchPointerEnd,
  true
);

/* =========================================================
   JAW SLIDER
========================================================= */

const jawSlider = $("jawSlider");
const jawValue = $("jawValue");

if (jawSlider) {
  jawSlider.addEventListener("input", () => {
    const value = Number(jawSlider.value);

    if (jawValue) {
      jawValue.textContent = value + "%";
    }

    if (ready && !obj) {
      slider.position.x =
        (value / 100) * TRAVEL;
    }
  });
}

/* =========================================================
   MEASUREMENT OBJECTS
========================================================= */

const SHAPES = {
  sphere: {
    fields: ["Diameter"],
    max: 60,

    geometry: a =>
      new THREE.SphereGeometry(
        a / 2,
        96,
        64
      ),

    height: a => a
  },

  cube: {
    fields: ["Side"],
    max: 100,

    geometry: a =>
      new THREE.BoxGeometry(
        a,
        a,
        a
      ),

    height: a => a
  },

  cylinder: {
    fields: ["Diameter", "Height"],
    max: 100,

    geometry: (a, b) =>
      new THREE.CylinderGeometry(
        a / 2,
        a / 2,
        b,
        96,
        1
      ),

    height: (a, b) => b
  },

  cuboid: {
    fields: ["Length", "Width", "Height"],
    max: 100,

    /*
    Length = X
    Width  = Z
    Height = Y
    */

    geometry: (a, b, c) =>
      new THREE.BoxGeometry(
        a,
        c,
        b
      ),

    height: (a, b, c) => c
  },

  cone: {
    fields: ["Base diameter", "Height"],
    max: 100,

    geometry: (a, b) =>
      new THREE.ConeGeometry(
        a / 2,
        b,
        96,
        1
      ),

    height: (a, b) => b
  }
};

/* =========================================================
   READ DIMENSIONS
========================================================= */

function readDims() {
  const definition = SHAPES[shape];

  if (!definition) return null;

  const dimensions = definition.fields.map(
    (_, index) =>
      Number(
        $("dim" + "ABC"[index]).value
      )
  );

  const maximumOpening =
    Math.floor(TRAVEL * MM);

  if (
    dimensions.some(
      value =>
        !Number.isFinite(value) ||
        value < 1 ||
        value > definition.max
    )
  ) {
    say(
      `Enter dimensions between 1 and ${definition.max} mm.`
    );

    return null;
  }

  if (dimensions[0] > maximumOpening) {
    say(
      `The available jaw opening is approximately ${maximumOpening} mm.`
    );

    return null;
  }

  return dimensions;
}

/* =========================================================
   PLACE OBJECT BETWEEN JAWS
========================================================= */

function place() {
  if (!obj || !shape || !ready) return;

  const dimensions = readDims();

  if (!dimensions) return;

  const definition = SHAPES[shape];

  const values = dimensions.map(
    value => value / MM
  );

  obj.geometry.dispose();

  obj.geometry = definition.geometry(
    ...values
  );

  obj.geometry.computeVertexNormals();

  /*
  Move the slider according to the object's first dimension.
  */

  slider.position.x = values[0];

  const height = definition.height(
    ...values
  );

  let y = ROOT_Y - height / 2;

  if (shape === "cone") {
    y = ROOT_Y - 0.05 - height / 2;
  }

  if (shape === "sphere") {
    y = Math.max(y, -1.05);
  }

  obj.rotation.set(
    0,
    0,
    shape === "cone" ? Math.PI : 0
  );

  obj.position.set(
    FACE_X + values[0] / 2,
    y,
    FACE_Z
  );

  const measurementAnswer =
    $("measurementAnswer");

  if (measurementAnswer) {
    measurementAnswer.textContent =
      definition.fields
        .map(
          (name, index) =>
            `${name}: ${dimensions[index]} mm`
        )
        .join(", ");
  }

  say(
    `Object selected. Entered dimensions: ${dimensions.join(" × ")} mm.`
  );
}

/* =========================================================
   SELECT SHAPE
========================================================= */

function selectShape(selectedShape) {
  if (!ready) {
    say("Wait for the caliper to load.");
    return;
  }

  shape = selectedShape;

  if (!obj) {
    obj = new THREE.Mesh(
      new THREE.BufferGeometry(),
      objectMaterials[shape]
    );

    obj.castShadow = true;
    obj.receiveShadow = true;

    rig.add(obj);
  } else {
    obj.material = objectMaterials[shape];
  }

  document.querySelectorAll("[data-shape]").forEach(
    button => {
      button.classList.toggle(
        "active",
        button.dataset.shape === selectedShape
      );
    }
  );

  const fields = SHAPES[selectedShape].fields;

  "ABC".split("").forEach((key, index) => {
    const enabled = index < fields.length;

    $("field" + key).hidden = !enabled;

    if (enabled) {
      $("label" + key).textContent =
        fields[index] + " (mm)";
    }
  });

  /*
  Default dimensions for each object.
  */

  const defaults = {
    sphere: [20],
    cube: [20],
    cylinder: [20, 30],
    cuboid: [30, 20, 15],
    cone: [20, 30]
  };

  defaults[selectedShape].forEach(
    (value, index) => {
      $("dim" + "ABC"[index]).value = value;
    }
  );

  $("objectPanel").hidden = false;
  $("jawControlPanel").hidden = true;

  place();
}

/* =========================================================
   REMOVE OBJECT
========================================================= */

function removeObject() {
  if (!obj) return;

  rig.remove(obj);

  obj.geometry.dispose();

  obj = null;
  shape = null;

  document.querySelectorAll("[data-shape]").forEach(
    button => button.classList.remove("active")
  );

  $("objectPanel").hidden = true;
  $("jawControlPanel").hidden = false;

  slider.position.x = Math.min(
    TRAVEL,
    Math.max(0, slider.position.x)
  );

  const percentage = Math.round(
    (slider.position.x / TRAVEL) * 100
  );

  if (jawSlider) {
    jawSlider.value = percentage;
  }

  if (jawValue) {
    jawValue.textContent = percentage + "%";
  }

  say("Object removed. Move the jaws freely.");
}

document.querySelectorAll("[data-shape]").forEach(
  button => {
    button.onclick = () =>
      selectShape(button.dataset.shape);
  }
);

["dimA", "dimB", "dimC"].forEach(id => {
  const input = $(id);

  if (input) {
    input.addEventListener("input", place);
  }
});

const removeButton = $("removeButton");

if (removeButton) {
  removeButton.onclick = removeObject;
}

/* =========================================================
   RESIZE
========================================================= */

new ResizeObserver(() => {
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;

  if (!width || !height) return;

  camera.aspect = width / height;

  camera.updateProjectionMatrix();

  renderer.setSize(
    width,
    height,
    false
  );

  if (ready && !moved) {
    viewFull(true);
  }
}).observe(viewer);

/* =========================================================
   RENDER LOOP
========================================================= */

function animate(now) {
  requestAnimationFrame(animate);

  if (fly) {
    const progress = Math.min(
      1,
      (now - fly.t0) / 500
    );

    const eased =
      progress * progress * (3 - 2 * progress);

    camera.position.lerpVectors(
      fly.p0,
      fly.p1,
      eased
    );

    controls.target.lerpVectors(
      fly.q0,
      fly.q1,
      eased
    );

    if (progress === 1) {
      fly = null;
    }
  }

  controls.update();

  renderer.render(
    scene,
    camera
  );
}

animate(performance.now());
