import AppKit
import SwiftUI

// 촬영 중에는 이 화면을 흘긋 보고 다시 시연으로 돌아간다. 그래서 대사가
// 화면의 주인공이고, 나머지(화면 지시·전환·주석)는 눈에 걸리되 읽으려고
// 애쓰지 않아도 되는 크기로 둔다.

struct ContentView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        VStack(spacing: 0) {
            StatusBar()
            Divider().overlay(Palette.hairline)

            // 배너는 대본 화면 안이 아니라 여기 둔다 — 권한 경고는 대본을 열기
            // 전에 봐야 하고, 녹화는 대본 없이도 시작할 수 있다.
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

// MARK: - 상단 상태 바

private struct StatusBar: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        HStack(alignment: .center, spacing: 16) {
            RecordIndicator()

            Divider().frame(height: 26).overlay(Palette.hairline)

            VStack(alignment: .leading, spacing: 3) {
                // 마이크 상태를 여기 둔 이유: -g 는 녹화 시작 시점의 '기본 입력
                // 장치'를 잡는다. 외장 마이크를 꽂아도 기본 입력은 자동으로
                // 바뀌지 않아서, 확인하지 않으면 다 찍고 나서야 안다.
                Label(app.recorder.inputStatus ?? "입력 장치는 녹화를 시작하면 표시됩니다",
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
            .help("촬영 전 준비·수칙")
            .disabled(app.script?.prep.isEmpty ?? true)

            Button { app.showLibrary.toggle() } label: {
                Image(systemName: app.showLibrary ? "doc.text" : "list.bullet")
            }
            .help(app.showLibrary ? "대본으로 돌아가기" : "대본·녹화 목록")
            .disabled(app.script == nil)

            Button { app.showSettings.toggle() } label: {
                Image(systemName: "gearshape")
            }
            .help("폴더·마이크·글자 크기")
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
        case .idle: "대기"
        case .starting: "시작하는 중…"
        case .recording: "녹화 중"
        case .stopping: "파일 확정 중…"
        case .failed: "실패"
        }
    }
}

// MARK: - 씬 화면

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
                            SideNote(label: "화면", text: scene.shot, tone: .neutral)
                        }
                        LineList(lines: scene.lines)
                        ForEach(scene.notes, id: \.self) { note in
                            SideNote(label: "주의", text: note, tone: .warn)
                        }
                        if let transition = scene.transition {
                            SideNote(label: "전환", text: transition, tone: .accent)
                        }
                        if let wrap = scene.wrapUp {
                            SideNote(label: "녹화 종료", text: wrap, tone: .accent)
                        }
                    }
                    .padding(.horizontal, 30)
                    .padding(.vertical, 26)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .id(app.sceneIndex)   // 씬을 넘기면 스크롤을 맨 위로 되돌린다
            }
        }
    }

}

// MARK: - 배너 묶음

private struct BannerStack: View {
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(spacing: 0) {
            if app.screenPermissionMissing {
                BannerView(
                    text: "화면 기록 권한이 없어 녹화를 시작할 수 없습니다. 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음 에서 ‘ShootConsole’을 켠 뒤 앱을 껐다 켜세요.",
                    tone: .error,
                    actionTitle: "시스템 설정 열기",
                    action: { Permissions.openScreenCaptureSettings() },
                    onClose: nil
                )
            }
            if app.micPermissionDenied {
                BannerView(
                    text: "마이크 권한이 꺼져 있습니다 — 화면은 찍히지만 목소리가 담기지 않습니다.",
                    tone: .warn,
                    actionTitle: "시스템 설정 열기",
                    action: { Permissions.openMicrophoneSettings() },
                    onClose: nil
                )
            }
            if case .failed(let message) = app.recorder.phase {
                // onClose 를 후행 클로저로 넘기지 않는다 — 앞에 있는 action 파라미터가
                // 먼저 클로저를 받아가서 닫기 버튼이 사라진다(전방 스캔 규칙).
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
                    text: "모니터가 하나입니다 — 이 창이 녹화 화면에 함께 찍힙니다. 녹화 중에는 창을 캡처에서 숨기지만, 대본을 보려면 창을 띄워야 하므로 보조 모니터를 쓰는 편이 확실합니다.",
                    tone: .warn, onClose: nil
                )
            }
            if !app.hotkeyFailures.isEmpty {
                BannerView(
                    text: "다른 앱이 쓰고 있어 등록하지 못한 단축키: \(app.hotkeyFailures.joined(separator: ", ")) — 해당 기능은 메뉴나 버튼으로 쓰세요.",
                    tone: .warn, onClose: nil
                )
            }
        }
    }

    private func doneMessage(_ raw: String) -> String {
        guard let marks = app.savedMarksPath else { return raw }
        return "\(raw)\n씬 마크: \(marks)"
    }
}

