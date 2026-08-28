export const DEFAULT_AVATAR_OPTIONS = Object.freeze({
  skinColor: '#d99a78',
  eyeColor: '#554238',
  hairColor: '#251a16',
  topColor: '#354f77',
  bottomColor: '#202733',
  accentColor: '#69e6d5',
  shoeColor: '#e9edf2',
  bodyVariant: 'standard',
  backgroundStyle: 'neon-future-city',
  heightScale: 1,
  avatarAssets: { parts: {} },
});

const PART_LABELS = Object.freeze({
  neckTop: '목/어깨',
  top: '앞치마 상체',
  bottom: '앞치마 하체',
  leftArm: '왼팔',
  rightArm: '오른팔',
  leftLeg: '왼발',
  rightLeg: '오른발',
});

const BACKGROUNDS = Object.freeze({
  'neon-future-city': { sky: '#070b10', floor: '#0b131b', line: '#1eb8ad', structure: '#151b25' },
  'space-station': { sky: '#05070b', floor: '#161a20', line: '#ccd8e2', structure: '#232a33' },
  laboratory: { sky: '#0d1416', floor: '#162023', line: '#7fd8ce', structure: '#243034' },
  'rainy-neon-street': { sky: '#080a10', floor: '#10151c', line: '#ef5bb8', structure: '#171b24' },
});

const fadedImageCache = new WeakMap();
const limbSegmentCache = new WeakMap();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function point(x, y) {
  return { x, y };
}

function average(a, b) {
  return point((a.x + b.x) / 2, (a.y + b.y) / 2);
}

