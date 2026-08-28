import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

export const DEFAULT_AVATAR_OPTIONS = Object.freeze({
  skinColor: '#d99a78',
  eyeColor: '#554238',
  hairColor: '#251a16',
  topColor: '#354f77',
  bottomColor: '#202733',
  accentColor: '#69e6d5',
  shoeColor: '#e9edf2',
  bodyType: 'balanced',
  bodyVariant: 'standard',
  gender: 'male',
  ageGroup: '10-20',
  occupation: 'student',
  backgroundStyle: 'neon-future-city',
  theme: 'cyberpunk',
  faceShape: 'oval',
  hairStyle: 'wave',
  outfitStyle: 'idol',
  accessoryStyle: 'ribbon',
  heightScale: 1,
  shoulderScale: 1,
  headScale: 1.08,
  renderStyle: 'glb-rigged-3d',
});

const UP = new THREE.Vector3(0, 1, 0);
const tempVectorA = new THREE.Vector3();
const tempVectorB = new THREE.Vector3();
const tempQuaternionA = new THREE.Quaternion();
const tempQuaternionB = new THREE.Quaternion();
const tempQuaternionC = new THREE.Quaternion();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function findBone(root, names) {
  const wanted = names.map(name => String(name).toLowerCase());
  let found = null;
  root.traverse(object => {
    if (!object.isBone || found) return;
    const key = String(object.name || '').toLowerCase();
    if (wanted.some(name =>
      key === name ||
      key.startsWith(`${name}.`) ||
      key.startsWith(`${name}_`) ||
      key.endsWith(`.${name}`)
    )) {
      found = object;
    }
  });
  return found;
}

function buildRig(model) {
  const rig = {
    hips: findBone(model, ['hips']),
    spine: findBone(model, ['spine']),
    chest: findBone(model, ['chest']),
    neck: findBone(model, ['neck']),
    head: findBone(model, ['head']),
    shoulderL: findBone(model, ['shoulder.l']),
    upperArmL: findBone(model, ['upper_arm.l', 'upperarm.l']),
    forearmL: findBone(model, ['forearm.l']),
    handL: findBone(model, ['hand.l']),
    shoulderR: findBone(model, ['shoulder.r']),
    upperArmR: findBone(model, ['upper_arm.r', 'upperarm.r']),
    forearmR: findBone(model, ['forearm.r']),
    handR: findBone(model, ['hand.r']),
    thighL: findBone(model, ['thigh.l']),
    shinL: findBone(model, ['shin.l']),
    footL: findBone(model, ['foot.l']),
    toeL: findBone(model, ['toe.l']),
    thighR: findBone(model, ['thigh.r']),
    shinR: findBone(model, ['shin.r']),
    footR: findBone(model, ['foot.r']),
    toeR: findBone(model, ['toe.r']),
  };

  const missing = Object.entries(rig)
    .filter(([, bone]) => !bone)
    .map(([name]) => name);

  console.info('[Pose Vision] Rig map:', Object.fromEntries(
    Object.entries(rig).map(([name, bone]) => [name, bone?.name ?? null]),
  ));
  if (missing.length) console.warn('[Pose Vision] Missing optional bones:', missing.join(', '));
  return rig;
}

function cacheRigRestPose(rig) {
  Object.values(rig).forEach(bone => {
    if (!bone) return;
    bone.updateWorldMatrix(true, false);
    const child = bone.children?.find(item => item.isBone);
    const bonePosition = bone.getWorldPosition(new THREE.Vector3());
    const childPosition = child?.getWorldPosition(new THREE.Vector3());

    bone.userData.poseVisionRestLocalQuaternion = bone.quaternion.clone();
    bone.userData.poseVisionRestWorldQuaternion = bone.getWorldQuaternion(new THREE.Quaternion()).clone();
    bone.userData.poseVisionRestWorldDirection = childPosition
      ? childPosition.sub(bonePosition).normalize()
      : null;
  });
}

function hasWorldPoint(point) {
  return point &&
    Number.isFinite(point.worldX) &&
    Number.isFinite(point.worldY) &&
    Number.isFinite(point.worldZ);
}

