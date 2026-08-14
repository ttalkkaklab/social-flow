# 쇼츠 세로 표면(`oar*`) 프레임 지정 — 채널 전용 Android 에뮬레이터 adb 절차

`thumbnailFilePath`(`thumbnails.set` API)는 **가로 표면**(hq720/maxresdefault —
검색결과·링크 미리보기·임베드·일반 추천)만 바꾼다. 쇼츠 피드·채널 쇼츠 탭·검색
쇼츠 결과가 쓰는 **세로 프레임(`oar*`)은 YouTube 네이티브 앱의 프레임 선택으로만**
바뀐다(API·웹 스튜디오 불가 — fect 2026-07-27 실측, 딸깍랩 2026-08-13 재확인).
미지정이면 YouTube 가 영상 중간의 임의 프레임을 자동 선택해 쇼츠 첫 화면에
노출한다. YouTube 게시는 이 단계까지 끝나야 완료다(publish SKILL §3).

> 2026-07-27 부터 YouTube 가 쇼츠 커스텀 썸네일 업로드(데스크톱 스튜디오)를 공식
> 지원하기 시작했지만 YPP 채널부터 점진 적용이다 — 비 YPP 채널은 이 절차가 유일하다.

## 선행 조건 — 채널 전용 AVD

- **AVD 는 채널(운영 브랜드)마다 분리한다.** 채널 소유 Google 계정이 채널마다
  다르므로, 다른 채널·프로젝트의 AVD 를 재사용하면 남의 계정으로 편집하는 사고가
  난다. AVD 이름과 로그인 계정은 그 채널의 `data/<채널>/profile.md` §4 에 적어 둔다
  (예: 딸깍랩 = `Ttalkkak_Phone_API36`).
- AVD 는 **Play Store 이미지**(YouTube 사전 설치)로 만든다:
  `avdmanager create avd -n <이름> -k "system-images;android-36;google_apis_playstore;arm64-v8a" -d medium_phone`
- **스냅샷 저장 모드로 띄운다** — `-no-snapshot-save` 로 띄우면 종료 시 로그인·PIN
  이 유실된다(fect 실측: 세팅 전체가 소멸해 재로그인부터 다시 했다).
- **PIN 을 계정 추가 전에 설정한다**: `adb shell locksettings set-pin 1234`.
  Workspace 조직 정책(`DeviceManagementScreenlockRequired`)이 있으면 PIN 부재 시
  계정이 목록에 아예 안 뜬다.
- 계정 추가(사용자 개입 필요 — 비밀번호·2단계 인증):
  `adb shell am start -a android.settings.ADD_ACCOUNT_SETTINGS` → Google →
  "Sign in with ease"(전화번호 조회)는 **NEXT → 실패 → SIGN IN ANOTHER WAY** 로
  지나간다(SKIP 은 흐름 전체를 닫고 홈으로 튕긴 실측 있음). 이메일은 adb 로 채우고
  비밀번호부터 사용자에게 넘긴다.
- **사전 설치 YouTube 가 구버전이면 실행을 거부한다**("Update available" 화면만
  뜸 — 2026-08-13 실측, 19.x). 로그인 후 Play Store 에서 업데이트한다(수 분,
  `dumpsys package com.google.android.youtube | grep versionName` 폴링으로 완료 판정).
- YouTube 앱 → 아바타 → Switch accounts → **채널(브랜드) 행**을 선택한다 —
  이메일 행이 아니라 채널명이 적힌 행이다. 게시·편집의 주체가 여기서 결정된다.

## 절차 (영상당 ~60초)

아래는 2026-08-14 딸깍랩 회차에서 **끝까지 돌려 성공한 경로**다(1080×2400 · API 36).
좌표는 그때 실측값이니 참고만 하고, 화면마다 `uiautomator dump` 로 다시 뽑는다.

1. `emulator -avd <채널 AVD>` — 스냅샷 유지로 띄운다(`-no-snapshot-save` 금지).
   부팅 대기는 `until [ "$(adb shell getprop sys.boot_completed|tr -d '\r')" = 1 ]`.
   **진입 전에 `adb shell date` 를 먼저 확인한다**(아래 시계 함정).
2. **앱은 `am start -n` 으로 띄운다.**

   ```bash
   adb shell am start -n com.google.android.youtube/com.google.android.apps.youtube.app.WatchWhileActivity
   ```

   ⚠ `monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1` 은
   **Play 스토어의 YouTube 상세 페이지**를 열어 버린다(2026-08-14 실측). 그걸 앱
   화면으로 오인하고 좌표를 찍으면 엉뚱한 데를 누른다.
3. 하단 **You**(≈972,2274) → **Your videos**(≈550,1714) → 채널 페이지 영상 그리드.
4. 대상 영상 타일의 **More actions(⋮)** → **Edit** → Edit video 화면.
   - ⚠ **쇼츠 플레이어의 상단 ⋮ 는 쓰지 마라** — "Swipe up for next video"
     코치마크가 반복 출현하며 상단 행 탭을 전부 삼킨다. 채널 페이지 경로만 신뢰 가능.
   - 그리드 타일마다 `More actions` 가 따로 있다 — **덤프 순서가 아니라 x 좌표로**
     대상 타일을 고른다(첫 타일 ≈323, 둘째 ≈684, 셋째 ≈1045).
