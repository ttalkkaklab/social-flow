# 영상 모델 API 스키마 비교: LTX-2.5 Pro · MiniMax H3 · HeyGen Video 1

기준일: 2026-11-18. 세 모델의 공식 API 문서를 모델별로 따로 조사했다. 유료 호출은 하지 않았다.

- [LTX-2.5 Pro](ltx-2.5-pro.md)
- [MiniMax H3](minimax-h3.md)
- [HeyGen Video 1](heygen-video-1.md)

## 결론

- **목소리 샘플을 받는 건 MiniMax H3와 HeyGen Video 1이다.** 둘 다 `reference_audio`를 최대 3개 받아서
  social-flow의 `reference` 레인 후보가 된다. LTX-2.5 Pro는 음성 참조 입력이 없다. `audio-to-video`로 TTS
  트랙을 영상에 입히는 `supplied` 레인만 맡을 수 있다.
- **공식 API로는 H3와 HeyGen 모두 MSR식 호출이 안 된다.** 첫 프레임 고정과 음성 참조를 한 요청에 넣을 수 없다.
  H3는 `first_frame`과 `reference_*` role이 상호 배타이고, HeyGen은 `image_to_video`와 `reference_to_video`가
  별개의 `mode`다. 그래서 샷 시작 이미지는 참조 이미지로만 들어가고 첫 프레임이 그 이미지와 같다는 보장이 없다.
  OpenRouter의 HeyGen 스키마는 `first_frame`과 오디오 참조를 한 요청에 받지만(2차) 실제로 둘이 함께 적용되는지는
  확인하지 못했다.
- **같은 목소리가 여러 생성에서 유지된다고 공식 문서가 주장하는 모델은 하나도 없다.** LTX는 한 번의 생성 안에서
  컷을 이을 때만 목소리 일관성을 말한다. 어댑터를 만들기 전에 실제 대사 샷으로 들어 봐야 한다.
- **`reference` 레인 단가는 HeyGen과 H3의 차이가 크지 않다.** 768p 참조 모드 기준 HeyGen은 $0.05/s(프로모션,
  11-30까지), 12-01부터 $0.06/s다. H3는 $0.08/s이고 하위 모델 `MiniMax-H3-Lite`는 $0.04/s,
  `MiniMax-H3-Highspeed`는 $0.06/s다. 두 회사 모두 이미지·오디오 참조는 무료이고(H3는 이미지 5장까지) 참조
  영상은 입력 초까지 과금한다. HeyGen이 확실히 싼 건 참조를 쓰지 않는 T2V·I2V(768p $0.018 → $0.03)뿐이다.
- **MiniMax H3 오픈 웨이트 라이선스는 대한민국을 Excluded Territories로 둔다.** Section I.5에
  "the Republic of Korea"가 들어 있다(원문 직접 확인). 이 지역에서 쓰려면 별도 신청서로 허가를 받아야 한다.
  API는 전 세계에 제공된다. 로컬 어댑터 `fasth3_omni_reference`의 모델 가중치도 같은 라이선스를 따른다고
  [docs/fasth3-omni.md](../../fasth3-omni.md)에 적혀 있다. 국내 사용 여부는 법률 검토가 필요하다.

## 비교표

| 항목 | LTX-2.5 Pro | MiniMax H3 | HeyGen Video 1 |
|---|---|---|---|
| 생성 엔드포인트 | `POST https://api.ltx.io/v2/{text,image,audio}-to-video` | `POST https://api.minimax.io/v2/video_generation` 하나 | `POST https://api.heygen.com/v3/models/videos` 하나 |
| 인증 | Bearer | Bearer | `x-api-key` |
| 모드 구분 | 엔드포인트 경로 | `content[].role` | `mode` 필드 |
| 결과 수신 | 폴링 (웹훅 없음) | 폴링 또는 `callback_url` | 폴링 또는 웹훅 |
| 길이 | 6·8·10초 | 4–15초 정수 (Max 5–15) | 5–30초 정수 또는 `"auto"` |
| 해상도 | 720p·1080p·1440p·4K 고정 목록 | 768p, 2K (2K는 `MiniMax-H3`만) | 480p·768p·1080p·2k |
| 끝 프레임 | `last_frame_uri` | `last_frame` role | `end_image` (`image_to_video`) |
| `seed` | 없음 | 없음 | 있음 (uint32) |
| 참조 입력 | 없음 | 이미지 9·영상 3·오디오 3 | 이미지 9·영상 3·오디오 3 |
| 첫 프레임 + 음성 참조 동시 | 해당 없음 | 불가 | 불가 (공식 API) |
| social-flow 레인 | `supplied` (A2V), 나머지 `none` | `reference` | `reference` |
| 초당 가격, 참조 없음 | 720p $0.12, 1080p $0.17 | 768p $0.08, 2K $0.13 | 768p $0.018 → 12월 $0.03 |
| 초당 가격, 레인 기준 | A2V 720p $0.12 (입력 오디오 초) | 참조 768p $0.08 | 참조 768p $0.05 → 12월 $0.06 |
| 작업·결과 보존 | 상태 24시간, URL 만료 미상 | 조회 7일, 업로드 파일 7일 | 서명 URL, 만료 미상 |
| 한국어 대사 | 근거 없음 | 모델 카드의 안정 지원 11개 언어에 포함 | 근거 없음 |
| AA 이미지→영상 Elo | 912 | 1134 | 1124 |

`1792x1024`(플러그인 LTX 기본값)를 그대로 받는 모델은 없다. 세부 필드, 오류 코드, 레이트 리밋과 출처는 각 문서에 있다.

## 셋 다 확인하지 못한 것

- 여러 생성 사이의 목소리 일관성
- 한국어 대사의 실제 품질 (H3도 모델 카드 문구 말고는 근거가 없다)

## 관련 조사

- [영상 모델 API 가격 비교 (2026-10-18)](../2026-10-18-video-model-api-pricing/README.md)
- [LTX-2.5 API와 ASTRA 도구 옵션 대조 (2026-10-17)](../2026-10-17-ltx-2.5-api-audit/README.md)
- [LTX 목소리 일관성 (2026-10-17)](../2026-10-17-ltx-voice-consistency/README.md)
