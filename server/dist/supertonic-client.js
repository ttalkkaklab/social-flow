/**
 * Supertonic 3 온디바이스 TTS 클라이언트 — 로컬 Python 런타임 서브프로세스 호출.
 *
 * Gemini TTS(tts-client.ts)와 나란히 두는 **두 번째 음성 경로**다. 네트워크·API 키·
 * 쿼터가 전부 빠지는 대신 로컬에 Python 런타임과 385MB 가중치가 있어야 한다.
 *
 * 두 경로의 분담(2026-08-11 실측 조사 기준 — docs/research/2026-08-11-local-tts-and-commercial-api):
 *   - 나레이션 본문   → 이쪽. CPU 만으로 실시간 6.3배, 회차당 비용 0
 *   - 감정이 실린 연기 → tts_generate(Gemini). stylePrompt 로 연기 지시가 되는 건 그쪽뿐이다
 *
 * ## 왜 서브프로세스인가
 *
 * Supertonic 은 ONNX Runtime 기반 Python 패키지이고 Node 바인딩이 없다. 실측한
 * 고정 오버헤드는 인터프리터 기동 ~1.8초 + import 0.12초 + 모델 로딩 0.52초로,
 * 호출마다 새 프로세스를 띄워도 씬 하나당 2~3초 수준이다. 모델을 상주시키는
 * 워커·HTTP 서버는 이 오버헤드를 1회로 줄이지만 수명 관리와 포트 경쟁(이 저장소는
 * 다중 세션 동시 작업이 전제다)을 떠안는다 — 필요가 실측으로 입증되기 전에는
 * 상태 없는 서브프로세스가 맞다.
 *
 * ## 왜 CLI 가 아니라 인라인 스니펫인가
 *
 * `supertonic tts` CLI 로도 같은 합성이 되지만, CLI 는 사람이 읽는 진행 메시지를
 * stdout 에 찍고 **오디오 길이를 돌려주지 않는다**. produce 파이프라인은 씬마다
 * 길이 검사를 하므로 그러면 ffprobe 를 한 번 더 돌려야 한다. 스니펫으로 부르면
 * 합성 결과가 JSON 한 줄로 나와 파싱도 견고하고 길이도 공짜로 얻는다.
 *
 * 스니펫을 별도 .py 파일로 두지 않는 것도 의도적이다 — package.json 의
 * `files: ["dist"]` 때문에 느슨한 파일은 npm 배포본에 실리지 않아, 로컬에서만
 * 되고 설치본에서 깨지는 구성이 된다.
 */
import { execFile } from 'node:child_process';
import { z } from 'zod';
import { supertonicPython } from './config.js';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
/**
 * 내장 보이스 10종.
 *
 * Gemini 쪽 TTS_VOICES 와 달리 **성격 라벨을 붙이지 않는다** — 공급사가 공개한
 * 특성 표가 없어서 "차분함"·"밝음" 같은 설명은 지어낸 값이 된다. 이름이 성별과
 * 번호만 뜻한다는 사실을 그대로 노출하는 편이 정직하고, 채널 프로파일이
 * 배정해 두면 어차피 고르는 일 자체가 없다.
 */
export const SUPERTONIC_VOICE_NAMES = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'];
/** upstream CLI 기본값과 일치시킨다 — 같은 인자로 부른 결과가 서로 다르면 놀란다. */
export const DEFAULT_SUPERTONIC_VOICE = 'M1';
/**
 * supertonic-3 지원 언어 31종 + 언어 비지정 폴백 `na`.
 *
 * upstream 기본값은 `na` 지만 이 서버는 **`ko` 를 기본으로 둔다.** 한국어 채널
 * 파이프라인이 주 용도이고, `ko` 를 명시해야 한국어용 짧은 청크 길이(120자)가
 * 적용되기 때문이다 — `na` 로 두면 300자 청크가 걸려 문장이 뭉개진다.
 */
export const SUPERTONIC_LANGUAGES = [
    'ko', 'en', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu',
    'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi', 'na',
];
export const DEFAULT_SUPERTONIC_LANGUAGE = 'ko';
/** upstream 기본값 (config.py) — 여기서 바꾸면 CLI 로 뽑은 음성과 톤이 달라진다. */
export const DEFAULT_SUPERTONIC_SPEED = 1.05;
export const DEFAULT_SUPERTONIC_STEPS = 8;
/** 고정 출력 규격 — Gemini TTS 는 24kHz 라 한 영상 안에서 섞으면 이어붙이기가 깨진다. */
export const SUPERTONIC_SAMPLE_RATE = 44_100;
/**
 * 입력 상한.
 *
 * 모델 자체는 10만 자까지 받고 내부적으로 청킹하지만, Gemini 쪽(16,000자)과 같은
 * 선을 쓴다 — 한 씬의 나레이션은 수백 자이고, 그보다 긴 입력은 대개 대본을
 * 씬으로 쪼개지 않은 실수다. 상한이 다르면 두 경로를 바꿔 낄 때 걸린다.
 */
export const MAX_SUPERTONIC_INPUT_CHARS = 16_000;
/**
 * 서브프로세스 타임아웃.
 *
 * 실시간 6배가 실측치지만 머신 부하에 크게 흔들린다(load 21 에서 1.1배까지 떨어지는
 * 것을 확인했다). 기동 여유 60초에 문자당 60ms 를 더하고 15분에서 끊는다.
 */
