import AppKit
import SwiftUI
import UniformTypeIdentifiers

@main
struct ShootConsoleApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var app = AppState()

    var body: some Scene {
        WindowGroup("촬영 콘솔") {
            ContentView()
                .environment(app)
                .onAppear {
                    delegate.app = app
                    delegate.configureWindow()
                }
                .onDrop(of: [.fileURL], isTargeted: nil) { providers in
                    loadDropped(providers)
                }
                .onChange(of: app.recorder.isRecording) { _, recording in
                    delegate.setHiddenFromCapture(recording)
                }
        }
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("대본 열기…") { app.openScriptPanel() }
                    .keyboardShortcut("o", modifiers: .command)
                Button("대본·녹화 목록") { app.showLibrary.toggle() }
                    .keyboardShortcut("l", modifiers: .command)
                    .disabled(app.script == nil)
            }
            CommandMenu("촬영") {
                Button(app.recorder.isRecording ? "녹화 정지" : "녹화 시작") { app.toggleRecording() }
                    .keyboardShortcut("r", modifiers: [.command, .option, .control])
                Divider()
                Button("다음 씬") { app.goNext() }
                    .keyboardShortcut(.rightArrow, modifiers: .command)
                Button("이전 씬") { app.goPrev() }
                    .keyboardShortcut(.leftArrow, modifiers: .command)
                Button("이 씬 다시") { app.markRetake() }
                    .keyboardShortcut("\\", modifiers: [.command, .option])
                Divider()
                Toggle("항상 맨 앞에", isOn: Binding(
                    get: { delegate.floatOnTop },
                    set: { delegate.floatOnTop = $0 }
                ))
                Button("보조 모니터로 옮기기") { delegate.moveToSecondaryDisplay() }
            }
        }
    }

    private func loadDropped(_ providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first else { return false }
        _ = provider.loadObject(ofClass: URL.self) { url, _ in
            guard let url else { return }
            Task { @MainActor in app.load(url: url) }
        }
        return true
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    var app: AppState?

    var floatOnTop = true {
        didSet { applyWindowLevel() }
    }

    private var window: NSWindow? { NSApp.windows.first { $0.isVisible && $0.contentView != nil } }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    /// Finder 에서 script.md 를 이 앱으로 열거나 `open -a 촬영콘솔 script.md` 했을 때.
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first else { return }
        Task { @MainActor in
            // 창이 아직 없을 수 있어 한 박자 뒤에 넣는다.
            try? await Task.sleep(for: .milliseconds(150))
            app?.load(url: url)
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        // 녹화 중 종료를 막는다. record.sh 는 nohup 으로 띄우므로 앱이 죽어도
        // screencapture 는 계속 돌고, 정지할 방법이 pid 파일밖에 남지 않는다.
        guard let app, app.recorder.isRecording else { return .terminateNow }
        let alert = NSAlert()
        alert.messageText = "녹화 중입니다"
        alert.informativeText = """
        지금 끄면 녹화가 백그라운드에 남습니다. 정지하고 나가시겠습니까?

        그냥 종료하면 터미널에서 아래로 멈춰야 합니다:
        record.sh stop \(app.recorder.outputURL?.path ?? "<녹화파일>")
        """
        alert.addButton(withTitle: "정지하고 종료")
        alert.addButton(withTitle: "취소")
        alert.addButton(withTitle: "그냥 종료")

        switch alert.runModal() {
        case .alertFirstButtonReturn:
            Task { @MainActor in
                app.toggleRecording()
                // isBusy 만 보면 안 된다 — toggleRecording 은 안에서 Task 를 만들고
                // 바로 돌아오므로, 이 시점의 상태는 아직 .recording 이고 isBusy 는
                // false 다. 그대로 두면 루프가 한 바퀴도 안 돌고 빠져나가 녹화를
                // 멈추지 않은 채 앱이 죽는다. 정지가 실제로 끝나는 조건은
                // "녹화 중도 아니고 작업 중도 아닐 때" 다.
                while app.recorder.isRecording || app.recorder.isBusy {
                    try? await Task.sleep(for: .milliseconds(200))
                }
                NSApp.reply(toApplicationShouldTerminate: true)
            }
            return .terminateLater
        case .alertThirdButtonReturn:
            return .terminateNow
        default:
            return .terminateCancel
        }
    }

    // MARK: - 창

    func configureWindow() {
        // WindowGroup 이 창을 올리기 전에 불릴 수 있어 한 박자 미룬다.
        DispatchQueue.main.async { [weak self] in
            guard let self, let window = self.window else { return }
            window.title = "촬영 콘솔"
            window.titlebarAppearsTransparent = true

            // 한 번 자리를 잡아두면 다음 촬영에도 그대로 쓴다. 저장된 배치가
            // 없을 때만 보조 모니터로 보낸다 — 사용자가 옮겨둔 창을 되돌리면
            // 매번 다시 배치해야 한다.
            let hadSavedFrame = window.setFrameUsingName("shootConsoleWindow")
            window.setFrameAutosaveName("shootConsoleWindow")
            if !hadSavedFrame {
                window.setContentSize(NSSize(width: 1080, height: 900))
                self.moveToSecondaryDisplay()
            }
            self.applyWindowLevel()

            let failures = self.app?.installHotkeys() ?? []
            self.app?.hotkeyFailures = failures
            self.app?.isSingleDisplay = NSScreen.screens.count < 2
            // 창이 올라온 뒤에 묻는다 — 권한 대화상자는 앱이 화면에 떠 있어야 뜬다.
            self.app?.refreshPermissions()
        }
    }

    private func applyWindowLevel() {
        // 보조 모니터에 다른 창(스토리보드 등)을 띄워도 대본이 가리지 않게 한다.
        window?.level = floatOnTop ? .floating : .normal
    }

    /// 대본 창을 메인이 아닌 화면 가운데로 옮긴다.
    ///
    /// 녹화는 메인 디스플레이만 담으므로(record.sh 의 -D 1), 창이 보조 화면에
    /// 있으면 프레임에 아예 들어오지 않는다. 이게 1차이자 가장 확실한 방어다.
    func moveToSecondaryDisplay() {
        guard let window else { return }
        let mainID = CGMainDisplayID()
        let key = NSDeviceDescriptionKey("NSScreenNumber")
        let secondary = NSScreen.screens.first {
            ($0.deviceDescription[key] as? CGDirectDisplayID) != mainID
        }
        guard let secondary else { return }   // 단일 모니터면 그대로 둔다

        let visible = secondary.visibleFrame
        var frame = window.frame
        frame.size.width = min(frame.width, visible.width - 40)
        frame.size.height = min(frame.height, visible.height - 40)
        frame.origin.x = visible.midX - frame.width / 2
        frame.origin.y = visible.midY - frame.height / 2
        window.setFrame(frame, display: true)
    }

    /// 녹화 중에만 창을 화면 캡처에서 제외한다.
    ///
    /// 보조 모니터 배치가 주된 방어이고 이건 보험이다 — 단일 모니터이거나 창을
    /// 메인으로 옮겨 뒀을 때를 대비한다. 평소에도 켜두면 스크린샷에 앱이 안 찍혀
    /// 오히려 곤란하므로 녹화 중에만 건다.
    func setHiddenFromCapture(_ hidden: Bool) {
        window?.sharingType = hidden ? .none : .readOnly
    }
}
