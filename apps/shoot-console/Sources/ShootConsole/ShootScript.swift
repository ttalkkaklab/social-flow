import Foundation

// storyboard/script.md 를 읽어 씬 단위로 쪼갠다.
//
// scenes.js 가 아니라 script.md 를 파싱하는 이유: script.md 는 "촬영하는 사람이
// 보조 모니터에 띄우고 읽는 문서"로 이미 설계돼 있다(shot-script-template.md).
// 말할 문장·화면 지시·전환 신호가 사람이 읽는 순서대로 들어 있어, 이 앱이 할 일은
// 그걸 크게 보여주고 현재 위치를 짚는 것뿐이다.

struct ScriptLine: Identifiable {
    let id = UUID()
    let index: Int
    /// 실제로 소리 내어 읽는 문장.
    let spoken: String
    /// 〔자막: …〕 — 화면 자막용 원표기라 읽지 않는다. 숫자·영문이 원형으로 적혀 있다.
    let caption: String?
}

struct ShootScene: Identifiable {
    let id = UUID()
    let number: Int
    let title: String
    /// cover / points — scenes.js 의 씬 종류.
    let kind: String?
    /// 목표 길이(초). 헤딩의 "목표 ~17s" 에서 뽑는다.
    let targetSeconds: Int?
    /// **화면**: 무엇을 띄우고 무엇을 조작하는지.
    let shot: String
    let lines: [ScriptLine]
    /// **전환**: 다음 씬으로 넘어가는 신호.
    let transition: String?
    /// 인용 블록 주석 — 말하면 안 되는 것, 촬영 시 주의점.
    let notes: [String]
    /// 마지막 씬의 **녹화 종료**: 안내.
    let wrapUp: String?

    var heading: String { "씬 \(number) — \(title)" }
}

struct ShootScript {
    let url: URL
    let topic: String?
    let mode: String?
    let targetTotal: String?
    let title: String
    /// 촬영 전 준비 + 촬영 수칙 — 녹화를 시작하기 전에 한 번 읽는 것들.
    let prep: [PrepSection]
    let scenes: [ShootScene]

    struct PrepSection: Identifiable {
        let id = UUID()
        let title: String
        let body: String
    }

    /// 대본이 잡아둔 본편 목표 길이 합계(초). 씬에 목표가 하나도 없으면 nil.
    var totalTargetSeconds: Int? {
        let sum = scenes.compactMap(\.targetSeconds).reduce(0, +)
        return sum > 0 ? sum : nil
    }
}

/// 마크다운 서식 기호를 걷어낸다.
///
/// 대본을 화면에 그대로 띄우면 `**금액을 말하지 말 것**` 처럼 별표가 문장에 섞인다.
/// 촬영 중에는 서식이 아니라 문장을 읽으므로 기호를 지우고 글자만 남긴다.
func plainText(_ source: String) -> String {
    var out = source.replacingOccurrences(of: "**", with: "")
    out = out.replacingOccurrences(of: "`", with: "")

    // [보이는 글자](주소) → 보이는 글자
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
        case .unreadable(let url): "대본을 읽을 수 없습니다: \(url.path)"
        case .noScenes: "대본에서 '## 씬 N — …' 헤딩을 찾지 못했습니다. 촬영 대본(script.md)이 맞는지 확인하세요."
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

        // 현재 수집 중인 덩어리. 씬 헤딩이나 다른 ## 를 만나면 확정한다.
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
                // "촬영 대본 — 제목" 형태면 접두어를 떼어 제목만 남긴다.
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
                    // "촬영 후", "대사 표기 규칙" 같은 나머지 섹션은 촬영 중 화면에
                    // 띄울 것이 아니라 건너뛴다.
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

    /// --- ... --- 프런트매터를 떼어내고 key: value 로 돌려준다.
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

// MARK: - 씬 헤딩

/// `## 씬 3 — 이미지 도구를 직접 붙인다 (points · 목표 ~17s)`
private struct SceneHeading {
    let number: Int
    let title: String
    let kind: String?
    let targetSeconds: Int?

    init?(heading: String) {
        guard heading.hasPrefix("씬 ") || heading.hasPrefix("씬") else { return nil }
        var rest = heading.dropFirst(1).trimmingCharacters(in: .whitespaces)

        // 번호
        let digits = rest.prefix { $0.isNumber }
        guard let num = Int(digits) else { return nil }
        number = num
        rest = String(rest.dropFirst(digits.count)).trimmingCharacters(in: CharacterSet(charactersIn: " —–-"))

        // 꼬리 괄호에서 종류·목표 초를 뽑는다. 없으면 제목만.
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

// MARK: - 씬 본문 수집

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
            // 인용 주석은 어느 필드 중이든 독립적으로 모은다.
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
            // 빈 줄은 필드를 닫지 않는다 — 대사 목록 사이에 빈 줄이 있어도 이어진다.
            return
        }

        switch field {
        case .shot: shot.append(t)
        case .lines: rawLines.append(t)
        case .transition: transition.append(t)
        case .none: break
        }
    }

    /// `**화면**: 본문` 또는 `**화면**:` 에서 본문을 뽑는다.
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

    /// "1. 문장  〔자막: 원표기〕" 목록을 ScriptLine 으로 바꾼다.
    /// 번호가 없는 줄은 직전 문장의 이어짐으로 붙인다.
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

    /// 〔자막: …〕 를 본문에서 떼어낸다.
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