function getPoseDirection(pose, startIndex, endIndex, mirror = false) {
  const start = pose?.[startIndex];
  const end = pose?.[endIndex];
  if (!start || !end) return null;

  let dx;
  let dy;
  let dz;

  if (hasWorldPoint(start) && hasWorldPoint(end)) {
    dx = end.worldX - start.worldX;
    dy = end.worldY - start.worldY;
    dz = end.worldZ - start.worldZ;
  } else if (
    Number.isFinite(start.x) && Number.isFinite(start.y) &&
    Number.isFinite(end.x) && Number.isFinite(end.y)
  ) {
    dx = end.x - start.x;
    dy = end.y - start.y;
    dz = (end.z ?? 0) - (start.z ?? 0);
  } else {
    return null;
  }

  // MediaPipe 카메라 좌표를 Three.js 월드 좌표로 변환한다.
  const direction = new THREE.Vector3(
    (mirror ? -1 : 1) * dx,
    -dy,
    -dz,
  );

  if (direction.lengthSq() < 1e-8) return null;
  return direction.normalize();
}

function getNormalizedPoint(pose, index) {
  const point = pose?.[index];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return point;
}

function averageNormalized(points) {
  const valid = points.filter(Boolean);
  if (!valid.length) return null;
  return {
    x: valid.reduce((sum, point) => sum + point.x, 0) / valid.length,
    y: valid.reduce((sum, point) => sum + point.y, 0) / valid.length,
    z: valid.reduce((sum, point) => sum + (point.z ?? 0), 0) / valid.length,
  };
}

function setBoneDirection3D(bone, targetDirection, influence = 0.42) {
  if (!bone || !targetDirection) return;
  const restDirection = bone.userData.poseVisionRestWorldDirection;
  const restWorldQuaternion = bone.userData.poseVisionRestWorldQuaternion;
  if (!restDirection || !restWorldQuaternion) return;

  // 원래 뼈가 향하던 월드 방향을 현재 MediaPipe 관절 방향으로 회전시킨다.
  tempQuaternionA.setFromUnitVectors(restDirection, targetDirection);
  tempQuaternionB.copy(tempQuaternionA).multiply(restWorldQuaternion);

  if (bone.parent) {
    bone.parent.getWorldQuaternion(tempQuaternionC).invert();
    tempQuaternionC.multiply(tempQuaternionB);
    bone.quaternion.slerp(tempQuaternionC, influence);
  } else {
    bone.quaternion.slerp(tempQuaternionB, influence);
  }
  bone.updateMatrixWorld(true);
}

function restoreBoneTowardRest(bone, influence = 0.08) {
  const rest = bone?.userData?.poseVisionRestLocalQuaternion;
  if (!bone || !rest) return;
  bone.quaternion.slerp(rest, influence);
}

function lockBoneAtRest(bone) {
  const rest = bone?.userData?.poseVisionRestLocalQuaternion;
  if (!bone || !rest) return;
  bone.quaternion.copy(rest);
  bone.updateMatrixWorld(true);
}

function makeMaterial(color, roughness = 0.72, metalness = 0.08, emissive = '#000000', emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
}

function addBox(group, position, scale, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function makeAvatarMaterial(color, options, accent = false) {
  return makeMaterial(
    color,
    options.theme === 'mecha' ? 0.34 : 0.68,
    options.theme === 'mecha' ? 0.5 : 0.08,
    accent ? options.accentColor : '#000000',
    accent ? 0.22 : 0,
  );
}

function makePart(geometry, material, name) {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

// Every visible body section has its own anchor.  Limb anchors point from a
// joint to the next joint, so pose tracking only rotates that one section.
function createSegment(name, length, radius, material, endRadius = radius * 1.06) {
  const anchor = new THREE.Group();
  anchor.name = `${name}Anchor`;
  const segment = makePart(
    // More radial detail keeps the limbs softly rounded, even when they bend.
    new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 8, 16),
    material,
    name,
  );
  segment.position.y = -length / 2;
  anchor.add(segment);
  const end = new THREE.Group();
  end.name = `${name}End`;
  end.position.y = -length;
  anchor.add(end);
  anchor.userData.poseVisionRestLocalQuaternion = anchor.quaternion.clone();
  return { anchor, end, length, endRadius };
}

function setAnchorRestDirection(anchor) {
  anchor.updateWorldMatrix(true, false);
  anchor.userData.poseVisionRestWorldQuaternion = anchor.getWorldQuaternion(new THREE.Quaternion()).clone();
  anchor.userData.poseVisionRestWorldDirection = new THREE.Vector3(0, -1, 0)
    .applyQuaternion(anchor.userData.poseVisionRestWorldQuaternion)
    .normalize();
}

function disposeGroup(group) {
  group.traverse(object => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
    else object.material?.dispose?.();
  });
}

