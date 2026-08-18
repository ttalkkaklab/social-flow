import AppKit
import Foundation
import Observation

@MainActor
@Observable
final class AppState {

    var script: ShootScript?
    var loadError: String?
    /// Current scene position (0-based).
    var sceneIndex: Int = 0
    /// Line text scale — adjust for the distance to the secondary display.
    var textScale: Double = UserDefaults.standard.object(forKey: "textScale") as? Double ?? 1.0 {
        didSet { UserDefaults.standard.set(textScale, forKey: "textScale") }
    }
    var showPrep = false
    var showSettings = false
    /// On when reopening the library with a script still loaded — to move on
    /// to the next topic, pick from the list instead of opening a file dialog.
    var showLibrary = false
    /// Labels of shortcuts another app grabbed first, so registration failed.
    /// Empty means everything is fine.
    var hotkeyFailures: [String] = []
    /// With only one display, the app window ends up in the recording — warn.
    var isSingleDisplay = false
    /// Screen recording permission is missing — recording won't even start.
    var screenPermissionMissing = false
    /// Microphone denied — the screen gets recorded but the voice is missing.
    /// The accident you notice last.
    var micPermissionDenied = false
    /// Path of the last saved scene-mark file — used for guidance after the shoot.
    var savedMarksPath: String?

    let recorder = Recorder()
    let marks = MarkLog()
    let library = Library()

    /// When the current scene was entered (seconds from recording start).
    /// Used for the per-scene elapsed display.
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

    /// Whether this scene has run past its target length — going over isn't
    /// wrong by itself, but editing warns on scenes over 20 seconds, so this
    /// is the signal to notice while still filming.
    var isOverTarget: Bool {
        guard recorder.isRecording, let target = currentScene?.targetSeconds else { return false }
        return sceneElapsed > Double(target)
    }

    // MARK: - Script

    func openScriptPanel() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.plainText]
        panel.allowsOtherFileTypes = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.message = "Choose a shooting script (script.md)"
        panel.prompt = "Open"
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
            // If there are pre-shoot prep notes and rules, show them first —
            // reading them after recording has started is already too late
            // (clearing scrollback, Do Not Disturb, and so on).
            showPrep = !parsed.prep.isEmpty
        } catch {
            script = nil
            loadError = error.localizedDescription
        }
    }

    // MARK: - Folders

    /// Picks the script root or the save folder. Both use the same dialog.
    func chooseFolder(message: String, current: URL?, apply: @escaping (URL) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.message = message
        panel.prompt = "Choose"
        panel.directoryURL = current
        if panel.runModal() == .OK, let url = panel.url { apply(url) }
    }

    private func rememberRecent(_ url: URL) {
        var list = recentScripts.map(\.path)
        list.removeAll { $0 == url.path }
        list.insert(url.path, at: 0)
        UserDefaults.standard.set(Array(list.prefix(8)), forKey: "recentScripts")
    }

    // MARK: - Scene navigation

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

    /// The scene just went wrong — mark that the same scene starts over.
    func markRetake() {
        guard recorder.isRecording, let scene = currentScene else { return }
        let now = recorder.preciseElapsed
        sceneEnteredAt = now
        marks.add(scene: scene.number, title: scene.title, t: now, event: SceneMark.Event.retake)
    }

    // MARK: - Recording

    func toggleRecording() {
        Task {
            if recorder.isRecording {
                await stopRecording()
            } else if !recorder.isBusy {
                await startRecording()
            }
        }
    }

    /// Checks permission state, and asks if it was never asked before.
    ///
    /// Called on every app launch. If already denied, the system won't ask
    /// again, so the user isn't pestered — a banner tells them instead.
    func refreshPermissions() {
        Task {
            screenPermissionMissing = !(await Permissions.checkScreenCapture())
            await Permissions.requestMicrophone()
            micPermissionDenied = Permissions.microphoneStatus == .denied
        }
    }

    private func startRecording() async {
        // Block before calling record.sh. Without permission, screencapture
        // dies quietly with a single "failed to start" line, and that alone
        // doesn't tell the user what to turn on.
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
        // Save the marks *before* stopping — record.sh stop waits up to 20s for
        // the mov to finalize, and if the app dies in that window the marks are
        // lost wholesale.
        let recording = recorder.outputURL
        let startedAt = recorder.startedAt ?? Date()
        if let recording, let script {
            savedMarksPath = marks.save(
                recording: recording, script: script.url, topic: script.topic, startedAt: startedAt
            )?.path
        }
        await recorder.stop()
        // Put the fresh file in the library — right after the shoot the path
        // gets picked up and handed to ingest.
        library.refresh()
    }

    // MARK: - Hotkey wiring

    /// onAppear can fire again when the window comes back, and re-registering
    /// then fails wholesale with eventHotKeyExistsErr — combos we already hold —
    /// which would be misread as "conflicts".
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

// No confirmation sound on scene changes — a scene change is a "stop talking
// for one second" silence gap, and ingest finds the cut point in exactly that
// silence. A sound effect there breaks silence detection and shifts the scene
// boundary. Confirm the change on screen instead.
