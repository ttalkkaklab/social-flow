import AppKit
import SwiftUI

// While filming you glance at this screen and go straight back to the demo.
// So the spoken lines are what the screen is for, and the rest (screen
// directions, transitions, notes) sit at a size you notice without having to
// work at reading them.

struct ContentView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        VStack(spacing: 0) {
            StatusBar()
            Divider().overlay(Palette.hairline)

            // Banners go here rather than inside the script pane — a permission
            // warning has to be seen before opening a script, and recording can
            // start without one.
            BannerStack()

            if app.script != nil && !app.showLibrary {
                ScenePane()
            } else {
                LibraryPane()
            }

            Divider().overlay(Palette.hairline)
            FooterBar()
        }
        .background(Palette.bg)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $app.showPrep) { PrepSheet() }
        .frame(minWidth: 720, minHeight: 560)
        .task { app.library.refresh() }
    }
}

// MARK: - Top status bar

private struct StatusBar: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        HStack(alignment: .center, spacing: 16) {
            RecordIndicator()

            Divider().frame(height: 26).overlay(Palette.hairline)

            VStack(alignment: .leading, spacing: 3) {
                // Why mic state sits here: -g grabs the 'default input device'
                // as of the moment recording starts. Plugging in an external mic
                // doesn't change the default input, so without checking you find
                // out only after the whole thing is shot.
                Label(app.recorder.inputStatus ?? "The input device shows once recording starts",
                      systemImage: "mic.fill")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(app.recorder.inputStatus == nil ? Palette.dim : Palette.text)
                    .lineLimit(1)

                if let script = app.script {
                    Label(script.url.lastPathComponent, systemImage: "doc.text")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.dim)
                        .lineLimit(1)
                        .help(script.url.path)
                }
            }

            Spacer(minLength: 8)

            Button { app.showPrep = true } label: {
                Image(systemName: "checklist")
            }
            .help("Pre-shoot prep and filming rules")
            .disabled(app.script?.prep.isEmpty ?? true)

            Button { app.showLibrary.toggle() } label: {
                Image(systemName: app.showLibrary ? "doc.text" : "list.bullet")
            }
            .help(app.showLibrary ? "Back to the script" : "Scripts and recordings")
            .disabled(app.script == nil)

            Button { app.showSettings.toggle() } label: {
                Image(systemName: "gearshape")
            }
            .help("Folders, mic, text size")
            .popover(isPresented: $app.showSettings, arrowEdge: .bottom) { SettingsPane() }
        }
        .buttonStyle(.borderless)
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(app.recorder.isRecording ? Palette.recordTint : Color.clear)
    }
}

private struct RecordIndicator: View {
    @Environment(AppState.self) private var app

    var body: some View {
        HStack(spacing: 9) {
            Circle()
                .fill(dotColor)
                .frame(width: 11, height: 11)
                .overlay(Circle().stroke(dotColor.opacity(0.35), lineWidth: 6))
                .opacity(app.recorder.isRecording ? 1 : 0.55)
                .animation(app.recorder.isRecording
                           ? .easeInOut(duration: 0.9).repeatForever(autoreverses: true)
                           : .default,
                           value: app.recorder.isRecording)

            VStack(alignment: .leading, spacing: 1) {
                Text(app.recorder.isRecording ? formatClock(app.recorder.elapsed) : "--:--")
                    .font(.system(size: 22, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Palette.text)
                Text(phaseLabel)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Palette.dim)
            }
        }
        .frame(minWidth: 120, alignment: .leading)
    }

    private var dotColor: Color {
        switch app.recorder.phase {
        case .recording: Palette.record
        case .failed: Palette.warn
        default: Palette.dim
        }
    }

    private var phaseLabel: String {
        switch app.recorder.phase {
        case .idle: "Idle"
        case .starting: "Starting…"
        case .recording: "Recording"
        case .stopping: "Finalizing the file…"
        case .failed: "Failed"
        }
    }
}

// MARK: - Scene pane

