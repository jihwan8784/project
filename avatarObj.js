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
  skin.roughness = 0.64;
  const clothing = makeAvatarMaterial(options.topColor, options);
  const bottoms = makeAvatarMaterial(options.bottomColor, options);
  const shoes = makeAvatarMaterial(options.shoeColor, options);
  const accent = makeAvatarMaterial(options.accentColor, options, true);
  const hair = makeAvatarMaterial(options.hairColor, options);
  const bodyWidth = 0.79;
  const limbRadius = 0.125;

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
    // A soft back layer overlaps both the cap and strands so no joint is visible.
    const backLayer = makePart(new THREE.SphereGeometry(0.31, 18, 14), hair, 'longHairBackLayer');
    backLayer.scale.set(0.96, 1.48, 0.55);
    backLayer.position.set(0, -0.18, -0.17);
    faceAnchor.add(backLayer);

    const addLongHairStrand = (name, x, y, z, radius, length) => {
      const strand = makePart(new THREE.CapsuleGeometry(radius, length, 8, 16), hair, name);
      strand.position.set(x, y, z);
      faceAnchor.add(strand);
    };
    addLongHairStrand('longHairBackLeft', -0.11, -0.37, -0.19, 0.105, 0.46);
    addLongHairStrand('longHairBackRight', 0.11, -0.37, -0.19, 0.105, 0.46);
    addLongHairStrand('longHairLeft', -0.275, -0.27, 0.0, 0.072, 0.42);
    addLongHairStrand('longHairRight', 0.275, -0.27, 0.0, 0.072, 0.42);
  }
  [-0.12, 0.12].forEach(x => {
    const eye = makePart(new THREE.SphereGeometry(0.034, 12, 8), makeAvatarMaterial(options.eyeColor, options), 'eye');
    eye.position.set(x, 0.015, 0.292);
    faceAnchor.add(eye);

    const brow = makePart(new THREE.CapsuleGeometry(0.008, 0.075, 4, 8), hair, 'eyebrow');
    brow.position.set(x, 0.09, 0.305);
    brow.rotation.z = x < 0 ? -1.48 : 1.48;
    faceAnchor.add(brow);
  });

  const nose = makePart(new THREE.ConeGeometry(0.027, 0.075, 10), skin, 'nose');
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.035, 0.325);
  faceAnchor.add(nose);

  const lipColor = new THREE.Color(options.skinColor).lerp(new THREE.Color('#8f3f49'), 0.34);
  const mouth = makePart(new THREE.CapsuleGeometry(0.009, 0.085, 4, 10), makeAvatarMaterial(lipColor, options), 'mouth');
  mouth.rotation.z = Math.PI / 2;
  mouth.position.set(0, -0.125, 0.307);
  faceAnchor.add(mouth);


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
  } else if (options.occupation === 'police') {
    const cap = makePart(new THREE.CylinderGeometry(0.34, 0.36, 0.12, 16), clothing, 'policeCap');
    cap.position.y = 0.32;
    faceAnchor.add(cap);
  } else if (options.occupation === 'doctor' || options.occupation === 'nurse') {
    const badge = makePart(new THREE.BoxGeometry(0.18, 0.22, 0.035), accent, 'medicalBadge');
    badge.position.set(0.2, 0.15, bodyWidth * 0.35);
    torsoAnchor.add(badge);
  } else if (options.occupation === 'chef') {
    const hat = makePart(new THREE.CylinderGeometry(0.25, 0.34, 0.34, 16), makeAvatarMaterial('#f5f1e8', options), 'chefHat');
    hat.position.y = 0.48;
    faceAnchor.add(hat);
  } else if (options.occupation === 'singer') {
    const mic = makePart(new THREE.CapsuleGeometry(0.035, 0.2, 6, 12), accent, 'microphone');
    mic.position.set(0.38, -0.04, 0.16);
    mic.rotation.z = -0.35;
    faceAnchor.add(mic);
  } else if (options.occupation === 'drone-pilot' || options.occupation === 'hacker') {
    const headset = makePart(new THREE.TorusGeometry(0.34, 0.028, 8, 24, Math.PI), accent, 'headset');
    headset.rotation.z = Math.PI;
    headset.position.y = 0.05;
    faceAnchor.add(headset);
  }

  avatar.updateMatrixWorld(true);
  Object.values(rig).forEach(setAnchorRestDirection);
  return { avatar, rig };
}

