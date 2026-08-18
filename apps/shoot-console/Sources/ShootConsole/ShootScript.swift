import Foundation

// Reads storyboard/script.md and splits it into scenes.
//
// Why parse script.md instead of scenes.js: script.md is already designed as
// "the document the person filming puts on a secondary display and reads"
// (shot-script-template.md). The sentences to speak, screen directions, and
// transition cues sit in the order a human reads them, so all this app has to
// do is show them large and point at the current position.

struct ScriptLine: Identifiable {
    let id = UUID()
    let index: Int
    /// The sentence actually spoken out loud.
    let spoken: String
    /// 〔자막: …〕 — the verbatim on-screen caption, not read aloud. Numbers and
    /// Latin text appear here in their original form.
    let caption: String?
}

struct ShootScene: Identifiable {
    let id = UUID()
    let number: Int
    let title: String
    /// cover / points — the scene kind from scenes.js.
    let kind: String?
    /// Target length in seconds. Pulled from "목표 ~17s" in the heading.
    let targetSeconds: Int?
    /// **화면** (screen): what to put on screen and what to operate.
    let shot: String
    let lines: [ScriptLine]
    /// **전환** (transition): the cue for moving to the next scene.
    let transition: String?
    /// Blockquote notes — things not to say, filming caveats.
    let notes: [String]
    /// The final scene's **녹화 종료** (wrap-up) instructions.
    let wrapUp: String?

    var heading: String { "Scene \(number) — \(title)" }
}

struct ShootScript {
    let url: URL
    let topic: String?
    let mode: String?
    let targetTotal: String?
    let title: String
    /// Pre-shoot prep + filming rules — read once before recording starts.
    let prep: [PrepSection]
    let scenes: [ShootScene]

    struct PrepSection: Identifiable {
        let id = UUID()
        let title: String
        let body: String
    }

    /// Total target length of the main body as set by the script (seconds).
    /// nil when no scene has a target.
    var totalTargetSeconds: Int? {
        let sum = scenes.compactMap(\.targetSeconds).reduce(0, +)
        return sum > 0 ? sum : nil
    }
}

/// Strips markdown formatting symbols.
///
/// Shown as-is, the script mixes asterisks into sentences, like
/// `**금액을 말하지 말 것**`. While filming you read sentences, not formatting,
/// so the symbols go and only the text stays.
func plainText(_ source: String) -> String {
    var out = source.replacingOccurrences(of: "**", with: "")
    out = out.replacingOccurrences(of: "`", with: "")

    // [visible text](url) → visible text
    var guardCount = 0
    while guardCount < 32,
          let open = out.range(of: "["),
          let mid = out.range(of: "](", range: open.upperBound..<out.endIndex),
          let close = out.range(of: ")", range: mid.upperBound..<out.endIndex) {
        let label = String(out[open.upperBound..<mid.lowerBound])
        out.replaceSubrange(open.lowerBound..<close.upperBound, with: label)
        guardCount += 1
    }
    return out
}

enum ScriptParseError: LocalizedError {
    case unreadable(URL)
    case noScenes

    var errorDescription: String? {
        switch self {
        case .unreadable(let url): "Can't read the script: \(url.path)"
        case .noScenes: "No '## 씬 N — …' heading found in the script. Check that this is a shooting script (script.md)."
        }
    }
}

enum ScriptParser {

    static func parse(url: URL) throws -> ShootScript {
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else {
            throw ScriptParseError.unreadable(url)
        }
        return try parse(text: raw, url: url)
    }

