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
});

const OUTLINE = 'rgba(18, 20, 31, 0.92)';
const IMAGE_CACHE = new Map();

function average(points) {
  const valid = points.filter(Boolean);
  if (!valid.length) return null;
  return valid.reduce(
    (sum, point) => ({ x: sum.x + point.x / valid.length, y: sum.y + point.y / valid.length }),
    { x: 0, y: 0 },
  );
}

function distance(a, b) {
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

function defaultPose(width, height) {
  const values = {
    0: [.5, .16], 7: [.46, .17], 8: [.54, .17],
    11: [.37, .31], 12: [.63, .31], 13: [.29, .47], 14: [.71, .47],
    15: [.25, .63], 16: [.75, .63], 23: [.43, .55], 24: [.57, .55],
    25: [.42, .73], 26: [.58, .73], 27: [.41, .91], 28: [.59, .91],
    29: [.40, .92], 30: [.60, .92], 31: [.44, .93], 32: [.64, .93],
  };
  return Object.fromEntries(
    Object.entries(values).map(([key, [x, y]]) => [key, { x: x * width, y: y * height }]),
  );
}

function getBlendshape(result, name) {
  const source = result?.faceBlendshapes;
  const categories = Array.isArray(source?.[0]?.categories)
    ? source[0].categories
    : Array.isArray(source) ? source : [];
  return Number(categories.find(item => (item.categoryName || item.displayName) === name)?.score) || 0;
}

function strokePath(ctx, points, color, width) {
  const valid = points.filter(Boolean);
  if (valid.length < 2) return;
  const draw = (strokeStyle, lineWidth) => {
    ctx.beginPath();
    ctx.moveTo(valid[0].x, valid[0].y);
    for (let index = 1; index < valid.length; index += 1) {
      ctx.lineTo(valid[index].x, valid[index].y);
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  draw(OUTLINE, width + Math.max(5, width * 0.16));
  draw(color, width);
}

function fillPolygon(ctx, points, color, outlineWidth) {
  if (points.some(point => !point)) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = outlineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawCircle(ctx, center, radius, color, outlineWidth = 5) {
  if (!center) return;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = outlineWidth;
  ctx.stroke();
}

function drawPreviewBackground(ctx, width, height, style) {
  const palettes = {
    'neon-future-city': ['#080b21', '#243b77', '#ff3ac8'],
    'space-station': ['#070b16', '#26354c', '#c7e7ff'],
    laboratory: ['#0b1820', '#28525b', '#9df8e7'],
    'rainy-neon-street': ['#080915', '#262347', '#4ad7ff'],
  };
  const colors = palettes[style] || palettes['neon-future-city'];
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.62, colors[1]);
  gradient.addColorStop(1, colors[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = colors[2];
  ctx.lineWidth = 2;
  for (let index = -4; index < 12; index += 1) {
    ctx.beginPath();
    ctx.moveTo(index * width * 0.12, height);
    ctx.lineTo(width * 0.5 + index * width * 0.035, height * 0.45);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawOccupationDetails(ctx, points, headCenter, headRadius, shoulderWidth, torsoHeight, options) {
  const occupation = options.occupation;
  const center = average([points[11], points[12], points[23], points[24]]);
  if (!center) return;
  ctx.save();
  ctx.strokeStyle = options.accentColor;
  ctx.fillStyle = options.accentColor;
  ctx.lineWidth = Math.max(3, shoulderWidth * 0.035);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (['doctor', 'nurse'].includes(occupation)) {
    const size = shoulderWidth * 0.13;
    ctx.fillRect(center.x - size * 0.22, center.y - size, size * 0.44, size * 2);
    ctx.fillRect(center.x - size, center.y - size * 0.22, size * 2, size * 0.44);
  } else if (occupation === 'student') {
    ctx.beginPath();
    ctx.moveTo(points[11].x, points[11].y);
    ctx.lineTo(center.x, center.y + torsoHeight * 0.18);
    ctx.lineTo(points[12].x, points[12].y);
    ctx.stroke();
  } else if (occupation === 'astronaut') {
    ctx.beginPath();
    ctx.arc(headCenter.x, headCenter.y, headRadius * 1.16, Math.PI * 0.72, Math.PI * 2.28);
    ctx.stroke();
  } else if (occupation === 'hacker') {
    ctx.beginPath();
    ctx.arc(headCenter.x, headCenter.y + headRadius * 0.08, headRadius * 1.12, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else if (occupation === 'police') {
    ctx.fillRect(headCenter.x - headRadius * 0.68, headCenter.y - headRadius * 1.02, headRadius * 1.36, headRadius * 0.18);
    ctx.fillRect(headCenter.x - headRadius * 0.4, headCenter.y - headRadius * 1.24, headRadius * 0.8, headRadius * 0.25);
  } else if (occupation === 'firefighter') {
    ctx.beginPath();
    ctx.arc(headCenter.x, headCenter.y - headRadius * 0.28, headRadius * 0.84, Math.PI, Math.PI * 2);
    ctx.lineTo(headCenter.x + headRadius * 0.92, headCenter.y - headRadius * 0.14);
    ctx.lineTo(headCenter.x - headRadius * 0.92, headCenter.y - headRadius * 0.14);
    ctx.closePath();
    ctx.fill();
  } else if (occupation === 'chef') {
    [-0.45, 0, 0.45].forEach(offset => {
      ctx.beginPath();
      ctx.arc(headCenter.x + headRadius * offset, headCenter.y - headRadius * 1.08, headRadius * 0.43, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (occupation === 'singer' && points[16]) {
    ctx.beginPath();
    ctx.moveTo(points[16].x, points[16].y);
    ctx.lineTo(points[16].x + shoulderWidth * 0.08, points[16].y + torsoHeight * 0.24);
    ctx.stroke();
    drawCircle(ctx, points[16], shoulderWidth * 0.055, options.accentColor, 2);
  } else if (occupation === 'drone-pilot') {
    ctx.beginPath();
    ctx.arc(headCenter.x, headCenter.y, headRadius * 1.08, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(headCenter.x + headRadius, headCenter.y - headRadius * 0.05, headRadius * 0.16, headRadius * 0.42);
  } else if (occupation === 'teacher') {
    ctx.beginPath();
    ctx.moveTo(center.x, points[11].y);
    ctx.lineTo(center.x, points[23].y);
    ctx.stroke();
  }
  ctx.restore();
}

function loadImage(url) {
  if (!IMAGE_CACHE.has(url)) {
    IMAGE_CACHE.set(url, new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    }));
  }
  return IMAGE_CACHE.get(url);
}

function drawSegmentSprite(ctx, image, start, end, width, overlap = 0.12) {
  if (!image || !start || !end) return;
  const length = distance(start, end);
  if (length < 2) return;
  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate(Math.atan2(end.y - start.y, end.x - start.x) - Math.PI / 2);
  ctx.drawImage(image, -width * 0.5, -length * overlap, width, length * (1 + overlap * 2));
  ctx.restore();
}

function drawCenteredSprite(ctx, image, center, width, height = width) {
  if (!image || !center) return;
  ctx.drawImage(image, center.x - width * 0.5, center.y - height * 0.5, width, height);
}

function drawImageParts(ctx, images, points, headCenter, headRadius, shoulderWidth, torsoHeight) {
  if (!images?.size) return;
  const shoulderCenter = average([points[11], points[12]]);
  const hipCenter = average([points[23], points[24]]);
  const segmentParts = [
    ['left-upper-arm', 11, 13, 0.24], ['left-forearm', 13, 15, 0.2],
    ['right-upper-arm', 12, 14, 0.24], ['right-forearm', 14, 16, 0.2],
    ['left-thigh', 23, 25, 0.31], ['left-calf', 25, 27, 0.25],
    ['right-thigh', 24, 26, 0.31], ['right-calf', 26, 28, 0.25],
    ['left-foot', 27, 31, 0.22], ['right-foot', 28, 32, 0.22],
  ];

  ctx.save();
  ctx.globalAlpha = 1;
  drawSegmentSprite(ctx, images.get('torso-base'), shoulderCenter, hipCenter, shoulderWidth * 1.18, 0.08);
  segmentParts.forEach(([name, start, end, widthFactor]) => {
    drawSegmentSprite(ctx, images.get(name), points[start], points[end], shoulderWidth * widthFactor);
  });

  [
    ['left-shoulder', 11], ['left-elbow', 13], ['left-wrist', 15], ['left-hand', 15],
    ['right-shoulder', 12], ['right-elbow', 14], ['right-wrist', 16], ['right-hand', 16],
    ['left-knee', 25], ['left-ankle', 27], ['right-knee', 26], ['right-ankle', 28],
  ].forEach(([name, index]) => {
    drawCenteredSprite(ctx, images.get(name), points[index], shoulderWidth * (name.includes('hand') ? 0.22 : 0.18));
  });

  drawCenteredSprite(ctx, images.get('pelvis'), hipCenter, shoulderWidth * 0.72, torsoHeight * 0.3);
  drawCenteredSprite(ctx, images.get('waist'), hipCenter, shoulderWidth * 0.68, torsoHeight * 0.18);
  drawCenteredSprite(ctx, images.get('neck'), shoulderCenter, shoulderWidth * 0.23, torsoHeight * 0.24);
  ['hair-back', 'head', 'face', 'hair-front'].forEach(name => {
    drawCenteredSprite(ctx, images.get(name), headCenter, headRadius * 2.35);
  });
  drawCenteredSprite(ctx, images.get('chest-overlay'), average([shoulderCenter, hipCenter]), shoulderWidth * 1.05, torsoHeight * 0.72);
  drawCenteredSprite(ctx, images.get('occupation-gear'), average([shoulderCenter, hipCenter]), shoulderWidth * 1.5, torsoHeight * 2.8);
  drawCenteredSprite(ctx, images.get('theme-overlay'), average([shoulderCenter, hipCenter]), shoulderWidth * 1.65, torsoHeight * 3.1);
  ctx.restore();
}

function drawAvatar(ctx, width, height, result, options, overlayMode, partImages) {
  const source = result?.poseLandmarks;
  const landmarks = Array.isArray(source?.[0]) ? source[0] : source;
  const mapping = result?.mapping;
  let points;

  if (Array.isArray(landmarks) && mapping) {
    points = {};
    landmarks.forEach((point, index) => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      if (Math.min(point.visibility ?? 1, point.presence ?? 1) < 0.08) return;
      points[index] = {
        x: mapping.x + (mapping.mirror ? 1 - point.x : point.x) * mapping.width,
        y: mapping.y + point.y * mapping.height,
      };
    });
  } else {
    points = defaultPose(width, height);
  }

  if (!overlayMode) drawPreviewBackground(ctx, width, height, options.backgroundStyle);

  const shoulderCenter = average([points[11], points[12]]);
  const hipCenter = average([points[23], points[24]]);
  if (!shoulderCenter || !hipCenter) return;
  const shoulderWidth = Math.max(distance(points[11], points[12]), distance(shoulderCenter, hipCenter) * 0.82);
  const torsoHeight = Math.max(distance(shoulderCenter, hipCenter), shoulderWidth * 0.72);
  const bodyFactor = options.bodyVariant === 'slim'
    ? 0.84
    : options.bodyVariant === 'muscular' ? 1.18 : options.bodyVariant === 'volume' ? 1.1 : 1;
  const outlineWidth = Math.max(3, shoulderWidth * 0.035);
  const armWidth = shoulderWidth * 0.2 * bodyFactor;
  const legWidth = shoulderWidth * 0.27 * bodyFactor;
  const headRadius = shoulderWidth * 0.34 * Number(options.headScale || 1);
  const headCenter = points[0]
    ? { x: points[0].x, y: points[0].y - headRadius * 0.08 }
    : { x: shoulderCenter.x, y: shoulderCenter.y - torsoHeight * 0.72 };

  ctx.save();
  ctx.globalAlpha = overlayMode ? 0.96 : 1;

  // Legs and shoes.
  strokePath(ctx, [points[23], points[25]], options.bottomColor, legWidth * 1.08);
  strokePath(ctx, [points[25], points[27]], options.bottomColor, legWidth * 0.9);
  strokePath(ctx, [points[24], points[26]], options.bottomColor, legWidth * 1.08);
  strokePath(ctx, [points[26], points[28]], options.bottomColor, legWidth * 0.9);
  drawCircle(ctx, points[25], legWidth * 0.46, options.accentColor, outlineWidth);
  drawCircle(ctx, points[26], legWidth * 0.46, options.accentColor, outlineWidth);
  strokePath(ctx, [points[27], points[31]], options.shoeColor, legWidth * 0.72);
  strokePath(ctx, [points[28], points[32]], options.shoeColor, legWidth * 0.72);

  // Hair behind the face.
  if (options.hairStyle !== 'none') {
    drawCircle(ctx, { x: headCenter.x, y: headCenter.y + headRadius * 0.12 }, headRadius * 1.08, options.hairColor, outlineWidth);
    if (['long', 'twinTail', 'wave'].includes(options.hairStyle)) {
      const hairLength = options.hairStyle === 'long' ? torsoHeight * 1.3 : torsoHeight * 0.95;
      strokePath(ctx, [
        { x: headCenter.x - headRadius * 0.78, y: headCenter.y + headRadius * 0.35 },
        { x: headCenter.x - headRadius * 0.92, y: headCenter.y + hairLength },
      ], options.hairColor, headRadius * 0.42);
      strokePath(ctx, [
        { x: headCenter.x + headRadius * 0.78, y: headCenter.y + headRadius * 0.35 },
        { x: headCenter.x + headRadius * 0.92, y: headCenter.y + hairLength },
      ], options.hairColor, headRadius * 0.42);
    }
    if (options.hairStyle === 'bun') {
      drawCircle(ctx, { x: headCenter.x + headRadius * 0.55, y: headCenter.y - headRadius * 0.78 }, headRadius * 0.38, options.hairColor, outlineWidth);
    }
  }

  // Torso and outfit.
  const torsoPadding = shoulderWidth * 0.08 * Number(options.shoulderScale || 1);
  fillPolygon(ctx, [
    { x: points[11].x - torsoPadding, y: points[11].y },
    { x: points[12].x + torsoPadding, y: points[12].y },
    { x: points[24].x + torsoPadding * 0.35, y: points[24].y },
    { x: points[23].x - torsoPadding * 0.35, y: points[23].y },
  ], options.topColor, outlineWidth);

  if (options.outfitStyle === 'idol') {
    fillPolygon(ctx, [
      points[23], points[24],
      { x: points[24].x + shoulderWidth * 0.22, y: points[24].y + torsoHeight * 0.42 },
      { x: points[23].x - shoulderWidth * 0.22, y: points[23].y + torsoHeight * 0.42 },
    ], options.accentColor, outlineWidth);
  }

  // Sleeves, arms and hands.
  strokePath(ctx, [points[11], points[13]], options.topColor, armWidth * 1.22);
  strokePath(ctx, [points[12], points[14]], options.topColor, armWidth * 1.22);
  strokePath(ctx, [points[13], points[15]], options.skinColor, armWidth);
  strokePath(ctx, [points[14], points[16]], options.skinColor, armWidth);
  drawCircle(ctx, points[13], armWidth * 0.54, options.accentColor, outlineWidth);
  drawCircle(ctx, points[14], armWidth * 0.54, options.accentColor, outlineWidth);
  drawCircle(ctx, points[15], armWidth * 0.53, options.skinColor, outlineWidth);
  drawCircle(ctx, points[16], armWidth * 0.53, options.skinColor, outlineWidth);

  // Neck and face.
  strokePath(ctx, [shoulderCenter, { x: headCenter.x, y: headCenter.y + headRadius * 0.68 }], options.skinColor, shoulderWidth * 0.14);
  drawCircle(ctx, headCenter, headRadius, options.skinColor, outlineWidth);

  if (options.hairStyle !== 'none') {
    ctx.beginPath();
    ctx.arc(headCenter.x, headCenter.y, headRadius * 0.96, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(headCenter.x + headRadius * 0.45, headCenter.y - headRadius * 0.05);
    ctx.lineTo(headCenter.x, headCenter.y - headRadius * 0.32);
    ctx.lineTo(headCenter.x - headRadius * 0.45, headCenter.y - headRadius * 0.05);
    ctx.closePath();
    ctx.fillStyle = options.hairColor;
    ctx.fill();
  }

  const blinkLeft = getBlendshape(result, 'eyeBlinkLeft');
  const blinkRight = getBlendshape(result, 'eyeBlinkRight');
  const eyeY = headCenter.y + headRadius * 0.04;
  [-1, 1].forEach((side, index) => {
    const blink = index === 0 ? blinkLeft : blinkRight;
    ctx.beginPath();
    ctx.ellipse(
      headCenter.x + side * headRadius * 0.34,
      eyeY,
      headRadius * 0.12,
      Math.max(headRadius * 0.018, headRadius * 0.15 * (1 - blink)),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = blink > 0.78 ? OUTLINE : options.eyeColor;
    ctx.fill();
  });

  const smile = (getBlendshape(result, 'mouthSmileLeft') + getBlendshape(result, 'mouthSmileRight')) * 0.5;
  const jawOpen = getBlendshape(result, 'jawOpen');
  ctx.beginPath();
  ctx.ellipse(
    headCenter.x,
    headCenter.y + headRadius * 0.38,
    headRadius * (0.12 + smile * 0.05),
    headRadius * (0.025 + jawOpen * 0.12),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = '#711f3a';
  ctx.fill();

  if (options.accessoryStyle === 'glasses') {
    ctx.strokeStyle = options.accentColor;
    ctx.lineWidth = outlineWidth;
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.arc(headCenter.x + side * headRadius * 0.34, eyeY, headRadius * 0.24, 0, Math.PI * 2);
      ctx.stroke();
    });
  } else if (options.accessoryStyle === 'headphones') {
    ctx.strokeStyle = options.accentColor;
    ctx.lineWidth = headRadius * 0.15;
    ctx.beginPath();
    ctx.arc(headCenter.x, headCenter.y, headRadius * 1.08, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else if (options.accessoryStyle === 'ribbon') {
    const ribbonCenter = { x: headCenter.x + headRadius * 0.72, y: headCenter.y - headRadius * 0.7 };
    fillPolygon(ctx, [
      ribbonCenter,
      { x: ribbonCenter.x + headRadius * 0.42, y: ribbonCenter.y - headRadius * 0.24 },
      { x: ribbonCenter.x + headRadius * 0.38, y: ribbonCenter.y + headRadius * 0.28 },
    ], options.accentColor, outlineWidth * 0.7);
    fillPolygon(ctx, [
      ribbonCenter,
      { x: ribbonCenter.x - headRadius * 0.34, y: ribbonCenter.y - headRadius * 0.28 },
      { x: ribbonCenter.x - headRadius * 0.38, y: ribbonCenter.y + headRadius * 0.22 },
    ], options.accentColor, outlineWidth * 0.7);
  }

  if (options.theme === 'mecha') {
    [points[11], points[12], points[23], points[24]].forEach(point => {
      drawCircle(ctx, point, shoulderWidth * 0.075, options.accentColor, outlineWidth * 0.7);
    });
  } else {
    ctx.strokeStyle = options.accentColor;
    ctx.lineWidth = Math.max(2, shoulderWidth * 0.022);
    ctx.beginPath();
    ctx.moveTo(points[11].x, points[11].y);
    ctx.lineTo(points[24].x, points[24].y);
    ctx.stroke();
  }

  drawOccupationDetails(ctx, points, headCenter, headRadius, shoulderWidth, torsoHeight, options);
  drawImageParts(ctx, partImages, points, headCenter, headRadius, shoulderWidth, torsoHeight);

  ctx.restore();
}

export function create2DAvatar(container, initialOptions = {}, runtimeOptions = {}) {
  const options = { ...DEFAULT_AVATAR_OPTIONS, ...initialOptions };
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const overlayMode = runtimeOptions.overlay === true;
  let cssWidth = 1;
  let cssHeight = 1;
  let pixelRatio = 1;
  let savedResult = null;
  let partImages = new Map();
  let assetGeneration = 0;
  container.appendChild(canvas);

  function render() {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    drawAvatar(context, cssWidth, cssHeight, savedResult, options, overlayMode, partImages);
  }

  async function loadPartAssets(manifest) {
    const generation = ++assetGeneration;
    partImages = new Map();
    render();
    const entries = Object.entries(manifest?.parts || {});
    const headEntry = entries.find(([name]) => name === 'head');
    if (!headEntry) return;
    try {
      const headImage = await loadImage(headEntry[1]);
      if (generation !== assetGeneration) return;
      partImages.set('head', headImage);
      render();
    } catch {
      return;
    }

    await Promise.all(entries.filter(([name]) => name !== 'head').map(async ([name, url]) => {
      try {
        const image = await loadImage(url);
        if (generation === assetGeneration) partImages.set(name, image);
      } catch {}
    }));
    if (generation === assetGeneration) render();
  }

  function resize() {
    cssWidth = Math.max(1, container.clientWidth);
    cssHeight = Math.max(1, container.clientHeight);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * pixelRatio);
    canvas.height = Math.round(cssHeight * pixelRatio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    render();
  }

  function applyPose(result) {
    savedResult = result;
    render();
  }

  function updateAppearance(nextOptions = {}) {
    const previousManifest = options.assetManifest;
    Object.assign(options, nextOptions);
    render();
    if (options.assetManifest !== previousManifest) loadPartAssets(options.assetManifest);
  }

  function capture(filename = 'pose-vision-avatar.png') {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  loadPartAssets(options.assetManifest);

  return {
    applyPose,
    capture,
    dispose() {
      resizeObserver.disconnect();
      assetGeneration += 1;
      canvas.remove();
    },
    domElement: canvas,
    updateAppearance,
  };
}
