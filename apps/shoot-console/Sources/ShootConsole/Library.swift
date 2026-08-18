import Foundation
import Observation

// The script folder and the save folder, plus the listings built by scanning them.
//
// Scripts live at data/<channel>/episodes/<topic>/storyboard/script.md, and
// every shoot adds a new topic. Instead of drilling five levels down with ⌘O
// each time, set one root folder and pick from the list. The save folder is
// there for the same reason — the app has to know where recordings pile up so
// you don't hunt for the path after a shoot.

// MARK: - Folder settings

/// Storage and defaults for both folders. Recorder reads the save location
/// from here too.
enum Folders {

    /// The root to search for scripts. Without it, guidance shows instead of a
    /// listing — guessing where to look and sweeping the whole home directory
    /// would be worse.
    static var scriptRoot: URL? {
        get { UserDefaults.standard.string(forKey: "scriptRoot").map { URL(fileURLWithPath: $0) } }
        set { UserDefaults.standard.set(newValue?.path, forKey: "scriptRoot") }
    }

    /// Folder to save recordings in. Empty means ~/Movies.
    static var outputRoot: URL? {
        get { UserDefaults.standard.string(forKey: "outputRoot").map { URL(fileURLWithPath: $0) } }
        set { UserDefaults.standard.set(newValue?.path, forKey: "outputRoot") }
    }

    /// The save folder actually used — falls back to ~/Movies when unset.
    static var effectiveOutputRoot: URL {
        outputRoot ?? defaultOutputRoot
    }

    static var defaultOutputRoot: URL {
        FileManager.default.urls(for: .moviesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Movies")
    }
}

// MARK: - Listing entries

struct ScriptEntry: Identifiable {
    var id: String { url.path }
    let url: URL
    /// Parent folder relative to the root — with data/ as the root, this is
    /// the channel name.
    let channel: String?
    /// Topic folder name. Same as the slug ingest and produce use.
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
    /// Whether scene marks were saved alongside — without them ingest has to
    /// estimate scene boundaries.
    let hasMarks: Bool
    /// A live .pid sidecar = the file being recorded right now. Not finished yet.
    let inProgress: Bool
}

// MARK: - Listing

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
    /// The folder disappeared — really happens when an external volume is
    /// ejected. An empty listing would read as "no scripts", so this is
    /// reported separately.
    private(set) var scriptRootMissing = false
    private(set) var outputRootMissing = false

    var effectiveOutputRoot: URL { Folders.effectiveOutputRoot }

    /// Scripts grouped by channel. Without a channel, one group under the
    /// empty-string key.
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

    // MARK: - Scanning

    private nonisolated static func isDirectory(_ url: URL) -> Bool {
        var isDir: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir)
        return exists && isDir.boolValue
    }

    /// Looks for script.md only. Picking up any .md would mix in documents
    /// with no scenes that bounce off the parser, and the shooting scripts the
    /// pipeline emits only ever have this name.
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
            // Guards against the accident of picking a bad root and sweeping
            // the home directory or the whole repo.
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

        // Pulls channel and topic from <channel>/episodes/<topic>/storyboard/script.md.
        // Trimmed from the tail so it holds up even with the root set directly
        // on a channel or topic folder.
        var comps = url.deletingLastPathComponent().pathComponents
        let rootComps = root.pathComponents
        if comps.count >= rootComps.count, Array(comps.prefix(rootComps.count)) == rootComps {
            comps.removeFirst(rootComps.count)
        }
        if comps.last == "storyboard" { comps.removeLast() }
        if comps.count >= 2, comps[comps.count - 2] == "episodes" {
            comps.remove(at: comps.count - 2)
        }

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

    /// Reads only what the listing needs from the head of the file — the front
    /// matter and one title line suffice, so there's no reason to run the full
    /// parser per file.
    private nonisolated static func preview(_ url: URL)
        -> (topic: String?, title: String?, scenes: Int?, target: String?)
    {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return (nil, nil, nil, nil) }
        defer { try? handle.close() }
        let head = (try? handle.read(upToCount: 8192)) ?? Data()
        // A truncated read can split a Hangul character in half at the tail.
        // String(data:encoding:) returns nil wholesale over that one character,
        // so use the decoder that lets broken bytes slide — all we need is the
        // front matter and one title line anyway.
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
                break   // once the title shows up there's nothing left to read
            }
        }
        return (topic, title, scenes, target)
    }

    /// Only looks at .mov files directly inside the save folder — recordings
    /// pile up flat here.
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

// MARK: - Formatting

func formatBytes(_ bytes: Int64) -> String {
    let fmt = ByteCountFormatter()
    fmt.allowedUnits = [.useMB, .useGB]
    fmt.countStyle = .file
    return fmt.string(fromByteCount: bytes)
}

func formatStamp(_ date: Date) -> String {
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "en_US")
    fmt.dateFormat = "MMM d HH:mm"
    return fmt.string(from: date)
}