function mix(a, b, amount) {
  return point(a.x + (b.x - a.x) * amount, a.y + (b.y - a.y) * amount);
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function rotationBetween(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
}

function unitBetween(a, b) {
  const length = Math.max(0.001, distance(a, b));
  return point((b.x - a.x) / length, (b.y - a.y) / length);
}

function hasPoint(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function neutralRig(width, height) {
  return {
    shoulderLeft: point(width * 0.40, height * 0.29),
    shoulderRight: point(width * 0.60, height * 0.29),
    hipLeft: point(width * 0.455, height * 0.55),
    hipRight: point(width * 0.545, height * 0.55),
    armLeft: [point(width * 0.40, height * 0.30), point(width * 0.34, height * 0.44), point(width * 0.32, height * 0.60)],
    armRight: [point(width * 0.60, height * 0.30), point(width * 0.66, height * 0.44), point(width * 0.68, height * 0.60)],
    legLeft: [point(width * 0.46, height * 0.55), point(width * 0.45, height * 0.73), point(width * 0.44, height * 0.91)],
    legRight: [point(width * 0.54, height * 0.55), point(width * 0.55, height * 0.73), point(width * 0.56, height * 0.91)],
  };
}

function trackedRig(pose, mirror, width, height) {
  const fallback = neutralRig(width, height);
  if (!pose?.length || ![11, 12, 23, 24].every(index => hasPoint(pose[index]))) return fallback;

  const screenX = value => mirror ? 1 - value : value;
  const rawShoulderCenter = point(
    (screenX(pose[11].x) + screenX(pose[12].x)) / 2,
    (pose[11].y + pose[12].y) / 2,
  );
  const rawHipCenter = point(
    (screenX(pose[23].x) + screenX(pose[24].x)) / 2,
    (pose[23].y + pose[24].y) / 2,
  );
  const rawTorsoLength = Math.max(0.08, distance(rawShoulderCenter, rawHipCenter));
  const distanceScale = clamp(rawTorsoLength / 0.22, 0.78, 1.28);
  const desiredTorsoLength = height * 0.26 * distanceScale;
  const pixelsPerUnit = Math.min(desiredTorsoLength / rawTorsoLength, height * 1.7, width * 2);
  const root = point(
    width * 0.5 + clamp((rawHipCenter.x - 0.5) * width * 0.58, -width * 0.18, width * 0.18),
    height * 0.56 + clamp((rawHipCenter.y - 0.58) * height * 0.58, -height * 0.14, height * 0.14),
  );
  const mapLandmark = (index, fallbackPoint = null) => {
    const source = pose[index];
    if (!hasPoint(source)) return fallbackPoint;
    return point(
      clamp(root.x + (screenX(source.x) - rawHipCenter.x) * pixelsPerUnit, width * 0.10, width * 0.90),
      clamp(root.y + (source.y - rawHipCenter.y) * pixelsPerUnit, height * 0.06, height * 0.94),
    );
  };
  const mapChain = (indices, fallbackChain) => {
    const start = mapLandmark(indices[0], fallbackChain[0]);
    let middle = mapLandmark(indices[1]);
    let end = mapLandmark(indices[2]);
    if (!middle) middle = end ? mix(start, end, 0.5) : fallbackChain[1];
    if (!end) {
      end = point(
        middle.x + (middle.x - start.x) * 0.92,
        middle.y + (middle.y - start.y) * 0.92,
      );
    }
    return [start, middle, end];
  };

  const armChains = [
    mapChain([11, 13, 15], fallback.armLeft),
    mapChain([12, 14, 16], fallback.armRight),
  ].sort((a, b) => a[0].x - b[0].x);
  const legChains = [
    mapChain([23, 25, 27], fallback.legLeft),
    mapChain([24, 26, 28], fallback.legRight),
  ].sort((a, b) => a[0].x - b[0].x);

  return {
    shoulderLeft: armChains[0][0],
    shoulderRight: armChains[1][0],
    hipLeft: legChains[0][0],
    hipRight: legChains[1][0],
    armLeft: armChains[0],
    armRight: armChains[1],
    legLeft: legChains[0],
    legRight: legChains[1],
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${src}`));
    image.src = src;
  });
}

function drawBackground(context, width, height, style) {
  const palette = BACKGROUNDS[style] || BACKGROUNDS['neon-future-city'];
  context.fillStyle = palette.sky;
  context.fillRect(0, 0, width, height);

  const horizon = height * 0.64;
  context.fillStyle = palette.structure;
  context.fillRect(0, height * 0.15, width * 0.16, horizon - height * 0.15);
  context.fillRect(width * 0.82, height * 0.08, width * 0.18, horizon - height * 0.08);
  context.fillStyle = palette.floor;
  context.fillRect(0, horizon, width, height - horizon);

  context.strokeStyle = palette.line;
  context.globalAlpha = 0.38;
  context.lineWidth = 1;
  for (let index = 0; index <= 6; index += 1) {
    const y = horizon + (height - horizon) * Math.pow(index / 6, 1.55);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  for (let index = -4; index <= 4; index += 1) {
    context.beginPath();
    context.moveTo(width * 0.5, horizon);
    context.lineTo(width * 0.5 + index * width * 0.22, height);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawImagePart(context, image, center, width, height, rotation) {
  if (!image) return;
  context.save();
  context.translate(center.x, center.y);
  context.rotate(rotation);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

function bottomFadedImage(image) {
  if (fadedImageCache.has(image)) return fadedImageCache.get(image);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  const mask = context.createLinearGradient(0, 0, 0, canvas.height);
  mask.addColorStop(0, '#000');
  mask.addColorStop(0.68, '#000');
  mask.addColorStop(1, 'transparent');
  context.fillStyle = mask;
  context.fillRect(0, 0, canvas.width, canvas.height);
  fadedImageCache.set(image, canvas);
  return canvas;
}

function alphaCentroid(imageData, width, height, startRatio, endRatio, fallback) {
  const startY = Math.max(0, Math.floor(height * startRatio));
  const endY = Math.min(height, Math.ceil(height * endRatio));
  let weight = 0;
  let xTotal = 0;
  let yTotal = 0;
  for (let y = startY; y < endY; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = imageData[(y * width + x) * 4 + 3];
      if (alpha < 24) continue;
      weight += alpha;
      xTotal += x * alpha;
      yTotal += y * alpha;
    }
  }
  return weight ? point(xTotal / weight, yTotal / weight) : fallback;
}

function maskedLimbSegment(image, splitRatio, upper) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  const mask = context.createLinearGradient(0, 0, 0, canvas.height);
  if (upper) {
    mask.addColorStop(0, '#000');
    mask.addColorStop(Math.max(0, splitRatio - 0.04), '#000');
    mask.addColorStop(Math.min(1, splitRatio + 0.04), 'transparent');
    mask.addColorStop(1, 'transparent');
  } else {
    mask.addColorStop(0, 'transparent');
    mask.addColorStop(Math.max(0, splitRatio - 0.04), 'transparent');
    mask.addColorStop(Math.min(1, splitRatio + 0.04), '#000');
    mask.addColorStop(1, '#000');
  }
  context.fillStyle = mask;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function analyzeLimbImage(image) {
  if (limbSegmentCache.has(image)) return limbSegmentCache.get(image);
  const source = document.createElement('canvas');
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const context = source.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, source.width, source.height).data;
  const splitRatio = 0.51;
  const anchors = [
    alphaCentroid(pixels, source.width, source.height, 0.02, 0.18, point(source.width * 0.5, source.height * 0.08)),
    alphaCentroid(pixels, source.width, source.height, 0.43, 0.59, point(source.width * 0.5, source.height * splitRatio)),
    alphaCentroid(pixels, source.width, source.height, 0.82, 0.99, point(source.width * 0.5, source.height * 0.92)),
  ];
  const analysis = {
    anchors,
    upper: maskedLimbSegment(image, splitRatio, true),
    lower: maskedLimbSegment(image, splitRatio, false),
  };
  limbSegmentCache.set(image, analysis);
  return analysis;
}

function drawLimbSegment(context, image, sourceStart, sourceEnd, targetStart, targetEnd, thicknessScale) {
  const sourceLength = Math.max(1, distance(sourceStart, sourceEnd));
  const targetLength = Math.max(1, distance(targetStart, targetEnd));
  const sourceAxis = point((sourceEnd.x - sourceStart.x) / sourceLength, (sourceEnd.y - sourceStart.y) / sourceLength);
  const sourcePerpendicular = point(-sourceAxis.y, sourceAxis.x);
  const targetAxis = point((targetEnd.x - targetStart.x) / targetLength, (targetEnd.y - targetStart.y) / targetLength);
  const targetPerpendicular = point(-targetAxis.y, targetAxis.x);
  const lengthScale = targetLength / sourceLength;
  const crossScale = lengthScale * thicknessScale;
  const a = targetAxis.x * lengthScale * sourceAxis.x + targetPerpendicular.x * crossScale * sourcePerpendicular.x;
  const c = targetAxis.x * lengthScale * sourceAxis.y + targetPerpendicular.x * crossScale * sourcePerpendicular.y;
  const b = targetAxis.y * lengthScale * sourceAxis.x + targetPerpendicular.y * crossScale * sourcePerpendicular.x;
  const d = targetAxis.y * lengthScale * sourceAxis.y + targetPerpendicular.y * crossScale * sourcePerpendicular.y;
  const e = targetStart.x - a * sourceStart.x - c * sourceStart.y;
  const f = targetStart.y - b * sourceStart.x - d * sourceStart.y;
  context.save();
  context.transform(a, b, c, d, e, f);
  context.drawImage(image, 0, 0);
  context.restore();
}

function drawBaseAvatar(context, rig, options) {
  const shoulderCenter = average(rig.shoulderLeft, rig.shoulderRight);
  const hipCenter = average(rig.hipLeft, rig.hipRight);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const drawLimb = (chain, color, width) => {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(chain[0].x, chain[0].y);
    context.lineTo(chain[1].x, chain[1].y);
    context.lineTo(chain[2].x, chain[2].y);
    context.stroke();
  };
  const limbWidth = clamp(distance(shoulderCenter, hipCenter) * 0.20, 16, 42);
  drawLimb(rig.legLeft, options.bottomColor, limbWidth);
  drawLimb(rig.legRight, options.bottomColor, limbWidth);
  drawLimb(rig.armLeft, options.topColor, limbWidth * 0.85);
  drawLimb(rig.armRight, options.topColor, limbWidth * 0.85);

  context.fillStyle = options.topColor;
  context.beginPath();
  context.moveTo(rig.shoulderLeft.x, rig.shoulderLeft.y);
  context.lineTo(rig.shoulderRight.x, rig.shoulderRight.y);
  context.lineTo(rig.hipRight.x, rig.hipRight.y);
  context.lineTo(rig.hipLeft.x, rig.hipLeft.y);
  context.closePath();
  context.fill();

  const headRadius = clamp(distance(rig.shoulderLeft, rig.shoulderRight) * 0.28, 24, 62);
  const down = unitBetween(shoulderCenter, hipCenter);
  const headCenter = point(shoulderCenter.x - down.x * headRadius * 1.45, shoulderCenter.y - down.y * headRadius * 1.45);
  context.fillStyle = options.skinColor;
  context.beginPath();
  context.arc(headCenter.x, headCenter.y, headRadius, 0, Math.PI * 2);
  context.fill();
}

export function create2DAvatar(container, initialOptions = {}, runtimeOptions = {}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  const options = { ...DEFAULT_AVATAR_OPTIONS, ...initialOptions };
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let latestPose = null;
  let mirror = true;
  let images = {};
  let loadGeneration = 0;
  let disposed = false;
  let lastCoordinateUpdate = 0;
  container.appendChild(canvas);

  function emitCoordinates(coordinates, force = false) {
    const now = performance.now();
    if (!force && now - lastCoordinateUpdate < 80) return;
    lastCoordinateUpdate = now;
    runtimeOptions.onCoordinatesChange?.(coordinates);
  }

  function addCoordinate(coordinates, key, center, rotation) {
    coordinates.push({
      key,
      label: PART_LABELS[key] || key,
      x: center.x,
      y: center.y,
      rotation: rotation * 180 / Math.PI,
    });
  }

  function render(forceCoordinates = false) {
    if (disposed) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawBackground(context, width, height, options.backgroundStyle);

    const rig = trackedRig(latestPose, mirror, width, height);
    const parts = options.avatarAssets?.parts || {};
    if (!Object.keys(parts).length) {
      drawBaseAvatar(context, rig, options);
      emitCoordinates([], forceCoordinates);
      return;
    }

    const coordinates = [];
    const shoulderCenter = average(rig.shoulderLeft, rig.shoulderRight);
    const hipCenter = average(rig.hipLeft, rig.hipRight);
    const torsoLength = clamp(distance(shoulderCenter, hipCenter), height * 0.16, height * 0.34);
    const shoulderWidth = clamp(distance(rig.shoulderLeft, rig.shoulderRight), torsoLength * 0.62, torsoLength * 1.12);
    const torsoRotation = rotationBetween(shoulderCenter, hipCenter);
    const down = unitBetween(shoulderCenter, hipCenter);

    const drawLimb = (key, chain) => {
      const image = images[key];
      if (!image) return;
      const segments = analyzeLimbImage(image);
      const thicknessScale = key.endsWith('Arm') ? 0.68 : 0.64;
      drawLimbSegment(context, segments.upper, segments.anchors[0], segments.anchors[1], chain[0], chain[1], thicknessScale);
      drawLimbSegment(context, segments.lower, segments.anchors[1], segments.anchors[2], chain[1], chain[2], thicknessScale);
      const center = mix(chain[0], chain[2], 0.5);
      const rotation = rotationBetween(chain[0], chain[2]);
      addCoordinate(coordinates, key, center, rotation);
    };

    drawLimb('leftLeg', rig.legLeft);
    drawLimb('rightLeg', rig.legRight);
    drawLimb('leftArm', rig.armLeft);
    drawLimb('rightArm', rig.armRight);

    if (images.top) {
      const topHeight = torsoLength * 1.20;
      const topWidth = topHeight * images.top.naturalWidth / images.top.naturalHeight * 1.08;
      const center = mix(shoulderCenter, hipCenter, 0.48);
      drawImagePart(context, images.top, center, topWidth, topHeight, torsoRotation);
      addCoordinate(coordinates, 'top', center, torsoRotation);
    }
    if (images.neckTop) {
      const neckWidth = shoulderWidth * 1.20;
      const neckHeight = neckWidth * images.neckTop.naturalHeight / images.neckTop.naturalWidth;
      const center = point(shoulderCenter.x + down.x * neckHeight * 0.12, shoulderCenter.y + down.y * neckHeight * 0.12);
      drawImagePart(context, bottomFadedImage(images.neckTop), center, neckWidth, neckHeight, torsoRotation);
      addCoordinate(coordinates, 'neckTop', center, torsoRotation);
    }
    if (images.bottom) {
      const bottomWidth = Math.max(shoulderWidth * 0.96, distance(rig.hipLeft, rig.hipRight) * 1.38);
      const bottomHeight = bottomWidth * images.bottom.naturalHeight / images.bottom.naturalWidth;
      const center = point(hipCenter.x + down.x * bottomHeight * 0.16, hipCenter.y + down.y * bottomHeight * 0.16);
      drawImagePart(context, images.bottom, center, bottomWidth, bottomHeight, torsoRotation);
      addCoordinate(coordinates, 'bottom', center, torsoRotation);
    }
    const coordinateOrder = ['neckTop', 'top', 'bottom', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
    coordinates.sort((a, b) => coordinateOrder.indexOf(a.key) - coordinateOrder.indexOf(b.key));
    emitCoordinates(coordinates, forceCoordinates);
  }

  async function loadAssets() {
    const generation = ++loadGeneration;
    const entries = Object.entries(options.avatarAssets?.parts || {});
    images = {};
    render(true);
    const loaded = await Promise.all(entries.map(async ([key, src]) => {
      try {
        return [key, await loadImage(src)];
      } catch (error) {
        console.error(error);
        return null;
      }
    }));
    if (disposed || generation !== loadGeneration) return;
    images = Object.fromEntries(loaded.filter(Boolean));
    render(true);
  }

  function resize() {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    render();
  }

  function applyPose(result = {}) {
    latestPose = result.poseLandmarks || result.landmarks?.[0] || null;
    mirror = result.mapping?.mirror !== false;
    render();
  }

  function updateAppearance(nextOptions = {}) {
    Object.assign(options, nextOptions);
    loadAssets();
  }

  function capture(filename = 'pose-vision-avatar.png') {
    render();
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function dispose() {
    disposed = true;
    resizeObserver.disconnect();
    canvas.remove();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  loadAssets();

  return { applyPose, capture, dispose, domElement: canvas, updateAppearance };
}