    static func parse(text raw: String, url: URL) throws -> ShootScript {
        var lines = raw.components(separatedBy: .newlines)
        let front = stripFrontMatter(&lines)

        var docTitle = url.deletingPathExtension().lastPathComponent
        var prep: [ShootScript.PrepSection] = []
        var scenes: [ShootScene] = []

        // The chunk currently being collected. Finalized when a scene heading
        // or another ## shows up.
        var sceneBuf: SceneBuffer?
        var prepTitle: String?
        var prepBody: [String] = []
        var inIgnoredSection = false

        func flushPrep() {
            if let t = prepTitle {
                let body = prepBody.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                if !body.isEmpty { prep.append(.init(title: t, body: body)) }
            }
            prepTitle = nil
            prepBody = []
        }
        func flushScene() {
            if let buf = sceneBuf { scenes.append(buf.build()) }
            sceneBuf = nil
        }

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.hasPrefix("# ") && !trimmed.hasPrefix("## ") {
                docTitle = String(trimmed.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                // For a "촬영 대본 — title" heading, drop the prefix and keep just the title.
                if let r = docTitle.range(of: "촬영 대본") {
                    let rest = docTitle[r.upperBound...].trimmingCharacters(in: CharacterSet(charactersIn: " —–-"))
                    if !rest.isEmpty { docTitle = rest }
                }
                continue
            }

            if trimmed.hasPrefix("## ") {
                flushPrep()
                flushScene()
                let heading = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespaces)

                if let parsed = SceneHeading(heading: heading) {
                    inIgnoredSection = false
                    sceneBuf = SceneBuffer(heading: parsed)
                } else if isPrepHeading(heading) {
                    inIgnoredSection = false
                    prepTitle = heading
                } else {
                    // The remaining sections, like "촬영 후" (after the shoot)
                    // or "대사 표기 규칙" (line notation rules), aren't meant for
                    // the screen during filming — skip them.
                    inIgnoredSection = true
                }
                continue
            }

            if inIgnoredSection { continue }
            if sceneBuf != nil {
                sceneBuf!.feed(line)
            } else if prepTitle != nil {
                prepBody.append(line)
            }
        }
        flushPrep()
        flushScene()

        guard !scenes.isEmpty else { throw ScriptParseError.noScenes }

        return ShootScript(
            url: url,
            topic: front["topic"],
            mode: front["mode"],
            targetTotal: front["target"],
            title: docTitle,
            prep: prep,
            scenes: scenes
        )
    }

    private static func isPrepHeading(_ heading: String) -> Bool {
        heading.contains("촬영 전") || heading.contains("촬영 수칙") || heading.contains("준비")
    }

    /// Strips the --- ... --- front matter and returns it as key: value pairs.
    private static func stripFrontMatter(_ lines: inout [String]) -> [String: String] {
        guard lines.first?.trimmingCharacters(in: .whitespaces) == "---" else { return [:] }
        var meta: [String: String] = [:]
        var end: Int?
        for i in 1..<lines.count {
            if lines[i].trimmingCharacters(in: .whitespaces) == "---" { end = i; break }
            let parts = lines[i].split(separator: ":", maxSplits: 1).map {
                $0.trimmingCharacters(in: .whitespaces)
            }
            if parts.count == 2 { meta[parts[0]] = parts[1] }
        }
        if let end { lines.removeSubrange(0...end) }
        return meta
    }
}

// MARK: - Scene heading

/// `## 씬 3 — 이미지 도구를 직접 붙인다 (points · 목표 ~17s)`
private struct SceneHeading {
    let number: Int
    let title: String
    let kind: String?
    let targetSeconds: Int?

    init?(heading: String) {
        guard heading.hasPrefix("씬 ") || heading.hasPrefix("씬") else { return nil }
        var rest = heading.dropFirst(1).trimmingCharacters(in: .whitespaces)

        // Number
        let digits = rest.prefix { $0.isNumber }
        guard let num = Int(digits) else { return nil }
        number = num
        rest = String(rest.dropFirst(digits.count)).trimmingCharacters(in: CharacterSet(charactersIn: " —–-"))

        // Pull the kind and target seconds from the trailing parentheses.
        // Without them, it's just the title.
        if rest.hasSuffix(")"), let open = rest.lastIndex(of: "(") {
            let meta = String(rest[rest.index(after: open)...].dropLast())
            title = String(rest[..<open]).trimmingCharacters(in: .whitespaces)
            var k: String?
            var t: Int?
            for piece in meta.components(separatedBy: "·").map({ $0.trimmingCharacters(in: .whitespaces) }) {
                if piece.contains("목표") {
                    let n = piece.filter(\.isNumber)
                    t = Int(n)
                } else if !piece.isEmpty {
                    k = piece
                }
            }
            kind = k
            targetSeconds = t
        } else {
            title = rest
            kind = nil
            targetSeconds = nil
        }
    }
}

// MARK: - Scene body collection

private struct SceneBuffer {
    let heading: SceneHeading
    private var shot: [String] = []
    private var rawLines: [String] = []
    private var transition: [String] = []
    private var notes: [String] = []
    private var wrapUp: String?
    private var field: Field = .none

