import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const DEFAULT_AVATAR_OPTIONS = Object.freeze({
  skinColor: '#d99a78',
  eyeColor: '#554238',
  hairColor: '#251a16',
  topColor: '#354f77',
  bottomColor: '#202733',
  accentColor: '#69e6d5',
  shoeColor: '#e9edf2',
  bodyType: 'balanced',
  faceShape: 'oval',
  hairStyle: 'crop',
  outfitStyle: 'casual',
  accessoryStyle: 'none',
  heightScale: 1,
  shoulderScale: 1,
  headScale: 1,
});

const UP = new THREE.Vector3(0, 1, 0);
const CORE = [11, 12, 23, 24];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeStandardMaterial(color, roughness = 0.72, metalness = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
  });
}

function makePhysicalMaterial(color, roughness = 0.62, sheen = 0) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    sheen,
    sheenRoughness: 0.8,
    clearcoat: 0.04,
    clearcoatRoughness: 0.8,
  });
}

function createCapsule(material, segments = 18) {
  const geometry = new THREE.CapsuleGeometry(1, 1, 8, segments);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createSphere(material, widthSegments = 28, heightSegments = 20) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, widthSegments, heightSegments),
    material,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createSmoothLimb(material) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function updateSmoothLimb(mesh, controlPoints, radii, tubularSegments = 32, radialSegments = 20) {
  const curve = new THREE.CatmullRomCurve3(
    controlPoints.map(point => point.clone()),
    false,
    'centripetal',
  );
  const positions = [];
  const indices = [];
  let previousNormal = null;

  function radiusAt(t) {
    const scaled = t * (radii.length - 1);
    const index = Math.min(Math.floor(scaled), radii.length - 2);
    const alpha = scaled - index;
    const eased = alpha * alpha * (3 - 2 * alpha);
    return THREE.MathUtils.lerp(radii[index], radii[index + 1], eased);
  }

  for (let segment = 0; segment <= tubularSegments; segment += 1) {
    const t = segment / tubularSegments;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    let normal;

    if (previousNormal) {
      normal = previousNormal.clone().addScaledVector(
        tangent,
        -previousNormal.dot(tangent),
      );
      if (normal.lengthSq() < 1e-6) normal = null;
    }
    if (!normal) {
      const reference = Math.abs(tangent.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
      normal = new THREE.Vector3().crossVectors(tangent, reference);
    }
    normal.normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    previousNormal = normal;
    const radius = radiusAt(t);

    for (let side = 0; side < radialSegments; side += 1) {
      const angle = side / radialSegments * Math.PI * 2;
      const offset = normal.clone().multiplyScalar(Math.cos(angle) * radius)
        .addScaledVector(binormal, Math.sin(angle) * radius);
      const vertex = center.clone().add(offset);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
  }

  for (let segment = 0; segment < tubularSegments; segment += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const nextSide = (side + 1) % radialSegments;
      const current = segment * radialSegments + side;
      const next = segment * radialSegments + nextSide;
      const upper = (segment + 1) * radialSegments + side;
      const upperNext = (segment + 1) * radialSegments + nextSide;
      indices.push(current, upper, next, next, upper, upperNext);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  mesh.geometry.dispose();
  mesh.geometry = geometry;
  mesh.visible = true;
}

function updateCapsule(mesh, start, end, radius) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(direction.length(), radius * 2.1);
  mesh.position.copy(start).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  mesh.scale.set(radius, length / 3, radius);
  mesh.visible = true;
}

function updateEllipsoidBetween(mesh, start, end, width, depth) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(direction.length(), 0.1);
  mesh.position.copy(start).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  mesh.scale.set(width, length * 0.52, depth);
}

function average(points) {
  const valid = points.filter(Boolean);
  if (valid.length === 0) return new THREE.Vector3();
  return valid.reduce(
    (sum, point) => sum.add(point),
    new THREE.Vector3(),
  ).multiplyScalar(1 / valid.length);
}

function basePose() {
  return {
    0: new THREE.Vector3(0, 1.34, 0.08),
    7: new THREE.Vector3(-0.17, 1.36, 0),
    8: new THREE.Vector3(0.17, 1.36, 0),
    11: new THREE.Vector3(-0.42, 0.78, 0),
    12: new THREE.Vector3(0.42, 0.78, 0),
    13: new THREE.Vector3(-0.67, 0.32, 0.02),
    14: new THREE.Vector3(0.67, 0.32, 0.02),
    15: new THREE.Vector3(-0.78, -0.12, 0.06),
    16: new THREE.Vector3(0.78, -0.12, 0.06),
    23: new THREE.Vector3(-0.24, -0.08, 0),
    24: new THREE.Vector3(0.24, -0.08, 0),
    25: new THREE.Vector3(-0.25, -0.75, 0.03),
    26: new THREE.Vector3(0.25, -0.75, 0.03),
    27: new THREE.Vector3(-0.25, -1.42, 0.04),
    28: new THREE.Vector3(0.25, -1.42, 0.04),
    29: new THREE.Vector3(-0.25, -1.47, 0.03),
    30: new THREE.Vector3(0.25, -1.47, 0.03),
    31: new THREE.Vector3(-0.25, -1.45, 0.22),
    32: new THREE.Vector3(0.25, -1.45, 0.22),
  };
}

function normalizeSavedPose(result) {
  const worldSource = result?.poseWorldLandmarks;
  const normalizedSource = result?.poseLandmarks;
  const world = Array.isArray(worldSource?.[0]) ? worldSource[0] : worldSource;
  const normalized = Array.isArray(normalizedSource?.[0]) ? normalizedSource[0] : normalizedSource;

  if (Array.isArray(world) && world.length >= 29) {
    const shoulderWidth = Math.hypot(
      (world[12]?.x ?? 0) - (world[11]?.x ?? 0),
      (world[12]?.y ?? 0) - (world[11]?.y ?? 0),
      (world[12]?.z ?? 0) - (world[11]?.z ?? 0),
    );
    const scale = clamp(0.84 / Math.max(shoulderWidth, 0.18), 1.25, 4.2);
    const hip = average([
      world[23] && new THREE.Vector3(world[23].x, -world[23].y, -world[23].z),
      world[24] && new THREE.Vector3(world[24].x, -world[24].y, -world[24].z),
    ]);
    const points = {};
    world.forEach((point, index) => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      points[index] = new THREE.Vector3(point.x, -point.y, -(point.z ?? 0))
        .sub(hip)
        .multiplyScalar(scale);
      points[index].y -= 0.08;
    });
    return points;
  }

  if (Array.isArray(normalized) && normalized.length >= 29) {
    const hipX = ((normalized[23]?.x ?? 0.5) + (normalized[24]?.x ?? 0.5)) * 0.5;
    const hipY = ((normalized[23]?.y ?? 0.55) + (normalized[24]?.y ?? 0.55)) * 0.5;
    const hipZ = ((normalized[23]?.z ?? 0) + (normalized[24]?.z ?? 0)) * 0.5;
    const shoulderSpan = Math.abs((normalized[12]?.x ?? 0.65) - (normalized[11]?.x ?? 0.35));
    const scale = clamp(0.84 / Math.max(shoulderSpan, 0.15), 1.5, 3.5);
    const points = {};
    normalized.forEach((point, index) => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      points[index] = new THREE.Vector3(
        (point.x - hipX) * scale,
        (hipY - point.y) * scale,
        -((point.z ?? 0) - hipZ) * scale * 0.7,
      );
      points[index].y -= 0.08;
    });
    return points;
  }

  return null;
}

