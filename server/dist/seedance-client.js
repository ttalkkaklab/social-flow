/**
 * ByteDance Seedance 비디오 생성 클라이언트 (BytePlus ModelArk).
 *
 * Veo(video-client.ts)와 같은 자리를 쓰는 두 번째 영상 엔진이다. 둘은 대체재가
 * 아니라 **상황이 다른 도구**다 — 어느 쪽을 언제 쓰는지는
 * skills/produce/references/video-model-selection.md 가 정본이다.
 *
 * - 모델 7종: Dreamina Seedance 2.5 / 2.0·fast·mini / Seedance 1.5 pro / 1.0 pro·fast
 * - Text-to-Video, Image-to-Video(첫 프레임 · 첫+끝 프레임), 참조 이미지(2.x 전용)
 * - 비율 7종(9:16 포함) · 24fps 고정 · 길이 2~30초(모델별로 다름)
 * - 생성은 비동기 — POST 로 태스크를 만들고 GET 으로 폴링한 뒤 mp4 를 내려받는다
 *
 * 결과 URL 은 **24시간짜리**라 폴링이 끝나는 즉시 로컬에 저장하고 경로만 반환한다
 * (Veo 클라이언트와 같은 계약). 과금 근거인 completion_tokens 도 함께 돌려준다 —
 * 벤더 청구 기준이 이 값이라 예상 단가로 환산한 값보다 이쪽이 정본이다.
 *
 * API 키는 기동 시가 아니라 호출 시점에 검증한다 (config.requireArkKey).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { arkBaseUrl, requireArkKey } from './config.js';
import { ALLOWED_EXTENSIONS, bareFilenameSchema, mimeFromExtension, resolveOutputFile, validateFilePath, } from './media-utils.js';
// ── 모델 능력표 (정본) ──────────────────────────────────────────────
//
// 공식 문서(docs.byteplus.com/en/docs/ModelArk 1330310·1520757·1544106, 2026-08-15
// 확인)의 모델별 제약을 그대로 옮긴 것이다. 스키마 검증·툴 enum·문서가 전부 이
// 표에서 파생된다 — 값을 여러 곳에 복사해 두면 모델이 늘 때 한쪽만 고쳐진다.
export const VALID_SEEDANCE_RESOLUTIONS = ['480p', '720p', '1080p', '4k'];
/** 비율 7종. adaptive 는 입력(이미지·영상)의 비율을 그대로 따른다. */
export const VALID_SEEDANCE_RATIOS = ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9', 'adaptive'];
export const SEEDANCE_MODEL_SPECS = {
    // 1080p 는 2026-08-17(UTC+8)부터 열린다 — 그날 이후 resolutions 에 '1080p' 를 더한다.
    'dreamina-seedance-2-5-260628': {
        resolutions: ['480p', '720p'],
        duration: [4, 30],
        lastFrame: true,
        referenceImages: [1, 30],
        audio: true,
        seed: false,
        realFaceInput: false,
        activationGate: true,
    },
    'dreamina-seedance-2-0-260128': {
        resolutions: ['480p', '720p', '1080p', '4k'],
        duration: [4, 15],
        lastFrame: true,
        referenceImages: [1, 9],
        audio: true,
        seed: false,
        realFaceInput: false,
        activationGate: true,
    },
    'dreamina-seedance-2-0-fast-260128': {
        resolutions: ['480p', '720p'],
        duration: [4, 15],
        lastFrame: true,
        referenceImages: [1, 9],
        audio: true,
        seed: false,
        realFaceInput: false,
        activationGate: true,
    },
    'dreamina-seedance-2-0-mini-260615': {
        resolutions: ['480p', '720p'],
        duration: [4, 15],
        lastFrame: true,
        referenceImages: [1, 9],
        audio: true,
        seed: false,
        realFaceInput: false,
        activationGate: true,
    },
    'seedance-1-5-pro-251215': {
        resolutions: ['480p', '720p', '1080p'],
        duration: [4, 12],
        lastFrame: true,
        referenceImages: false,
        audio: true,
        seed: true,
        realFaceInput: true,
        activationGate: false,
    },
    'seedance-1-0-pro-250528': {
        resolutions: ['480p', '720p', '1080p'],
        duration: [2, 12],
        lastFrame: true,
        referenceImages: false,
        audio: false,
        seed: true,
        realFaceInput: true,
        activationGate: false,
    },
    'seedance-1-0-pro-fast-251015': {
        resolutions: ['480p', '720p', '1080p'],
        duration: [2, 12],
        lastFrame: false,
        referenceImages: false,
        audio: false,
        seed: true,
        realFaceInput: true,
        activationGate: false,
    },
};
export const VALID_SEEDANCE_MODELS = Object.keys(SEEDANCE_MODEL_SPECS);
/**
 * 기본 모델 — Seedance 1.5 pro.
 *
 * 이 파이프라인의 기본 포맷(9:16 · 1080p)을 오늘 뽑을 수 있는 모델 중 가장 싸고,
 * 실사 인물 입력을 받으며(2.x 는 거부한다), seed 로 재현이 되고, 잔액 관문도 없다.
 */
