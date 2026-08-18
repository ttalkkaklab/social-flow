import Foundation

// Writes the times when scenes changed during the shoot next to the recording —
// <recording.mov>.scene-marks.json
//
// This file is a hint ingest uses when matching script scenes to recording
// segments (alignment.json). Until now the boundaries were estimated by
// comparing the transcript against the script; with the times the person
// filming actually advanced, the estimate becomes a confirmation.
//
// Still just a hint — the actual cut snaps to a silence point in ingest. A
// person advances the scene and starts talking a beat later, so a mark can't
// be the exact cut point.

struct SceneMark: Codable, Identifiable {
    var id: String { "\(event)-\(scene)-\(t)" }

    /// Scene number from the script.
    let scene: Int
    let title: String
    /// Elapsed seconds from recording start.
    let t: Double
    /// enter = this scene started · retake = discard the last attempt and go again · wrap = shoot finished
    let event: String
    /// Which attempt at this scene this is (1-based).
    let take: Int
    /// Whether this take was discarded by a later retake of the same scene.
    /// The segments editing uses are the marks with `superseded == false`.
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

    /// Records a scene entry, retake, or wrap.
    ///
    /// - Parameters:
    ///   - scene: script scene number (1-based)
    ///   - title: scene title — a person opening the JSON later can't tell
    ///     scenes apart by number alone
    ///   - t: elapsed seconds from recording start
    ///   - event: one of SceneMark.Event
    func add(scene: Int, title: String, t: TimeInterval, event: String) {
        marks = applyPolicy(
            scene: scene, title: title, t: round(t * 10) / 10, event: event, to: marks
        )
    }

    /// The retake policy — this one function decides alignment quality.
    ///
    /// The filming rule is: "if you slip, don't stop the recording — say the
    /// scene again from the top; editing uses only the last take." So one scene
    /// accumulates multiple marks.
    ///
    /// Earlier marks aren't deleted; `superseded` gets set instead. The
    /// segments editing uses are still just the ones with `superseded == false`,
    /// so picking stays simple, and keeping the discarded takes' start times
    /// buys two things for free: when the transcript has the same sentence
    /// twice, the earlier one is identifiably the discarded take, and which
    /// scenes were retaken how many times becomes the shoot record as is. On a
    /// recording of five or six scenes that's only a handful of extra lines —
    /// deleting them gains nothing.
    ///
    /// Going back to reshoot an earlier scene (⌥⌘[) follows the same rule —
    /// that scene's earlier takes get discarded and take goes up by one.
    private func applyPolicy(
        scene: Int, title: String, t: Double, event: String, to existing: [SceneMark]
    ) -> [SceneMark] {
        // The wrap mark is the end of the recording, not a take of a scene,
        // so it sits outside the policy.
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

    /// Saves as <recording.mov>.scene-marks.json next to the recording file.
    @discardableResult
    func save(recording: URL, script: URL, topic: String?, startedAt: Date) -> URL? {
        guard !marks.isEmpty else { return nil }
        let payload = SceneMarkFile(
            recording: recording.path,
            script: script.path,
            topic: topic,
            startedAt: startedAt,
            // Sorted by time. Going back with ⌥⌘[ to reshoot an earlier scene
            // puts recorded order out of step with actual time, and the reader
            // should see the recording's flow.
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
