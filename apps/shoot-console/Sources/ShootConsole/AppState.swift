import AppKit
import Foundation
import Observation

@MainActor
@Observable
final class AppState {

    var script: ShootScript?
    var loadError: String?
    /// 현재 씬 위치 (0부터).
    var sceneIndex: Int = 0
    /// 대사 글자 크기 배율 — 보조 모니터 거리에 맞춰 조절한다.
    var textScale: Double = UserDefaults.standard.object(forKey: "textScale") as? Double ?? 1.0 {
        didSet { UserDefaults.standard.set(textScale, forKey: "textScale") }
    }
    var showPrep = false
    var showSettings = false
    /// 대본을 열어둔 채로 목록을 다시 볼 때 켠다 — 다음 주제로 넘어가려고
    /// 파일 대화상자를 여는 대신 목록에서 고른다.
    var showLibrary = false
    /// 다른 앱이 선점해 등록하지 못한 단축키 표기. 비어 있으면 전부 정상.
    var hotkeyFailures: [String] = []
    /// 모니터가 하나뿐이면 앱 창이 녹화에 찍힌다 — 경고해야 한다.
    var isSingleDisplay = false
    /// 화면 기록 권한이 없다 — 이 상태로는 녹화 자체가 시작되지 않는다.
    var screenPermissionMissing = false
    /// 마이크가 거부된 상태 — 화면은 찍히는데 목소리만 빠진다. 가장 늦게 알아채는 사고다.
    var micPermissionDenied = false
    /// 마지막으로 저장한 씬 마크 파일 경로 — 촬영이 끝나면 안내에 쓴다.
    var savedMarksPath: String?

    let recorder = Recorder()
    let marks = MarkLog()
    let library = Library()

    /// 현재 씬에 들어온 시각(녹화 시작 기준 초). 씬별 경과 표시에 쓴다.
    private var sceneEnteredAt: TimeInterval = 0

    var recentScripts: [URL] {
        (UserDefaults.standard.array(forKey: "recentScripts") as? [String] ?? [])
            .map { URL(fileURLWithPath: $0) }
            .filter { FileManager.default.fileExists(atPath: $0.path) }
    }

    var currentScene: ShootScene? {
        guard let script, script.scenes.indices.contains(sceneIndex) else { return nil }
        return script.scenes[sceneIndex]
    }

    var sceneElapsed: TimeInterval {
        guard recorder.isRecording else { return 0 }
        return max(0, recorder.elapsed - sceneEnteredAt)
    }

    /// 이 씬의 목표 길이를 넘겼는지 — 넘겼다고 잘못된 건 아니고, 편집이 20초 넘는
    /// 씬을 경고하므로 촬영 중에 알아채라는 신호다.
    var isOverTarget: Bool {
        guard recorder.isRecording, let target = currentScene?.targetSeconds else { return false }
        return sceneElapsed > Double(target)
    }

    // MARK: - 대본