export const DEFAULT_SEEDANCE_MODEL = 'seedance-1-5-pro-251215';
/** 참조 이미지를 받는 모델만 (2.x 계열) — seedance_reference 의 enum 정본 */
export const SEEDANCE_REFERENCE_MODELS = VALID_SEEDANCE_MODELS.filter((model) => SEEDANCE_MODEL_SPECS[model].referenceImages !== false);
/**
 * 참조 툴의 기본 모델 — Dreamina Seedance 2.0.
 *
 * 2.5 가 참조 30장·30초로 기능이 더 넓지만 **품질 근거가 없다** — Artificial
 * Analysis 블라인드 아레나 네 보드 어디에도 없고 ByteDance 도 수치 벤치마크를
 * 내지 않았다(2026-08-15 확인). 2.0 은 같은 아레나 이미지→영상 보드 1위이고
 * (Elo 1,198 · 표본 12,599) 1080p·4K 도 낸다. 근거 있는 쪽을 기본값으로 둔다.
 *
 * 목록 순서에서 뽑지 않고 상수로 박는 이유는, 능력표에 모델을 하나 끼워 넣는
 * 순간 기본값이 조용히 바뀌는 결합을 없애기 위해서다.
 */
export const DEFAULT_SEEDANCE_REFERENCE_MODEL = 'dreamina-seedance-2-0-260128';
/** 실사 인물이 든 입력 이미지를 받는 모델만 — 커버 배경 → b-roll 레인이 쓸 수 있는 목록 */
export const SEEDANCE_REAL_FACE_MODELS = VALID_SEEDANCE_MODELS.filter((model) => SEEDANCE_MODEL_SPECS[model].realFaceInput);
export const DEFAULT_SEEDANCE_RESOLUTION = '720p';
export const DEFAULT_SEEDANCE_DURATION = 5; // 전 모델의 길이 범위에 들어가는 유일한 공통 기본값
export const SEEDANCE_FPS = 24; // 전 모델 고정
const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 90; // 15분 최대 대기 — 2.5 의 30초 클립은 Veo 보다 오래 걸린다
const MAX_INPUT_IMAGE_BYTES = 30 * 1024 * 1024; // 이미지 1장 상한 (공식)
const MAX_REQUEST_BYTES = 64 * 1024 * 1024; // 요청 본문 상한 (공식)
// ── 공통 스키마 조각 ────────────────────────────────────────────────
const commonFields = {
    prompt: z.string().min(1, 'Prompt is required'),
    model: z.enum(VALID_SEEDANCE_MODELS).optional().default(DEFAULT_SEEDANCE_MODEL),
    resolution: z.enum(VALID_SEEDANCE_RESOLUTIONS).optional().default(DEFAULT_SEEDANCE_RESOLUTION),
    durationSeconds: z.number().int().optional().default(DEFAULT_SEEDANCE_DURATION),
    generateAudio: z.boolean().optional().default(false),
    watermark: z.boolean().optional().default(false),
    seed: z.number().int().min(-1).max(2147483647).optional(),
    cameraFixed: z.boolean().optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').optional(),
};
/**
 * 모델 × 해상도 × 길이 × 기능 교차 제약 검증 (공식 문서 준거).
 *
 * 호출 전에 거부하는 이유는 Veo 와 같다 — 생성 한 번이 분 단위로 걸리고, 잘못된
 * 조합은 비동기 에러로 돌아와 그 시간을 통째로 태운다. 여기서 거부하면 모델은
 * 즉시 교정된 인자로 다시 부를 수 있다.
 */