function buildPartAvatar(options) {
  const avatar = new THREE.Group();
  avatar.name = 'PartAvatar';
  const skin = makeAvatarMaterial(options.skinColor, options);
  const clothing = makeAvatarMaterial(options.topColor, options);
  const bottoms = makeAvatarMaterial(options.bottomColor, options);
  const shoes = makeAvatarMaterial(options.shoeColor, options);
  const accent = makeAvatarMaterial(options.accentColor, options, true);
  const hair = makeAvatarMaterial(options.hairColor, options);
  const bodyWidth = options.bodyVariant === 'slim' ? 0.68 : options.bodyVariant === 'muscular' ? 0.92 : options.bodyVariant === 'volume' ? 0.88 : 0.79;
  const limbRadius = options.bodyVariant === 'slim' ? 0.105 : options.bodyVariant === 'muscular' ? 0.15 : 0.125;

  // Face and torso are independent parts. Their positions are skeleton anchors.
  const torsoAnchor = new THREE.Group();
  torsoAnchor.name = 'torsoAnchor';
  torsoAnchor.position.set(0, 1.05, 0);
  avatar.add(torsoAnchor);
  const torso = makePart(new THREE.CapsuleGeometry(bodyWidth / 2, 0.72, 10, 20), clothing, 'torso');
  torso.scale.z = 0.68;
  torsoAnchor.add(torso);
  const neck = new THREE.Group();
  neck.position.y = 0.72;
  torsoAnchor.add(neck);
  const faceAnchor = new THREE.Group();
  faceAnchor.name = 'faceAnchor';
  faceAnchor.position.y = 0.22;
  neck.add(faceAnchor);
  const face = makePart(new THREE.SphereGeometry(0.34 * Number(options.headScale || 1), 18, 14), skin, 'face');
  face.scale.z = 0.84;
  faceAnchor.add(face);
  const hairCap = makePart(new THREE.SphereGeometry(0.35 * Number(options.headScale || 1), 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 'hair');
  hairCap.scale.z = 0.87;
  hairCap.position.y = 0.08;
  faceAnchor.add(hairCap);
  if (options.hairStyle === 'long') {
    // Rounded strands show the length while leaving the face unobstructed.
    const addLongHairStrand = (name, x, y, z, radius, length) => {
      const strand = makePart(new THREE.CapsuleGeometry(radius, length, 8, 16), hair, name);
      strand.position.set(x, y, z);
      faceAnchor.add(strand);
    };
    addLongHairStrand('longHairBack', 0, -0.22, -0.18, 0.22, 0.34);
    addLongHairStrand('longHairLeft', -0.28, -0.22, 0.01, 0.09, 0.32);
    addLongHairStrand('longHairRight', 0.28, -0.22, 0.01, 0.09, 0.32);
  }
  [-0.12, 0.12].forEach(x => {
    const eye = makePart(new THREE.SphereGeometry(0.032, 8, 6), makeAvatarMaterial(options.eyeColor, options), 'eye');
    eye.position.set(x, 0.015, 0.292);
    faceAnchor.add(eye);
  });

  const rig = { torso: torsoAnchor, face: faceAnchor };
  const addArm = (side, x) => {
    const shoulder = new THREE.Group();
    shoulder.name = `${side}ShoulderAnchor`;
    shoulder.position.set(x, 0.48, 0);
    torsoAnchor.add(shoulder);
    const upper = createSegment(`${side}UpperArm`, 0.48, limbRadius, clothing);
    shoulder.add(upper.anchor);
    const lower = createSegment(`${side}Forearm`, 0.42, limbRadius * 0.9, skin);
    // Overlap the rounded ends slightly so the arm reads as one continuous form,
    // rather than a pair of pieces joined by a visible elbow ball.
    lower.anchor.position.y = limbRadius * 0.45;
    upper.end.add(lower.anchor);
    rig[`${side}UpperArm`] = upper.anchor;
    rig[`${side}Forearm`] = lower.anchor;
  };
  addArm('left', -bodyWidth * 0.58);
  addArm('right', bodyWidth * 0.58);

  const addLeg = (side, x) => {
    const hip = new THREE.Group();
    hip.name = `${side}HipAnchor`;
    hip.position.set(x, -0.43, 0);
    torsoAnchor.add(hip);
    // Four leg segments total: two thighs and two shins.
    const thigh = createSegment(`${side}Thigh`, 0.58, limbRadius * 1.18, bottoms);
    hip.add(thigh.anchor);
    const shin = createSegment(`${side}Shin`, 0.53, limbRadius, bottoms);
    // As with the arms, make the leg a continuous tapered silhouette with no
    // separate knee mesh protruding from it.
    shin.anchor.position.y = limbRadius * 0.50;
    thigh.end.add(shin.anchor);
    // A scaled sphere gives the shoe a rounded silhouette instead of hard box corners.
    const foot = makePart(new THREE.SphereGeometry(1, 16, 12), shoes, `${side}Foot`);
    foot.scale.set(limbRadius * 1.18, limbRadius * 0.58, 0.21);
    // The shin end is already at the ankle; offset only by half the shoe height.
    foot.position.set(0, -limbRadius * 0.58, 0.12);
    foot.castShadow = foot.receiveShadow = true;
    shin.end.add(foot);
    rig[`${side}Thigh`] = thigh.anchor;
    rig[`${side}Shin`] = shin.anchor;
  };
  addLeg('left', -bodyWidth * 0.24);
  addLeg('right', bodyWidth * 0.24);

  if (options.occupation === 'astronaut') {
    const visor = makePart(new THREE.SphereGeometry(0.37, 16, 10), makeAvatarMaterial('#87dfff', options, true), 'visor');
    visor.scale.set(0.92, 0.48, 0.25);
    visor.position.set(0, 0.02, 0.3);
    faceAnchor.add(visor);
  } else if (options.occupation === 'teacher' || options.accessoryStyle === 'glasses') {
    [-0.12, 0.12].forEach(x => {
      const glass = makePart(new THREE.TorusGeometry(0.075, 0.012, 6, 10), accent, 'glasses');
      glass.position.set(x, 0.015, 0.325);
      faceAnchor.add(glass);
    });
  } else if (options.occupation === 'firefighter') {
    const helmet = makePart(new THREE.CylinderGeometry(0.37, 0.37, 0.13, 14), accent, 'helmet');
    helmet.position.y = 0.29;
    faceAnchor.add(helmet);
  }

  avatar.updateMatrixWorld(true);
  Object.values(rig).forEach(setAnchorRestDirection);
  return { avatar, rig };
}

function addBackdrop(group, color) {
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 10),
    new THREE.MeshBasicMaterial({ color }),
  );
  backdrop.position.set(0, 4.2, -5.5);
  group.add(backdrop);
}

