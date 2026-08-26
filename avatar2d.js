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
  hairStyle: 'wave',
  outfitStyle: 'idol',
  accessoryStyle: 'ribbon',
  heightScale: 1,
  shoulderScale: 1,
  headScale: 1.08,
});

const OUTLINE = 'rgba(18, 20, 31, 0.92)';

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

function drawAvatar(ctx, width, height, result, options, overlayMode) {
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

  const shoulderCenter = average([points[11], points[12]]);
  const hipCenter = average([points[23], points[24]]);
  if (!shoulderCenter || !hipCenter) return;
  const shoulderWidth = Math.max(distance(points[11], points[12]), distance(shoulderCenter, hipCenter) * 0.82);
  const torsoHeight = Math.max(distance(shoulderCenter, hipCenter), shoulderWidth * 0.72);
  const bodyFactor = options.bodyType === 'slim' ? 0.86 : options.bodyType === 'athletic' ? 1.14 : 1;
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
  strokePath(ctx, [points[23], points[25], points[27]], options.bottomColor, legWidth);
  strokePath(ctx, [points[24], points[26], points[28]], options.bottomColor, legWidth);
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
  container.appendChild(canvas);

  function render() {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    drawAvatar(context, cssWidth, cssHeight, savedResult, options, overlayMode);
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
    Object.assign(options, nextOptions);
    render();
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

  return {
    applyPose,
    capture,
    dispose() {
      resizeObserver.disconnect();
      canvas.remove();
    },
    domElement: canvas,
    updateAppearance,
  };
}