const BACKGROUND_FILES = Object.freeze({
  'neon-future-city': './background/배경1.png',
  'space-station': './background/배경2.png',
  laboratory: './background/배경3.png',
  'rainy-neon-street': './background/배경4.png',
});

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
  let referenceBodySize = null;
  let currentBackgroundStyle = null;
  const backgroundTextures = new Map();
  const textureLoader = new THREE.TextureLoader();

  function rebuildEnvironment() {
    currentBackgroundStyle = options.backgroundStyle;
    const requestedStyle = options.backgroundStyle;
    const file = BACKGROUND_FILES[requestedStyle] || BACKGROUND_FILES['neon-future-city'];
    const cached = backgroundTextures.get(file);
    if (cached) {
      scene.background = cached;
      return;
    }
    scene.background = new THREE.Color('#050914');
    textureLoader.load(new URL(file, import.meta.url).href, texture => {
      if (disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      backgroundTextures.set(file, texture);
      if (currentBackgroundStyle === requestedStyle) scene.background = texture;
    });
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
    const leftShoulder = getNormalizedPoint(pose, 11);
    const rightShoulder = getNormalizedPoint(pose, 12);
    const shoulderWidth = leftShoulder && rightShoulder
      ? Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y)
      : 0;
    const torsoHeight = shoulderCenter && hipCenter
      ? Math.hypot(shoulderCenter.x - hipCenter.x, shoulderCenter.y - hipCenter.y)
      : 0;
    const bodySize = shoulderWidth * 0.62 + torsoHeight * 0.38;
    if (bodySize > 0.04 && referenceBodySize == null) referenceBodySize = bodySize;
    const depthScale = referenceBodySize && bodySize > 0.04
      ? clamp(bodySize / referenceBodySize, 0.62, 1.62)
      : 1;

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
      // Camera depth changes also move the detected hip vertically. Keep true
      // vertical following restrained and express depth mainly through scale.
      rootY: hipCenter ? clamp((0.58 - hipCenter.y) * 0.62, -0.34, 0.34) : 0,
      depthScale,
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

    setBoneDirection3D(rig.leftUpperArm, targets.upperArmL, 0.56);
    setBoneDirection3D(rig.leftForearm, targets.forearmL, 0.60);
    setBoneDirection3D(rig.rightUpperArm, targets.upperArmR, 0.56);
    setBoneDirection3D(rig.rightForearm, targets.forearmR, 0.60);

    setBoneDirection3D(rig.leftThigh, targets.thighL, 0.50);
    setBoneDirection3D(rig.leftShin, targets.shinL, 0.54);
    setBoneDirection3D(rig.rightThigh, targets.thighR, 0.50);
    setBoneDirection3D(rig.rightShin, targets.shinR, 0.54);

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

    root.rotation.z += (targets.bodyTilt * 0.26 - root.rotation.z) * 0.18;
    root.rotation.x += (targets.depthLean * 0.32 - root.rotation.x) * 0.18;
    root.position.x += (targets.rootX - root.position.x) * 0.15;
    root.position.y += (targets.rootY - root.position.y) * 0.13;
    const targetScale = Number(options.heightScale || 1) * targets.depthScale;
    const nextScale = root.scale.x + (targetScale - root.scale.x) * 0.14;
    root.scale.setScalar(nextScale);
  }

  function restoreNeutralPose() {
    if (!rig) return;
    [rig.leftUpperArm, rig.leftForearm, rig.rightUpperArm, rig.rightForearm,
      rig.leftThigh, rig.leftShin, rig.rightThigh, rig.rightShin]
      .forEach(bone => restoreBoneTowardRest(bone, 0.14));
    root.rotation.x += (0 - root.rotation.x) * 0.14;
    root.rotation.z += (0 - root.rotation.z) * 0.14;
    root.position.x += (0 - root.position.x) * 0.12;
    root.position.y += (0 - root.position.y) * 0.12;
    const neutralScale = Number(options.heightScale || 1);
    const nextScale = root.scale.x + (neutralScale - root.scale.x) * 0.12;
    root.scale.setScalar(nextScale);
  }

  function renderFrame() {
    frameId = null;
    if (disposed) return;

    if (loaded && poseTargets) updateRigFromPose(poseTargets);
    else if (loaded) restoreNeutralPose();

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


  function clearPose() {
    latestPoseInput = null;
    poseTargets = null;
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
    backgroundTextures.forEach(texture => texture.dispose());
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
    clearPose,
    capture,
    dispose,
    domElement: renderer.domElement,
    updateAppearance,
  };
}