function mergePoseWithFallback(savedPoints, options) {
  const fallback = basePose();
  const points = {};
  Object.keys(fallback).forEach(key => {
    const index = Number(key);
    points[index] = savedPoints?.[index]?.clone() ?? fallback[index].clone();
  });

  const hipCenter = average([points[23], points[24]]);
  Object.values(points).forEach(point => {
    point.y = hipCenter.y + (point.y - hipCenter.y) * options.heightScale;
  });

  const shoulderCenter = average([points[11], points[12]]);
  [11, 13, 15].forEach(index => {
    points[index].x = shoulderCenter.x +
      (points[index].x - shoulderCenter.x) * options.shoulderScale;
  });
  [12, 14, 16].forEach(index => {
    points[index].x = shoulderCenter.x +
      (points[index].x - shoulderCenter.x) * options.shoulderScale;
  });

  const footY = Math.min(points[27].y, points[28].y, points[29].y, points[30].y);
  const floorOffset = -1.46 - footY;
  Object.values(points).forEach(point => {
    point.y += floorOffset;
  });
  return points;
}

function createHairStyle(head, material) {
  const styles = {};

  const crop = new THREE.Group();
  const cropCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.265, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.56),
    material,
  );
  cropCap.scale.set(1.04, 1.03, 1.03);
  cropCap.position.y = 0.055;
  crop.add(cropCap);
  for (let index = 0; index < 7; index += 1) {
    const lock = createSphere(material, 16, 10);
    const angle = (index / 6 - 0.5) * 1.45;
    lock.scale.set(0.045, 0.075, 0.045);
    lock.position.set(Math.sin(angle) * 0.2, 0.21 - Math.abs(angle) * 0.035, 0.18 + Math.cos(angle) * 0.055);
    crop.add(lock);
  }
  styles.crop = crop;

  const wave = crop.clone();
  for (let index = 0; index < 12; index += 1) {
    const curl = createSphere(material, 16, 12);
    const angle = index / 12 * Math.PI * 2;
    curl.scale.set(0.065, 0.085, 0.065);
    curl.position.set(Math.cos(angle) * 0.23, 0.14 + Math.sin(angle * 2) * 0.04, Math.sin(angle) * 0.2);
    wave.add(curl);
  }
  styles.wave = wave;

  const long = new THREE.Group();
  long.add(cropCap.clone());
  const backHair = createCapsule(material, 22);
  backHair.scale.set(0.25, 0.25, 0.15);
  backHair.position.set(0, -0.16, -0.12);
  long.add(backHair);
  [-1, 1].forEach(side => {
    const strand = createCapsule(material, 18);
    strand.scale.set(0.075, 0.17, 0.07);
    strand.position.set(side * 0.23, -0.15, 0.02);
    strand.rotation.z = side * 0.08;
    long.add(strand);
  });
  styles.long = long;

  const bun = crop.clone();
  const bunMesh = createSphere(material, 24, 16);
  bunMesh.scale.set(0.13, 0.14, 0.12);
  bunMesh.position.set(0, 0.27, -0.12);
  bun.add(bunMesh);
  styles.bun = bun;

  Object.values(styles).forEach(style => {
    style.visible = false;
    head.add(style);
  });
  return styles;
}