private struct ScenePane: View {
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(spacing: 0) {
            if let scene = app.currentScene {
                SceneHeader(scene: scene)
                Divider().overlay(Palette.hairline)

                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        if !scene.shot.isEmpty {
                            SideNote(label: "Screen", text: scene.shot, tone: .neutral)
                        }
                        LineList(lines: scene.lines)
                        ForEach(scene.notes, id: \.self) { note in
                            SideNote(label: "Note", text: note, tone: .warn)
                        }
                        if let transition = scene.transition {
                            SideNote(label: "Transition", text: transition, tone: .accent)
                        }
                        if let wrap = scene.wrapUp {
                            SideNote(label: "Stop recording", text: wrap, tone: .accent)
                        }
                    }
                    .padding(.horizontal, 30)
                    .padding(.vertical, 26)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .id(app.sceneIndex)   // moving to another scene puts the scroll back at the top
            }
        }
    }

}

// MARK: - Banner stack

private struct BannerStack: View {
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(spacing: 0) {
            if app.screenPermissionMissing {
                BannerView(
                    text: "Recording can't start without screen recording permission. Turn on ‘ShootConsole’ in System Settings → Privacy & Security → Screen & System Audio Recording, then quit and reopen the app.",
                    tone: .error,
                    actionTitle: "Open System Settings",
                    action: { Permissions.openScreenCaptureSettings() },
                    onClose: nil
                )
            }
            if app.micPermissionDenied {
                BannerView(
                    text: "Microphone permission is off — the screen gets recorded but your voice won't.",
                    tone: .warn,
                    actionTitle: "Open System Settings",
                    action: { Permissions.openMicrophoneSettings() },
                    onClose: nil
                )
            }
            if case .failed(let message) = app.recorder.phase {
                // Don't hand onClose over as a trailing closure — the action
                // parameter ahead of it takes the closure first and the close
                // button disappears (forward-scan rule).
                BannerView(
                    text: message, tone: .error,
                    onClose: { app.recorder.clearError() }
                )
            }
            if let done = app.recorder.lastResult {
                BannerView(text: doneMessage(done), tone: .ok, onClose: nil)
            }
            if app.isSingleDisplay {
                BannerView(
                    text: "There is only one display — this window gets filmed along with the recording. The window is hidden from capture while recording, but you have to have it up to read the script, so a secondary display is the safe route.",
                    tone: .warn, onClose: nil
                )
            }
            if !app.hotkeyFailures.isEmpty {
                BannerView(
                    text: "Hotkeys another app already holds, so they could not be registered: \(app.hotkeyFailures.joined(separator: ", ")) — use the menu or the buttons for those.",
                    tone: .warn, onClose: nil
                )
            }
        }
    }

    private func doneMessage(_ raw: String) -> String {
        guard let marks = app.savedMarksPath else { return raw }
        return "\(raw)\nScene marks: \(marks)"
    }
}

private struct SceneHeader: View {
    @Environment(AppState.self) private var app
    let scene: ShootScene

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            Text("Scene \(scene.number)")
                .font(.system(size: 13, weight: .bold, design: .monospaced))
                .foregroundStyle(Palette.accent)

            Text(scene.title)
                .font(.system(size: 21, weight: .semibold))
                .foregroundStyle(Palette.text)
                .lineLimit(2)

            if let kind = scene.kind {
                Text(kind)
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Palette.chip, in: Capsule())
                    .foregroundStyle(Palette.dim)
            }

            Spacer(minLength: 8)

            if let target = scene.targetSeconds {
                // While filming, the seconds spent on this scene have to show
                // against the target — a scene over 20s trips a warning in
                // editing, and at that point a reshoot is the answer.
                HStack(spacing: 4) {
                    if app.recorder.isRecording {
                        Text(formatClock(app.sceneElapsed))
                            .font(.system(size: 15, weight: .semibold, design: .monospaced))
                            .foregroundStyle(app.isOverTarget ? Palette.warn : Palette.text)
                    }
                    Text("/ ~\(target)s")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Palette.dim)
                }
            }
        }
        .padding(.horizontal, 30)
        .padding(.vertical, 14)
    }
}

