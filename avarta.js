const canvas = document.getElementById('avatarCanvas');
const ctx = canvas.getContext('2d');
const savedLandmarks = JSON.parse(localStorage.getItem('savedPoseLandmarks') || 'null');

const controls = {
  skin: document.getElementById('skinColor'),
  hair: document.getElementById('hairColor'),
  shirt: document.getElementById('shirtColor'),
  pants: document.getElementById('pantsColor'),
  shoe: document.getElementById('shoeColor'),
  hairStyle: document.getElementById('hairStyle'),
  eyeStyle: document.getElementById('eyeStyle'),
  accessory: document.getElementById('avatarAccessory'),
};

const POSE_CONNECTIONS = [
  [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [27, 31], [28, 30], [28, 32],
];

function visiblePoint(index) {
  const point = savedLandmarks?.[index];
  return point && (point.visibility ?? 1) >= 0.35 ? point : null;
}

function getPoseTransform() {
  const visible = savedLandmarks.filter(point => (point.visibility ?? 1) >= 0.35);
  const minX = Math.min(...visible.map(point => point.x));
  const maxX = Math.max(...visible.map(point => point.x));
  const minY = Math.min(...visible.map(point => point.y));
  const maxY = Math.max(...visible.map(point => point.y));
  const scale = Math.min(560 / (maxX - minX || 1), 430 / (maxY - minY || 1));
  return point => [
    point.x * scale + 320 - ((minX + maxX) / 2) * scale,
    point.y * scale + 250 - ((minY + maxY) / 2) * scale,
  ];
}

function drawAvatar() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const visible = savedLandmarks?.filter(point => (point.visibility ?? 1) >= 0.35) ?? [];
  if (!visible.length) return drawFallbackAvatar();

  const toCanvas = getPoseTransform();
  const point = index => {
    const landmark = visiblePoint(index);
    return landmark ? toCanvas(landmark) : null;
  };
  const nose = point(0);
  const leftShoulder = point(11);
  const rightShoulder = point(12);
  const leftHip = point(23);
  const rightHip = point(24);

  drawTorso(leftShoulder, rightShoulder, leftHip, rightHip);
  drawLimbs(point);
  drawHead(nose, point(7), point(8));
  drawFace(nose, point(7), point(8));
  drawHair(nose, point(7), point(8));
  drawShoes(point(29), point(30), point(31), point(32));
  drawAccessory(nose, point(7), point(8), leftShoulder, rightShoulder);
}

function drawFallbackAvatar() {
  ctx.fillStyle = controls.shirt.value;
  ctx.fillRect(245, 260, 150, 150);
  ctx.fillStyle = controls.skin.value;
  ctx.beginPath();
  ctx.arc(320, 190, 72, 0, Math.PI * 2);
  ctx.fill();
}

function drawTorso(leftShoulder, rightShoulder, leftHip, rightHip) {
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return;
  ctx.fillStyle = controls.shirt.value;
  ctx.beginPath();
  ctx.moveTo(...leftShoulder);
  ctx.lineTo(...rightShoulder);
  ctx.lineTo(...rightHip);
  ctx.lineTo(...leftHip);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawLimbs(point) {
  POSE_CONNECTIONS.forEach(([startIndex, endIndex]) => {
    const start = point(startIndex);
    const end = point(endIndex);
    if (!start || !end) return;
    const isLeg = startIndex >= 23 || endIndex >= 23;
    ctx.strokeStyle = isLeg ? controls.pants.value : controls.skin.value;
    ctx.lineWidth = isLeg ? 26 : 22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...start);
    ctx.lineTo(...end);
    ctx.stroke();
  });
}

function drawHead(nose, leftEar, rightEar) {
  if (!nose) return;
  const earDistance = leftEar && rightEar ? Math.abs(rightEar[0] - leftEar[0]) : 70;
  ctx.fillStyle = controls.skin.value;
  ctx.beginPath();
  ctx.ellipse(nose[0], nose[1], earDistance * 0.62, earDistance * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFace(nose, leftEar, rightEar) {
  if (!nose) return;
  const width = leftEar && rightEar ? Math.abs(rightEar[0] - leftEar[0]) : 70;
  const eyeY = nose[1] - width * 0.16;
  const eyeGap = width * 0.28;
  ctx.strokeStyle = '#202124';
  ctx.fillStyle = '#202124';
  ctx.lineWidth = 4;
  if (controls.eyeStyle.value === 'happy') {
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.arc(nose[0] + side * eyeGap, eyeY + 4, 8, Math.PI, Math.PI * 2);
      ctx.stroke();
    });
  } else if (controls.eyeStyle.value !== 'cool') {
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.arc(nose[0] + side * eyeGap, eyeY, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.beginPath();
  ctx.arc(nose[0], nose[1] + width * 0.25, width * 0.16, 0, Math.PI);
  ctx.stroke();
}

function drawHair(nose, leftEar, rightEar) {
  if (!nose || controls.hairStyle.value === 'none') return;
  const width = leftEar && rightEar ? Math.abs(rightEar[0] - leftEar[0]) : 70;
  ctx.fillStyle = controls.hair.value;
  ctx.beginPath();
  ctx.ellipse(nose[0], nose[1] - width * 0.42, width * 0.66, width * 0.35, 0, Math.PI, Math.PI * 2);
  if (controls.hairStyle.value === 'long') {
    ctx.lineTo(nose[0] + width * 0.62, nose[1] + width * 0.48);
    ctx.lineTo(nose[0] - width * 0.62, nose[1] + width * 0.48);
  }
  ctx.fill();
}

function drawShoes(...feet) {
  feet.forEach(foot => {
    if (!foot) return;
    ctx.fillStyle = controls.shoe.value;
    ctx.beginPath();
    ctx.ellipse(foot[0], foot[1], 24, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawAccessory(nose, leftEar, rightEar, leftShoulder, rightShoulder) {
  if (controls.accessory.value === 'hat' && nose) {
    const width = leftEar && rightEar ? Math.abs(rightEar[0] - leftEar[0]) : 70;
    ctx.fillStyle = '#d97706';
    ctx.fillRect(nose[0] - width * 0.7, nose[1] - width * 0.78, width * 1.4, 12);
    ctx.beginPath();
    ctx.arc(nose[0], nose[1] - width * 0.78, width * 0.5, Math.PI, 0);
    ctx.fill();
  } else if (controls.accessory.value === 'glasses' || controls.eyeStyle.value === 'cool') {
    if (!nose) return;
    ctx.strokeStyle = '#202124';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(nose[0] - 18, nose[1] - 12, 14, 0, Math.PI * 2);
    ctx.arc(nose[0] + 18, nose[1] - 12, 14, 0, Math.PI * 2);
    ctx.moveTo(nose[0] - 4, nose[1] - 12);
    ctx.lineTo(nose[0] + 4, nose[1] - 12);
    ctx.stroke();
  } else if (controls.accessory.value === 'headphones' && nose) {
    const width = leftEar && rightEar ? Math.abs(rightEar[0] - leftEar[0]) : 70;
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(nose[0], nose[1], width * 0.7, Math.PI, 0);
    ctx.stroke();
  } else if (controls.accessory.value === 'necklace' && leftShoulder && rightShoulder) {
    ctx.strokeStyle = '#f5c542';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc((leftShoulder[0] + rightShoulder[0]) / 2, leftShoulder[1] + 15, 25, 0, Math.PI);
    ctx.stroke();
  }
}

Object.values(controls).forEach(control => {
  control.addEventListener('input', drawAvatar);
  control.addEventListener('change', drawAvatar);
});

drawAvatar();