function validateCommon(data, ctx) {
    const spec = SEEDANCE_MODEL_SPECS[data.model];
    if (!spec.resolutions.includes(data.resolution)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['resolution'],
            message: `${data.model} 은(는) ${data.resolution} 을 지원하지 않습니다 (지원: ${spec.resolutions.join(', ')}).`,
        });
    }
    const [minDuration, maxDuration] = spec.duration;
    if (data.durationSeconds < minDuration || data.durationSeconds > maxDuration) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['durationSeconds'],
            message: `${data.model} 의 길이 범위는 ${minDuration}~${maxDuration}초입니다 (요청: ${data.durationSeconds}초).`,
        });
    }
    if (data.generateAudio && !spec.audio) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['generateAudio'],
            message: `${data.model} 은(는) 무음 전용이라 음성을 생성할 수 없습니다. 음성이 필요하면 seedance-1-5-pro-251215 이상을 쓰세요.`,
        });
    }
    if (!spec.seed) {
        if (data.seed !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['seed'],
                message: `${data.model} 은(는) seed 를 지원하지 않습니다 (Seedance 1.5 pro·1.0 pro·1.0 pro fast 전용).`,
            });
        }
        if (data.cameraFixed !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['cameraFixed'],
                message: `${data.model} 은(는) cameraFixed 를 지원하지 않습니다 (Seedance 1.5 pro·1.0 pro·1.0 pro fast 전용). 카메라 고정은 프롬프트로 지시하세요.`,
            });
        }
    }
}
// Text-to-Video 요청 스키마
export const seedanceText2VideoSchema = z
    .object({
    ...commonFields,
    ratio: z.enum(VALID_SEEDANCE_RATIOS).optional().default('16:9'),
})
    .superRefine(validateCommon);
// Image-to-Video 요청 스키마 (첫 프레임 · 첫+끝 프레임)
export const seedanceImg2VideoSchema = z
    .object({
    ...commonFields,
    sourceImagePath: z.string().min(1, 'Source image path is required'),
    lastImagePath: z.string().optional(),
    // 입력 이미지 비율을 그대로 따르는 것이 기본이다 — 다른 비율을 지정하면
    // 서버가 소스 이미지를 중앙 기준으로 잘라낸다(9:16 커버가 잘리는 사고).
    ratio: z.enum(VALID_SEEDANCE_RATIOS).optional().default('adaptive'),
})
    .superRefine((data, ctx) => {
    validateCommon(data, ctx);
    if (data.lastImagePath && !SEEDANCE_MODEL_SPECS[data.model].lastFrame) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lastImagePath'],
            message: `${data.model} 은(는) 첫 프레임만 받습니다 — 첫+끝 프레임 보간은 seedance-1-0-pro-250528 이상을 쓰세요.`,
        });
    }
});
// 참조 이미지 요청 스키마 (2.x 전용 — omni reference)
//
// model 을 공통 필드에서 **덮어쓴다**. 툴 표면(JSON 스키마)의 default 는 안내일 뿐
// 실제로 적용되는 건 여기 zod 기본값이라, 덮어쓰지 않으면 공통 기본값(1.5 pro)이
// 들어오고 아래 superRefine 이 그걸 거절한다 — 인자를 생략한 정상 호출이 전부
// 실패한다. 좁힌 enum 은 1.x 를 아래 검증까지 가기 전에 걸러 메시지도 명확해진다.
export const seedanceReferenceSchema = z
    .object({
    ...commonFields,
    model: z
        .enum(SEEDANCE_REFERENCE_MODELS)
        .optional()
        .default(DEFAULT_SEEDANCE_REFERENCE_MODEL),
    referenceImagePaths: z.array(z.string()).min(1, 'At least one reference image is required'),
    ratio: z.enum(VALID_SEEDANCE_RATIOS).optional().default('adaptive'),
})
    .superRefine((data, ctx) => {
    validateCommon(data, ctx);
    const range = SEEDANCE_MODEL_SPECS[data.model].referenceImages;
    if (range === false) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['model'],
            message: `${data.model} 은(는) 참조 이미지를 지원하지 않습니다. Dreamina Seedance 2.5 또는 2.0 계열(${SEEDANCE_REFERENCE_MODELS.join(', ')})을 쓰세요.`,
        });
        return;
    }
    const [, maxImages] = range;
    if (data.referenceImagePaths.length > maxImages) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['referenceImagePaths'],
            message: `${data.model} 의 참조 이미지 상한은 ${maxImages}장입니다 (요청: ${data.referenceImagePaths.length}장).`,
        });
    }
});
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** ModelArk 에러 본문에서 모델이 읽을 수 있는 한 줄을 뽑는다. */
function describeHttpError(status, body) {
    try {
        const parsed = JSON.parse(body);
        const code = parsed.error?.code;
        const message = parsed.error?.message;
        if (message)
            return `HTTP ${status} ${code ? `(${code}) ` : ''}${message}`;
    }
    catch {
        // JSON 이 아니면 원문을 그대로 쓴다
    }
    return `HTTP ${status} — ${body.slice(0, 400)}`;
}
/** 태스크 생성 → 태스크 ID */
async function createTask(apiKey, body) {
    const response = await fetch(`${arkBaseUrl()}/contents/generations/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`Failed to create video task: ${describeHttpError(response.status, await response.text())}`);
    }
    const json = (await response.json());
    if (!json.id)
        throw new Error('No task id returned from ModelArk');
    return json.id;
}
async function getTask(apiKey, taskId) {
    const response = await fetch(`${arkBaseUrl()}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
        throw new Error(`Failed to get task status: ${describeHttpError(response.status, await response.text())}`);
    }
    return response.json();
}
/**
 * 완료 폴링 → mp4 다운로드 → 로컬 저장.
 *
 * 다운로드에는 API 키를 보내지 않는다 — video_url 은 서명이 이미 붙은 오브젝트
 * 스토리지 주소이고, 남의 도메인에 우리 키를 얹을 이유가 없다.
 */