private struct LineList: View {
    @Environment(AppState.self) private var app
    let lines: [ScriptLine]

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            ForEach(lines) { line in
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Text("\(line.index)")
                        .font(.system(size: 15 * app.textScale, weight: .bold, design: .monospaced))
                        .foregroundStyle(Palette.accent.opacity(0.75))
                        .frame(width: 22 * app.textScale, alignment: .trailing)

                    VStack(alignment: .leading, spacing: 6) {
                        Text(line.spoken)
                            .font(.system(size: 30 * app.textScale, weight: .medium))
                            .foregroundStyle(Palette.text)
                            .lineSpacing(7 * app.textScale)
                            .textSelection(.enabled)

                        // 〔자막: …〕 is not a sentence you read out. It is
                        // confusing when it stands out, so it stays dim — kept
                        // for checking numbers and Latin text in their original
                        // form.
                        if let caption = line.caption {
                            Text("Caption  \(caption)")
                                .font(.system(size: 13 * app.textScale))
                                .foregroundStyle(Palette.dim)
                        }
                    }
                }
            }
        }
    }
}

private struct SideNote: View {
    enum Tone { case neutral, warn, accent }
    let label: String
    let text: String
    let tone: Tone

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .padding(.horizontal, 6).padding(.vertical, 3)
                .background(color.opacity(0.16), in: RoundedRectangle(cornerRadius: 4))
                .foregroundStyle(color)
                .fixedSize()
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(tone == .neutral ? Palette.mid : color.opacity(0.92))
                .lineSpacing(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var color: Color {
        switch tone {
        case .neutral: Palette.mid
        case .warn: Palette.warn
        case .accent: Palette.accent
        }
    }
}

// MARK: - Bottom bar

private struct FooterBar: View {
    @Environment(AppState.self) private var app

    var body: some View {
        HStack(spacing: 14) {
            if let script = app.script {
                HStack(spacing: 5) {
                    ForEach(Array(script.scenes.enumerated()), id: \.element.id) { index, scene in
                        Button { app.go(to: index) } label: {
                            Circle()
                                .fill(index == app.sceneIndex ? Palette.accent : Palette.chip)
                                .frame(width: index == app.sceneIndex ? 9 : 7,
                                       height: index == app.sceneIndex ? 9 : 7)
                        }
                        .buttonStyle(.plain)
                        .help("Scene \(scene.number) — \(scene.title)")
                    }
                }
                Text("\(app.sceneIndex + 1) / \(script.scenes.count)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Palette.dim)
            }

            Spacer(minLength: 8)

            HotkeyHint(label: Hotkeys.prevScene.label, text: "Prev")
            HotkeyHint(label: Hotkeys.nextScene.label, text: "Next")
            HotkeyHint(label: Hotkeys.markRetake.label, text: "Redo")
            HotkeyHint(label: Hotkeys.toggleRecording.label,
                       text: app.recorder.isRecording ? "Stop" : "Record",
                       tint: app.recorder.isRecording ? Palette.record : Palette.accent)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
    }
}

private struct HotkeyHint: View {
    let label: String
    let text: String
    var tint: Color = Palette.dim

    var body: some View {
        HStack(spacing: 5) {
            Text(label)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Palette.chip, in: RoundedRectangle(cornerRadius: 4))
                .foregroundStyle(tint)
            Text(text)
                .font(.system(size: 11))
                .foregroundStyle(Palette.dim)
        }
    }
}

// MARK: - Lists (scripts · recordings)

private struct LibraryPane: View {
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text(app.script == nil ? "Pick a shooting script" : "Lists")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.text)

                if app.library.scanning {
                    ProgressView().controlSize(.small)
                }

                Spacer(minLength: 8)

                Button { app.library.refresh() } label: { Image(systemName: "arrow.clockwise") }
                    .help("Scan again")
                Button("Open script…") { app.openScriptPanel() }
                    .controlSize(.small)
                if app.script != nil {
                    Button("Back") { app.showLibrary = false }
                        .controlSize(.small)
                        .keyboardShortcut(.cancelAction)
                }
            }
            .buttonStyle(.bordered)
            .padding(.horizontal, 26)
            .padding(.vertical, 14)

            Divider().overlay(Palette.hairline)

            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    if let error = app.loadError {
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundStyle(Palette.warn)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ScriptSection()
                    RecordingSection()
                }
                .padding(.horizontal, 26)
                .padding(.vertical, 22)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

private struct ScriptSection: View {
    @Environment(AppState.self) private var app

