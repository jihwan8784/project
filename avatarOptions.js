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
  hairStyle: [
    { value: 'short', label: '짧은 머리' },
    { value: 'long', label: '긴 머리' },
  ],
});

export const DEFAULT_SELECTION = Object.freeze({
  gender: 'male',
  age: '10-20',
  body: 'standard',
  occupation: 'chef',
  background: 'neon-future-city',
  theme: 'cyberpunk',
  hairStyle: 'short',
});

const THEME_STYLES = {
  cyberpunk: {
    topColor: '#27305f', bottomColor: '#151a34', accentColor: '#37f2dc', shoeColor: '#dce8ff',
  },
  mecha: {
    topColor: '#dce3ec', bottomColor: '#667487', accentColor: '#ff5a66', shoeColor: '#202936',
  },
};

const OCCUPATION_COLORS = {
  student: '#334f82', 'drone-pilot': '#354651', astronaut: '#e8edf3', hacker: '#20203b',
  teacher: '#7a5b45', doctor: '#e7f1ef', nurse: '#e8f0ff', police: '#233d69',
  firefighter: '#9b332d', chef: '#f0ece3', singer: '#633c89',
};

export function normalizeSelection(value = {}) {
  const selection = { ...DEFAULT_SELECTION, ...value };
  const includes = (group, option) => OPTION_GROUPS[group].some(item => item.value === option);
  if (!includes('gender', selection.gender)) selection.gender = DEFAULT_SELECTION.gender;
  if (!includes('age', selection.age)) selection.age = DEFAULT_SELECTION.age;
  if (!includes('occupation', selection.occupation)) selection.occupation = DEFAULT_SELECTION.occupation;
  if (!includes('background', selection.background)) selection.background = DEFAULT_SELECTION.background;
  if (!includes('theme', selection.theme)) selection.theme = DEFAULT_SELECTION.theme;
  if (!includes('hairStyle', selection.hairStyle)) selection.hairStyle = DEFAULT_SELECTION.hairStyle;
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
    topColor: OCCUPATION_COLORS[selection.occupation] || theme.topColor,
    bodyType: selection.body === 'slim' ? 'slim' : selection.body === 'muscular' ? 'athletic' : 'balanced',
    bodyVariant: selection.body,
    gender: selection.gender,
    ageGroup: selection.age,
    occupation: selection.occupation,
    backgroundStyle: selection.background,
    theme: selection.theme,
    hairStyle: selection.hairStyle,
    outfitStyle: selection.occupation === 'singer' ? 'idol' : 'casual',
    headScale: ageHeadScale,
    accessoryStyle: selection.occupation === 'drone-pilot'
      ? 'headphones'
      : selection.occupation === 'teacher' ? 'glasses' : 'none',
  };
}