private struct SceneHeader: View {
    @Environment(AppState.self) private var app
    let scene: ShootScene

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            Text("씬 \(scene.number)")
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
                // 촬영 중에는 이 씬에 몇 초를 썼는지가 목표 대비로 보여야 한다 —
                // 20초를 넘긴 씬은 편집에서 경고가 뜨고, 그때는 재촬영이 답이다.
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

                        // 〔자막: …〕 은 읽는 문장이 아니다. 눈에 띄면 헷갈리므로
                        // 흐리게 두되, 숫자·영문 원표기 확인용으로 남긴다.
                        if let caption = line.caption {
                            Text("자막  \(caption)")
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

// MARK: - 하단 바

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
                        .help("씬 \(scene.number) — \(scene.title)")
                    }
                }
                Text("\(app.sceneIndex + 1) / \(script.scenes.count)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Palette.dim)
            }

            Spacer(minLength: 8)

            HotkeyHint(label: Hotkeys.prevScene.label, text: "이전")
            HotkeyHint(label: Hotkeys.nextScene.label, text: "다음")
            HotkeyHint(label: Hotkeys.markRetake.label, text: "다시")
            HotkeyHint(label: Hotkeys.toggleRecording.label,
                       text: app.recorder.isRecording ? "정지" : "녹화",
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

// MARK: - 목록 (대본 · 녹화)

private struct LibraryPane: View {
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text(app.script == nil ? "촬영 대본을 고르세요" : "목록")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.text)

                if app.library.scanning {
                    ProgressView().controlSize(.small)
                }

                Spacer(minLength: 8)

                Button { app.library.refresh() } label: { Image(systemName: "arrow.clockwise") }
                    .help("다시 훑기")
                Button("대본 열기…") { app.openScriptPanel() }
                    .controlSize(.small)
                if app.script != nil {
                    Button("돌아가기") { app.showLibrary = false }
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
            SectionTitle("대본", count: library.scripts.count)

            FolderField(
                path: library.scriptRoot?.path,
                placeholder: "대본이 모여 있는 폴더 (예: …/social-flow/data)",
                missing: library.scriptRootMissing,
                choose: {
                    app.chooseFolder(message: "대본이 모여 있는 폴더를 고르세요",
                                     current: library.scriptRoot) { library.scriptRoot = $0 }
                },
                clear: library.scriptRoot == nil ? nil : { library.scriptRoot = nil }
            )

            if library.scriptRoot == nil {
                Hint("폴더를 정하면 그 아래 `script.md` 를 전부 찾아 여기 늘어놓습니다.")
            } else if library.scriptRootMissing {
                Hint("폴더를 찾을 수 없습니다 — 옮겼거나 볼륨이 빠졌는지 확인하세요.", tone: .warn)
            } else if library.scripts.isEmpty && !library.scanning {
                Hint("이 폴더 아래에 `script.md` 가 없습니다.")
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

            // 뿌리 밖에서 연 대본은 목록에 안 잡히므로 최근 기록을 남겨둔다.
            let outsiders = app.recentScripts.filter { url in
                !library.scripts.contains { $0.url.path == url.path }
            }
            if !outsiders.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("최근 (폴더 밖)")
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
            Button("Finder 에서 보기") { revealInFinder(entry.url) }
            Button("경로 복사") { copyToClipboard(entry.url.path) }
        }
    }

    private var meta: String {
        var parts: [String] = []
        if let n = entry.sceneCount { parts.append("\(n)씬") }
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
            SectionTitle("녹화", count: library.recordings.count)

            FolderField(
                path: library.effectiveOutputRoot.path,
                placeholder: "",
                missing: library.outputRootMissing,
                isDefault: library.outputRoot == nil,
                choose: {
                    app.chooseFolder(message: "녹화를 저장할 폴더를 고르세요",
                                     current: library.effectiveOutputRoot) { library.outputRoot = $0 }
                },
                clear: library.outputRoot == nil ? nil : { library.outputRoot = nil },
                reveal: { revealInFinder(library.effectiveOutputRoot) }
            )

            if library.recordings.isEmpty && !library.scanning {
                Hint("이 폴더에는 아직 녹화가 없습니다.")
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
                        Tag("녹화 중", color: Palette.record)
                    } else if entry.hasMarks {
                        Tag("씬 마크", color: Palette.ok)
                    } else {
                        // 마크가 없으면 ingest 가 씬 경계를 전사만 보고 추정한다.
                        Tag("마크 없음", color: Palette.dim)
                    }
                }
            }
            Spacer(minLength: 8)

            if hovering || copied {
                Button(copied ? "복사됨" : "경로 복사") {
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
                    .help("Finder 에서 보기")
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

// MARK: - 목록 부품

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

/// 폴더 한 줄 — 경로를 보여주고 고르게 한다. 설정 팝오버와 목록이 같이 쓴다.
private struct FolderField: View {
    let path: String?
    let placeholder: String
    var missing = false
    /// 지정한 적이 없어 기본값(~/Movies)으로 도는 상태.
    var isDefault = false
    let choose: () -> Void
    var clear: (() -> Void)? = nil
    var reveal: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: missing ? "folder.badge.questionmark" : "folder")
                .foregroundStyle(missing ? Palette.warn : Palette.dim)
                .font(.system(size: 12))

            // 경로는 가운데를 접는다 — 앞의 볼륨명과 뒤의 폴더명이 다 필요하다.
            Text(path ?? placeholder)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(path == nil ? Palette.dim : (missing ? Palette.warn : Palette.mid))
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: .infinity, alignment: .leading)
                .help(path ?? placeholder)

            if isDefault {
                Text("기본값").font(.system(size: 9)).foregroundStyle(Palette.dim)
            }
            if let reveal {
                Button { reveal() } label: { Image(systemName: "arrow.up.forward.app") }
                    .help("Finder 에서 보기")
            }
            Button(path == nil ? "고르기…" : "바꾸기…") { choose() }
            if let clear {
                Button { clear() } label: { Image(systemName: "xmark") }
                    .help("지정 해제")
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

// MARK: - 준비 사항 시트

private struct PrepSheet: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("녹화 시작 전에 한 번")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Palette.text)
                    if let title = app.script?.title {
                        Text(title).font(.system(size: 12)).foregroundStyle(Palette.dim)
                    }
                }
                Spacer()
                Button("닫기") { app.showPrep = false }
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

    /// 서식 기호와 인용 표시를 걷어낸다 — 촬영 직전에 읽는 글이라 문장만 남기면 된다.
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

