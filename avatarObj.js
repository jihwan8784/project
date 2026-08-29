import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js';

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
const avatarPartTextureCache = new Map();
const policeModelLoader = new GLTFLoader();
const POLICE_MODEL_URL = new URL('./아바타 용/여성경찰/female_police_rigged.glb', import.meta.url).href;

const AVATAR_FOLDER_NAMES = Object.freeze({
  student: '학생', astronaut: '우주비행사', hacker: '해커', teacher: '교사',
  doctor: '의사', police: '경찰', firefighter: '소방관', chef: '요리사', singer: '가수',
});

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

function getBodyYaw(leftShoulder, rightShoulder, mirror = false) {
  if (!leftShoulder || !rightShoulder) return null;
  // Anatomical left appears to the right of anatomical right in a front view,
  // and their order reverses after the person turns around.
  const shoulderOrder = leftShoulder.x - rightShoulder.x;
  let depthDifference = 0;
  if (hasWorldPoint(leftShoulder) && hasWorldPoint(rightShoulder)) {
    depthDifference = leftShoulder.worldZ - rightShoulder.worldZ;
  } else {
    depthDifference = (leftShoulder.z ?? 0) - (rightShoulder.z ?? 0);
  }
  if (mirror) depthDifference *= -1;
  const magnitude = Math.hypot(shoulderOrder, depthDifference);
  if (magnitude < 0.018) return null;
  return Math.atan2(depthDifference, shoulderOrder);
}

function easeAngle(current, target, amount) {
  let difference = target - current;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return current + difference * amount;
}

function constrainTrackedLimb(direction, side, kind) {
  if (!direction) return null;
  const constrained = direction.clone();
  // Preserve the camera direction. Only discard impossible depth spikes caused
  // by a temporarily occluded landmark so a limb cannot flip through the body.
  constrained.z = clamp(constrained.z, -0.92, 0.92);
  return constrained.lengthSq() > 1e-8 ? constrained.normalize() : null;
}

function buildPoliceRig(model) {
  const find = name => model.getObjectByName(name) || null;
  return {
    torso: find('Hips'),
    face: find('Head'),
    leftUpperArm: find('RightUpperArm'),
    leftForearm: find('RightForearm'),
    rightUpperArm: find('LeftUpperArm'),
    rightForearm: find('LeftForearm'),
    leftThigh: find('RightThigh'),
    leftShin: find('RightShin'),
    rightThigh: find('LeftThigh'),
    rightShin: find('LeftShin'),
  };
}

function cacheBoneRestDirections(rig) {
  Object.values(rig).forEach(bone => {
    if (!bone) return;
    bone.updateWorldMatrix(true, false);
    const child = bone.children.find(item => item.isBone);
    bone.userData.poseVisionRestLocalQuaternion = bone.quaternion.clone();
    bone.userData.poseVisionRestWorldQuaternion = bone.getWorldQuaternion(new THREE.Quaternion()).clone();
    if (child) {
      bone.userData.poseVisionRestWorldDirection = child.getWorldPosition(new THREE.Vector3())
        .sub(bone.getWorldPosition(new THREE.Vector3()))
        .normalize();
    }
  });
}

