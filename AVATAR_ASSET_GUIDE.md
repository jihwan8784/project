# 2D 아바타 이미지 규격

## 옵션 대표 이미지

WebP 이미지를 아래 경로에 넣으면 옵션 변경 시 왼쪽 미리보기에 자동 표시됩니다.

```text
assets/options/gender/{male|female}.webp
assets/options/age/{10-20|30|40-50}.webp
assets/options/body/{male|female}-{slim|standard|muscular|volume}.webp
assets/options/occupation/{option-id}.webp
assets/options/background/{option-id}.webp
assets/options/theme/{cyberpunk|mecha}.webp
```

권장 규격은 같은 구도·화풍의 세로형 `1024×1536 WebP`입니다. 옵션마다 카메라 거리, 캐릭터 정면 위치와 조명을 동일하게 유지해야 학습 및 파츠 분리가 안정적입니다.

## 아바타 파츠

투명 PNG를 `assets/avatar-parts` 아래에 저장합니다. 선택 조합별 정확한 경로와 파츠 이름은 브라우저의 `poseVisionAvatarAssetManifest`에 자동 생성됩니다.

```text
assets/avatar-parts/{gender}/{age}/{body}/{part}.png
assets/avatar-parts/outfits/{occupation}/{theme}/{part}.png
assets/backgrounds/{background}.webp
```

파츠는 머리 앞/뒤, 얼굴, 목, 몸통, 가슴 장식, 허리, 골반, 좌우 어깨·상완·팔꿈치·전완·손목·손, 좌우 허벅지·무릎·종아리·발목·발, 직업 장비와 테마 오버레이로 분리합니다. 모든 파츠는 동일한 캔버스 크기와 기준점을 사용하고 관절 주변에 충분한 겹침 여백을 둡니다.