    var body: some View {
        let library = app.library
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Scripts", count: library.scripts.count)

            FolderField(
                path: library.scriptRoot?.path,
                placeholder: "The folder your scripts live under (e.g. …/social-flow/data)",
                missing: library.scriptRootMissing,
                choose: {
                    app.chooseFolder(message: "Pick the folder your scripts live under",
                                     current: library.scriptRoot) { library.scriptRoot = $0 }
                },
                clear: library.scriptRoot == nil ? nil : { library.scriptRoot = nil }
            )

            if library.scriptRoot == nil {
                Hint("Set a folder and every `script.md` under it gets found and listed here.")
            } else if library.scriptRootMissing {
                Hint("Can't find the folder — check whether it moved or the volume came unmounted.", tone: .warn)
            } else if library.scripts.isEmpty && !library.scanning {
                Hint("There is no `script.md` under this folder.")
            }

            ForEach(library.scriptsByChannel, id: \.channel) { group in
                VStack(alignment: .leading, spacing: 6) {
                    if !group.channel.isEmpty {
                        Text(group.channel)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Palette.accent.opacity(0.85))
                            .padding(.top, 4)
                    }
                    ForEach(group.scripts) { entry in
                        ScriptRow(entry: entry)
                    }
                }
            }

            // Scripts opened from outside the root never show up in the list, so keep a recents record.
            let outsiders = app.recentScripts.filter { url in
                !library.scripts.contains { $0.url.path == url.path }
            }
            if !outsiders.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Recent (outside the folder)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Palette.dim)
                        .padding(.top, 6)
                    ForEach(outsiders, id: \.path) { url in
                        Button { app.load(url: url) } label: {
                            Text(url.pathComponents.suffix(3).joined(separator: "/"))
                                .font(.system(size: 11, design: .monospaced))
                                .lineLimit(1)
                                .truncationMode(.head)
                        }
                        .buttonStyle(.link)
                    }
                }
            }
        }
    }
}

private struct ScriptRow: View {
    @Environment(AppState.self) private var app
    let entry: ScriptEntry
    @State private var hovering = false

    var body: some View {
        Button { app.load(url: entry.url) } label: {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Palette.text)
                        .lineLimit(1)
                    Text(entry.topic)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Palette.dim)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Text(meta)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Palette.dim)
                    .fixedSize()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(hovering ? Palette.chip : Color.clear,
                        in: RoundedRectangle(cornerRadius: 7))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(entry.url.path)
        .contextMenu {
            Button("Show in Finder") { revealInFinder(entry.url) }
            Button("Copy path") { copyToClipboard(entry.url.path) }
        }
    }

    private var meta: String {
        var parts: [String] = []
        if let n = entry.sceneCount { parts.append("\(n) scenes") }
        if let t = entry.target { parts.append(t) }
        parts.append(formatStamp(entry.modified))
        return parts.joined(separator: " · ")
    }
}

private struct RecordingSection: View {
    @Environment(AppState.self) private var app

    var body: some View {
        let library = app.library
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Recordings", count: library.recordings.count)

            FolderField(
                path: library.effectiveOutputRoot.path,
                placeholder: "",
                missing: library.outputRootMissing,
                isDefault: library.outputRoot == nil,
                choose: {
                    app.chooseFolder(message: "Pick the folder to save recordings in",
                                     current: library.effectiveOutputRoot) { library.outputRoot = $0 }
                },
                clear: library.outputRoot == nil ? nil : { library.outputRoot = nil },
                reveal: { revealInFinder(library.effectiveOutputRoot) }
            )

            if library.recordings.isEmpty && !library.scanning {
                Hint("No recordings in this folder yet.")
            }

            ForEach(library.recordings) { entry in
                RecordingRow(entry: entry)
            }
        }
    }
}