5. **Edit thumbnail**(연필 ≈85,274) → 프레임 피커 → 목표 프레임 → 체크(✓ ≈985,141)
   → **Save**(≈946,125) → "Video updated".
   - **목표 프레임은 커버 완성 시각이다** — 이 파이프라인의 커버는 첫 카드지만
     히어로 수치는 몇 초 뒤에 완성된다(드롭쉬핑 회차 "0원" 등장 ~6초, 홈페이지 회차
     6.5초). 프레임 피커 **첫 칸(t=0)으로는 수치가 안 잡힌다.** 시각은
     `produce` 가 `cover.jpg` 를 뽑은 그 시각(`build-report.txt` 커버 전환 완료)을 쓴다.
   - **눈대중으로 스크럽하지 말고 플레이헤드가 스스로 말하는 시각을 읽는다.**
     필름스트립 `android.widget.SeekBar` 의 `content-desc` 가
     `Playhead selected at 0 minutes 6 seconds out of 1 minute 25 seconds` 형태로
     **현재 시각을 초 단위로 알려 준다**(2026-08-14 발견). 끌 때마다 이걸 읽으면
     스크린샷 판독 없이 목표 초에 정확히 맞춘다.

     ```bash
     readtime(){ adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
                 adb pull /sdcard/ui.xml .work/ui.xml >/dev/null 2>&1
                 grep -o 'Playhead selected at [^"]*' .work/ui.xml | head -1; }
     adb shell input swipe 81 2240 112 2240 500; sleep 2; readtime   # → 2 seconds
     adb shell input swipe 112 2240 140 2240 500; sleep 2; readtime  # → 5 seconds
     adb shell input swipe 140 2240 156 2240 500; sleep 2; readtime  # → 6 seconds
     ```

     실측 눈금(85초 영상 · 필름스트립 x 32~1048): t=0 은 핸들 중심 x≈81 이고,
     앞 구간은 **1초에 약 9~15px** 다. 목표 x ≈ `81 + (t/총길이) × 918` 로 잡고
     시작해 위 루프로 다듬는다.
   - **한 번에 크게(60px 이상) 끌면 피커가 `Unable to preview the video` 로 죽고
     체크가 무반응이 된다** — 30px 안팎으로 나눠 끈다. 죽으면 에디터를 X 로 닫고
     재진입해야 한다.
   - 체크(✓) 전에 **screencap 으로 미리보기가 커버인지 눈으로 확인**한다.
     여기서 틀린 프레임을 승인하면 200 은 뜨는데 내용이 틀린다.
   - 좌표는 기기·앱 버전마다 다르다 — **`uiautomator dump` 로 매번 재추출**한다.
     키보드가 올라오면 버튼 위치가 통째로 밀린다(이메일 입력에서 NEXT 를 눌렀는데
     "." 키가 눌린 실측) — 화면 상태 확인 없이 좌표를 연타하지 말 것.
6. 판정: `curl -s -o oar.jpg -w "%{http_code}" "https://i.ytimg.com/vi/<videoId>/oardefault.jpg"`
   → **200 = 적용**. 내려받아 내용까지 눈으로 확인한다(200 은 "어떤" 세로 프레임이
   걸렸다는 뜻이지 "맞는" 프레임이라는 뜻이 아니다). 크기가 **1080×1920** 이면 세로
   프레임이 맞다.
   - **Save 직후 바로 200 이 된다** — 2026-08-14 실측은 저장 8초 뒤 첫 조회에서 200.
     404 가 계속 나오면 기다릴 게 아니라 Save 가 안 먹은 것이다(에디터 재진입).
   - `oar1`/`oar2`·웹 채널 그리드는 며칠씩 구 프레임을 돌려준다 — **판정 근거는
     oardefault 200 하나뿐**. 재작업하지 말고 캐시 수렴을 기다린다.
   - 프레임 지정 후 `maxresdefault` 는 선택 프레임의 레터박스판으로 바뀐다 —
     내용이 커버면 정상이니 `thumbnails.set` 으로 "고치지" 마라. 가로 전용 16:9 를
     다시 올리면 **oardefault 가 404 로 되돌아간다**(fect 2026-08-11 실측 — 둘을
     동시에 가질 수 없으므로 세로를 택한다).

## 함정

- **게스트 시계가 틀리면 체크(✓) 탭이 무조건 `Unable to preview the video` 로
  죽는다**(스냅샷 복원 직후 NTP 재동기화 전 상태). 미리보기 로드는 정상이라
  오진하기 쉽다. `adb shell cmd network_time_update_service force_refresh` →
  `am force-stop com.google.android.youtube` 후 재진입.
- **PIN/잠금 설정 화면을 지나면 `screencap` 이 전면 검정**(FLAG_SECURE 잔존) —
  `uiautomator dump` 는 정상이므로 덤프로 항행하거나, 잠금(keyevent 26)→해제
  (keyevent 224 + 스와이프 + PIN) 1사이클로 해소한다.
- 알림 권한 다이얼로그·코치마크 등 첫 실행 오버레이가 탭을 가로챈다 — 단계마다
  screencap(밝기 검사 포함) 또는 uiautomator dump 로 확인 후 진행한다.
- 계정 전환 후 첫 진입에서 Edit 화면이 홈으로 튕기는 회차가 있다 — 채널 페이지부터
  다시 들어가면 된다.
- **업로드 직후에는 채널 그리드에 새 영상이 안 보이고 프레임 피커도 불안정하다** —
  API `processingStatus: succeeded` 여도 그렇다. `am force-stop` 후 재진입하면
  그리드는 갱신되고, 피커는 업로드 후 5분쯤 지나면 안정된다(fect 실측).
- 검증 스크린샷·좌표 실측 로그는 세션 스크래치패드에 두고, 완료 보고에는 videoId
  별 oardefault 코드를 표로 적는다.