function createHand(material) {
  const hand = new THREE.Group();
  const palm = createSphere(material, 20, 14);
  palm.scale.set(0.08, 0.105, 0.045);
  hand.add(palm);

  const fingerOffsets = [-0.052, -0.026, 0, 0.026, 0.052];
  fingerOffsets.forEach((offset, index) => {
    const finger = createCapsule(material, 12);
    finger.scale.set(0.012, 0.035 + (2 - Math.abs(2 - index)) * 0.006, 0.012);
    finger.position.set(offset, -0.115, 0.004);
    finger.rotation.z = offset * -1.8;
    hand.add(finger);
  });
  return hand;
}

function createAccessoryGroup(materials) {
  const group = new THREE.Group();
  const accessories = {};

  const glasses = new THREE.Group();
  [-1, 1].forEach(side => {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.008, 8, 28),
      materials.metal,
    );
    rim.position.set(side * 0.09, 0.045, 0.235);
    glasses.add(rim);
  });
  const bridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.007, 0.05, 10),
    materials.metal,
  );
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, 0.045, 0.235);
  glasses.add(bridge);
  accessories.glasses = glasses;

  const headphones = new THREE.Group();
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.285, 0.024, 12, 40, Math.PI),
    materials.accent,
  );
  band.position.y = 0.02;
  headphones.add(band);
  [-1, 1].forEach(side => {
    const cup = createSphere(materials.dark, 20, 14);
    cup.scale.set(0.055, 0.1, 0.055);
    cup.position.set(side * 0.28, -0.02, 0);
    headphones.add(cup);
  });
  accessories.headphones = headphones;

  const earrings = new THREE.Group();
  [-1, 1].forEach(side => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.028, 0.006, 8, 20),
      materials.metal,
    );
    ring.position.set(side * 0.275, -0.035, 0);
    earrings.add(ring);
  });
  accessories.earrings = earrings;

  Object.values(accessories).forEach(accessory => {
    accessory.visible = false;
    group.add(accessory);
  });
  return { group, accessories };
}

