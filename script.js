import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* =========================================================
   VERNIER CALIPER CONFIGURATION
   Retains your existing model and calibration constants.
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

const VERN = {
  x0: -1.192,
  x1: 0.537,
  y0: -0.166,
  y1: -0.0045,
  z: 0.469
};

const $ = id => document.getElementById(id);

const viewer = $("viewer");

function say(message) {
  const status = $("status");
  if (status) status.textContent = message;
}

/* =========================================================
   SCENE
========================================================= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.domElement.style.display = "block";
renderer.domElement.style.width = "100%";
renderer.domElement.style.height = "100%";
renderer.domElement.style.touchAction = "none";

viewer.appendChild(renderer.domElement);

/* =========================================================
   LIGHTING
   Multiple lights create visible metallic highlights.
========================================================= */

scene.add(
  new THREE.HemisphereLight(
    0xffffff,
    0x242a32,
    2.0
  )
);

function addLight(color, intensity, x, y, z) {
  const light = new THREE.DirectionalLight(color, intensity);

  light.position.set(x, y, z);
  scene.add(light);

  return light;
}

addLight(0xffffff, 5.0, 3, 5, 7);
addLight(0xdceaff, 3.5, -5, 2, 4);
addLight(0xffffff, 4.0, 1, -3, -5);
addLight(0xffffff, 2.5, -2, 5, -3);

/* Environment reflections are essential for shiny metal. */

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

/* Highly polished silver steel for the caliper. */

const silver = new THREE.MeshPhysicalMaterial({
  color: 0xe6eaf0,
  metalness: 1.0,
  roughness: 0.19,
  clearcoat: 1.0,
  clearcoatRoughness: 0.12,
  envMapIntensity: 2.0
});

/* Reflective material for the movable parts. */

const polishedSteel = new THREE.MeshPhysicalMaterial({
  color: 0xdce2e9,
  metalness: 1.0,
  roughness: 0.23,
  clearcoat: 1.0,
  clearcoatRoughness: 0.1,
  envMapIntensity: 1.8
});

/* Darker steel for recesses and engraved areas. */

const darkSteel = new THREE.MeshStandardMaterial({
  color: 0x454c55,
  metalness: 0.95,
  roughness: 0.3
});

/* Shiny materials for measurement objects. */

function makeObjectMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.32,
    roughness: 0.19,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.6
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
controls.zoomSpeed = 1.0;

/*
Mouse:
Left drag   = pan
Middle drag = zoom
Right drag  = rotate
Wheel       = zoom towards cursor

Touch:
One finger  = pan in the direction of the finger
Two fingers = pinch zoom and pan
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
const u3 = new THREE.Vector3();

let W = 6;
let H = 2.5;

let rig = null;
let slider = null;
let ready = false;

let shape = null;
let obj = null;

/* =========================================================
   HIGH-QUALITY SCALE TEXTURES
========================================================= */

const FONT = "Arial, Helvetica, sans-serif";

function steelGradient(g, w, h) {
  const gradient = g.createLinearGradient(0, 0, 0, h);

  gradient.addColorStop(0, "#f5f7fa");
  gradient.addColorStop(0.25, "#e4e8ec");
  gradient.addColorStop(0.55, "#cbd2d9");
  gradient.addColorStop(0.8, "#e7ebef");
  gradient.addColorStop(1, "#aeb7c1");

  g.fillStyle = gradient;
  g.fillRect(0, 0, w, h);
}

function drawTexture(wMm, hMm, pxMm, draw) {
  const canvas = document.createElement("canvas");

  canvas.width = Math.max(1, Math.round(wMm * pxMm));
  canvas.height = Math.max(1, Math.round(hMm * pxMm));

  const g = canvas.getContext("2d");

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
    metalness: 0.85,
    roughness: 0.23,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.2,
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
    console.warn("Main scale has no UV attribute.");
    return;
  }

  for (let i = 0; i < position.count; i++) {
    v3.fromBufferAttribute(position, i);
    v3.applyMatrix4(worldMatrix);

    v3.x = Math.max(v3.x, RULER_LEFT);

    uv.setXY(
      i,
      (v3.x - RULER_LEFT) /
        Math.max(0.001, bounds.max.x - RULER_LEFT),

      (v3.y - bounds.min.y) /
        Math.max(0.001, bounds.max.y - bounds.min.y)
    );

    v3.applyMatrix4(inverseMatrix);

    position.setXYZ(i, v3.x, v3.y, v3.z);
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

      g.fillText("cm", 3, height - 6.3);

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

/* =========================================================
   VERNIER SCALE
========================================================= */

function buildVernier() {
  const width =
    (VERN.x1 - VERN.x0) * MM;

  const height =
    (VERN.y1 - VERN.y0) * MM;

  const zero =
    (ZERO_X - VERN.x0) * MM;

  const pitch = 39 / 20;

  const material = drawTexture(
    width,
    height,
    Math.min(38, 2048 / width),
    g => {
      steelGradient(g, width, height);

      g.fillStyle = "#15191e";
      g.textAlign = "center";

      g.font = `600 1.9px ${FONT}`;

      for (let i = 0; i <= 20; i++) {
        const even = i % 2 === 0;

        const tickWidth =
          i % 10 === 0 ? 0.16 : 0.1;

        g.fillRect(
          zero + i * pitch - tickWidth / 2,
          0,
          tickWidth,
          even ? 2.6 : 1.6
        );

        if (even) {
          g.fillText(
            String(i / 2),
            zero + i * pitch,
            4.6
          );
        }
      }

      g.textAlign = "left";

      g.fillText(
        "0.05 mm",
        zero + 39 + 3.2,
        4.6
      );
    }
  );

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(
      VERN.x1 - VERN.x0,
      VERN.y1 - VERN.y0
    ),
    material
  );

  plane.material.polygonOffset = true;
  plane.material.polygonOffsetFactor = -2;
  plane.material.polygonOffsetUnits = -2;

  plane.position.set(
    (VERN.x0 + VERN.x1) / 2,
    (VERN.y0 + VERN.y1) / 2,
    VERN.z
  );

  return plane;
}

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

      say("Setup problem: " + error.message);
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

        material.metalness = 1.0;

        /*
        Keep the original material colour and texture.
        This preserves dark markings and existing details.
        */

        if ("roughness" in material) {
          material.roughness = Math.min(
            material.roughness ?? 0.4,
            0.24
          );
        }

        if ("envMapIntensity" in material) {
          material.envMapIntensity = 1.8;
        }

        if ("clearcoat" in material) {
          material.clearcoat = 0.8;
          material.clearcoatRoughness = 0.12;
        }

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

  const ruler = model.getObjectByName("Object_4");

  if (ruler) {
    buildRuler(ruler);
  } else {
    console.warn(
      "Object_4 was not found. The original main scale is retained."
    );
  }

  slider = new THREE.Group();

  rig.add(slider);

  movingParts.forEach(part => {
    slider.attach(part);
  });

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
    throw new Error("The model contains no visible geometry.");
  }

  const size = fit.getSize(new THREE.Vector3());

  W = size.x;
  H = size.y;

  rig.position
    .copy(fit.getCenter(new THREE.Vector3()))
    .negate();

  slider.add(buildVernier());

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

  const distance = distanceForSpan(span) + 1;

  const target = new THREE.Vector3(0, 0, 0);

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
      (gap + 1.4) / Math.max(camera.aspect, 0.01)
    )
  );

  const position = new THREE.Vector3(
    center.x,
    center.y,
    center.z + distance
  );

  go(position, center);
}

