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
  renderStyle: 'glb-rigged',
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  const valid = values.filter(value => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function averagePoint(points) {
  const valid = points.filter(Boolean);
  if (!valid.length) return null;
  return {
    x: average(valid.map(point => point.x)),
    y: average(valid.map(point => point.y)),
    z: average(valid.map(point => point.z)),
  };
}

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function readPosePoint(pose, mapping, index) {
  const point = pose?.[index];
  if (!point || !mapping) return null;
  return {
    x: mapping.x + (mapping.mirror ? 1 - point.x : point.x) * mapping.width,
    y: mapping.y + point.y * mapping.height,
    z: point.z ?? 0,
  };
}

function poseAverage(pose, mapping, indices) {
  return averagePoint(indices.map(index => readPosePoint(pose, mapping, index)).filter(Boolean));
}

function screenToWorld(width, height, x, y) {
  return new THREE.Vector3(x - width * 0.5, height * 0.5 - y, 0);
}

function worldAngleFromPose(start, end) {
  if (!start || !end) return 0;
  const vx = end.x - start.x;
  const vy = start.y - end.y;
  return Math.atan2(vx, vy);
}

function findBone(root, names) {
  const wanted = names.map(name => String(name).toLowerCase());
  let found = null;
  root.traverse(object => {
    if (!object.isBone || found) return;
    const key = String(object.name || '').toLowerCase();
    if (wanted.some(name => key === name || key.startsWith(`${name}.`) || key.startsWith(`${name}_`))) {
      found = object;
    }
  });
  return found;
}

function getBoneRestAngle(bone) {
  if (!bone?.children?.length) return 0;
  const child = bone.children.find(item => item.isBone) || bone.children[0];
  if (!child) return 0;
  return Math.atan2(child.position.x, child.position.y);
}

const boneWorldQuaternion = new THREE.Quaternion();
const boneParentQuaternion = new THREE.Quaternion();
const boneWorldEuler = new THREE.Euler();
const boneParentEuler = new THREE.Euler();
const boneDesiredQuaternion = new THREE.Quaternion();
const boneAlignQuaternion = new THREE.Quaternion();
const boneLocalQuaternion = new THREE.Quaternion();
const boneRestDirection = new THREE.Vector3();
const boneTargetDirection = new THREE.Vector3();

function worldZRotation(object, targetQuaternion, targetEuler) {
  if (!object) return 0;
  object.getWorldQuaternion(targetQuaternion);
  targetEuler.setFromQuaternion(targetQuaternion, 'XYZ');
  return targetEuler.z;
}

function setBoneAngle(bone, targetAngle, influence = 1) {
  if (!bone) return;
  if (bone.userData.restWorldQuaternion && bone.userData.restWorldDirection) {
    boneTargetDirection.set(Math.sin(targetAngle), Math.cos(targetAngle), 0).normalize();
    boneAlignQuaternion.setFromUnitVectors(bone.userData.restWorldDirection, boneTargetDirection);
    boneDesiredQuaternion.copy(boneAlignQuaternion).multiply(bone.userData.restWorldQuaternion);
    boneWorldQuaternion.copy(bone.getWorldQuaternion(boneWorldQuaternion));
    boneWorldQuaternion.slerp(boneDesiredQuaternion, influence);
    if (bone.parent) {
      boneParentQuaternion.copy(bone.parent.getWorldQuaternion(boneParentQuaternion)).invert();
      boneLocalQuaternion.copy(boneParentQuaternion).multiply(boneWorldQuaternion);
      bone.quaternion.copy(boneLocalQuaternion);
    } else {
      bone.quaternion.copy(boneWorldQuaternion);
    }
    bone.updateMatrixWorld(true);
    return;
  }
  const restWorldAngle = bone.userData.restWorldAngle ?? getBoneRestAngle(bone);
  const restParentWorldZ = bone.userData.restParentWorldZ ?? 0;
  const restLocalZ = bone.userData.restLocalZ ?? 0;
  const parent = bone.parent?.isBone ? bone.parent : null;
  const parentWorldZ = worldZRotation(parent, boneParentQuaternion, boneParentEuler);
  const parentDelta = parent ? parentWorldZ - restParentWorldZ : 0;
  const delta = targetAngle - restWorldAngle - parentDelta;
  bone.rotation.z = restLocalZ + delta * influence;
}

function setBoneTilt(bone, x = 0, y = 0, z = 0) {
  if (!bone) return;
  const restX = bone.userData.restX ?? (bone.userData.restX = bone.rotation.x);
  const restY = bone.userData.restY ?? (bone.userData.restY = bone.rotation.y);
  const restZ = bone.userData.restZ ?? (bone.userData.restZ = bone.rotation.z);
  bone.rotation.x = restX + x;
  bone.rotation.y = restY + y;
  if (z != null) bone.rotation.z = restZ + z;
}

function buildRig(scene) {
  const bones = {};
  scene.traverse(object => {
    if (!object.isBone) return;
    const key = String(object.name || '').toLowerCase();
    bones[key] = object;
  });

  return {
    hips: findBone(scene, ['hips']),
    spine: findBone(scene, ['spine']),
    chest: findBone(scene, ['chest']),
    neck: findBone(scene, ['neck']),
    head: findBone(scene, ['head']),
    upperArmL: findBone(scene, ['upper_arm.l', 'upperarm.l']),
    forearmL: findBone(scene, ['forearm.l']),
    handL: findBone(scene, ['hand.l']),
    upperArmR: findBone(scene, ['upper_arm.r', 'upperarm.r']),
    forearmR: findBone(scene, ['forearm.r']),
    handR: findBone(scene, ['hand.r']),
    thighL: findBone(scene, ['thigh.l']),
    shinL: findBone(scene, ['shin.l']),
    footL: findBone(scene, ['foot.l']),
    toeL: findBone(scene, ['toe.l']),
    thighR: findBone(scene, ['thigh.r']),
    shinR: findBone(scene, ['shin.r']),
    footR: findBone(scene, ['foot.r']),
    toeR: findBone(scene, ['toe.r']),
  };
}

function computePoseFrame(pose, mapping, metrics, width, height, timeSeconds) {
  const shoulderL = readPosePoint(pose, mapping, 11);
  const shoulderR = readPosePoint(pose, mapping, 12);
  const elbowL = readPosePoint(pose, mapping, 13);
  const elbowR = readPosePoint(pose, mapping, 14);
  const wristL = readPosePoint(pose, mapping, 15);
  const wristR = readPosePoint(pose, mapping, 16);
  const indexL = readPosePoint(pose, mapping, 19);
  const indexR = readPosePoint(pose, mapping, 20);
  const hipL = readPosePoint(pose, mapping, 23);
  const hipR = readPosePoint(pose, mapping, 24);
  const kneeL = readPosePoint(pose, mapping, 25);
  const kneeR = readPosePoint(pose, mapping, 26);
  const ankleL = readPosePoint(pose, mapping, 27);
  const ankleR = readPosePoint(pose, mapping, 28);
  const footIndexL = readPosePoint(pose, mapping, 31);
  const footIndexR = readPosePoint(pose, mapping, 32);
  const earCenter = poseAverage(pose, mapping, [7, 8]);
  const eyeCenter = poseAverage(pose, mapping, [1, 2]);
  const nose = readPosePoint(pose, mapping, 0);

  const shoulderCenter = poseAverage(pose, mapping, [11, 12]) || averagePoint([shoulderL, shoulderR]);
  const hipCenter = poseAverage(pose, mapping, [23, 24]) || averagePoint([hipL, hipR]);
  const ankleCenter = poseAverage(pose, mapping, [27, 28]) || averagePoint([ankleL, ankleR]);
  const kneeCenter = poseAverage(pose, mapping, [25, 26]) || averagePoint([kneeL, kneeR]);
  const headAnchor = earCenter || eyeCenter || nose || shoulderCenter;

  if (!shoulderCenter || !hipCenter) return null;

  const shoulderWidth = Math.max(distance(shoulderL, shoulderR), distance(hipL, hipR));
  const torsoHeight = Math.max(distance(shoulderCenter, hipCenter), 1);
  const headRadius = Math.max(distance(readPosePoint(pose, mapping, 7), readPosePoint(pose, mapping, 8)) * 0.66, shoulderWidth * 0.22, 18);
  const topY = (headAnchor?.y ?? shoulderCenter.y) - headRadius * 1.6;
  const bottomY = (ankleCenter?.y ?? (hipCenter.y + torsoHeight * 1.55)) + headRadius * 0.36;
  const centerX = average([shoulderCenter.x, hipCenter.x]);
  const targetHeight = Math.max(1, bottomY - topY) * 0.82;
  const targetWidth = Math.max(shoulderWidth * 2.45, torsoHeight * 0.82);
  const scale = Math.min(targetHeight / metrics.modelHeight, targetWidth / metrics.modelWidth) * Number(metrics.options.heightScale || 1);

  const position = screenToWorld(width, height, centerX, bottomY);
  const sway = Math.sin(timeSeconds * 1.2) * Math.max(1.2, shoulderWidth * 0.018);
  const bob = Math.sin(timeSeconds * 1.9) * Math.max(1.2, torsoHeight * 0.012);
  const breathe = 1 + Math.sin(timeSeconds * 2.2) * 0.012;
  const lean = Math.sin(timeSeconds * 0.85) * 0.02;

  const bodyTilt = Math.atan2((hipCenter.y - shoulderCenter.y), (hipCenter.x - shoulderCenter.x)) - Math.PI / 2;
  const faceOffset = nose && eyeCenter ? (nose.x - eyeCenter.x) / Math.max(headRadius, 1) : 0;
  const faceTurn = clamp(faceOffset * 0.8, -0.55, 0.55);
  const handY = Math.sin(timeSeconds * 2.6) * 0.06;

  return {
    scale,
    position,
    sway,
    bob,
    breathe,
    lean,
    bodyTilt,
    faceTurn,
    handY,
    shoulderL,
    shoulderR,
    elbowL,
    elbowR,
    wristL,
    wristR,
    indexL,
    indexR,
    hipL,
    hipR,
    kneeL,
    kneeR,
    ankleL,
    ankleR,
    footIndexL,
    footIndexR,
    headAnchor,
  };
}

function createFallbackCanvas(container, overlayMode, options) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.clearRect(0, 0, width, height);
    if (!overlayMode) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#11172b');
      gradient.addColorStop(0.55, '#0d1320');
      gradient.addColorStop(1, '#081018');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
    const size = Math.min(width, height) * 0.32;
    ctx.save();
    ctx.translate(width * 0.5, height * 0.56);
    ctx.fillStyle = options.topColor;
    ctx.strokeStyle = 'rgba(6, 8, 14, 0.18)';
    ctx.lineWidth = Math.max(2, size * 0.03);
    ctx.beginPath();
    ctx.arc(0, -size * 0.2, size * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-size * 0.22, -size * 0.01, size * 0.44, size * 0.62);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
  resize();
  return { canvas, resize };
}

