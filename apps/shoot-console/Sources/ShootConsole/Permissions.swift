import AVFoundation
import AppKit
import CoreGraphics
import ScreenCaptureKit

// 화면 기록·마이크 권한.
//
// 시스템 설정 → 개인정보 보호 및 보안 → "화면 및 시스템 오디오 녹음" 목록에는
// 권한을 요청한 적이 있는 앱이 올라온다. 그런데 이 앱은 화면을 직접 캡처하지
// 않는다 — record.sh 가 띄우는 screencapture 가 한다. 그래서 앱 자신은 TCC 를
// 건드린 적이 없어 목록에 나타나지 않고, 켜줄 방법이 없다. 여기서 직접 묻는 이유다.
//
// 캡처를 자식 프로세스가 하는 건 그대로 둬도 된다. TCC 의 책임 프로세스는 스폰
// 시점에 정해져 nohup·disown 으로 부모가 바뀌어도 유지되므로, 앱에 권한이
// 붙으면 그 아래 screencapture 도 함께 통과한다.
//
// 실측(macOS 26.5) — 두 API 를 각자 잘하는 일에만 쓴다.
//   CGRequestScreenCaptureAccess()  등록도 프롬프트도 일어나지 않는다. 못 쓴다.
//   SCShareableContent 조회          앱을 목록에 등록시킨다. 단 권한이 없어도
//                                    성공해서 돌아오므로 판정에는 쓸 수 없다.
//   CGPreflightScreenCaptureAccess() 상태는 정확히 알려준다. 대신 묻지는 않는다.
enum Permissions {

    // MARK: - 화면 기록

    /// 지금 녹화할 수 있는지 확인하고, 권한이 없으면 등록을 시도한다.
    ///
    /// 사용자가 설정에서 켜도 이번 실행에는 반영되지 않는다 — macOS 가 앱을
    /// 다시 띄우라고 한다. 그래서 반환값은 "지금 찍을 수 있는가"이지 "사용자가
    /// 거부했는가"가 아니다.
    static func checkScreenCapture() async -> Bool {
        if CGPreflightScreenCaptureAccess() { return true }
        // 목록 등록을 노린 호출이다. 반환값·예외 여부는 보지 않는다.
        _ = try? await SCShareableContent.excludingDesktopWindows(
            false, onScreenWindowsOnly: true
        )
        return CGPreflightScreenCaptureAccess()
    }

    // MARK: - 마이크

    static var microphoneStatus: AVAuthorizationStatus {
        AVCaptureDevice.authorizationStatus(for: .audio)
    }

    /// 마이크도 사정이 같다 — screencapture -g 가 대신 잡으므로 앱은 물은 적이 없다.
    static func requestMicrophone() async {
        guard microphoneStatus == .notDetermined else { return }
        _ = await AVCaptureDevice.requestAccess(for: .audio)
    }

    // MARK: - 시스템 설정 열기

    static func openScreenCaptureSettings() { openPrivacyPane("Privacy_ScreenCapture") }
    static func openMicrophoneSettings() { openPrivacyPane("Privacy_Microphone") }

    /// 실측(macOS 26.5): 예전 com.apple.preference.security 주소는 설정 앱을
    /// 열기만 하고 "일반"에 떨어진다. 확장 번들 id 를 써야 해당 항목으로 간다.
    private static func openPrivacyPane(_ anchor: String) {
        guard let url = URL(
            string: "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?\(anchor)"
        ) else { return }
        NSWorkspace.shared.open(url)
    }
}
