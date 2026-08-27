import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js';

const MODEL_URL = new URL('./final low poly character  rigged.glb', import.meta.url).href;

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

const REQUIRED_MOTION_BONES = [
  'upperArmL', 'forearmL', 'upperArmR', 'forearmR',
  'thighL', 'shinL', 'thighR', 'shinR',
];

const tempQuaternionA = new THREE.Quaternion();
const tempQuaternionB = new THREE.Quaternion();
const tempQuaternionC = new THREE.Quaternion();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function collectBones(root) {
  const bones = [];
  root.traverse(object => {
    if (object.isBone) bones.push(object);
  });
  return bones;
}

function normalizeBoneName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^mixamorig[:_]?/, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '_');
}

function findBoneFromList(bones, names) {
  const wanted = names.map(normalizeBoneName);

  // Blender가 thigh.L.001 같은 보조 Bone을 함께 내보낼 수 있으므로
  // 완전 일치 이름을 가장 먼저 찾는다.
  for (const target of wanted) {
    const exact = bones.find(bone => normalizeBoneName(bone.name) === target);
    if (exact) return exact;
  }

  // 정확한 이름이 없을 때만 숫자 suffix나 exporter prefix가 붙은 Bone을 허용한다.
  for (const target of wanted) {
    const close = bones.find(bone => {
      const key = normalizeBoneName(bone.name);
      return key.startsWith(`${target}.`) ||
        key.startsWith(`${target}_`) ||
        key.endsWith(`.${target}`) ||
        key.endsWith(`_${target}`);
    });
    if (close) return close;
  }

  return null;
}

function buildRig(model) {
  const allBones = collectBones(model);
  const find = names => findBoneFromList(allBones, names);

  const rig = {
    hips: find(['hips']),
    spine: find(['spine']),
    chest: find(['chest', 'spine.001', 'spine1']),
    neck: find(['neck']),
    head: find(['head']),

    shoulderL: find(['shoulder.l', 'leftshoulder']),
    upperArmL: find(['upper_arm.l', 'upperarm.l', 'leftarm']),
    forearmL: find(['forearm.l', 'leftforearm']),
    handL: find(['hand.l', 'leftHand']),

    shoulderR: find(['shoulder.r', 'rightshoulder']),
    upperArmR: find(['upper_arm.r', 'upperarm.r', 'rightarm']),
    forearmR: find(['forearm.r', 'rightforearm']),
    handR: find(['hand.r', 'righthand']),

    thighL: find(['thigh.l', 'leftupleg', 'leftleg']),
    shinL: find(['shin.l', 'leftleg', 'leftlowerleg']),
    footL: find(['foot.l', 'leftfoot']),
    toeL: find(['toe.l', 'lefttoe']),

    thighR: find(['thigh.r', 'rightupleg', 'rightleg']),
    shinR: find(['shin.r', 'rightleg', 'rightlowerleg']),
    footR: find(['foot.r', 'rightfoot']),
    toeR: find(['toe.r', 'righttoe']),
  };

  const rigMap = Object.fromEntries(
    Object.entries(rig).map(([key, bone]) => [key, bone?.name ?? null]),
  );
  console.info('[Pose Vision] GLB Bone map:', rigMap);

  const missingRequired = REQUIRED_MOTION_BONES.filter(key => !rig[key]);
  if (missingRequired.length) {
    console.error('[Pose Vision] Required motion Bone missing:', missingRequired.join(', '));
    console.info('[Pose Vision] GLB Bone names:', allBones.map(bone => bone.name));
  }

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

function embeddedWorldPoint(pose, index) {
  const point = pose?.[index];
  if (!point) return null;
  if (
    Number.isFinite(point.worldX) &&
    Number.isFinite(point.worldY) &&
    Number.isFinite(point.worldZ)
  ) {
    return { x: point.worldX, y: point.worldY, z: point.worldZ };
  }
  return null;
}

function directWorldPoint(worldPose, index) {
  const point = worldPose?.[index];
  if (!point) return null;
  if (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z)
  ) return point;
  return null;
}

function getWorldPoint(pose, worldPose, index) {
  return directWorldPoint(worldPose, index) || embeddedWorldPoint(pose, index);
}