    func openScriptPanel() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.plainText]
        panel.allowsOtherFileTypes = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.message = "촬영 대본(script.md)을 고르세요"
        panel.prompt = "열기"
        if panel.runModal() == .OK, let url = panel.url {
            load(url: url)
        }
    }

    func load(url: URL) {
        do {
            let parsed = try ScriptParser.parse(url: url)
            script = parsed
            sceneIndex = 0
            loadError = nil
            savedMarksPath = nil
            showLibrary = false
            rememberRecent(url)
            // 촬영 전 준비·수칙이 있으면 먼저 보여준다 — 녹화를 시작하고 나서
            // 읽으면 이미 늦은 것들이다(스크롤백 비우기, 방해 금지 모드 등).
            showPrep = !parsed.prep.isEmpty
        } catch {
            script = nil
            loadError = error.localizedDescription
        }
    }

    // MARK: - 폴더

    /// 대본 뿌리·저장 폴더를 고른다. 둘 다 같은 대화상자를 쓴다.
    func chooseFolder(message: String, current: URL?, apply: @escaping (URL) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.message = message
        panel.prompt = "선택"
        panel.directoryURL = current
        if panel.runModal() == .OK, let url = panel.url { apply(url) }
    }

    private func rememberRecent(_ url: URL) {
        var list = recentScripts.map(\.path)
        list.removeAll { $0 == url.path }
        list.insert(url.path, at: 0)
        UserDefaults.standard.set(Array(list.prefix(8)), forKey: "recentScripts")
    }

    // MARK: - 씬 이동

    func goNext() { go(to: sceneIndex + 1) }
    func goPrev() { go(to: sceneIndex - 1) }

    func go(to index: Int) {
        guard let script, script.scenes.indices.contains(index), index != sceneIndex else { return }
        sceneIndex = index
        guard recorder.isRecording else { return }
        let now = recorder.preciseElapsed
        sceneEnteredAt = now
        let scene = script.scenes[index]
        marks.add(scene: scene.number, title: scene.title, t: now, event: SceneMark.Event.enter)
    }

    /// 방금 씬을 망쳤다 — 같은 씬을 다시 간다는 표시.
    func markRetake() {
        guard recorder.isRecording, let scene = currentScene else { return }
        let now = recorder.preciseElapsed
        sceneEnteredAt = now
        marks.add(scene: scene.number, title: scene.title, t: now, event: SceneMark.Event.retake)
    }

    // MARK: - 녹화

    func toggleRecording() {
        Task {
            if recorder.isRecording {
                await stopRecording()
            } else if !recorder.isBusy {
                await startRecording()
            }
        }
    }

    /// 권한 상태를 확인하고, 아직 물어본 적이 없으면 묻는다.
    ///
    /// 앱을 켤 때마다 부른다. 이미 거부된 상태면 시스템이 다시 묻지 않으므로
    /// 사용자를 귀찮게 하지 않는다 — 대신 배너로 알린다.
    func refreshPermissions() {
        Task {
            screenPermissionMissing = !(await Permissions.checkScreenCapture())
            await Permissions.requestMicrophone()
            micPermissionDenied = Permissions.microphoneStatus == .denied
        }
    }

    private func startRecording() async {
        // record.sh 를 부르기 전에 막는다. 권한이 없으면 screencapture 가 조용히
        // 죽고 "시작 실패" 한 줄만 남는데, 그것만 보고는 무엇을 켜야 하는지 모른다.
        guard await Permissions.checkScreenCapture() else {
            screenPermissionMissing = true
            return
        }
        screenPermissionMissing = false

        marks.reset()
        savedMarksPath = nil
        showPrep = false
        await recorder.start(topic: script?.topic)
        guard recorder.isRecording else { return }
        sceneEnteredAt = 0
        if let scene = currentScene {
            marks.add(scene: scene.number, title: scene.title, t: 0, event: SceneMark.Event.enter)
        }
    }

    private func stopRecording() async {
        if let scene = currentScene {
            marks.add(scene: scene.number, title: scene.title, t: recorder.preciseElapsed, event: SceneMark.Event.wrap)
        }
        // 마크는 정지 "전에" 저장한다 — record.sh stop 은 mov 확정까지 최대 20초
        // 기다리므로, 그 사이 앱이 죽으면 마크만 통째로 날아간다.
        let recording = recorder.outputURL
        let startedAt = recorder.startedAt ?? Date()
        if let recording, let script {
            savedMarksPath = marks.save(
                recording: recording, script: script.url, topic: script.topic, startedAt: startedAt
            )?.path
        }
        await recorder.stop()
        // 방금 찍은 파일을 목록에 올린다 — 촬영이 끝나면 바로 경로를 집어
        // ingest 로 넘기게 된다.
        library.refresh()
    }

    // MARK: - 단축키 연결

    /// 창이 다시 뜰 때 onAppear 가 또 불릴 수 있는데, 그때 재등록하면 이미 잡아둔
    /// 조합이라 전부 eventHotKeyExistsErr 로 실패해 "충돌" 로 오인된다.
    private var hotkeysInstalled = false

    func installHotkeys() -> [String] {
        guard !hotkeysInstalled else { return hotkeyFailures }
        hotkeysInstalled = true

        var failed: [String] = []
        let center = HotkeyCenter.shared
        func add(_ combo: HotkeyCenter.Combo, _ action: @escaping () -> Void) {
            let status = center.register(combo, action: action)
            if status != noErr { failed.append("\(combo.label)(\(status))") }
        }
        add(Hotkeys.toggleRecording) { [weak self] in self?.toggleRecording() }
        add(Hotkeys.nextScene) { [weak self] in self?.goNext() }
        add(Hotkeys.prevScene) { [weak self] in self?.goPrev() }
        add(Hotkeys.markRetake) { [weak self] in self?.markRetake() }
        return failed
    }
}

// 씬을 넘길 때 확인음을 내지 않는다 — 씬 전환은 "말을 멈추고 1초" 하는 무음
// 구간이고, ingest 가 바로 그 무음에서 컷 지점을 찾는다. 여기에 효과음이 섞이면
// 무음 검출이 깨져 씬 경계가 어긋난다. 넘어간 것은 화면으로 확인한다.
