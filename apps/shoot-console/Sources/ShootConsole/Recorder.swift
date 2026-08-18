import Foundation
import Observation

// Recording itself is delegated to the ingest skill's record.sh.
//
// Why the app doesn't spawn screencapture directly: the stop path (SIGINT →
// wait for the mov container to finalize → empty-file check) is already
// battle-tested there, and the .pid sidecar and output conventions must match
// so /social-flow:ingest picks the recording up untouched after the shoot.
//
// record.sh launches the recording with nohup + disown. So the recording
// survives even if this app dies — a crash doesn't lose the take, but stopping
// then has to go through the pid file, so the UI shows that path.

@MainActor
@Observable
final class Recorder {

    enum Phase: Equatable {
        case idle
        case starting
        case recording
        case stopping
        case failed(String)
    }

    private(set) var phase: Phase = .idle
    private(set) var outputURL: URL?
    private(set) var startedAt: Date?
    /// The "입력 장치: … / 입력 볼륨: …" (input device / input volume) line
    /// record.sh prints. Losing a long take to the wrong microphone is a
    /// frequent accident, so it goes verbatim at the very top of the UI.
    private(set) var inputStatus: String?
    private(set) var lastResult: String?

    /// Elapsed time for display. A timer nudges it every 0.5s.
    private(set) var elapsed: TimeInterval = 0

    /// Elapsed time right now. The display `elapsed` can be up to 0.5s stale,
    /// so places where the timestamp itself matters — like scene marks — use this.
    var preciseElapsed: TimeInterval {
        guard let startedAt else { return 0 }
        return Date().timeIntervalSince(startedAt)
    }

    /// SF_MIC_DEVICE — empty means use the current default input device as is.
    var micDevice: String = UserDefaults.standard.string(forKey: "micDevice") ?? "" {
        didSet { UserDefaults.standard.set(micDevice, forKey: "micDevice") }
    }
    /// SF_MIC_VOLUME — empty means keep the current volume.
    var micVolume: String = UserDefaults.standard.string(forKey: "micVolume") ?? "" {
        didSet { UserDefaults.standard.set(micVolume, forKey: "micVolume") }
    }

    var isBusy: Bool { phase == .starting || phase == .stopping }
    var isRecording: Bool { phase == .recording }

    private var ticker: Timer?

    // MARK: - Start / stop