async function awaitVideoAndSave(apiKey, taskId, outputPath, filename) {
    for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
        console.error(`[Seedance] Generation in progress... (polling ${poll}/${MAX_POLLS})`);
        await sleep(POLL_INTERVAL_MS);
        const task = await getTask(apiKey, taskId);
        if (task.status === 'failed' || task.status === 'expired' || task.status === 'cancelled') {
            const reason = task.error?.message || task.status;
            return { error: `Generation ${task.status}: ${reason}` };
        }
        if (task.status !== 'succeeded')
            continue;
        const videoUrl = task.content?.video_url;
        if (!videoUrl)
            return { error: 'Task succeeded but no video_url in response' };
        // 경로 검증(traversal·확장자)은 다운로드 전에 한다 — 수십 MB 를 받고 나서
        // 거부하면 대역폭이 낭비되고, 결과 URL 은 24시간 뒤 사라져 재시도도 못 한다.
        const fullPath = resolveOutputFile(outputPath, filename, 'video');
        const download = await fetch(videoUrl);
        if (!download.ok) {
            return { error: `Failed to download video: HTTP ${download.status} (URL 유효기간 24시간)` };
        }
        fs.writeFileSync(fullPath, Buffer.from(await download.arrayBuffer()));
        console.error(`[Seedance] Video saved to: ${fullPath}`);
        return { videoPath: fullPath, task };
    }
    return { error: `Video generation timed out (${(MAX_POLLS * POLL_INTERVAL_MS) / 60_000} minutes). 태스크 ${taskId} 는 계속 돌고 있을 수 있다 — ModelArk 콘솔에서 확인할 것.` };
}
/**
 * 로컬 이미지를 data URI 로 읽는다.
 *
 * ModelArk 는 공개 URL 이 아니면 base64 data URI 만 받는다. 형식 문자열은
 * 소문자여야 하고(`data:image/png;base64,`), 요청 본문 전체가 64MB 를 넘으면 안 된다.
 */
