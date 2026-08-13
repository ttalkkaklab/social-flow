import Foundation
import Observation

// 대본 폴더와 저장 폴더, 그리고 그 안을 훑어 만든 목록.
//
// 대본은 data/<채널>/<주제>/storyboard/script.md 에 있고 촬영마다 새 주제가
// 생긴다. 매번 ⌘O 로 다섯 단계를 파고드는 대신 뿌리 폴더 하나만 잡아두면
// 목록에서 고른다. 저장 폴더도 같은 이유다 — 촬영본이 어디 쌓이는지 앱이
// 알아야 찍고 나서 경로를 찾아 헤매지 않는다.

// MARK: - 폴더 설정

/// 두 폴더의 저장·기본값. Recorder 도 저장 위치를 여기서 읽는다.
enum Folders {

    /// 대본을 찾을 뿌리. 정해두지 않으면 목록 대신 안내가 뜬다 — 어디를
    /// 뒤져야 할지 짐작해서 홈 전체를 훑는 쪽이 더 나쁘다.
    static var scriptRoot: URL? {
        get { UserDefaults.standard.string(forKey: "scriptRoot").map { URL(fileURLWithPath: $0) } }
        set { UserDefaults.standard.set(newValue?.path, forKey: "scriptRoot") }
    }

    /// 녹화를 저장할 폴더. 비워두면 ~/Movies.
    static var outputRoot: URL? {
        get { UserDefaults.standard.string(forKey: "outputRoot").map { URL(fileURLWithPath: $0) } }
        set { UserDefaults.standard.set(newValue?.path, forKey: "outputRoot") }
    }

    /// 실제로 쓸 저장 폴더 — 설정이 없으면 ~/Movies 로 떨어진다.
    static var effectiveOutputRoot: URL {
        outputRoot ?? defaultOutputRoot
    }

    static var defaultOutputRoot: URL {
        FileManager.default.urls(for: .moviesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Movies")
    }
}

// MARK: - 목록 항목

struct ScriptEntry: Identifiable {
    var id: String { url.path }
    let url: URL
    /// 뿌리 기준 상위 폴더 — data/ 를 잡으면 채널 이름이 된다.
    let channel: String?
    /// 주제 폴더 이름. ingest·produce 가 쓰는 slug 와 같다.
    let topic: String
    let title: String
    let sceneCount: Int?
    let target: String?
    let modified: Date
}

struct RecordingEntry: Identifiable {
    var id: String { url.path }
    let url: URL
    let size: Int64
    let modified: Date
    /// 씬 마크가 함께 남았는지 — 없으면 ingest 가 씬 경계를 추정해야 한다.
    let hasMarks: Bool
    /// .pid 사이드카가 살아 있다 = 지금 찍고 있는 파일. 아직 완성이 아니다.
    let inProgress: Bool
}

// MARK: - 목록

@MainActor
@Observable
final class Library {

    var scriptRoot: URL? = Folders.scriptRoot {
        didSet {
            Folders.scriptRoot = scriptRoot
            refresh()
        }
    }

    var outputRoot: URL? = Folders.outputRoot {
        didSet {
            Folders.outputRoot = outputRoot
            refresh()
        }
    }

    private(set) var scripts: [ScriptEntry] = []
    private(set) var recordings: [RecordingEntry] = []
    private(set) var scanning = false
    /// 폴더가 사라졌다 — 외장 볼륨을 빼면 실제로 일어난다. 빈 목록으로
    /// 보여주면 "대본이 없다" 로 읽히므로 구분해서 알린다.
    private(set) var scriptRootMissing = false
    private(set) var outputRootMissing = false

    var effectiveOutputRoot: URL { Folders.effectiveOutputRoot }

    /// 채널별로 묶은 대본. 채널이 없으면 빈 문자열 키로 한 덩어리.
    var scriptsByChannel: [(channel: String, scripts: [ScriptEntry])] {
        let grouped = Dictionary(grouping: scripts) { $0.channel ?? "" }
        return grouped
            .map { (channel: $0.key, scripts: $0.value) }
            .sorted { $0.channel < $1.channel }
    }

    func refresh() {
        let scriptDir = scriptRoot
        let outputDir = Folders.effectiveOutputRoot
        scanning = true
        Task {
            let result = await Task.detached(priority: .utility) {
                (
                    scripts: scriptDir.map(Library.scanScripts) ?? [],
                    recordings: Library.scanRecordings(root: outputDir),
                    scriptMissing: scriptDir.map { !Library.isDirectory($0) } ?? false,
                    outputMissing: !Library.isDirectory(outputDir)
                )
            }.value

            scripts = result.scripts
            recordings = result.recordings
            scriptRootMissing = result.scriptMissing
            outputRootMissing = result.outputMissing
            scanning = false
        }
    }

    // MARK: - 훑기

    private nonisolated static func isDirectory(_ url: URL) -> Bool {
        var isDir: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir)
        return exists && isDir.boolValue
    }