// MARK: - 설정

private struct SettingsPane: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        @Bindable var recorder = app.recorder
        let library = app.library
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("대본 폴더").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.dim)
                FolderField(
                    path: library.scriptRoot?.path,
                    placeholder: "지정하지 않음",
                    missing: library.scriptRootMissing,
                    choose: {
                        app.chooseFolder(message: "대본이 모여 있는 폴더를 고르세요",
                                         current: library.scriptRoot) { library.scriptRoot = $0 }
                    },
                    clear: library.scriptRoot == nil ? nil : { library.scriptRoot = nil }
                )
                Text("이 폴더 아래의 `script.md` 를 찾아 목록에 올립니다.")
                    .font(.system(size: 10)).foregroundStyle(Palette.dim)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("저장 폴더").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.dim)
                FolderField(
                    path: library.effectiveOutputRoot.path,
                    placeholder: "",
                    missing: library.outputRootMissing,
                    isDefault: library.outputRoot == nil,
                    choose: {
                        app.chooseFolder(message: "녹화를 저장할 폴더를 고르세요",
                                         current: library.effectiveOutputRoot) { library.outputRoot = $0 }
                    },
                    clear: library.outputRoot == nil ? nil : { library.outputRoot = nil }
                )
                Text("바꿔도 찍고 있는 녹화는 시작할 때 정해둔 자리에 그대로 저장됩니다.")
                    .font(.system(size: 10)).foregroundStyle(Palette.dim)
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("마이크").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.dim)
                TextField("장치 이름 (예: Shure MV6)", text: $recorder.micDevice)
                    .textFieldStyle(.roundedBorder)
                TextField("입력 볼륨 0~100", text: $recorder.micVolume)
                    .textFieldStyle(.roundedBorder)
                Text("비워두면 지금 설정된 기본 입력을 그대로 씁니다.")
                    .font(.system(size: 10)).foregroundStyle(Palette.dim)
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("대사 글자 크기").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.dim)
                Slider(value: $app.textScale, in: 0.7...1.8, step: 0.1)
                Text(String(format: "%.0f%%", app.textScale * 100))
                    .font(.system(size: 10, design: .monospaced)).foregroundStyle(Palette.dim)
            }
        }
        .padding(16)
        .frame(width: 440)
    }
}

// MARK: - 배너

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

// MARK: - 색

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
