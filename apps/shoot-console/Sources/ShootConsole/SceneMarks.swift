import Foundation

// 촬영 중 씬을 넘긴 시각을 녹화 파일 옆에 남긴다 — <녹화.mov>.scene-marks.json
//
// 이 파일은 ingest 가 대본 씬 ↔ 녹화 구간을 맞출 때(alignment.json) 쓰는 힌트다.
// 지금까지는 전사 문장과 대본을 대조해 경계를 추정했는데, 촬영한 사람이 실제로
// 넘긴 시각이 있으면 추정이 확인으로 바뀐다.
//
// 어디까지나 힌트다 — 실제 컷은 ingest 가 무음 지점에 스냅한다. 사람이 씬을
// 넘기고 한 박자 뒤에 말을 시작하니 마크가 정확히 컷 지점일 수는 없다.

struct SceneMark: Codable, Identifiable {
    var id: String { "\(event)-\(scene)-\(t)" }

    /// 대본의 씬 번호.
    let scene: Int
    let title: String
    /// 녹화 시작 기준 경과 초.
    let t: Double
    /// enter = 이 씬을 시작했다 · retake = 방금 것을 버리고 다시 간다 · wrap = 촬영 종료
    let event: String
    /// 이 씬을 몇 번째로 시도한 것인지 (1부터).
    let take: Int
    /// 뒤에 같은 씬을 다시 찍어서 이 테이크가 버려졌는지.
    /// 편집이 쓸 구간은 `superseded == false` 인 마크들이다.
    var superseded: Bool

    enum Event {
        static let enter = "enter"
        static let retake = "retake"
        static let wrap = "wrap"
    }
}

struct SceneMarkFile: Codable {
    let recording: String
    let script: String
    let topic: String?
    let startedAt: Date
    let marks: [SceneMark]
}

@MainActor
final class MarkLog {
    private(set) var marks: [SceneMark] = []

    func reset() { marks.removeAll() }

    /// 씬 진입·재촬영·종료를 기록한다.
    ///
    /// - Parameters:
    ///   - scene: 대본 씬 번호 (1부터)
    ///   - title: 씬 제목 — 나중에 사람이 JSON 을 열어볼 때 번호만으로는 못 알아본다
    ///   - t: 녹화 시작 기준 경과 초
    ///   - event: SceneMark.Event 중 하나
    func add(scene: Int, title: String, t: TimeInterval, event: String) {
        marks = applyPolicy(
            scene: scene, title: title, t: round(t * 10) / 10, event: event, to: marks
        )
    }

    /// 재촬영 정책 — 이 함수 하나가 정합 품질을 좌우한다.
    ///
    /// 촬영 수칙은 "틀리면 녹화를 끊지 말고 그 씬 처음부터 다시 말한다 — 편집이
    /// 마지막 테이크만 쓴다" 다. 그래서 한 씬에 마크가 여러 번 쌓인다.
    ///
    /// 앞선 마크를 지우지 않고 `superseded` 를 세워 남긴다. 편집이 쓸 구간은
    /// `superseded == false` 하나뿐이라 고르기는 여전히 단순하고, 버려진 테이크의
    /// 시작 시각이 남아 두 가지가 공짜로 따라온다: 전사에 같은 문장이 두 번 나올 때
    /// 앞엣것이 버린 테이크임을 알 수 있고, 어느 씬에서 몇 번 다시 찍었는지가
    /// 그대로 촬영 기록이 된다. 씬 대여섯 개짜리 녹화에서 늘어나는 줄 수는 몇 줄이라
    /// 지워서 얻을 것이 없다.
    ///
    /// 되돌아가서 이전 씬을 다시 찍는 경우(⌥⌘[)도 같은 규칙을 탄다 — 그 씬의
    /// 앞선 테이크가 버려지고 take 가 하나 오른다.
    private func applyPolicy(
        scene: Int, title: String, t: Double, event: String, to existing: [SceneMark]
    ) -> [SceneMark] {
        // 촬영 종료 표시는 씬의 테이크가 아니라 녹화의 끝이라 정책 밖이다.
        guard event != SceneMark.Event.wrap else {
            return existing + [
                SceneMark(scene: scene, title: title, t: t, event: event, take: 1, superseded: false)
            ]
        }

        var updated = existing
        var previousTakes = 0
        for i in updated.indices
        where updated[i].scene == scene && updated[i].event != SceneMark.Event.wrap {
            previousTakes += 1
            updated[i].superseded = true
        }

        return updated + [
            SceneMark(
                scene: scene, title: title, t: t, event: event,
                take: previousTakes + 1, superseded: false
            )
        ]
    }

    /// 녹화 파일 옆에 <녹화.mov>.scene-marks.json 으로 저장한다.
    @discardableResult
    func save(recording: URL, script: URL, topic: String?, startedAt: Date) -> URL? {
        guard !marks.isEmpty else { return nil }
        let payload = SceneMarkFile(
            recording: recording.path,
            script: script.path,
            topic: topic,
            startedAt: startedAt,
            // 시각순으로 정렬한다. ⌥⌘[ 로 앞 씬에 돌아가 다시 찍으면 기록된
            // 순서와 실제 시각이 어긋나는데, 읽는 쪽은 녹화 흐름대로 보는 게 맞다.
            marks: marks.sorted { $0.t < $1.t }
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601

        let target = URL(fileURLWithPath: recording.path + ".scene-marks.json")
        guard let data = try? encoder.encode(payload) else { return nil }
        try? data.write(to: target, options: .atomic)
        return target
    }
}