function getPoseDirection(pose, worldPose, startIndex, endIndex, mirror = false) {
  const worldStart = getWorldPoint(pose, worldPose, startIndex);
  const worldEnd = getWorldPoint(pose, worldPose, endIndex);

  let dx;
  let dy;
  let dz;

  if (worldStart && worldEnd) {
    dx = worldEnd.x - worldStart.x;
    dy = worldEnd.y - worldStart.y;
    dz = worldEnd.z - worldStart.z;
  } else {
    const start = pose?.[startIndex];
    const end = pose?.[endIndex];
    if (!start || !end ||
      !Number.isFinite(start.x) || !Number.isFinite(start.y) ||
      !Number.isFinite(end.x) || !Number.isFinite(end.y)) return null;

    dx = end.x - start.x;
    dy = end.y - start.y;
    dz = (end.z ?? 0) - (start.z ?? 0);
  }

  // MediaPipe: +x 오른쪽, +y 아래쪽. Three.js: +y 위쪽.
  // z도 Three.js 카메라 방향에 맞춰 반전한다.
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

function averageWorldZ(pose, worldPose, indices) {
  const points = indices
    .map(index => getWorldPoint(pose, worldPose, index))
    .filter(Boolean);
  if (!points.length) return null;
  return points.reduce((sum, point) => sum + point.z, 0) / points.length;
}

function setBoneDirection3D(bone, targetDirection, influence = 0.42) {
  if (!bone || !targetDirection) return;

  const restDirection = bone.userData.poseVisionRestWorldDirection;
  const restWorldQuaternion = bone.userData.poseVisionRestWorldQuaternion;
  if (!restDirection || !restWorldQuaternion) return;

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
  let fogNear = 7;
  let fogFar = 20;

  if (style === 'space-station') {
    backgroundColor = '#030711';
    floorColor = '#394452';
    floorMetalness = 0.72;
    floorRoughness = 0.24;
    gridPrimary = 0x7ca8ff;
    gridSecondary = 0x32415e;
    fogNear = 8;
    fogFar = 24;
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
    fogNear = 9;
    fogFar = 25;
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
    fogNear = 5.5;
    fogFar = 16;
    addBackdrop(group, '#090713');
    const building = makeMaterial('#111522', 0.72, 0.22);
    const magenta = makeMaterial('#27142b', 0.38, 0.2, '#ff42d0', 1.4);
    const cyan = makeMaterial('#10252a', 0.38, 0.2, '#47f5ff', 1.3);
    [-4, -3, 3, 4].forEach((x, index) => {
      addBox(group, [x, 2.2, -3.8 - (index % 2) * 0.5], [1.25, 4.4, 1.3], building);
      addBox(group, [x > 0 ? x - 0.55 : x + 0.55, 2.4, -3.05], [0.12, 1.5, 0.08], index % 2 ? magenta : cyan);
    });
  } else {
    backgroundColor = '#050914';
    floorColor = '#0b1324';
    floorMetalness = 0.48;
    floorRoughness = 0.32;
    gridPrimary = 0x4df4dc;
    gridSecondary = 0x264a73;
    fogNear = 6.5;
    fogFar = 19;
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
  floor.name = 'PoseVisionFloor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.012;
  floor.receiveShadow = true;
  group.add(floor);

  // 바닥 위에 투명한 shadow catcher를 한 겹 두어 발밑 접지감을 강화한다.
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.ShadowMaterial({
      color: 0x000000,
      opacity: style === 'laboratory' ? 0.18 : 0.36,
    }),
  );
  shadowCatcher.name = 'PoseVisionShadowCatcher';
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = 0.002;
  shadowCatcher.receiveShadow = true;
  group.add(shadowCatcher);

  const grid = new THREE.GridHelper(30, 30, gridPrimary, gridSecondary);
  grid.position.y = 0.008;
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMaterials.forEach(material => {
    material.transparent = true;
    material.opacity = style === 'laboratory' ? 0.22 : 0.44;
  });
  group.add(grid);

  return { group, backgroundColor, fogNear, fogFar };
}

export function create2DAvatar(container, initialOptions = {}, runtimeOptions = {}) {
  const options = { ...DEFAULT_AVATAR_OPTIONS, ...initialOptions };
  const loader = new GLTFLoader();
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
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;

  const rim = new THREE.DirectionalLight(0x72f2df, 1.4);
  rim.position.set(-4, 3, -3);
  scene.add(hemi, key, rim);

  let cssWidth = 1;
  let cssHeight = 1;
  let disposed = false;
  let loaded = false;
  let rig = null;
  let model = null;
  let modelBaseScale = 1;
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
    scene.fog = new THREE.Fog(environment.backgroundColor, environment.fogNear, environment.fogFar);
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
    const worldPose = result?.poseWorldLandmarks || result?.worldLandmarks?.[0] || null;
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

      const shoulderWorldZ = averageWorldZ(pose, worldPose, [11, 12]);
      const hipWorldZ = averageWorldZ(pose, worldPose, [23, 24]);
      if (shoulderWorldZ != null && hipWorldZ != null) {
        depthLean = clamp((shoulderWorldZ - hipWorldZ) * 0.9, -0.28, 0.28);
      }
    }

    return {
      mirror,
      bodyTilt,
      depthLean,
      rootX: hipCenter
        ? clamp(((mirror ? 0.5 - hipCenter.x : hipCenter.x - 0.5) * 1.15), -0.7, 0.7)
        : 0,
      upperArmL: getPoseDirection(pose, worldPose, 11, 13, mirror),
      forearmL: getPoseDirection(pose, worldPose, 13, 15, mirror),
      handL: getPoseDirection(pose, worldPose, 15, 19, mirror),
      upperArmR: getPoseDirection(pose, worldPose, 12, 14, mirror),
      forearmR: getPoseDirection(pose, worldPose, 14, 16, mirror),
      handR: getPoseDirection(pose, worldPose, 16, 20, mirror),
      thighL: getPoseDirection(pose, worldPose, 23, 25, mirror),
      shinL: getPoseDirection(pose, worldPose, 25, 27, mirror),
      footL: getPoseDirection(pose, worldPose, 27, 31, mirror),
      thighR: getPoseDirection(pose, worldPose, 24, 26, mirror),
      shinR: getPoseDirection(pose, worldPose, 26, 28, mirror),
      footR: getPoseDirection(pose, worldPose, 28, 32, mirror),
    };
  }

  function updateRigFromPose(targets) {
    if (!rig || !targets) return;

    setBoneDirection3D(rig.upperArmL, targets.upperArmL, 0.40);
    setBoneDirection3D(rig.forearmL, targets.forearmL, 0.46);
    setBoneDirection3D(rig.handL, targets.handL, 0.34);
    setBoneDirection3D(rig.upperArmR, targets.upperArmR, 0.40);
    setBoneDirection3D(rig.forearmR, targets.forearmR, 0.46);
    setBoneDirection3D(rig.handR, targets.handR, 0.34);

    setBoneDirection3D(rig.thighL, targets.thighL, 0.38);
    setBoneDirection3D(rig.shinL, targets.shinL, 0.44);
    setBoneDirection3D(rig.footL, targets.footL, 0.32);
    setBoneDirection3D(rig.thighR, targets.thighR, 0.38);
    setBoneDirection3D(rig.shinR, targets.shinR, 0.44);
    setBoneDirection3D(rig.footR, targets.footR, 0.32);

    if (!targets.upperArmL) restoreBoneTowardRest(rig.upperArmL);
    if (!targets.forearmL) restoreBoneTowardRest(rig.forearmL);
    if (!targets.upperArmR) restoreBoneTowardRest(rig.upperArmR);
    if (!targets.forearmR) restoreBoneTowardRest(rig.forearmR);
    if (!targets.thighL) restoreBoneTowardRest(rig.thighL);
    if (!targets.shinL) restoreBoneTowardRest(rig.shinL);
    if (!targets.thighR) restoreBoneTowardRest(rig.thighR);
    if (!targets.shinR) restoreBoneTowardRest(rig.shinR);

    root.rotation.z += (targets.bodyTilt * 0.26 - root.rotation.z) * 0.12;
    root.rotation.x += (targets.depthLean * 0.32 - root.rotation.x) * 0.12;
    root.position.x += (targets.rootX - root.position.x) * 0.08;
  }

  function renderFrame() {
    frameId = null;
    if (disposed) return;

    if (loaded && poseTargets) updateRigFromPose(poseTargets);

    // 의도적으로 AnimationMixer를 만들지 않는다.
    // GLB 내부 clip을 재생하면 MediaPipe가 적용한 Bone quaternion이 다음 프레임에 덮어써질 수 있다.
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(renderFrame);
  }

  async function loadModel() {
    try {
      const gltf = await loader.loadAsync(MODEL_URL);
      if (disposed) return;

      model = gltf.scene;

      const includedGround = model.getObjectByName('Plane') || model.getObjectByName('plane');
      includedGround?.parent?.remove(includedGround);

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

      let skinnedMeshCount = 0;
      model.traverse(object => {
        if (object.isSkinnedMesh) skinnedMeshCount += 1;
      });

      const animationCount = gltf.animations?.length ?? 0;
      console.info(`[Pose Vision] GLB loaded: ${skinnedMeshCount} skinned mesh(es), ${animationCount} animation clip(s)`);
      if (animationCount > 0) {
        console.info('[Pose Vision] Embedded GLB animations are intentionally ignored during live tracking.');
      }

      loaded = true;
      if (latestPoseInput) poseTargets = makePoseTargets(latestPoseInput);
    } catch (error) {
      console.error('GLB avatar load failed.', error);
      loaded = false;
    }
  }

  function applyPose(result) {
    latestPoseInput = result;
    if (!loaded) return;
    const nextTargets = makePoseTargets(result);
    if (nextTargets) poseTargets = nextTargets;
  }

  function updateAppearance(nextOptions = {}) {
    Object.assign(options, nextOptions);
    root.scale.setScalar(Number(options.heightScale || 1));
    if (options.backgroundStyle !== currentBackgroundStyle) rebuildEnvironment();
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