function getHeadTargets(pose, mirror = false) {
  const nose = getNormalizedPoint(pose, 0);
  const leftEar = getNormalizedPoint(pose, 7);
  const rightEar = getNormalizedPoint(pose, 8);
  if (!nose || !leftEar || !rightEar) return null;
  const earCenter = averageNormalized([leftEar, rightEar]);
  const earWidth = Math.max(0.025, Math.hypot(leftEar.x - rightEar.x, leftEar.y - rightEar.y));
  const mirrorSign = mirror ? -1 : 1;
  return {
    yaw: clamp((nose.x - earCenter.x) / earWidth * 0.9 * mirrorSign, -0.72, 0.72),
    roll: clamp(Math.atan2(rightEar.y - leftEar.y, Math.abs(rightEar.x - leftEar.x)) * mirrorSign, -0.5, 0.5),
    pitch: clamp(((nose.y - earCenter.y) / earWidth - 0.34) * 0.42, -0.34, 0.34),
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

function getFemalePoliceAtlasTexture(suffix, baseColor) {
  const sourceUrl = new URL('./아바타 용/여성경찰/여성경찰-turnaround-transparent.png', import.meta.url).href;
  const cacheKey = `${sourceUrl}|${suffix}|${baseColor}`;
  if (avatarPartTextureCache.has(cacheKey)) return avatarPartTextureCache.get(cacheKey);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = baseColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const regions = {
    2: [[1080, 35, 400, 430], [500, 45, 270, 440], [55, 30, 415, 440], [775, 45, 280, 440]],
    3: [[1040, 120, 170, 400], [505, 120, 145, 400], [0, 115, 170, 410], [785, 120, 145, 400]],
    4: [[1370, 120, 160, 400], [650, 120, 120, 400], [350, 115, 155, 410], [925, 120, 125, 400]],
    5: [[1100, 345, 365, 200], [530, 340, 225, 210], [95, 340, 345, 205], [800, 340, 225, 210]],
    copy: [[1080, 430, 205, 565], [535, 430, 155, 565], [75, 430, 190, 565], [805, 430, 155, 565]],
    6: [[1280, 430, 205, 565], [645, 430, 150, 565], [255, 430, 190, 565], [915, 430, 150, 565]],
  };
  const selected = regions[suffix] || regions[2];
  const image = new Image();
  image.onload = () => {
    context.fillStyle = baseColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    selected.forEach(([sx, sy, sw, sh], index) => {
      context.drawImage(image, sx, sy, sw, sh, index * 256, 0, 256, 512);
    });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const fill = new THREE.Color(baseColor);
    const fillR = Math.round(fill.r * 255);
    const fillG = Math.round(fill.g * 255);
    const fillB = Math.round(fill.b * 255);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (spread < 14 && (red + green + blue) / 3 > 178) {
        pixels.data[index] = fillR;
        pixels.data[index + 1] = fillG;
        pixels.data[index + 2] = fillB;
      }
    }
    context.putImageData(pixels, 0, 0);
    texture.needsUpdate = true;
  };
  image.src = sourceUrl;
  avatarPartTextureCache.set(cacheKey, texture);
  return texture;
}

function getAvatarPartTexture(options, suffix, baseColor) {
  if (options.gender === 'female' && options.occupation === 'police') {
    return getFemalePoliceAtlasTexture(suffix, baseColor);
  }
  const role = AVATAR_FOLDER_NAMES[options.occupation];
  if (!role) return null;
  const prefix = `${options.gender === 'female' ? '여성' : '남성'}${role}`;
  const file = suffix === 'copy'
    ? `${prefix}-Photoroom - 복사본.png`
    : suffix ? `${prefix}-Photoroom - 복사본 (${suffix}).png` : `${prefix}-Photoroom.png`;
  const url = new URL(`./아바타 용/${prefix}/${file}`, import.meta.url).href;
  const cacheKey = `${url}|${baseColor}`;
  if (avatarPartTextureCache.has(cacheKey)) return avatarPartTextureCache.get(cacheKey);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = baseColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const image = new Image();
  image.onload = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = baseColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    texture.needsUpdate = true;
  };
  image.src = url;
  avatarPartTextureCache.set(cacheKey, texture);
  return texture;
}

function makeDesignedMaterial(baseColor, options, texture) {
  const material = makeAvatarMaterial('#ffffff', options);
  material.map = texture;
  material.needsUpdate = true;
  return material;
}