function buildEnvironment(style) {
  const group = new THREE.Group();
  let backgroundColor = '#07101c';
  let floorColor = '#10192b';
  let floorMetalness = 0.28;
  let floorRoughness = 0.42;
  let gridPrimary = 0x55f4df;
  let gridSecondary = 0x2a5572;

  if (style === 'space-station') {
    backgroundColor = '#030711';
    floorColor = '#394452';
    floorMetalness = 0.72;
    floorRoughness = 0.24;
    gridPrimary = 0x7ca8ff;
    gridSecondary = 0x32415e;
    addBackdrop(group, '#030711');
    const ringMaterial = makeMaterial('#6e7b8e', 0.3, 0.8, '#8fb6ff', 0.35);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.08, 12, 80), ringMaterial);
    ring.position.set(0, 2.5, -4.2);
    group.add(ring);
    [-3.1, 3.1].forEach(x => addBox(group, [x, 1.7, -3.8], [0.45, 3.4, 0.5], ringMaterial));
  } else if (style === 'laboratory') {
    backgroundColor = '#c9d7df';
    floorColor = '#d9e0e4';
    floorMetalness = 0.08;
    floorRoughness = 0.72;
    gridPrimary = 0x7ab7c9;
    gridSecondary = 0xa8c2ca;
    addBackdrop(group, '#aebfc8');
    const panel = makeMaterial('#e8f0f3', 0.58, 0.1);
    const glow = makeMaterial('#75d9e8', 0.35, 0.2, '#75d9e8', 0.65);
    for (let x = -3; x <= 3; x += 1.5) {
      addBox(group, [x, 2.1, -4.7], [1.25, 3.6, 0.12], panel);
      addBox(group, [x, 2.1, -4.5], [0.04, 3.2, 0.05], glow);
    }
  } else if (style === 'rainy-neon-street') {
    backgroundColor = '#090713';
    floorColor = '#11121b';
    floorMetalness = 0.88;
    floorRoughness = 0.12;
    gridPrimary = 0xff4fd8;
    gridSecondary = 0x4b2b68;
    addBackdrop(group, '#090713');
    const building = makeMaterial('#111522', 0.72, 0.22);
    const magenta = makeMaterial('#27142b', 0.38, 0.2, '#ff42d0', 1.4);
    const cyan = makeMaterial('#10252a', 0.38, 0.2, '#47f5ff', 1.3);
    [-4, -3, 3, 4].forEach((x, index) => {
      addBox(group, [x, 2.2, -3.8 - (index % 2) * 0.5], [1.25, 4.4, 1.3], building);
      addBox(group, [x > 0 ? x - 0.55 : x + 0.55, 2.4, -3.05], [0.12, 1.5, 0.08], index % 2 ? magenta : cyan);
    });
  } else {
    // neon-future-city
    backgroundColor = '#050914';
    floorColor = '#0b1324';
    floorMetalness = 0.48;
    floorRoughness = 0.32;
    gridPrimary = 0x4df4dc;
    gridSecondary = 0x264a73;
    addBackdrop(group, '#050914');
    const building = makeMaterial('#10172b', 0.72, 0.25);
    const cyan = makeMaterial('#133037', 0.34, 0.25, '#42f5dc', 1.1);
    const violet = makeMaterial('#201634', 0.34, 0.25, '#a270ff', 1.0);
    const heights = [2.6, 4.2, 3.3, 5, 3.6, 4.5];
    [-4.5, -3.2, -1.9, 1.9, 3.2, 4.5].forEach((x, index) => {
      const height = heights[index];
      addBox(group, [x, height * 0.5, -4.4], [1.05, height, 1.1], building);
      addBox(group, [x, height * 0.62, -3.82], [0.06, height * 0.55, 0.04], index % 2 ? violet : cyan);
    });
  }

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    makeMaterial(floorColor, floorRoughness, floorMetalness),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.012;
  floor.receiveShadow = true;
  group.add(floor);

  const grid = new THREE.GridHelper(30, 30, gridPrimary, gridSecondary);
  grid.position.y = 0.006;
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMaterials.forEach(material => {
    material.transparent = true;
    material.opacity = style === 'laboratory' ? 0.25 : 0.48;
  });
  group.add(grid);

  return { group, backgroundColor };
}