    /// script.md 만 찾는다. 아무 .md 나 주우면 씬이 없어 파싱에서 튕기는
    /// 문서가 목록에 섞이는데, 파이프라인이 내놓는 촬영 대본은 이 이름뿐이다.
    private nonisolated static func scanScripts(root: URL) -> [ScriptEntry] {
        let fm = FileManager.default
        guard isDirectory(root),
              let walker = fm.enumerator(
                  at: root,
                  includingPropertiesForKeys: [.contentModificationDateKey, .isDirectoryKey],
                  options: [.skipsHiddenFiles, .skipsPackageDescendants]
              )
        else { return [] }

        var found: [ScriptEntry] = []
        for case let url as URL in walker {
            // 뿌리를 잘못 잡아 홈이나 저장소 전체를 훑는 사고를 막는다.
            if walker.level > 6 { walker.skipDescendants(); continue }
            if skipped.contains(url.lastPathComponent) { walker.skipDescendants(); continue }
            guard url.lastPathComponent == "script.md" else { continue }
            if found.count >= 200 { break }
            found.append(entry(for: url, root: root))
        }
        return found.sorted { $0.modified > $1.modified }
    }

    private nonisolated static let skipped: Set<String> = [
        "node_modules", ".build", "build", "output", "assets", "dist"
    ]

    private nonisolated static func entry(for url: URL, root: URL) -> ScriptEntry {
        let meta = preview(url)

        // <채널>/<주제>/storyboard/script.md 에서 채널·주제를 뽑는다. 뿌리를
        // 채널 폴더나 주제 폴더에 바로 잡아도 무너지지 않게 뒤에서부터 깎는다.
        var comps = url.deletingLastPathComponent().pathComponents
        let rootComps = root.pathComponents
        if comps.count >= rootComps.count, Array(comps.prefix(rootComps.count)) == rootComps {
            comps.removeFirst(rootComps.count)
        }
        if comps.last == "storyboard" { comps.removeLast() }

        let topic = comps.last ?? meta.topic ?? root.lastPathComponent
        let channel = comps.count >= 2 ? comps[comps.count - 2] : nil

        let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?
            .contentModificationDate ?? .distantPast

        return ScriptEntry(
            url: url,
            channel: channel,
            topic: topic,
            title: meta.title ?? topic,
            sceneCount: meta.scenes,
            target: meta.target,
            modified: modified
        )
    }

    /// 목록에 필요한 것만 앞부분에서 읽는다 — 프런트매터와 제목 한 줄이면
    /// 충분해서, 파일마다 전체 파싱을 돌릴 이유가 없다.
    private nonisolated static func preview(_ url: URL)
        -> (topic: String?, title: String?, scenes: Int?, target: String?)
    {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return (nil, nil, nil, nil) }
        defer { try? handle.close() }
        let head = (try? handle.read(upToCount: 8192)) ?? Data()
        // 잘라 읽으면 끝자락에서 한글 한 글자가 반토막 난다. String(data:encoding:)
        // 은 그 한 글자 때문에 통째로 nil 을 내놓으므로, 깨진 바이트를 흘려보내는
        // 쪽을 쓴다 — 어차피 필요한 건 프런트매터와 제목 한 줄뿐이다.
        let text = String(decoding: head, as: UTF8.self)

        var topic: String?
        var title: String?
        var scenes: Int?
        var target: String?
        var inFrontMatter = false
        var seenFrontMatter = false

        for raw in text.components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line == "---" {
                if !seenFrontMatter { inFrontMatter = true; seenFrontMatter = true; continue }
                if inFrontMatter { inFrontMatter = false; continue }
            }
            if inFrontMatter {
                let parts = line.split(separator: ":", maxSplits: 1).map {
                    $0.trimmingCharacters(in: .whitespaces)
                }
                guard parts.count == 2 else { continue }
                switch parts[0] {
                case "topic": topic = parts[1]
                case "scenes": scenes = Int(parts[1].filter(\.isNumber))
                case "target": target = parts[1]
                default: break
                }
                continue
            }
            if line.hasPrefix("# ") && !line.hasPrefix("## ") {
                var t = String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                if let r = t.range(of: "촬영 대본") {
                    let rest = t[r.upperBound...].trimmingCharacters(in: CharacterSet(charactersIn: " —–-"))
                    if !rest.isEmpty { t = rest }
                }
                title = t
                break   // 제목까지 나왔으면 더 읽을 게 없다
            }
        }
        return (topic, title, scenes, target)
    }

    /// 저장 폴더 바로 밑의 .mov 만 본다 — 녹화는 여기에 평평하게 쌓인다.
    private nonisolated static func scanRecordings(root: URL) -> [RecordingEntry] {
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }

        return items
            .filter { $0.pathExtension.lowercased() == "mov" }
            .map { url in
                let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
                return RecordingEntry(
                    url: url,
                    size: Int64(values?.fileSize ?? 0),
                    modified: values?.contentModificationDate ?? .distantPast,
                    hasMarks: fm.fileExists(atPath: url.path + ".scene-marks.json"),
                    inProgress: fm.fileExists(atPath: url.path + ".pid")
                )
            }
            .sorted { $0.modified > $1.modified }
            .prefix(40)
            .map { $0 }
    }
}

// MARK: - 표기

func formatBytes(_ bytes: Int64) -> String {
    let fmt = ByteCountFormatter()
    fmt.allowedUnits = [.useMB, .useGB]
    fmt.countStyle = .file
    return fmt.string(fromByteCount: bytes)
}

func formatStamp(_ date: Date) -> String {
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "ko_KR")
    fmt.dateFormat = "M월 d일 HH:mm"
    return fmt.string(from: date)
}