export function create2DAvatar(container, initialOptions = {}, runtimeOptions = {}) {
  const options = { ...DEFAULT_AVATAR_OPTIONS, ...initialOptions };
  const overlayMode = runtimeOptions.overlay === true;
  const loader = new GLTFLoader();
  const scene = new THREE.Scene();
  scene.background = null;
  scene.fog = null;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const root = new THREE.Group();
  scene.add(root);

  const ambient = new THREE.AmbientLight(0xffffff, 1.55);
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(-4, 6, 8);
  const fillLight = new THREE.DirectionalLight(0x8fb2ff, 0.9);
  fillLight.position.set(5, 2, 7);
  const rimLight = new THREE.DirectionalLight(0x72f2df, 0.55);
  rimLight.position.set(-2, -1, -5);
  scene.add(ambient, keyLight, fillLight, rimLight);

  let cssWidth = 1;
  let cssHeight = 1;
  let disposed = false;
  let loaded = false;
  let poseState = null;
  let modelMetrics = null;
  let rig = null;
  let frameId = null;
  let mixer = null;

  function fitCamera() {
    camera.left = -cssWidth * 0.5;
    camera.right = cssWidth * 0.5;
    camera.top = cssHeight * 0.5;
    camera.bottom = -cssHeight * 0.5;
    camera.updateProjectionMatrix();
    renderer.setSize(cssWidth, cssHeight, false);
  }

  function updateBonePose(state, timeSeconds) {
    if (!rig || !state) return;

    const pose2d = state.pose2d;
    const mapping = state.mapping;
    const poseScale = state.scale;
    const bodyLean = state.bodyTilt + state.lean;

    const angleLUpperArm = worldAngleFromPose(state.shoulderL, state.elbowL);
    const angleLForearm = worldAngleFromPose(state.elbowL, state.wristL);
    const angleRUpperArm = worldAngleFromPose(state.shoulderR, state.elbowR);
    const angleRForearm = worldAngleFromPose(state.elbowR, state.wristR);
    const angleLHand = worldAngleFromPose(state.wristL, state.indexL) || angleLForearm;
    const angleRHand = worldAngleFromPose(state.wristR, state.indexR) || angleRForearm;
    const angleLThigh = worldAngleFromPose(state.hipL, state.kneeL);
    const angleLShin = worldAngleFromPose(state.kneeL, state.ankleL);
    const angleRThigh = worldAngleFromPose(state.hipR, state.kneeR);
    const angleRShin = worldAngleFromPose(state.kneeR, state.ankleR);
    const angleLFoot = worldAngleFromPose(state.ankleL, state.footIndexL) || angleLShin;
    const angleRFoot = worldAngleFromPose(state.ankleR, state.footIndexR) || angleRShin;

    setBoneAngle(rig.hips, bodyLean * 0.55 + Math.sin(timeSeconds * 0.8) * 0.02);
    setBoneAngle(rig.spine, bodyLean * 0.38);
    setBoneAngle(rig.chest, bodyLean * 0.22);
    setBoneAngle(rig.neck, state.faceTurn * 0.1);
    setBoneAngle(rig.head, state.faceTurn * 0.2 + Math.sin(timeSeconds * 1.7) * 0.02);

    setBoneAngle(rig.upperArmL, angleLUpperArm);
    setBoneAngle(rig.forearmL, angleLForearm);
    setBoneAngle(rig.upperArmR, angleRUpperArm);
    setBoneAngle(rig.forearmR, angleRForearm);
    setBoneAngle(rig.handL, angleLHand, 0.9);
    setBoneAngle(rig.handR, angleRHand, 0.9);
    setBoneAngle(rig.thighL, angleLThigh);
    setBoneAngle(rig.shinL, angleLShin);
    setBoneAngle(rig.thighR, angleRThigh);
    setBoneAngle(rig.shinR, angleRShin);
    setBoneAngle(rig.footL, angleLFoot, 0.9);
    setBoneAngle(rig.footR, angleRFoot, 0.9);

    setBoneTilt(rig.handL, 0, state.handY * 0.3, null);
    setBoneTilt(rig.handR, 0, -state.handY * 0.3, null);
    setBoneTilt(rig.footL, state.handY * 0.2, 0, null);
    setBoneTilt(rig.footR, -state.handY * 0.2, 0, null);

    if (rig.toeL) setBoneTilt(rig.toeL, 0, 0, -state.handY * 0.15);
    if (rig.toeR) setBoneTilt(rig.toeR, 0, 0, state.handY * 0.15);

    root.position.copy(state.position).add(new THREE.Vector3(state.sway, -state.bob, 0));
    root.scale.setScalar(state.scale * state.breathe);
    root.rotation.z = state.lean * 0.65;
  }

  function renderFrame(timeMs) {
    frameId = null;
    if (disposed) return;
    const timeSeconds = (Number.isFinite(timeMs) ? timeMs : performance.now()) * 0.001;
    if (loaded && poseState) {
      updateBonePose(poseState, timeSeconds);
    } else if (loaded && modelMetrics) {
      // Keep the setup preview readable before the camera has a reliable pose.
      const idleScale = Math.min(
        (cssHeight * 0.62) / modelMetrics.modelHeight,
        (cssWidth * 0.44) / modelMetrics.modelWidth,
      ) * Number(options.heightScale || 1);
      root.position.set(0, -modelMetrics.modelHeight * idleScale * 0.48, 0);
      root.scale.setScalar(idleScale);
      root.rotation.z = 0;
    }
    if (mixer) mixer.update(1 / 60);
    if (!overlayMode) {
      scene.background = new THREE.Color('#081018');
    } else {
      scene.background = null;
    }
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(renderFrame);
  }

  async function loadModel() {
    try {
      const gltf = await loader.loadAsync(MODEL_URL);
      if (disposed) return;

      const model = gltf.scene;
      // The exported GLB contains a separate ground plane. It is useful in a
      // Blender preview, but must not be part of the transparent avatar layer
      // or its fit calculations.
      const ground = model.getObjectByName('Plane') || model.getObjectByName('plane');
      ground?.parent?.remove(ground);
      model.traverse(object => {
        if (object.isMesh) {
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
        }
      });

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      model.position.set(-center.x, -box.min.y, -center.z);
      modelMetrics = {
        modelWidth: Math.max(size.x, size.z, 1e-5),
        modelHeight: Math.max(size.y, 1e-5),
        options,
      };

      root.add(model);
      rig = buildRig(model);
      model.updateMatrixWorld(true);
      Object.values(rig).forEach(bone => {
        if (!bone) return;
        const child = bone.children?.find(item => item.isBone);
        const bonePosition = bone.getWorldPosition(new THREE.Vector3());
        const childPosition = child?.getWorldPosition(new THREE.Vector3());
        bone.userData.restWorldDirection = childPosition
          ? childPosition.sub(bonePosition).normalize()
          : null;
        bone.userData.restWorldQuaternion = bone.getWorldQuaternion(new THREE.Quaternion()).clone();
        bone.userData.restWorldAngle = childPosition
          ? Math.atan2(childPosition.x - bonePosition.x, childPosition.y - bonePosition.y)
          : 0;
        bone.userData.restLocalZ = bone.rotation.z;
        bone.userData.restParentWorldZ = bone.parent?.isBone
          ? worldZRotation(bone.parent, boneParentQuaternion, boneParentEuler)
          : 0;
      });
      loaded = true;
      if (gltf.animations?.length && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach(clip => mixer.clipAction(clip).play());
      }
    } catch (error) {
      console.error('GLB avatar load failed.', error);
      loaded = false;
    }
  }


  function resize() {
    cssWidth = Math.max(1, container.clientWidth);
    cssHeight = Math.max(1, container.clientHeight);
    fitCamera();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(cssWidth, cssHeight, false);
  }

  function applyPose(result) {
    const pose = result?.poseLandmarks || result?.landmarks?.[0] || null;
    const mapping = result?.mapping || null;
    if (!pose || !mapping || !modelMetrics) {
      poseState = null;
      return;
    }
    poseState = computePoseFrame(pose, mapping, modelMetrics, cssWidth, cssHeight, performance.now() * 0.001);
  }

  function updateAppearance(nextOptions = {}) {
    Object.assign(options, nextOptions);
    if (modelMetrics) modelMetrics.options = options;
  }

  function capture(filename = 'pose-vision-avatar.png') {
    const link = document.createElement('a');
    link.download = filename;
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  loadModel();
  frameId = requestAnimationFrame(renderFrame);

  return {
    applyPose,
    capture,
    dispose() {
      disposed = true;
      if (frameId != null) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
      root.clear();
    },
    domElement: renderer.domElement,
    updateAppearance,
  };
}
