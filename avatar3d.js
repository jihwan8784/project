import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.176.0/build/three.module.js';

const POSE_BONES = [
  [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [11, 12],
];

const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export function createAvatar3D(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1018');
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.2, 4.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight('#ffffff', '#26364a', 2));

  const avatar = new THREE.Group();
  scene.add(avatar);
  const joints = new Map();
  const bones = [];
  const jointMaterial = new THREE.MeshStandardMaterial({ color: '#f2b28d', roughness: 0.7 });
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#2f80ed', roughness: 0.65 });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), bodyMaterial);
  torso.scale.set(1.25, 1.45, 0.55);
  avatar.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.3, 16), jointMaterial);
  avatar.add(neck);

  JOINTS.forEach(index => {
    const radius = index === 0 ? 0.22 : 0.09;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), jointMaterial);
    avatar.add(mesh);
    joints.set(index, mesh);
  });

  POSE_BONES.forEach(([startIndex, endIndex]) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 1, 12), bodyMaterial);
    avatar.add(mesh);
    bones.push({ mesh, startIndex, endIndex });
  });

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 48),
    new THREE.MeshStandardMaterial({ color: '#142235', roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.35;
  avatar.add(floor);

  function resize() {
    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function worldPoint(landmark) {
    return new THREE.Vector3(landmark.x * 3, -landmark.y * 3, -landmark.z * 3);
  }

  function update(result) {
    const pose = result?.poseWorldLandmarks?.[0];
    if (!pose?.length) return;

    const hip = pose[23] && pose[24]
      ? new THREE.Vector3().addVectors(worldPoint(pose[23]), worldPoint(pose[24])).multiplyScalar(0.5)
      : new THREE.Vector3();
    JOINTS.forEach(index => {
      const landmark = pose[index];
      const joint = joints.get(index);
      if (!landmark || !joint) return;
      const target = worldPoint(landmark).sub(hip);
      target.y += 0.45;
      joint.position.lerp(target, 0.45);
      joint.visible = (landmark.visibility ?? 1) >= 0.35;
    });

    const shoulders = [joints.get(11), joints.get(12)];
    const hips = [joints.get(23), joints.get(24)];
    if (shoulders.every(Boolean) && hips.every(Boolean)) {
      const shoulderCenter = new THREE.Vector3().addVectors(shoulders[0].position, shoulders[1].position).multiplyScalar(0.5);
      const hipCenter = new THREE.Vector3().addVectors(hips[0].position, hips[1].position).multiplyScalar(0.5);
      torso.position.lerp(new THREE.Vector3().addVectors(shoulderCenter, hipCenter).multiplyScalar(0.5), 0.45);
      torso.scale.x = Math.max(0.75, shoulders[0].position.distanceTo(shoulders[1].position) * 1.25);
      torso.scale.y = Math.max(1, shoulderCenter.distanceTo(hipCenter) * 1.2);
      neck.position.lerp(shoulderCenter, 0.45);
      neck.position.y += 0.18;
    }

    bones.forEach(({ mesh, startIndex, endIndex }) => {
      const start = joints.get(startIndex);
      const end = joints.get(endIndex);
      if (!start || !end || !start.visible || !end.visible) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      const direction = new THREE.Vector3().subVectors(end.position, start.position);
      mesh.position.copy(start.position).addScaledVector(direction, 0.5);
      mesh.scale.y = Math.max(direction.length(), 0.05);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    avatar.rotation.y += 0.002;
    renderer.render(scene, camera);
  }

  resize();
  window.addEventListener('resize', resize);
  animate();
  return { update };
}