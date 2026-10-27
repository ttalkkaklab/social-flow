# 모션그래픽 서체 조사

조사일: 2026-10-18. 제작자 배포처와 공식 저장소를 확인했다. 아래 용도와 조합은 이 플러그인을 위한 디자인 제안이며 사용량 순위가 아니다. 후보 7종을 플러그인에 동봉했다. 테마가 제목·본문·숫자의 서체 역할을 선택하며 실제 글리프 표로 누락을 검사한다.

## 현재 구현의 문제

기존 모션 렌더러는 한글에 Pretendard, 영문과 숫자에 Inter를 사용했다. 테마별 굵기와 자간을 바꿔도 글자 형태가 같아 표현 범위가 좁다. 제목용 서체, 설명용 서체, 데이터용 숫자의 역할을 따로 정해야 한다. 서체를 늘려도 동일한 카드 구성과 단조로운 움직임은 별도로 개선해야 한다.

## 후보와 상황별 용도

| 후보 | 공식 자료에서 확인한 특성 | 권하는 상황 | 적용 시 확인할 점 |
|---|---|---|---|
| Paperlogy | 9개 굵기, Gmarket Sans 기반 한글, Montserrat 기반 영문, 고정폭 숫자 | 설명 영상의 큰 제목, 비교 데이터, 제품 소개 | 한글 2,780자 구성으로 소개돼 있다. 실제 사용 문장의 글리프를 확인한다 |
| Black Han Sans | 사각 형태를 강조한 제목용 한글 서체 | 짧은 선언, 강한 후킹 문장, 캠페인 | 긴 본문에 사용하지 않는다. 공식 설명은 한글 2,580자와 제한된 문자 구성을 명시한다 |
| Dongle | 둥글고 탈네모꼴인 디스플레이 서체 | 가벼운 교육, 친근한 캐릭터 설명, 유쾌한 메시지 | 같은 CSS 크기라도 다른 서체와 실제 글자 높이가 다르므로 화면 기준으로 조정한다 |
| Gowun Batang | 정갈한 연필 글씨에서 착안한 부드러운 명조 | 인용, 인물 이야기, 문화·에세이, 차분한 브랜드 소개 | 작은 크기에서 얇은 획이 영상 압축으로 흐려지는지 확인한다 |
| Space Grotesk | 고정폭 서체에서 출발한 비례폭 산세리프, tabular figures 지원 | 기술·제품의 영문 제목, 데이터 수치 | 한글은 별도 서체가 필요하다. 한글과 높이·굵기를 맞춘다 |
| Roboto Flex | 굵기·폭·기울기·광학 크기 등을 조절하는 가변 서체 | 영문 키네틱 타이포그래피, 확장·압축을 표현하는 단어 | 한글 서체로 취급하지 않는다. 글자 폭이 변할 때 주변 배치를 함께 설계한다 |

출처:

- [Paperlogy 제작자 배포처](https://freesentation.blog/paperlogyfont)
- [Black Han Sans 공식 배포 설명](https://raw.githubusercontent.com/google/fonts/main/ofl/blackhansans/DESCRIPTION.en_us.html)
- [Dongle 공식 배포 설명](https://raw.githubusercontent.com/google/fonts/main/ofl/dongle/DESCRIPTION.en_us.html)
- [Gowun Batang 공식 배포 설명](https://raw.githubusercontent.com/google/fonts/main/ofl/gowunbatang/DESCRIPTION.en_us.html)
- [Space Grotesk 제작자 저장소](https://github.com/floriankarsten/space-grotesk)
- [Roboto Flex 제작 저장소](https://github.com/googlefonts/roboto-flex), [공식 배포 가변 축 목록](https://github.com/google/fonts/blob/main/ofl/robotoflex/METADATA.pb)

## 테마에 반영할 규칙

테마는 제목·본문·숫자·움직임에 사용할 서체와 실제 굵기를 지정한다. 한 샷에서는 주로 두 서체 이내로 구성하며 숫자 역할이 꼭 필요한 경우에만 추가한다. 여러 후보를 샷마다 무작위로 섞지 않는다.

| 테마/목적 | 제목 후보 | 설명 | 숫자/영문 |
|---|---|---|---|
| 리포트 | Paperlogy Bold | Pretendard | Paperlogy 또는 Space Grotesk의 고정폭 숫자 |
| 제품 시연 | Paperlogy Bold | Pretendard | Space Grotesk |
| 학습 | Paperlogy, 친근한 대상이면 Jua | Pretendard | 본문과 같은 계열 |
| 캠페인 | Black Han Sans | Pretendard | Roboto Flex 또는 제목과 어울리는 굵은 영문 |
| 스토리 | Gowun Batang Bold | Pretendard | 제목보다 조용한 산세리프 |

가변 서체는 글자를 이미지처럼 늘리지 않고 서체가 제공하는 축을 조절한다. 굵기 변화는 강조, 폭 변화는 압축·확장 같은 의미와 연결한다. 한글 가변 서체에 영문 서체의 폭 축이 있다고 가정하지 않는다. 본문과 작은 숫자에는 의미 없는 출렁임을 넣지 않는다.

## 라이선스와 재현성

후보 7종은 공식 배포 자료에서 OFL을 확인했다. OFL 글꼴을 플러그인에 동봉할 때 저작권 표시와 라이선스 원문을 함께 포함한다. 글꼴 단독 판매와 수정본의 예약 이름 조건도 원문을 따른다. 영상에 글자를 사용하는 일과 폰트 파일을 배포하는 일은 구분한다.

- [OFL 공식 FAQ](https://openfontlicense.org/ofl-faq/)
- [Black Han Sans 라이선스](https://raw.githubusercontent.com/google/fonts/main/ofl/blackhansans/OFL.txt)
- [Dongle 라이선스](https://raw.githubusercontent.com/google/fonts/main/ofl/dongle/OFL.txt)
- [Gowun Batang 라이선스](https://raw.githubusercontent.com/google/fonts/main/ofl/gowunbatang/OFL.txt)
- Paperlogy·Space Grotesk·Roboto Flex는 위 제작자 배포처의 라이선스 안내를 확인했다.

플러그인에 적용할 때 파일 버전·해시·글리프 범위와 라이선스를 함께 기록한다. 브라우저의 폰트 로드 완료만으로 글리프 지원을 증명하지 않는다. 실제 문장의 모든 문자를 검사하고 누락이 있으면 지원하는 서체로 문장 전체를 바꾸거나 대체한 문자를 보고한다. 임의의 시스템 폰트로 조용히 바뀌지 않게 한다.

동일한 문장으로 서체를 비교한 뒤 실제 주제와 문장으로 가로·세로 영상을 검토한다. 제목의 글자 폭을 대략적인 글자 수만으로 추정하지 말고 로드한 글꼴로 측정한다. 결과 영상의 축소 화면에서도 한글 받침과 숫자를 구분할 수 있어야 한다.

구현: `motion-font-data.js`는 동봉 파일의 cmap과 가변 축, 해시를 저장한다. `motion-fonts.js`는 실제 텍스트가 선택 서체에 없는 경우 문장 전체에 Pretendard를 적용하고 준비 기록에 대체 사실을 기록한다. Pretendard에도 문자가 없으면 누락 문자를 알려 준다. 테마 렌더러는 로드한 폰트의 Canvas 측정값으로 줄을 나눈다. 기존 팔레트 전용 샷은 기존 서체를 유지한다.

## 재생 평가 후 조정

친근한 테마의 긴 문장에서는 Dongle의 분리된 받침 형태가 읽는 속도를 늦췄다. 기본 서체를 Jua로 바꿨다. Dongle은 짧은 장식 문구를 위한 후보로 유지한다. [Jua 공식 배포 설명](https://raw.githubusercontent.com/google/fonts/main/ofl/jua/DESCRIPTION.en_us.html)은 한글과 영문 지원을 명시하며 [OFL 원문](https://raw.githubusercontent.com/google/fonts/main/ofl/jua/OFL.txt)을 함께 동봉했다. 실제 문장의 지원 여부는 다른 서체와 같은 cmap 검사로 확인한다.
