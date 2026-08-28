export const OPTION_GROUPS = Object.freeze({
  gender: [
    { value: 'male', label: '남성' },
    { value: 'female', label: '여성' },
  ],
  age: [
    { value: '10-20', label: '10~20대' },
    { value: '30', label: '30대' },
    { value: '40-50', label: '40~50대' },
  ],
  bodyByGender: {
    male: [
      { value: 'slim', label: '슬림형' },
      { value: 'standard', label: '표준형' },
      { value: 'muscular', label: '근육형' },
    ],
    female: [
      { value: 'slim', label: '슬림형' },
      { value: 'standard', label: '표준형' },
      { value: 'volume', label: '볼륨형' },
    ],
  },
  faceShape: [
    { value: 'oval', label: '타원형' },
    { value: 'round', label: '둥근형' },
    { value: 'angular', label: '각진형' },
  ],
  hairStyle: [
    { value: 'short', label: '쇼트' },
    { value: 'bob', label: '보브' },
    { value: 'long', label: '롱' },
    { value: 'ponytail', label: '포니테일' },
    { value: 'spiky', label: '스파이키' },
  ],
  accessory: [
    { value: 'none', label: '없음' },
    { value: 'glasses', label: '안경' },
    { value: 'headphones', label: '헤드폰' },
    { value: 'cap', label: '캡' },
  ],
  occupation: [
    { value: 'student', label: '학생' },
    { value: 'drone-pilot', label: '드론 조종사' },
    { value: 'astronaut', label: '우주 비행사' },
    { value: 'hacker', label: '해커' },
    { value: 'teacher', label: '교사' },
    { value: 'doctor', label: '의사' },
    { value: 'nurse', label: '간호사' },
    { value: 'police', label: '경찰' },
    { value: 'firefighter', label: '소방관' },
    { value: 'chef', label: '요리사' },
    { value: 'singer', label: '가수' },
  ],
  background: [
    { value: 'neon-future-city', label: '네온 미래 도시' },
    { value: 'space-station', label: '우주정거장' },
    { value: 'laboratory', label: '연구소' },
    { value: 'rainy-neon-street', label: '비 내리는 네온 거리' },
  ],
  theme: [
    { value: 'cyberpunk', label: '사이버펑크' },
    { value: 'mecha', label: '메카' },
  ],
  skinColor: [
    { value: '#f1c7a5', label: '라이트' },
    { value: '#d99a78', label: '웜' },
    { value: '#b97855', label: '탠' },
    { value: '#855136', label: '딥' },
    { value: '#553322', label: '다크' },
  ],
  hairColor: [
    { value: '#251a16', label: '블랙 브라운' },
    { value: '#75452d', label: '브라운' },
    { value: '#e8d1a0', label: '블론드' },
    { value: '#c7667e', label: '핑크' },
    { value: '#506bc4', label: '블루' },
    { value: '#e5e8ef', label: '실버' },
  ],
  eyeColor: [
    { value: '#554238', label: '브라운' },
    { value: '#32767d', label: '틸' },
    { value: '#526eae', label: '블루' },
    { value: '#7653a8', label: '바이올렛' },
    { value: '#20242b', label: '블랙' },
  ],
  outfitColor: [
    { value: '#334f82', label: '네이비' },
    { value: '#6b416f', label: '퍼플' },
    { value: '#2f6b63', label: '그린' },
    { value: '#9b493f', label: '레드' },
    { value: '#d8dce4', label: '화이트' },
    { value: '#242936', label: '블랙' },
  ],
  accentColor: [
    { value: '#37f2dc', label: '민트' },
    { value: '#63a7ff', label: '블루' },
    { value: '#a982ff', label: '퍼플' },
    { value: '#ff6689', label: '핑크' },
    { value: '#ffcc57', label: '옐로' },
  ],
});

export const DEFAULT_SELECTION = Object.freeze({
  gender: 'male',
  age: '10-20',
  body: 'standard',
<<<<<<< HEAD
  faceShape: 'oval',
  occupation: 'student',
=======
  occupation: 'chef',
>>>>>>> 6ec7b2d53f84fb0d8420082ab0341a6aba1c28a0
  background: 'neon-future-city',
  theme: 'cyberpunk',
  hairStyle: 'short',
  accessory: 'none',
  skinColor: '#d99a78',
  hairColor: '#251a16',
  eyeColor: '#554238',
  outfitColor: '#334f82',
  accentColor: '#37f2dc',
});

const THEME_STYLES = {
  cyberpunk: { bottomColor: '#151a34', shoeColor: '#dce8ff' },
  mecha: { bottomColor: '#667487', shoeColor: '#202936' },
};

const LIST_GROUPS = [
  'gender', 'age', 'faceShape', 'occupation', 'background', 'theme', 'hairStyle', 'accessory',
  'skinColor', 'hairColor', 'eyeColor', 'outfitColor', 'accentColor',
];

export function normalizeSelection(value = {}) {
  const selection = { ...DEFAULT_SELECTION, ...value };
  const includes = (group, option) => OPTION_GROUPS[group].some(item => item.value === option);
  LIST_GROUPS.forEach(group => {
    if (!includes(group, selection[group])) selection[group] = DEFAULT_SELECTION[group];
  });
  const bodies = OPTION_GROUPS.bodyByGender[selection.gender];
  if (!bodies.some(item => item.value === selection.body)) selection.body = 'standard';
  return selection;
}

export function selectionToAppearance(selectionValue) {
  const selection = normalizeSelection(selectionValue);
  const theme = THEME_STYLES[selection.theme];
  const ageHeadScale = selection.age === '10-20' ? 1.1 : selection.age === '30' ? 1.05 : 1;
  return {
    ...theme,
    skinColor: selection.skinColor,
    hairColor: selection.hairColor,
    eyeColor: selection.eyeColor,
    topColor: selection.outfitColor,
    accentColor: selection.accentColor,
    bodyType: selection.body === 'slim' ? 'slim' : selection.body === 'muscular' ? 'athletic' : 'balanced',
    bodyVariant: selection.body,
    gender: selection.gender,
    ageGroup: selection.age,
    faceShape: selection.faceShape,
    occupation: selection.occupation,
    backgroundStyle: selection.background,
    theme: selection.theme,
    hairStyle: selection.hairStyle,
    outfitStyle: selection.occupation === 'singer' ? 'idol' : 'casual',
    headScale: ageHeadScale,
    accessoryStyle: selection.accessory,
  };
}
