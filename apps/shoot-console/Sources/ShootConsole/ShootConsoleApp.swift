import AppKit
import SwiftUI
import UniformTypeIdentifiers

@main
struct ShootConsoleApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var app = AppState()

    var body: some Scene {
        WindowGroup("ShootConsole") {
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
                Button("Open script…") { app.openScriptPanel() }
                    .keyboardShortcut("o", modifiers: .command)
                Button("Scripts and recordings") { app.showLibrary.toggle() }
                    .keyboardShortcut("l", modifiers: .command)
                    .disabled(app.script == nil)
            }
            CommandMenu("Shoot") {
                Button(app.recorder.isRecording ? "Stop recording" : "Start recording") { app.toggleRecording() }
                    .keyboardShortcut("r", modifiers: [.command, .option, .control])
                Divider()
                Button("Next scene") { app.goNext() }
                    .keyboardShortcut(.rightArrow, modifiers: .command)
                Button("Previous scene") { app.goPrev() }
                    .keyboardShortcut(.leftArrow, modifiers: .command)
                Button("Redo this scene") { app.markRetake() }
                    .keyboardShortcut("\\", modifiers: [.command, .option])
                Divider()
                Toggle("Always in front", isOn: Binding(
                    get: { delegate.floatOnTop },
                    set: { delegate.floatOnTop = $0 }
                ))
                Button("Move to the secondary display") { delegate.moveToSecondaryDisplay() }
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

    /// When script.md is opened with this app from Finder, or with
    /// `open -a ShootConsole script.md`.
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first else { return }
        Task { @MainActor in
            // The window may not exist yet, so hand it over a beat later.
            try? await Task.sleep(for: .milliseconds(150))
            app?.load(url: url)
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        // Blocks quitting mid-recording. record.sh spawns under nohup, so
        // screencapture keeps running even when the app dies, and the pid file
        // becomes the only way to stop it.
        guard let app, app.recorder.isRecording else { return .terminateNow }
        let alert = NSAlert()
        alert.messageText = "Recording is in progress"
        alert.informativeText = """
        Quitting now leaves the recording running in the background. Stop it and quit?

        If you quit anyway, you have to stop it from a terminal with:
        record.sh stop \(app.recorder.outputURL?.path ?? "<recording file>")
        """
        alert.addButton(withTitle: "Stop and quit")
        alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: "Quit anyway")

        switch alert.runModal() {
        case .alertFirstButtonReturn:
            Task { @MainActor in
                app.toggleRecording()
                // Watching isBusy alone isn't enough — toggleRecording makes a
                // Task inside and returns right away, so at this point the state
                // is still .recording and isBusy is false. Left that way the loop
                // exits without a single pass and the app dies without stopping
                // the recording. The real condition for the stop being finished
                // is "not recording and not busy".
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

    // MARK: - Window

    func configureWindow() {
        // This can fire before WindowGroup puts the window up, so defer a beat.
        DispatchQueue.main.async { [weak self] in
            guard let self, let window = self.window else { return }
            window.title = "ShootConsole"
            window.titlebarAppearsTransparent = true

            // Place it once and the next shoot reuses that spot. Only send it
            // to the secondary display when there's no saved frame — snapping a
            // window the user moved back into place would mean rearranging it
            // every time.
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
            // Ask after the window is up — the permission dialog only appears
            // with the app on screen.
            self.app?.refreshPermissions()
        }
    }

    private func applyWindowLevel() {
        // Keeps the script from being covered when another window (a storyboard,
        // say) opens on the secondary display.
        window?.level = floatOnTop ? .floating : .normal
    }

    /// Moves the script window to the center of a display other than the main one.
    ///
    /// Recording only takes the main display (-D 1 in record.sh), so a window on
    /// the secondary screen never enters the frame at all. This is the first and
    /// surest defense.
    func moveToSecondaryDisplay() {
        guard let window else { return }
        let mainID = CGMainDisplayID()
        let key = NSDeviceDescriptionKey("NSScreenNumber")
        let secondary = NSScreen.screens.first {
            ($0.deviceDescription[key] as? CGDirectDisplayID) != mainID
        }
        guard let secondary else { return }   // leave it where it is on a single monitor

        let visible = secondary.visibleFrame
        var frame = window.frame
        frame.size.width = min(frame.width, visible.width - 40)
        frame.size.height = min(frame.height, visible.height - 40)
        frame.origin.x = visible.midX - frame.width / 2
        frame.origin.y = visible.midY - frame.height / 2
        window.setFrame(frame, display: true)
    }

    /// Excludes the window from screen capture, but only while recording.
    ///
    /// Placement on the secondary display is the main defense; this is the
    /// insurance — for a single monitor, or a window the user moved onto the main
    /// display. Leaving it on all the time would keep the app out of ordinary
    /// screenshots too, which is its own nuisance, so it only applies while
    /// recording.
    func setHiddenFromCapture(_ hidden: Bool) {
        window?.sharingType = hidden ? .none : .readOnly
    }
}