export function createVirtualAvatar(container, initialOptions = {}) {
  const options = { ...DEFAULT_AVATAR_OPTIONS, ...initialOptions };
  let savedPose = null;
  let autoRotate = true;
  let controlsInteracting = false;
  let animationFrameId = 0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d1119');
  scene.fog = new THREE.FogExp2('#0d1119', 0.065);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.05, 5.35);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 8;
  controls.target.set(0, 0.02, 0);
  controls.update();
  controls.addEventListener('start', () => {
    controlsInteracting = true;
  });
  controls.addEventListener('end', () => {
    controlsInteracting = false;
  });

  const hemi = new THREE.HemisphereLight('#dcecff', '#182134', 1.9);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight('#fff2e8', 4.2);
  keyLight.position.set(3.4, 4.8, 4.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -3;
  keyLight.shadow.camera.right = 3;
  keyLight.shadow.camera.top = 4;
  keyLight.shadow.camera.bottom = -3;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight('#77bfff', 3.1);
  rimLight.position.set(-4, 2.4, -3);
  scene.add(rimLight);

  const fillLight = new THREE.PointLight('#69e6d5', 12, 8, 2);
  fillLight.position.set(-2.4, 0.2, 2.7);
  scene.add(fillLight);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(1.42, 1.58, 0.12, 64),
    makeStandardMaterial('#131b28', 0.52, 0.18),
  );
  platform.position.y = -1.57;
  platform.receiveShadow = true;
  scene.add(platform);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.ShadowMaterial({ color: '#000000', opacity: 0.38 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.51;
  floor.receiveShadow = true;
  scene.add(floor);

  const materials = {
    skin: makePhysicalMaterial(options.skinColor, 0.68, 0.08),
    top: makePhysicalMaterial(options.topColor, 0.82, 0.2),
    bottom: makePhysicalMaterial(options.bottomColor, 0.76, 0.1),
    shoe: makePhysicalMaterial(options.shoeColor, 0.42, 0.05),
    hair: makePhysicalMaterial(options.hairColor, 0.76, 0.12),
    eyeWhite: makePhysicalMaterial('#f5f3ef', 0.28),
    iris: makePhysicalMaterial(options.eyeColor, 0.34, 0),
    pupil: makeStandardMaterial('#080808', 0.32),
    lip: makePhysicalMaterial('#9d514f', 0.5),
    accent: makePhysicalMaterial(options.accentColor, 0.42, 0.15),
    metal: makePhysicalMaterial('#bcc7d2', 0.2, 0.82),
    dark: makePhysicalMaterial('#151922', 0.36, 0.1),
  };

  const avatar = new THREE.Group();
  avatar.position.y = 0.03;
  scene.add(avatar);

  const chest = createSphere(materials.top, 36, 26);
  const abdomen = createCapsule(materials.top, 24);
  const pelvis = createSphere(materials.bottom, 30, 22);
  avatar.add(chest, abdomen, pelvis);

  const limbs = {
    leftArm: createSmoothLimb(materials.skin),
    rightArm: createSmoothLimb(materials.skin),
    leftLeg: createSmoothLimb(materials.bottom),
    rightLeg: createSmoothLimb(materials.bottom),
    neck: createCapsule(materials.skin),
  };
  Object.values(limbs).forEach(mesh => avatar.add(mesh));

  const leftHand = createHand(materials.skin);
  const rightHand = createHand(materials.skin);
  avatar.add(leftHand, rightHand);

  const leftShoe = createSphere(materials.shoe, 28, 18);
  const rightShoe = createSphere(materials.shoe, 28, 18);
  avatar.add(leftShoe, rightShoe);

  const head = new THREE.Group();
  avatar.add(head);

  const headMesh = createSphere(materials.skin, 48, 36);
  head.add(headMesh);

  [-1, 1].forEach(side => {
    const ear = createSphere(materials.skin, 20, 14);
    ear.scale.set(0.042, 0.066, 0.028);
    ear.position.set(side * 0.245, 0, 0);
    head.add(ear);
  });

  const eyes = [];
  const irises = [];
  [-1, 1].forEach(side => {
    const eye = createSphere(materials.eyeWhite, 24, 16);
    eye.scale.set(0.067, 0.042, 0.025);
    eye.position.set(side * 0.09, 0.055, 0.218);
    head.add(eye);
    eyes.push(eye);

    const iris = createSphere(materials.iris, 20, 14);
    iris.scale.set(0.027, 0.027, 0.012);
    iris.position.set(side * 0.09, 0.054, 0.241);
    head.add(iris);
    irises.push(iris);

    const pupil = createSphere(materials.pupil, 16, 12);
    pupil.scale.set(0.011, 0.011, 0.007);
    pupil.position.set(side * 0.09, 0.054, 0.251);
    head.add(pupil);

    const brow = createCapsule(materials.hair, 14);
    brow.scale.set(0.012, 0.03, 0.012);
    brow.rotation.z = Math.PI / 2 + side * 0.08;
    brow.position.set(side * 0.09, 0.115, 0.225);
    head.add(brow);
  });

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.034, 0.105, 18),
    materials.skin,
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, 0.255);
  nose.castShadow = true;
  head.add(nose);

  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.052, 0.009, 8, 24, Math.PI),
    materials.lip,
  );
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -0.085, 0.238);
  head.add(mouth);

  const hairStyles = createHairStyle(head, materials.hair);
  const accessoryBundle = createAccessoryGroup(materials);
  head.add(accessoryBundle.group);

  const lapels = new THREE.Group();
  [-1, 1].forEach(side => {
    const lapel = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.46, 0.035),
      materials.accent,
    );
    lapel.position.set(side * 0.12, 0, 0.25);
    lapel.rotation.z = side * 0.25;
    lapels.add(lapel);
  });
  avatar.add(lapels);

  const sportStripes = new THREE.Group();
  [-1, 1].forEach(side => {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.74, 0.018),
      materials.accent,
    );
    stripe.position.set(side * 0.23, 0, 0.24);
    sportStripes.add(stripe);
  });
  avatar.add(sportStripes);

  function setColor(material, value) {
    material.color.set(value);
    material.needsUpdate = true;
  }

  function applyPose(result = savedPose) {
    savedPose = result;
    const points = mergePoseWithFallback(normalizeSavedPose(result), options);
    const shoulderCenter = average([points[11], points[12]]);
    const hipCenter = average([points[23], points[24]]);
    const torsoLength = shoulderCenter.distanceTo(hipCenter);
    const shoulderWidth = points[11].distanceTo(points[12]);
    const hipWidth = points[23].distanceTo(points[24]);
    const bodyFactor = options.bodyType === 'slim'
      ? 0.84
      : options.bodyType === 'athletic' ? 1.16 : 1;

    updateEllipsoidBetween(
      chest,
      hipCenter.clone().lerp(shoulderCenter, 0.45),
      shoulderCenter.clone().addScaledVector(
        new THREE.Vector3().subVectors(shoulderCenter, hipCenter),
        0.12,
      ),
      shoulderWidth * 0.56 * bodyFactor,
      0.23 * bodyFactor,
    );
    updateCapsule(
      abdomen,
      hipCenter.clone().add(new THREE.Vector3(0, 0.05, 0)),
      shoulderCenter.clone().lerp(hipCenter, 0.48),
      0.18 * bodyFactor,
    );
    pelvis.position.copy(hipCenter);
    pelvis.scale.set(
      Math.max(hipWidth * 0.68 * bodyFactor, 0.23),
      Math.max(torsoLength * 0.22, 0.16),
      0.21 * bodyFactor,
    );

    const armRadius = 0.085 * bodyFactor;
    const legRadius = 0.115 * bodyFactor;
    updateSmoothLimb(
      limbs.leftArm,
      [points[11], points[13], points[15]],
      [armRadius * 1.16, armRadius * 0.94, armRadius * 0.7],
    );
    updateSmoothLimb(
      limbs.rightArm,
      [points[12], points[14], points[16]],
      [armRadius * 1.16, armRadius * 0.94, armRadius * 0.7],
    );
    updateSmoothLimb(
      limbs.leftLeg,
      [points[23], points[25], points[27]],
      [legRadius * 1.22, legRadius, legRadius * 0.76],
      38,
      22,
    );
    updateSmoothLimb(
      limbs.rightLeg,
      [points[24], points[26], points[28]],
      [legRadius * 1.22, legRadius, legRadius * 0.76],
      38,
      22,
    );

    const headCenter = points[0].clone().add(new THREE.Vector3(0, 0.08, 0.01));
    const neckTop = headCenter.clone().add(new THREE.Vector3(0, -0.27, -0.01));
    updateCapsule(limbs.neck, shoulderCenter, neckTop, 0.105 * bodyFactor);

    const faceShape = options.faceShape;
    const faceScale = faceShape === 'round'
      ? new THREE.Vector3(0.27, 0.29, 0.245)
      : faceShape === 'angular'
        ? new THREE.Vector3(0.25, 0.33, 0.225)
        : new THREE.Vector3(0.255, 0.325, 0.23);
    head.position.copy(headCenter);
    head.scale.setScalar(options.headScale);
    headMesh.scale.copy(faceScale);

    if (points[7] && points[8]) {
      const earCenter = average([points[7], points[8]]);
      head.rotation.y = clamp((points[0].x - earCenter.x) * 2.4, -0.7, 0.7);
      head.rotation.z = clamp(
        Math.atan2(points[8].y - points[7].y, points[8].x - points[7].x),
        -0.35,
        0.35,
      );
    }

    leftHand.position.copy(points[15]);
    rightHand.position.copy(points[16]);
    leftHand.scale.setScalar(bodyFactor);
    rightHand.scale.setScalar(bodyFactor);
    leftHand.quaternion.setFromUnitVectors(
      UP,
      new THREE.Vector3().subVectors(points[15], points[13]).normalize(),
    );
    rightHand.quaternion.setFromUnitVectors(
      UP,
      new THREE.Vector3().subVectors(points[16], points[14]).normalize(),
    );

    const leftFootDirection = new THREE.Vector3().subVectors(points[31], points[27]);
    const rightFootDirection = new THREE.Vector3().subVectors(points[32], points[28]);
    leftShoe.position.copy(points[27]).addScaledVector(leftFootDirection, 0.38);
    rightShoe.position.copy(points[28]).addScaledVector(rightFootDirection, 0.38);
    leftShoe.scale.set(0.13 * bodyFactor, 0.085, 0.25);
    rightShoe.scale.set(0.13 * bodyFactor, 0.085, 0.25);
    leftShoe.rotation.y = Math.atan2(leftFootDirection.x, leftFootDirection.z);
    rightShoe.rotation.y = Math.atan2(rightFootDirection.x, rightFootDirection.z);

    lapels.position.copy(chest.position);
    lapels.quaternion.copy(chest.quaternion);
    lapels.scale.set(
      shoulderWidth * 0.88,
      Math.max(torsoLength, 0.55),
      1,
    );
    sportStripes.position.copy(chest.position);
    sportStripes.quaternion.copy(chest.quaternion);
    sportStripes.scale.set(
      shoulderWidth,
      Math.max(torsoLength, 0.55),
      1,
    );
  }

  function updateAppearance(nextOptions = {}) {
    Object.assign(options, nextOptions);
    setColor(materials.skin, options.skinColor);
    setColor(materials.iris, options.eyeColor);
    setColor(materials.hair, options.hairColor);
    setColor(materials.top, options.topColor);
    setColor(materials.bottom, options.bottomColor);
    setColor(materials.accent, options.accentColor);
    setColor(materials.shoe, options.shoeColor);

    Object.entries(hairStyles).forEach(([name, group]) => {
      group.visible = options.hairStyle !== 'none' && name === options.hairStyle;
    });
    Object.entries(accessoryBundle.accessories).forEach(([name, group]) => {
      group.visible = options.accessoryStyle !== 'none' && name === options.accessoryStyle;
    });

    lapels.visible = options.outfitStyle === 'formal';
    sportStripes.visible = options.outfitStyle === 'sport';
    materials.top.roughness = options.outfitStyle === 'formal' ? 0.58 : 0.82;
    materials.top.sheen = options.outfitStyle === 'sport' ? 0.55 : 0.2;
    applyPose(savedPose);
  }

  function resetCamera() {
    avatar.rotation.y = 0;
    camera.position.set(0, 0.05, 5.35);
    controls.target.set(0, 0.02, 0);
    controls.update();
  }

  function setAutoRotate(enabled) {
    autoRotate = Boolean(enabled);
  }

  function capture(filename = 'pose-vision-avatar.png') {
    renderer.render(scene, camera);
    const link = document.createElement('a');
    link.download = filename;
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
  }

  function resize() {
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 480);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (autoRotate && !controlsInteracting) avatar.rotation.y += 0.0022;
    controls.update();
    renderer.render(scene, camera);
  }

  function dispose() {
    cancelAnimationFrame(animationFrameId);
    resizeObserver.disconnect();
    controls.dispose();
    scene.traverse(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        object.material.forEach(material => material.dispose());
      } else {
        object.material?.dispose?.();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  }

  resize();
  updateAppearance(options);
  animate();

  return {
    applyPose,
    capture,
    dispose,
    resetCamera,
    setAutoRotate,
    updateAppearance,
  };
}