$("fitButton").onclick = () => {
  if (ready) viewFull();
};

$("jawsButton").onclick = viewJaws;

/* =========================================================
   TOUCH PAN
   Finger movement follows the direction of the finger.
========================================================= */

const element = renderer.domElement;

const fingers = new Map();

element.addEventListener("pointerdown", event => {
  if (event.pointerType !== "touch") return;

  fingers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });
});

element.addEventListener("pointermove", event => {
  const finger = fingers.get(event.pointerId);

  if (!finger || fingers.size !== 1) return;

  const dx = event.clientX - finger.x;
  const dy = event.clientY - finger.y;

  finger.x = event.clientX;
  finger.y = event.clientY;

  const distance = camera.position.distanceTo(
    controls.target
  );

  const scale =
    (2 * distance *
      Math.tan(
        THREE.MathUtils.degToRad(camera.fov / 2)
      )) /
    Math.max(viewer.clientHeight, 1);

  camera.updateMatrixWorld();

  const right = new THREE.Vector3()
    .setFromMatrixColumn(camera.matrixWorld, 0);

  const up = new THREE.Vector3()
    .setFromMatrixColumn(camera.matrixWorld, 1);

  /*
  Pan follows the finger direction.

  Positive dx moves the view right.
  Negative dx moves the view left.
  Positive dy moves the view down.
  Negative dy moves the view up.
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
});

["pointerup", "pointercancel", "pointerleave"].forEach(
  eventName => {
    element.addEventListener(eventName, event => {
      fingers.delete(event.pointerId);
    });
  }
);

/* =========================================================
   JAW SLIDER
========================================================= */

$("jawSlider").addEventListener("input", () => {
  const value = Number($("jawSlider").value);

  $("jawValue").textContent = value + "%";

  if (ready && !obj) {
    slider.position.x =
      (value / 100) * TRAVEL;
  }
});

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
      new THREE.BoxGeometry(a, a, a),

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

    All three dimensions can be different.
    */

    geometry: (a, b, c) =>
      new THREE.BoxGeometry(a, c, b),

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
      Number($("dim" + "ABC"[index]).value)
  );

  const maximumOpening = Math.floor(TRAVEL * MM);

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

  obj.geometry = definition.geometry(...values);

  obj.geometry.computeVertexNormals();

  /*
  The slider moves so the jaw gap equals the first dimension.
  */

  slider.position.x = values[0];

  const height = definition.height(...values);

  let y = ROOT_Y - height / 2;

  if (shape !== "cone") {
    y = ROOT_Y - height / 2;
  } else {
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

  $("measurementAnswer").textContent =
    definition.fields
      .map(
        (name, index) =>
          `${name}: ${dimensions[index]} mm`
      )
      .join(", ");

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
  Give newly selected objects useful default dimensions.
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

  $("jawSlider").value = percentage;
  $("jawValue").textContent = percentage + "%";

  say("Object removed. Move the jaws freely.");
}

document.querySelectorAll("[data-shape]").forEach(
  button => {
    button.onclick = () =>
      selectShape(button.dataset.shape);
  }
);

["dimA", "dimB", "dimC"].forEach(id => {
  $(id).addEventListener("input", place);
});

$("removeButton").onclick = removeObject;

/* =========================================================
   RESIZE
========================================================= */

new ResizeObserver(() => {
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;

  if (!width || !height) return;

  camera.aspect = width / height;

  camera.updateProjectionMatrix();

  renderer.setSize(width, height, false);

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

  renderer.render(scene, camera);
}

animate(performance.now());