function timeoutFor(textLength) {
    return Math.min(15 * 60_000, 60_000 + textLength * 60);
}
// ── 요청 스키마 ──────────────────────────────────────────────────
export const supertonicGenerateSchema = z.object({
    text: z
        .string()
        .min(1, 'Text is required')
        .max(MAX_SUPERTONIC_INPUT_CHARS, `Text exceeds ${MAX_SUPERTONIC_INPUT_CHARS} characters; split the script by scene`),
    voice: z.enum(SUPERTONIC_VOICE_NAMES).optional().default(DEFAULT_SUPERTONIC_VOICE),
    lang: z.enum(SUPERTONIC_LANGUAGES).optional().default(DEFAULT_SUPERTONIC_LANGUAGE),
    speed: z.number().min(0.7).max(2.0).optional().default(DEFAULT_SUPERTONIC_SPEED),
    steps: z.number().int().min(1).max(100).optional().default(DEFAULT_SUPERTONIC_STEPS),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
});
// ── Python 스니펫 ────────────────────────────────────────────────
/**
 * 합성 스니펫.
 *
 * 인자는 argv 로 넘긴다 — 텍스트를 코드에 문자열 보간하면 따옴표·개행·백슬래시가
 * 그대로 파이썬 소스가 되어 깨지거나, 최악의 경우 임의 코드가 된다.
 *
 * `synthesize` 반환값은 `(wav, duration_array)` 인데 두 원소 모두 ndarray 라
 * 두 번째를 샘플레이트로 오독하기 쉽다. 샘플 수에서 직접 길이를 구해 그 여지를 없앤다.
 */
const SYNTH_SNIPPET = `
import json, sys, time
args = json.loads(sys.argv[1])
try:
    import numpy as np
    from supertonic import TTS
except ImportError as e:
    print(json.dumps({"ok": False, "kind": "missing_package", "error": str(e)}))
    sys.exit(0)

t0 = time.time()
try:
    tts = TTS(model="supertonic-3")
    style = tts.get_voice_style(args["voice"])
    wav, _ = tts.synthesize(
        args["text"], voice_style=style, lang=args["lang"],
        speed=args["speed"], total_steps=args["steps"],
    )
    tts.save_audio(wav, args["out"])
    samples = int(np.asarray(wav).reshape(-1).size)
    print(json.dumps({
        "ok": True, "samples": samples,
        "duration": round(samples / 44100.0, 3),
        "elapsed": round(time.time() - t0, 2),
    }))
except Exception as e:
    print(json.dumps({"ok": False, "kind": "synthesis", "error": f"{type(e).__name__}: {e}"}))
`;
/** 파이썬 실행 실패를 사용자가 고칠 수 있는 안내로 바꾼다. */
function installHint(detail) {
    return (`${detail}\n\n` +
        `로컬 TTS 는 Python 런타임과 Supertonic 패키지를 요구한다:\n` +
        `  pip install supertonic\n` +
        `가상환경에 설치했다면 그 인터프리터를 SUPERTONIC_PYTHON 으로 지정한다 ` +
        `(예: SUPERTONIC_PYTHON=/path/to/.venv/bin/python).\n` +
        `최초 1회 호출 시 가중치 385MB 를 ~/.cache/supertonic3 에 내려받는다(약 24초).\n` +
        `설치 전까지는 tts_generate(Gemini TTS)를 쓸 것 — 그쪽은 API 키만 있으면 된다.`);
}
// ── 합성 ────────────────────────────────────────────────────────
/** 단일 화자 로컬 합성 — 나레이션·보이스오버 */
export async function generateLocalSpeech(request) {
    const python = supertonicPython();
    const outFile = resolveOutputFile(request.outputPath || process.cwd(), request.filename || `supertonic_${Date.now()}.wav`, 'audio');
    const payload = JSON.stringify({
        text: request.text,
        voice: request.voice,
        lang: request.lang,
        speed: request.speed,
        steps: request.steps,
        out: outFile,
    });
    console.error(`[Supertonic] Synthesizing locally... (voice: ${request.voice}, lang: ${request.lang}, ${request.text.length} chars)`);
    let stdout;
    try {
        stdout = await new Promise((resolve, reject) => {
            execFile(python, ['-c', SYNTH_SNIPPET, payload], { timeout: timeoutFor(request.text.length), maxBuffer: 1024 * 1024 }, (error, out, errOut) => {
                if (error) {
                    // ENOENT = 인터프리터 자체가 없음. 그 외는 파이썬이 죽은 것(스니펫이 예외를
                    // 삼키므로 여기 오면 대개 타임아웃이거나 import 이전 단계의 실패다).
                    const code = error.code;
                    if (code === 'ENOENT') {
                        reject(new Error(installHint(`Python interpreter not found: "${python}"`)));
                        return;
                    }
                    reject(new Error(installHint(`${error.message}\n${errOut.trim()}`.trim())));
                    return;
                }
                resolve(out);
            });
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Supertonic] Error: ${message.split('\n')[0]}`);
        return { success: false, error: message };
    }
    let result;
    try {
        result = JSON.parse(stdout.trim().split('\n').pop() || '');
    }
    catch {
        return { success: false, error: `Unexpected output from the local TTS runtime:\n${stdout.slice(0, 500)}` };
    }
    if (!result.ok) {
        const detail = result.error || 'unknown error';
        // 패키지 미설치만 설치 안내를 붙인다 — 합성 자체의 실패에 설치법을 덧대면
        // 원인이 묻힌다.
        return {
            success: false,
            error: result.kind === 'missing_package' ? installHint(detail) : detail,
        };
    }
    console.error(`[Supertonic] Audio saved to: ${outFile} (${result.duration}s in ${result.elapsed}s)`);
    return {
        success: true,
        audioPath: outFile,
        voice: request.voice,
        lang: request.lang,
        durationSeconds: result.duration,
        sampleRate: SUPERTONIC_SAMPLE_RATE,
        elapsedSeconds: result.elapsed,
    };
}