    private enum Field { case none, shot, lines, transition }

    init(heading: SceneHeading) { self.heading = heading }

    mutating func feed(_ line: String) {
        let t = line.trimmingCharacters(in: .whitespaces)

        if let body = labelled(t, "화면") { field = .shot; shot.append(body); return }
        if let body = labelled(t, "대사") { field = .lines; if !body.isEmpty { rawLines.append(body) }; return }
        if let body = labelled(t, "전환") { field = .transition; transition.append(body); return }
        if let body = labelled(t, "녹화 종료") { field = .none; wrapUp = body; return }

        if t.hasPrefix(">") {
            // Blockquote notes collect independently of whatever field is open.
            let body = t.dropFirst().trimmingCharacters(in: .whitespaces)
            if body.isEmpty {
                notes.append("")
            } else if var last = notes.last, !last.isEmpty, !last.hasSuffix("\n") {
                last += " " + body
                notes[notes.count - 1] = last
            } else {
                notes.append(body)
            }
            return
        }

        if t.isEmpty {
            // A blank line doesn't close a field — lines in a list continue
            // across blank lines.
            return
        }

        switch field {
        case .shot: shot.append(t)
        case .lines: rawLines.append(t)
        case .transition: transition.append(t)
        case .none: break
        }
    }

    /// Extracts the body from `**화면**: body` or `**화면**:` style labels.
    private func labelled(_ line: String, _ label: String) -> String? {
        for prefix in ["**\(label)**:", "**\(label)** :", "\(label):"] {
            if line.hasPrefix(prefix) {
                return String(line.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
            }
        }
        return nil
    }

    func build() -> ShootScene {
        ShootScene(
            number: heading.number,
            title: heading.title,
            kind: heading.kind,
            targetSeconds: heading.targetSeconds,
            shot: plainText(shot.joined(separator: " ")).trimmingCharacters(in: .whitespaces),
            lines: Self.parseLines(rawLines),
            transition: transition.isEmpty ? nil : plainText(transition.joined(separator: " ")),
            notes: notes.filter { !$0.isEmpty }.map(plainText),
            wrapUp: wrapUp.map(plainText)
        )
    }

    /// Turns a "1. sentence  〔자막: verbatim〕" list into ScriptLine values.
    /// A line without a number continues the previous sentence.
    private static func parseLines(_ raw: [String]) -> [ScriptLine] {
        var out: [(spoken: String, caption: String?)] = []

        for line in raw {
            var body = line
            var isNew = false

            let digits = body.prefix { $0.isNumber }
            if !digits.isEmpty {
                let after = body.dropFirst(digits.count)
                if after.hasPrefix(".") || after.hasPrefix(")") {
                    body = String(after.dropFirst()).trimmingCharacters(in: .whitespaces)
                    isNew = true
                }
            }
            if body.hasPrefix("- ") || body.hasPrefix("* ") {
                body = String(body.dropFirst(2))
                isNew = true
            }

            if isNew || out.isEmpty {
                out.append(split(body))
            } else {
                let merged = (out[out.count - 1].spoken + " " + body).trimmingCharacters(in: .whitespaces)
                let pair = split(merged)
                out[out.count - 1] = (pair.spoken, out[out.count - 1].caption ?? pair.caption)
            }
        }

        return out.enumerated().map {
            ScriptLine(
                index: $0.offset + 1,
                spoken: plainText($0.element.spoken),
                caption: $0.element.caption.map(plainText)
            )
        }
    }

    /// Detaches 〔자막: …〕 from the body text.
    private static func split(_ s: String) -> (spoken: String, caption: String?) {
        guard let open = s.range(of: "〔"), let close = s.range(of: "〕", range: open.upperBound..<s.endIndex) else {
            return (s.trimmingCharacters(in: .whitespaces), nil)
        }
        var inner = String(s[open.upperBound..<close.lowerBound])
        for label in ["자막:", "자막 :", "자막"] where inner.hasPrefix(label) {
            inner = String(inner.dropFirst(label.count))
            break
        }
        let spoken = (String(s[s.startIndex..<open.lowerBound]) + String(s[close.upperBound...]))
            .trimmingCharacters(in: .whitespaces)
        return (spoken, inner.trimmingCharacters(in: .whitespaces))
    }
}