    func start(topic: String?) async {
        guard phase == .idle || isFailed else { return }
        phase = .starting
        lastResult = nil

        let url = Self.makeOutputURL(topic: topic)
        outputURL = url

        // If the folder is missing, screencapture dies without a word — this
        // actually happens when the user later moves or deletes the save folder
        // they picked.
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true
            )
        } catch {
            phase = .failed("Can't create the save folder: \(url.deletingLastPathComponent().path)\n\(error.localizedDescription)")
            outputURL = nil
            return
        }

        // Take t0 right *before* launching the process. record.sh spawns, then
        // sleeps 1s to confirm survival before returning, so using the return
        // time would shift every scene mark by a full second. The offset from
        // the actual screencapture start is only the spawn delay (~0.1s).
        let t0 = Date()

        do {
            let out = try await runScript(args: ["start", url.path])
            inputStatus = out.split(separator: "\n").first { $0.hasPrefix("입력 장치") }.map(String.init)
            startedAt = t0
            elapsed = 0
            phase = .recording
            startTicker()
        } catch {
            phase = .failed(Self.explain(error))
            outputURL = nil
        }
    }

    func stop() async {
        guard phase == .recording else { return }
        guard let url = outputURL else { return }
        phase = .stopping
        stopTicker()

        do {
            let out = try await runScript(args: ["stop", url.path])
            lastResult = out.split(separator: "\n").last.map(String.init) ?? "Recording stopped"
            phase = .idle
        } catch {
            // A failed stop may still leave the file behind, so keep the path.
            phase = .failed(Self.explain(error))
        }
        startedAt = nil
    }

    func clearError() {
        if isFailed { phase = .idle }
    }

    private var isFailed: Bool {
        if case .failed = phase { return true }
        return false
    }

    // MARK: - Running record.sh

    private func runScript(args: [String]) async throws -> String {
        let script = Self.recordScriptURL()
        guard FileManager.default.fileExists(atPath: script.path) else {
            throw RecorderError.scriptMissing(script.path)
        }

        var env = ProcessInfo.processInfo.environment
        if !micDevice.trimmingCharacters(in: .whitespaces).isEmpty {
            env["SF_MIC_DEVICE"] = micDevice.trimmingCharacters(in: .whitespaces)
        }
        if !micVolume.trimmingCharacters(in: .whitespaces).isEmpty {
            env["SF_MIC_VOLUME"] = micVolume.trimmingCharacters(in: .whitespaces)
        }
        // A .app doesn't inherit the login shell's PATH. record.sh calls
        // SwitchAudioSource and ffprobe, which live in Homebrew, so add those
        // directories ourselves.
        let extraPaths = ["/opt/homebrew/bin", "/usr/local/bin"]
        env["PATH"] = (extraPaths + [env["PATH"] ?? "/usr/bin:/bin"]).joined(separator: ":")

        return try await Task.detached(priority: .userInitiated) {
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: "/bin/bash")
            proc.arguments = [script.path] + args
            proc.environment = env

            let pipe = Pipe()
            proc.standardOutput = pipe
            proc.standardError = pipe

            try proc.run()
            // Drain the pipe first, then wait — in the other order the 64KB
            // buffer fills up and deadlocks (the stop path's output is short,
            // but the rule holds anyway).
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            proc.waitUntilExit()

            let text = String(data: data, encoding: .utf8) ?? ""
            guard proc.terminationStatus == 0 else {
                throw RecorderError.scriptFailed(status: proc.terminationStatus, output: text)
            }
            return text
        }.value
    }

    private static func recordScriptURL() -> URL {
        // Normal path: the copy build-app.sh placed in the bundle Resources.
        if let bundled = Bundle.main.url(forResource: "record", withExtension: "sh") {
            return bundled
        }
        // Fallback for `swift run` — relative path within the source tree.
        return URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // ShootConsole
            .deletingLastPathComponent()   // Sources
            .deletingLastPathComponent()   // shoot-console
            .deletingLastPathComponent()   // apps
            .appendingPathComponent("skills/ingest/references/record.sh")
    }

    /// This is the one place that reads the save-folder setting. outputURL
    /// holds the path decided at start time and stop uses it as is, so changing
    /// the setting mid-recording doesn't disturb the file being written.
    private static func makeOutputURL(topic: String?) -> URL {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyyMMdd-HHmmss"
        let stamp = fmt.string(from: Date())
        let slug = (topic?.trimmingCharacters(in: .whitespaces)).flatMap { $0.isEmpty ? nil : $0 }
        let name = slug.map { "social-flow-\($0)-\(stamp).mov" } ?? "social-flow-rec-\(stamp).mov"
        return Folders.effectiveOutputRoot.appendingPathComponent(name)
    }

    private static func explain(_ error: Error) -> String {
        guard case let RecorderError.scriptFailed(_, output) = error else {
            return error.localizedDescription
        }
        let text = output.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.contains("권한") || text.contains("시작 실패") {
            return "Couldn't start recording. Turn on 'ShootConsole' in System Settings → Privacy & Security → Screen & System Audio Recording.\n\n\(text)"
        }
        return text.isEmpty ? "record.sh failed" : text
    }

    // MARK: - Elapsed time

    private func startTicker() {
        stopTicker()
        let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let started = self.startedAt else { return }
                self.elapsed = Date().timeIntervalSince(started)
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        ticker = timer
    }

    private func stopTicker() {
        ticker?.invalidate()
        ticker = nil
    }
}

enum RecorderError: LocalizedError {
    case scriptMissing(String)
    case scriptFailed(status: Int32, output: String)

    var errorDescription: String? {
        switch self {
        case .scriptMissing(let path): "Can't find record.sh: \(path)"
        case .scriptFailed(_, let output): output
        }
    }
}

// MARK: - Time formatting

func formatClock(_ seconds: TimeInterval) -> String {
    let total = max(0, Int(seconds.rounded()))
    return String(format: "%02d:%02d", total / 60, total % 60)
}