export function create2DAvatar(container, initialOptions = {}, runtimeOptions = {}) {
  const options = { ...DEFAULT_AVATAR_OPTIONS, ...initialOptions };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050914');

  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
  camera.position.set(0, 1.35, 5.0);
  camera.lookAt(0, 1.05, 0);

  const renderer = new THREE.WebGLRenderer({
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const root = new THREE.Group();
  scene.add(root);

  const hemi = new THREE.HemisphereLight(0xdcecff, 0x1a2030, 1.8);
  const key = new THREE.DirectionalLight(0xffffff, 3.4);
  key.position.set(3.4, 6.2, 4.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -2;
  const rim = new THREE.DirectionalLight(0x72f2df, 1.4);
  rim.position.set(-4, 3, -3);
  scene.add(hemi, key, rim);

  let cssWidth = 1;
  let cssHeight = 1;
  let disposed = false;
  let loaded = false;
  let rig = null;
  let model = null;
  let frameId = null;
  let latestPoseInput = null;
  let poseTargets = null;
  let environment = null;
  let currentBackgroundStyle = null;

  function rebuildEnvironment() {
    if (environment) {
      scene.remove(environment.group);
      environment.group.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
        else object.material?.dispose?.();
      });
    }
    environment = buildEnvironment(options.backgroundStyle);
    currentBackgroundStyle = options.backgroundStyle;
    scene.add(environment.group);
    scene.background = new THREE.Color(environment.backgroundColor);
  }

  function resize() {
    cssWidth = Math.max(1, container.clientWidth);
    cssHeight = Math.max(1, container.clientHeight);
    camera.aspect = cssWidth / cssHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(cssWidth, cssHeight, false);
  }

  function makePoseTargets(result) {
    const pose = result?.poseLandmarks || result?.landmarks?.[0] || null;
    if (!pose?.length) return null;
    const mirror = Boolean(result?.mapping?.mirror);

    const shoulderCenter = averageNormalized([
      getNormalizedPoint(pose, 11),
      getNormalizedPoint(pose, 12),
    ]);
    const hipCenter = averageNormalized([
      getNormalizedPoint(pose, 23),
      getNormalizedPoint(pose, 24),
    ]);

    let bodyTilt = 0;
    let depthLean = 0;
    if (shoulderCenter && hipCenter) {
      const dx = shoulderCenter.x - hipCenter.x;
      const dy = hipCenter.y - shoulderCenter.y;
      bodyTilt = clamp(Math.atan2((mirror ? -1 : 1) * dx, Math.max(0.05, dy)), -0.5, 0.5);

      const shoulderWorldZ = [pose[11], pose[12]]
        .filter(hasWorldPoint)
        .reduce((sum, point) => sum + point.worldZ, 0) /
        Math.max(1, [pose[11], pose[12]].filter(hasWorldPoint).length);
      const hipWorldZ = [pose[23], pose[24]]
        .filter(hasWorldPoint)
        .reduce((sum, point) => sum + point.worldZ, 0) /
        Math.max(1, [pose[23], pose[24]].filter(hasWorldPoint).length);
      depthLean = clamp((shoulderWorldZ - hipWorldZ) * 0.9, -0.28, 0.28);
    }

    return {
      pose,
      mirror,
      bodyTilt,
      depthLean,
      rootX: hipCenter ? clamp(((mirror ? 0.5 - hipCenter.x : hipCenter.x - 0.5) * 1.15), -0.7, 0.7) : 0,
      upperArmL: getPoseDirection(pose, 11, 13, mirror),
      forearmL: getPoseDirection(pose, 13, 15, mirror),
      handL: getPoseDirection(pose, 15, 19, mirror),
      upperArmR: getPoseDirection(pose, 12, 14, mirror),
      forearmR: getPoseDirection(pose, 14, 16, mirror),
      handR: getPoseDirection(pose, 16, 20, mirror),
      thighL: getPoseDirection(pose, 23, 25, mirror),
      shinL: getPoseDirection(pose, 25, 27, mirror),
      footL: getPoseDirection(pose, 27, 31, mirror),
      thighR: getPoseDirection(pose, 24, 26, mirror),
      shinR: getPoseDirection(pose, 26, 28, mirror),
      footR: getPoseDirection(pose, 28, 32, mirror),
      neck: getPoseDirection(pose, 11, 0, mirror),
    };
  }

  function updateRigFromPose(targets) {
    if (!rig || !targets) return;

    setBoneDirection3D(rig.leftUpperArm, targets.upperArmL, 0.40);
    setBoneDirection3D(rig.leftForearm, targets.forearmL, 0.46);
    setBoneDirection3D(rig.rightUpperArm, targets.upperArmR, 0.40);
    setBoneDirection3D(rig.rightForearm, targets.forearmR, 0.46);

    setBoneDirection3D(rig.leftThigh, targets.thighL, 0.38);
    setBoneDirection3D(rig.leftShin, targets.shinL, 0.44);
    setBoneDirection3D(rig.rightThigh, targets.thighR, 0.38);
    setBoneDirection3D(rig.rightShin, targets.shinR, 0.44);

    // Arms ease back to rest when tracking is incomplete. Legs stay in their
    // neutral standing pose whenever their landmarks are unavailable.
    if (!targets.upperArmL) restoreBoneTowardRest(rig.leftUpperArm);
    if (!targets.forearmL) restoreBoneTowardRest(rig.leftForearm);
    if (!targets.upperArmR) restoreBoneTowardRest(rig.rightUpperArm);
    if (!targets.forearmR) restoreBoneTowardRest(rig.rightForearm);
    if (!targets.thighL) lockBoneAtRest(rig.leftThigh);
    if (!targets.shinL) lockBoneAtRest(rig.leftShin);
    if (!targets.thighR) lockBoneAtRest(rig.rightThigh);
    if (!targets.shinR) lockBoneAtRest(rig.rightShin);

    root.rotation.z += (targets.bodyTilt * 0.26 - root.rotation.z) * 0.12;
    root.rotation.x += (targets.depthLean * 0.32 - root.rotation.x) * 0.12;
    root.position.x += (targets.rootX - root.position.x) * 0.08;
  }

  function renderFrame() {
    frameId = null;
    if (disposed) return;

    if (loaded && poseTargets) {
      updateRigFromPose(poseTargets);
    }

    // GLB 내부 애니메이션은 재생하지 않는다. 재생하면 MediaPipe가 쓴 Bone 회전을
    // AnimationMixer가 다음 프레임에 다시 덮어쓸 수 있다.
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(renderFrame);
  }

  function loadModel() {
    if (model) {
      root.remove(model);
      disposeGroup(model);
    }
    const partAvatar = buildPartAvatar(options);
    model = partAvatar.avatar;
    // The part rig is designed in readable joint units. Scale it, then use its
    // actual bounds to place the soles on the floor for every body type.
    model.scale.setScalar(0.70);
    model.updateMatrixWorld(true);
    const modelBounds = new THREE.Box3().setFromObject(model);
    model.position.y = -modelBounds.min.y;
    rig = partAvatar.rig;
    root.add(model);
    loaded = true;
    if (latestPoseInput) poseTargets = makePoseTargets(latestPoseInput);
    return;
    /* Legacy GLB loader retained below temporarily for reference.
    try {
      const gltf = await loader.loadAsync(MODEL_URL);
      if (disposed) return;

      model = gltf.scene;
      const ground = model.getObjectByName('Plane') || model.getObjectByName('plane');
      ground?.parent?.remove(ground);

      model.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = false;
        if (Array.isArray(object.material)) {
          object.material.forEach(material => {
            material.side = THREE.FrontSide;
            material.needsUpdate = true;
          });
        } else if (object.material) {
          object.material.side = THREE.FrontSide;
          object.material.needsUpdate = true;
        }
      });

      const rawBox = new THREE.Box3().setFromObject(model);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      modelBaseScale = 1.86 / Math.max(rawSize.y, 1e-5);
      model.scale.setScalar(modelBaseScale);
      model.updateMatrixWorld(true);

      const scaledBox = new THREE.Box3().setFromObject(model);
      const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
      model.position.x -= scaledCenter.x;
      model.position.z -= scaledCenter.z;
      model.position.y -= scaledBox.min.y;
      model.updateMatrixWorld(true);

      root.add(model);
      rig = buildRig(model);
      model.updateMatrixWorld(true);
      cacheRigRestPose(rig);

      // 실제로 스킨된 리깅 모델인지 개발자 콘솔에서 즉시 확인할 수 있다.
      let skinnedMeshCount = 0;
      model.traverse(object => { if (object.isSkinnedMesh) skinnedMeshCount += 1; });
      console.info(`[Pose Vision] GLB loaded: ${skinnedMeshCount} skinned mesh(es), ${gltf.animations?.length ?? 0} animation clip(s)`);

      loaded = true;
      if (latestPoseInput) poseTargets = makePoseTargets(latestPoseInput);
    } catch (error) {
      console.error('GLB avatar load failed.', error);
      loaded = false;
    }
  }
    */
  }

  function applyPose(result) {
    // 모델 로딩 전에 들어온 포즈도 버리지 않고 기억했다가 로딩 직후 적용한다.
    latestPoseInput = result;
    if (!loaded) return;
    const nextTargets = makePoseTargets(result);
    if (nextTargets) poseTargets = nextTargets;
  }

  function updateAppearance(nextOptions = {}) {
    Object.assign(options, nextOptions);
    root.scale.setScalar(Number(options.heightScale || 1));
    if (options.backgroundStyle !== currentBackgroundStyle) rebuildEnvironment();
    loadModel();
  }

  function capture(filename = 'pose-vision-avatar.png') {
    renderer.render(scene, camera);
    const link = document.createElement('a');
    link.download = filename;
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
  }

  function dispose() {
    disposed = true;
    if (frameId != null) cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    scene.traverse(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
      else object.material?.dispose?.();
    });
    renderer.dispose();
    renderer.domElement.remove();
    scene.clear();
  }

  rebuildEnvironment();
  root.scale.setScalar(Number(options.heightScale || 1));

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  loadModel();
  frameId = requestAnimationFrame(renderFrame);

  return {
    applyPose,
    capture,
    dispose,
    domElement: renderer.domElement,
    updateAppearance,
  };
}