function readImageDataUri(filePath) {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_INPUT_IMAGE_BYTES) {
        throw new Error(`Input image too large: ${path.basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(1)}MB, 상한 30MB)`);
    }
    const buffer = fs.readFileSync(filePath);
    return `data:${mimeFromExtension(filePath, 'image')};base64,${buffer.toString('base64')}`;
}
/** 입력 이미지 경로를 검증하고 data URI 로 바꾼다 (존재·확장자·크기·합계). */
function loadImages(filePaths) {
    const uris = [];
    for (const filePath of filePaths) {
        validateFilePath(filePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });
        if (!fs.existsSync(filePath))
            throw new Error(`Image not found: ${filePath}`);
        uris.push(readImageDataUri(filePath));
    }
    const total = uris.reduce((sum, uri) => sum + uri.length, 0);
    if (total > MAX_REQUEST_BYTES) {
        throw new Error(`Request body too large: base64 합계 ${(total / 1024 / 1024).toFixed(1)}MB (상한 64MB). 이미지 수를 줄이거나 해상도를 낮출 것.`);
    }
    return uris;
}
/** 공통 요청 본문 조립 — 모델이 지원하지 않는 필드는 아예 싣지 않는다. */
function buildBody(request, images) {
    const spec = SEEDANCE_MODEL_SPECS[request.model];
    const body = {
        model: request.model,
        content: [{ type: 'text', text: request.prompt }, ...images],
        ratio: request.ratio,
        resolution: request.resolution,
        duration: request.durationSeconds,
        watermark: request.watermark,
    };
    // generate_audio 의 벤더 기본은 true 다. 무음 전용 모델에 넘기면 거절되므로
    // 지원 모델에만 싣고, 우리 기본값은 false 로 뒤집는다 — 이 파이프라인은
    // 나레이션을 TTS 로 따로 붙이고, 1.5 pro 는 음성을 켜면 단가가 정확히 2배다.
    if (spec.audio)
        body.generate_audio = request.generateAudio;
    if (spec.seed) {
        if (request.seed !== undefined)
            body.seed = request.seed;
        if (request.cameraFixed !== undefined)
            body.camera_fixed = request.cameraFixed;
    }
    return body;
}
/** 성공 응답 조립 — 실제 생성 결과(벤더가 돌려준 값)를 우선한다. */
function toResponse(request, videoPath, task, taskId) {
    return {
        success: true,
        videoPath,
        prompt: request.prompt,
        model: request.model,
        ratio: task.ratio ?? request.ratio,
        resolution: task.resolution ?? request.resolution,
        duration: task.duration ?? request.durationSeconds,
        completionTokens: task.usage?.completion_tokens,
        taskId,
    };
}
function toFailure(error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Seedance] Error: ${message}`);
    return { success: false, error: message };
}
// ── 생성 함수 3종 ────────────────────────────────────────────────────
/** 텍스트 프롬프트로 영상 생성 */
export async function generateFromText(request) {
    const apiKey = requireArkKey();
    try {
        console.error(`[Seedance] Starting text-to-video generation... (model: ${request.model})`);
        const taskId = await createTask(apiKey, buildBody(request, []));
        const saved = await awaitVideoAndSave(apiKey, taskId, request.outputPath || process.cwd(), request.filename || `video_${Date.now()}.mp4`);
        if ('error' in saved)
            return { success: false, error: saved.error, taskId };
        return toResponse(request, saved.videoPath, saved.task, taskId);
    }
    catch (error) {
        return toFailure(error);
    }
}
/** 이미지에서 영상 생성 (첫 프레임 · 첫+끝 프레임 보간) */
export async function generateFromImage(request) {
    const apiKey = requireArkKey();
    try {
        const paths = [request.sourceImagePath, ...(request.lastImagePath ? [request.lastImagePath] : [])];
        const uris = loadImages(paths);
        const images = uris.map((url, index) => ({
            type: 'image_url',
            image_url: { url },
            role: index === 0 ? 'first_frame' : 'last_frame',
        }));
        console.error(`[Seedance] Starting image-to-video generation... (model: ${request.model})`);
        console.error(`[Seedance] First frame: ${request.sourceImagePath}`);
        if (request.lastImagePath)
            console.error(`[Seedance] Last frame: ${request.lastImagePath}`);
        const taskId = await createTask(apiKey, buildBody(request, images));
        const saved = await awaitVideoAndSave(apiKey, taskId, request.outputPath || process.cwd(), request.filename || `video_${Date.now()}.mp4`);
        if ('error' in saved)
            return { success: false, error: saved.error, taskId };
        return {
            ...toResponse(request, saved.videoPath, saved.task, taskId),
            sourceImage: request.sourceImagePath,
            lastImage: request.lastImagePath,
        };
    }
    catch (error) {
        return toFailure(error);
    }
}
/** 참조 이미지로 피사체 일관성을 지키며 영상 생성 (Dreamina Seedance 2.x 전용) */
export async function generateWithReferences(request) {
    const apiKey = requireArkKey();
    try {
        const images = loadImages(request.referenceImagePaths).map((url) => ({
            type: 'image_url',
            image_url: { url },
            role: 'reference_image',
        }));
        console.error(`[Seedance] Starting reference-to-video generation... (model: ${request.model})`);
        console.error(`[Seedance] Reference images: ${request.referenceImagePaths.join(', ')}`);
        const taskId = await createTask(apiKey, buildBody(request, images));
        const saved = await awaitVideoAndSave(apiKey, taskId, request.outputPath || process.cwd(), request.filename || `video_ref_${Date.now()}.mp4`);
        if ('error' in saved)
            return { success: false, error: saved.error, taskId };
        return {
            ...toResponse(request, saved.videoPath, saved.task, taskId),
            referenceImages: request.referenceImagePaths,
        };
    }
    catch (error) {
        return toFailure(error);
    }
}