function addJointBand(parent, name, radius, y, material) {
  const band = makePart(new THREE.CylinderGeometry(radius, radius, 0.075, 16), material, name);
  band.position.y = y;
  parent.add(band);
  return band;
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
  const isPoliceAvatar = options.gender === 'female' && options.occupation === 'police';
  const bodyWidth = isPoliceAvatar ? 0.84 : 0.79;
  const limbRadius = isPoliceAvatar ? 0.115 : 0.125;
  const isHackerDesign = options.occupation === 'hacker';

  // Face and torso are independent parts. Their positions are skeleton anchors.
  const torsoAnchor = new THREE.Group();
  torsoAnchor.name = 'torsoAnchor';
  torsoAnchor.position.set(0, 1.05, 0);
  avatar.add(torsoAnchor);
  const torsoTexture = getAvatarPartTexture(options, 2, options.topColor);
  const torsoMaterial = torsoTexture ? makeDesignedMaterial(options.topColor, options, torsoTexture) : clothing;
  const torsoGeometry = isPoliceAvatar
    ? new THREE.CylinderGeometry(bodyWidth * 0.47, bodyWidth * 0.30, 1.14, 24, 8)
    : isHackerDesign
      ? new THREE.CapsuleGeometry(bodyWidth * 0.43, 0.66, 12, 24)
      : new THREE.CapsuleGeometry(bodyWidth / 2, 0.72, 10, 20);
  const torso = makePart(torsoGeometry, torsoMaterial, 'torso');
  torso.scale.z = isPoliceAvatar ? 0.72 : isHackerDesign ? 0.76 : 0.68;
  if (isPoliceAvatar) torso.position.y = 0.08;
  torsoAnchor.add(torso);
  if (isPoliceAvatar) {
    const waistTexture = getAvatarPartTexture(options, 5, options.bottomColor);
    const uniformBottoms = waistTexture ? makeDesignedMaterial(options.bottomColor, options, waistTexture) : bottoms;
    const hips = makePart(new THREE.CapsuleGeometry(0.34, 0.12, 10, 22), uniformBottoms, 'policeUniformHips');
    hips.scale.set(1.18, 0.76, 0.78);
    hips.position.y = -0.47;
    torsoAnchor.add(hips);
    addJointBand(torsoAnchor, 'policeUniformBelt', 0.31, -0.36, accent);
    const collar = makePart(new THREE.TorusGeometry(0.265, 0.035, 8, 24), accent, 'policeUniformCollar');
    collar.position.y = 0.61;
    collar.scale.y = 0.72;
    torsoAnchor.add(collar);
  }
  if (isHackerDesign) {
    const collar = makePart(new THREE.TorusGeometry(0.29, 0.045, 8, 24), accent, 'hackerJacketCollar');
    collar.position.set(0, 0.49, 0.015);
    collar.scale.y = 0.72;
    torsoAnchor.add(collar);

    const waistTexture = getAvatarPartTexture(options, 5, options.bottomColor);
    const waistMaterial = waistTexture ? makeDesignedMaterial(options.bottomColor, options, waistTexture) : bottoms;
    const waist = makePart(new THREE.SphereGeometry(0.42, 20, 14), waistMaterial, 'hackerWaistConnector');
    waist.scale.set(1, 0.38, 0.72);
    waist.position.y = -0.43;
    torsoAnchor.add(waist);
    addJointBand(torsoAnchor, 'hackerWaistBand', 0.34, -0.34, accent);
  }
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
  const backHair = makePart(new THREE.SphereGeometry(0.32, 18, 14), hair, 'backHair');
  backHair.scale.set(0.96, options.hairStyle === 'long' ? 1.18 : 0.92, 0.30);
  backHair.position.set(0, options.hairStyle === 'long' ? -0.04 : 0.025, -0.285);
  faceAnchor.add(backHair);
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

  {
    const nose = makePart(new THREE.ConeGeometry(0.027, 0.075, 10), skin, 'nose');
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.035, 0.325);
    faceAnchor.add(nose);

    const lipColor = new THREE.Color(options.skinColor).lerp(new THREE.Color('#8f3f49'), 0.34);
    const mouth = makePart(new THREE.CapsuleGeometry(0.009, 0.085, 4, 10), makeAvatarMaterial(lipColor, options), 'mouth');
    mouth.rotation.z = Math.PI / 2;
    mouth.position.set(0, -0.125, 0.307);
    faceAnchor.add(mouth);
  }


  const rig = { torso: torsoAnchor, face: faceAnchor };
  const addArm = (side, x) => {
    const shoulder = new THREE.Group();
    shoulder.name = `${side}ShoulderAnchor`;
    shoulder.position.set(
      isPoliceAvatar ? Math.sign(x) * bodyWidth * 0.49 : isHackerDesign ? Math.sign(x) * bodyWidth * 0.52 : x,
      isPoliceAvatar ? 0.50 : 0.48,
      0,
    );
    torsoAnchor.add(shoulder);
    const armTexture = getAvatarPartTexture(options, side === 'left' ? 3 : 4, options.topColor);
    const armMaterial = armTexture ? makeDesignedMaterial(options.topColor, options, armTexture) : clothing;
    const upper = createSegment(`${side}UpperArm`, isPoliceAvatar ? 0.50 : 0.48, isPoliceAvatar ? limbRadius * 1.12 : limbRadius, armMaterial);
    shoulder.add(upper.anchor);
    const lower = createSegment(`${side}Forearm`, isPoliceAvatar ? 0.45 : 0.42, isPoliceAvatar ? limbRadius : limbRadius * 0.9, armMaterial);
    // Overlap the rounded ends slightly so the arm reads as one continuous form,
    // rather than a pair of pieces joined by a visible elbow ball.
    lower.anchor.position.y = limbRadius * 0.45;
    upper.end.add(lower.anchor);
    if (isPoliceAvatar) {
      addJointBand(lower.anchor, `${side}PoliceElbowGuard`, limbRadius * 1.18, -0.035, accent);
      const hand = makePart(new THREE.SphereGeometry(1, 14, 10), skin, `${side}Hand`);
      hand.scale.set(limbRadius * 0.82, limbRadius * 1.15, limbRadius * 0.58);
      hand.position.y = -0.47;
      lower.anchor.add(hand);
    }
    if (isHackerDesign) {
      addJointBand(upper.anchor, `${side}ShoulderBand`, limbRadius * 1.18, -0.045, accent);
      addJointBand(lower.anchor, `${side}ElbowBand`, limbRadius, -0.02, accent);
    }
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
    const legTexture = getAvatarPartTexture(options, side === 'left' ? 'copy' : 6, options.bottomColor);
    const legMaterial = legTexture ? makeDesignedMaterial(options.bottomColor, options, legTexture) : bottoms;
    const thigh = createSegment(`${side}Thigh`, isPoliceAvatar ? 0.62 : 0.58, isPoliceAvatar ? limbRadius * 1.34 : limbRadius * 1.18, legMaterial);
    hip.add(thigh.anchor);
    const shin = createSegment(`${side}Shin`, isPoliceAvatar ? 0.58 : 0.53, isPoliceAvatar ? limbRadius * 1.12 : limbRadius, legMaterial);
    // As with the arms, make the leg a continuous tapered silhouette with no
    // separate knee mesh protruding from it.
    shin.anchor.position.y = limbRadius * 0.50;
    thigh.end.add(shin.anchor);
    if (isPoliceAvatar) {
      addJointBand(shin.anchor, `${side}PoliceKneeGuard`, limbRadius * 1.30, -0.04, accent);
    }
    if (isHackerDesign) {
      addJointBand(thigh.anchor, `${side}HipBand`, limbRadius * 1.34, -0.045, accent);
      addJointBand(shin.anchor, `${side}KneeBand`, limbRadius * 1.08, -0.025, accent);
    }
    // A scaled sphere gives the shoe a rounded silhouette instead of hard box corners.
    const footMaterial = isPoliceAvatar ? legMaterial : shoes;
    const foot = makePart(new THREE.SphereGeometry(1, 16, 12), footMaterial, `${side}Foot`);
    foot.scale.set(isPoliceAvatar ? limbRadius * 1.55 : limbRadius * 1.18, limbRadius * 0.68, isPoliceAvatar ? 0.25 : 0.21);
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
  } else if (options.occupation === 'doctor') {
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
  } else if (options.occupation === 'hacker') {
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
  let modelLoadGeneration = 0;
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
      rootX: hipCenter ? clamp(((mirror ? 0.5 - hipCenter.x : hipCenter.x - 0.5) * 1.55), -0.9, 0.9) : 0,
      // Camera depth changes also move the detected hip vertically. Keep true
      // vertical following restrained and express depth mainly through scale.
      rootY: hipCenter ? clamp((0.58 - hipCenter.y) * 0.95, -0.48, 0.48) : 0,
      depthScale,
      bodyYaw: getBodyYaw(leftShoulder, rightShoulder, mirror),
      head: getHeadTargets(pose, mirror),
      upperArmL: constrainTrackedLimb(getPoseDirection(pose, 11, 13, mirror), 'left', 'upperArm'),
      forearmL: constrainTrackedLimb(getPoseDirection(pose, 13, 15, mirror), 'left', 'forearm'),
      handL: getPoseDirection(pose, 15, 19, mirror),
      upperArmR: constrainTrackedLimb(getPoseDirection(pose, 12, 14, mirror), 'right', 'upperArm'),
      forearmR: constrainTrackedLimb(getPoseDirection(pose, 14, 16, mirror), 'right', 'forearm'),
      handR: getPoseDirection(pose, 16, 20, mirror),
      thighL: constrainTrackedLimb(getPoseDirection(pose, 23, 25, mirror), 'left', 'leg'),
      shinL: constrainTrackedLimb(getPoseDirection(pose, 25, 27, mirror), 'left', 'leg'),
      footL: getPoseDirection(pose, 27, 31, mirror),
      thighR: constrainTrackedLimb(getPoseDirection(pose, 24, 26, mirror), 'right', 'leg'),
      shinR: constrainTrackedLimb(getPoseDirection(pose, 26, 28, mirror), 'right', 'leg'),
      footR: getPoseDirection(pose, 28, 32, mirror),
      neck: getPoseDirection(pose, 11, 0, mirror),
    };
  }

  function updateRigFromPose(targets) {
    if (!rig || !targets) return;

    setBoneDirection3D(rig.leftUpperArm, targets.upperArmL, 0.84);
    setBoneDirection3D(rig.leftForearm, targets.forearmL, 0.88);
    setBoneDirection3D(rig.rightUpperArm, targets.upperArmR, 0.84);
    setBoneDirection3D(rig.rightForearm, targets.forearmR, 0.88);

    setBoneDirection3D(rig.leftThigh, targets.thighL, 0.80);
    setBoneDirection3D(rig.leftShin, targets.shinL, 0.84);
    setBoneDirection3D(rig.rightThigh, targets.thighR, 0.80);
    setBoneDirection3D(rig.rightShin, targets.shinR, 0.84);

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

    root.rotation.z += (targets.bodyTilt * 0.82 - root.rotation.z) * 0.42;
    root.rotation.x += (targets.depthLean * 0.76 - root.rotation.x) * 0.40;
    if (targets.bodyYaw != null) root.rotation.y = easeAngle(root.rotation.y, targets.bodyYaw, 0.36);
    if (rig.face && targets.head) {
      rig.face.rotation.y += (targets.head.yaw - rig.face.rotation.y) * 0.24;
      rig.face.rotation.x += (targets.head.pitch - rig.face.rotation.x) * 0.22;
      rig.face.rotation.z += (targets.head.roll - rig.face.rotation.z) * 0.22;
    }
    root.position.x += (targets.rootX - root.position.x) * 0.42;
    root.position.y += (targets.rootY - root.position.y) * 0.38;
    const targetScale = Number(options.heightScale || 1) * targets.depthScale;
    const nextScale = root.scale.x + (targetScale - root.scale.x) * 0.34;
    root.scale.setScalar(nextScale);
  }

  function restoreNeutralPose() {
    if (!rig) return;
    [rig.leftUpperArm, rig.leftForearm, rig.rightUpperArm, rig.rightForearm,
      rig.leftThigh, rig.leftShin, rig.rightThigh, rig.rightShin]
      .forEach(bone => restoreBoneTowardRest(bone, 0.14));
    root.rotation.x += (0 - root.rotation.x) * 0.14;
    root.rotation.z += (0 - root.rotation.z) * 0.14;
    root.rotation.y = easeAngle(root.rotation.y, 0, 0.10);
    if (rig.face) {
      rig.face.rotation.x += (0 - rig.face.rotation.x) * 0.12;
      rig.face.rotation.y = easeAngle(rig.face.rotation.y, 0, 0.12);
      rig.face.rotation.z += (0 - rig.face.rotation.z) * 0.12;
    }
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

  async function loadModel() {
    const generation = ++modelLoadGeneration;
    loaded = false;
    rig = null;
    if (model) {
      root.remove(model);
      disposeGroup(model);
      model = null;
    }

    const usePoliceModel = options.gender === 'female' && options.occupation === 'police';
    if (usePoliceModel) {
      try {
        const gltf = await policeModelLoader.loadAsync(POLICE_MODEL_URL);
        if (disposed || generation !== modelLoadGeneration) {
          disposeGroup(gltf.scene);
          return;
        }
        model = gltf.scene;
        model.traverse(object => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
        });
        model.updateMatrixWorld(true);
        const rawBounds = new THREE.Box3().setFromObject(model);
        const rawSize = rawBounds.getSize(new THREE.Vector3());
        model.scale.setScalar(1.86 / Math.max(rawSize.y, 1e-5));
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= bounds.min.y;
        root.add(model);
        model.updateMatrixWorld(true);
        rig = buildPoliceRig(model);
        cacheBoneRestDirections(rig);
        const missing = Object.entries(rig).filter(([, bone]) => !bone).map(([name]) => name);
        const skinnedMeshes = [];
        model.traverse(object => { if (object.isSkinnedMesh) skinnedMeshes.push(object); });
        if (missing.length || !skinnedMeshes.length) {
          throw new Error(`Invalid female police rig: missing=${missing.join(',')}, skinnedMeshes=${skinnedMeshes.length}`);
        }
        console.info(`[Pose Vision] Female police GLB loaded: ${skinnedMeshes.length} SkinnedMesh, ${Object.keys(rig).length} mapped bones`);
        loaded = true;
        if (latestPoseInput) poseTargets = makePoseTargets(latestPoseInput);
        return;
      } catch (error) {
        console.error('Female police GLB load failed; using procedural fallback.', error);
      }
    }

    if (disposed || generation !== modelLoadGeneration) return;
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
    modelLoadGeneration += 1;
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
