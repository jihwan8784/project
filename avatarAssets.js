const assetUrl = filename => new URL(`./avatar/${filename}`, import.meta.url).href;

const ASSET_RULES = [
  {
    id: 'male-chef',
    label: '남성 요리사',
    match: { gender: 'male', occupation: 'chef' },
    hideBaseAvatar: true,
    parts: {
      neckTop: assetUrl('남성 요리사 목 아래 상체 윗부분.png'),
      top: assetUrl('남성 요리사 앞치마 상체.png'),
      rightArm: assetUrl('남성 요리사 왼팔.png'),
      leftArm: assetUrl('남성 요리사 오른팔.png'),
      bottom: assetUrl('남성 요리사 앞치마 하체.png'),
      leftLeg: assetUrl('남성 요리사 오른발.png'),
      rightLeg: assetUrl('남성 요리사 왼발.png'),
    },
  },
];

function matchesRule(selection, rule) {
  return Object.entries(rule.match).every(([key, value]) => selection[key] === value);
}

export function resolveAvatarAssets(selection = {}) {
  const matched = ASSET_RULES.find(rule => matchesRule(selection, rule));
  if (!matched) return { label: '', parts: {} };
  return {
    id: matched.id,
    label: matched.label,
    hideBaseAvatar: matched.hideBaseAvatar === true,
    parts: { ...matched.parts },
  };
}