private struct RecordingRow: View {
    let entry: RecordingEntry
    @State private var hovering = false
    @State private var copied = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(entry.url.lastPathComponent)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .truncationMode(.middle)
                HStack(spacing: 6) {
                    Text("\(formatStamp(entry.modified)) · \(formatBytes(entry.size))")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.dim)
                    if entry.inProgress {
                        Tag("Recording", color: Palette.record)
                    } else if entry.hasMarks {
                        Tag("Scene marks", color: Palette.ok)
                    } else {
                        // Without marks, ingest guesses the scene boundaries from the transcript alone.
                        Tag("No marks", color: Palette.dim)
                    }
                }
            }
            Spacer(minLength: 8)

            if hovering || copied {
                Button(copied ? "Copied" : "Copy path") {
                    copyToClipboard(entry.url.path)
                    copied = true
                    Task {
                        try? await Task.sleep(for: .seconds(1.5))
                        copied = false
                    }
                }
                .controlSize(.small)
                Button { revealInFinder(entry.url) } label: { Image(systemName: "folder") }
                    .controlSize(.small)
                    .help("Show in Finder")
            }
        }
        .buttonStyle(.bordered)
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(hovering ? Palette.chip : Color.clear, in: RoundedRectangle(cornerRadius: 7))
        .onHover { hovering = $0 }
        .help(entry.url.path)
    }
}

// MARK: - List parts

private struct SectionTitle: View {
    let text: String
    let count: Int
    init(_ text: String, count: Int) { self.text = text; self.count = count }

    var body: some View {
        HStack(spacing: 7) {
            Text(text)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Palette.mid)
            Text("\(count)")
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Palette.chip, in: Capsule())
                .foregroundStyle(Palette.dim)
        }
    }
}

private struct Tag: View {
    let text: String
    let color: Color
    init(_ text: String, color: Color) { self.text = text; self.color = color }

    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .semibold))
            .padding(.horizontal, 5).padding(.vertical, 2)
            .background(color.opacity(0.16), in: RoundedRectangle(cornerRadius: 3))
            .foregroundStyle(color)
    }
}

private struct Hint: View {
    let text: String
    var tone: Tone = .plain
    enum Tone { case plain, warn }
    init(_ text: String, tone: Tone = .plain) { self.text = text; self.tone = tone }

    var body: some View {
        Text(text)
            .font(.system(size: 11))
            .foregroundStyle(tone == .warn ? Palette.warn : Palette.dim)
    }
}

/// One folder row — shows the path and lets you pick one. The settings popover and the lists share it.
private struct FolderField: View {
    let path: String?
    let placeholder: String
    var missing = false
    /// Never set, so it is running on the default (~/Movies).
    var isDefault = false
    let choose: () -> Void
    var clear: (() -> Void)? = nil
    var reveal: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: missing ? "folder.badge.questionmark" : "folder")
                .foregroundStyle(missing ? Palette.warn : Palette.dim)
                .font(.system(size: 12))

            // Paths truncate in the middle — you need both the volume name up front and the folder name at the end.
            Text(path ?? placeholder)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(path == nil ? Palette.dim : (missing ? Palette.warn : Palette.mid))
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: .infinity, alignment: .leading)
                .help(path ?? placeholder)

            if isDefault {
                Text("Default").font(.system(size: 9)).foregroundStyle(Palette.dim)
            }
            if let reveal {
                Button { reveal() } label: { Image(systemName: "arrow.up.forward.app") }
                    .help("Show in Finder")
            }
            Button(path == nil ? "Pick…" : "Change…") { choose() }
            if let clear {
                Button { clear() } label: { Image(systemName: "xmark") }
                    .help("Clear")
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(Palette.chip.opacity(0.6), in: RoundedRectangle(cornerRadius: 7))
    }
}

private func revealInFinder(_ url: URL) {
    NSWorkspace.shared.activateFileViewerSelecting([url])
}

private func copyToClipboard(_ text: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(text, forType: .string)
}

// MARK: - Prep sheet

private struct PrepSheet: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Once, before you start recording")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Palette.text)
                    if let title = app.script?.title {
                        Text(title).font(.system(size: 12)).foregroundStyle(Palette.dim)
                    }
                }
                Spacer()
                Button("Close") { app.showPrep = false }
                    .keyboardShortcut(.defaultAction)
            }
            .padding(20)

            Divider().overlay(Palette.hairline)

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ForEach(app.script?.prep ?? []) { section in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(section.title)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Palette.accent)
                            Text(cleanMarkdown(section.body))
                                .font(.system(size: 13))
                                .foregroundStyle(Palette.mid)
                                .lineSpacing(5)
                                .textSelection(.enabled)
                        }
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(width: 640, height: 560)
        .background(Palette.bg)
    }

    /// Strips formatting symbols and blockquote markers — this is read right before filming, so the sentences are all you need.
    private func cleanMarkdown(_ text: String) -> String {
        plainText(text)
            .components(separatedBy: .newlines)
            .map { line -> String in
                var l = line
                while l.hasPrefix(">") { l = String(l.dropFirst()).trimmingCharacters(in: .whitespaces) }
                return l
            }
            .joined(separator: "\n")
    }
}

