import Foundation
import Observation

// 녹화 실행은 ingest 스킬의 record.sh 에 맡긴다.
//
// 앱이 screencapture 를 직접 띄우지 않는 이유: stop 경로(SIGINT → mov 컨테이너
// 확정 대기 → 빈 파일 검사)가 이미 실전에서 다듬어져 있고, .pid 사이드카와 출력
// 규약이 같아야 촬영 뒤 /social-flow:ingest 가 손대지 않고 그대로 붙는다.
//
// record.sh 는 nohup + disown 으로 녹화를 띄운다. 그래서 이 앱이 죽어도 녹화는
// 살아남는다 — 크래시가 테이크를 날리지 않는 대신, 정지는 pid 파일로 따로
// 해줘야 하므로 UI 에 그 경로를 남긴다.

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
    /// record.sh 가 찍는 "입력 장치: … / 입력 볼륨: …" 줄. 엉뚱한 마이크로 긴
    /// 테이크를 날리는 사고가 잦아 UI 최상단에 그대로 노출한다.
    private(set) var inputStatus: String?
    private(set) var lastResult: String?

    /// 화면에 표시할 경과 시간. 타이머가 0.5초마다 흔든다.
    private(set) var elapsed: TimeInterval = 0

    /// 지금 이 순간의 경과 시간. 화면 표시용 `elapsed` 는 최대 0.5초 묵은 값이라,
    /// 씬 마크처럼 시각 자체가 의미인 곳에서는 이쪽을 쓴다.
    var preciseElapsed: TimeInterval {
        guard let startedAt else { return 0 }
        return Date().timeIntervalSince(startedAt)
    }

    /// SF_MIC_DEVICE — 비우면 현재 기본 입력 장치를 그대로 쓴다.
    var micDevice: String = UserDefaults.standard.string(forKey: "micDevice") ?? "" {
        didSet { UserDefaults.standard.set(micDevice, forKey: "micDevice") }
    }
    /// SF_MIC_VOLUME — 비우면 현재 볼륨 유지.
    var micVolume: String = UserDefaults.standard.string(forKey: "micVolume") ?? "" {
        didSet { UserDefaults.standard.set(micVolume, forKey: "micVolume") }
    }

    var isBusy: Bool { phase == .starting || phase == .stopping }
    var isRecording: Bool { phase == .recording }

    private var ticker: Timer?

    // MARK: - 시작 / 정지

    func start(topic: String?) async {
        guard phase == .idle || isFailed else { return }
        phase = .starting
        lastResult = nil

        let url = Self.makeOutputURL(topic: topic)
        outputURL = url

        // 폴더가 없으면 screencapture 는 아무 말 없이 죽는다 — 사용자가 지정한
        // 저장 폴더를 나중에 옮기거나 지웠을 때 실제로 걸린다.
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true
            )
        } catch {
            phase = .failed("저장 폴더를 만들 수 없습니다: \(url.deletingLastPathComponent().path)\n\(error.localizedDescription)")
            outputURL = nil
            return
        }

        // t0 를 프로세스 실행 "직전"으로 잡는다. record.sh 는 스폰 뒤 sleep 1 로
        // 생존을 확인하고 나서야 반환하므로, 반환 시각을 쓰면 씬 마크가 통째로
        // 1초 밀린다. 실제 screencapture 시작과는 스폰 지연(~0.1s)만큼 어긋난다.
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
            lastResult = out.split(separator: "\n").last.map(String.init) ?? "녹화 종료"
            phase = .idle
        } catch {
            // 정지 실패는 파일이 남아 있을 수 있으므로 경로를 살려둔다.
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

    // MARK: - record.sh 실행

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
        // .app 은 로그인 셸의 PATH 를 물려받지 않는다. record.sh 가 부르는
        // SwitchAudioSource·ffprobe 가 Homebrew 에 있으므로 직접 얹어준다.
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
            // 파이프를 먼저 비운 뒤 기다린다 — 순서가 뒤집히면 64KB 버퍼가 차서
            // 교착한다(정지 경로는 출력이 짧지만 규칙은 지킨다).
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
        // 정상 경로: build-app.sh 가 번들 Resources 에 복사해 둔 사본.
        if let bundled = Bundle.main.url(forResource: "record", withExtension: "sh") {
            return bundled
        }
        // swift run 으로 띄웠을 때의 폴백 — 소스 트리 기준 상대 경로.
        return URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // ShootConsole
            .deletingLastPathComponent()   // Sources
            .deletingLastPathComponent()   // shoot-console
            .deletingLastPathComponent()   // apps
            .appendingPathComponent("skills/ingest/references/record.sh")
    }

    /// 저장 폴더 설정을 읽는 곳은 여기 하나다. 시작 시점에 정한 경로를
    /// outputURL 이 들고 있다가 정지에 그대로 쓰므로, 녹화 도중 설정을 바꿔도
    /// 찍고 있는 파일은 흔들리지 않는다.
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
            return "녹화를 시작하지 못했습니다. 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음 에서 ‘ShootConsole’을 켜세요.\n\n\(text)"
        }
        return text.isEmpty ? "record.sh 실행 실패" : text
    }

    // MARK: - 경과 시간

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
        case .scriptMissing(let path): "record.sh 를 찾을 수 없습니다: \(path)"
        case .scriptFailed(_, let output): output
        }
    }
}

// MARK: - 시간 표기

func formatClock(_ seconds: TimeInterval) -> String {
    let total = max(0, Int(seconds.rounded()))
    return String(format: "%02d:%02d", total / 60, total % 60)
}