// MARK: - Settings

private struct SettingsPane: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        @Bindable var recorder = app.recorder
        let library = app.library
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Script folder").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.dim)
                FolderField(
                    path: library.scriptRoot?.path,
                    placeholder: "Not set",
                    missing: library.scriptRootMissing,
                    choose: {
                        app.chooseFolder(message: "Pick the folder your scripts live under",
                                         current: library.scriptRoot) { library.scriptRoot = $0 }
                    },
                    clear: library.scriptRoot == nil ? nil : { library.scriptRoot = nil }
                )
                Text("Finds the `script.md` files under this folder and puts them in the list.")
                    .font(.system(size: 10)).foregroundStyle(Palette.dim)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Output folder").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.dim)
                FolderField(
                    path: library.effectiveOutputRoot.path,
                    placeholder: "",
                    missing: library.outputRootMissing,
                    isDefault: library.outputRoot == nil,
                    choose: {
                        app.chooseFolder(message: "Pick the folder to save recordings in",
                                         current: library.effectiveOutputRoot) { library.outputRoot = $0 }
                    },
                    clear: library.outputRoot == nil ? nil : { library.outputRoot = nil }
                )
                Text("Change this and a recording already rolling still saves where it was headed when it started.")
                    .font(.system(size: 10)).foregroundStyle(Palette.dim)
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Microphone").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.dim)
                TextField("Device name (e.g. Shure MV6)", text: $recorder.micDevice)
                    .textFieldStyle(.roundedBorder)
                TextField("Input volume 0–100", text: $recorder.micVolume)
                    .textFieldStyle(.roundedBorder)
                Text("Leave it empty to use whatever the current default input is.")
                    .font(.system(size: 10)).foregroundStyle(Palette.dim)
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Line text size").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.dim)
                Slider(value: $app.textScale, in: 0.7...1.8, step: 0.1)
                Text(String(format: "%.0f%%", app.textScale * 100))
                    .font(.system(size: 10, design: .monospaced)).foregroundStyle(Palette.dim)
            }
        }
        .padding(16)
        .frame(width: 440)
    }
}

// MARK: - Banner

private struct BannerView: View {
    enum Tone { case error, ok, warn }
    let text: String
    let tone: Tone
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil
    let onClose: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(color)
            Text(text)
                .font(.system(size: 12))
                .foregroundStyle(Palette.text)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let actionTitle, let action {
                Button(actionTitle) { action() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
            }
            if let onClose {
                Button { onClose() } label: { Image(systemName: "xmark") }
                    .buttonStyle(.borderless)
                    .foregroundStyle(Palette.dim)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 11)
        .background(color.opacity(0.12))
    }

    private var icon: String {
        switch tone {
        case .error: "exclamationmark.triangle.fill"
        case .warn: "exclamationmark.circle.fill"
        case .ok: "checkmark.circle.fill"
        }
    }

    private var color: Color {
        switch tone {
        case .error: Palette.record
        case .warn: Palette.warn
        case .ok: Palette.ok
        }
    }
}

// MARK: - Colors

enum Palette {
    static let bg = Color(red: 0.055, green: 0.063, blue: 0.078)
    static let text = Color(white: 0.96)
    static let mid = Color(white: 0.74)
    static let dim = Color(white: 0.52)
    static let hairline = Color(white: 1).opacity(0.08)
    static let chip = Color(white: 1).opacity(0.08)
    static let accent = Color(red: 0.42, green: 0.72, blue: 1.0)
    static let record = Color(red: 1.0, green: 0.28, blue: 0.29)
    static let recordTint = Color(red: 1.0, green: 0.28, blue: 0.29).opacity(0.10)
    static let warn = Color(red: 1.0, green: 0.71, blue: 0.28)
    static let ok = Color(red: 0.35, green: 0.85, blue: 0.55)
}
