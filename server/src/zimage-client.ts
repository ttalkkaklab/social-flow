/**
 * Z-Image Turbo 로컬 이미지 생성 클라이언트 — mflux CLI 서브프로세스 호출.
 *
 * gpt_image(image-client.ts)와 나란히 두는 **두 번째 이미지 경로이자 기본 경로**다.
 * 네트워크·API 키·장당 과금이 전부 빠지는 대신 로컬에 mflux 와 모델 가중치가 있어야 한다.
 *
 * 두 경로의 분담(2026-08-12 실측 조사 기준 — docs/research/2026-08-12-local-image-generation):
 *   - 텍스트 없는 이미지(커버 배경·b-roll·시안 탐색) → 이쪽. 장당 비용 0
 *   - 글자가 들어가는 이미지·품질 상향이 필요한 건   → gpt_image_text2img.
 *     한글 렌더링을 실측한 결과 "딸깍연구소"가 "달닥연구소"로 깨졌다(자소 파탄·유사문자).
 *
 * ## 왜 서브프로세스인가
 *
 * mflux 는 Apple MLX 기반 Python 패키지이고 Node 바인딩이 없다. Supertonic
 * (supertonic-client.ts)과 같은 판단이다 — 모델 상주 워커는 수명 관리와 메모리 점유
 * (실측 피크 32~39GB)를 떠안으므로, 필요가 실측으로 입증되기 전에는 상태 없는
 * 서브프로세스가 맞다. Supertonic 과 달리 인라인 스니펫이 아니라 CLI 를 그대로 쓰는
 * 이유: mflux 의 uv tool 설치본은 자체 격리 venv 를 가진 실행 파일이라 인터프리터를
 * 따로 고를 일이 없고, CLI 가 결과 파일 경로 외에 돌려줄 부가 정보(길이 같은)도 없다.
 *
 * 실측치(M4 Max 128GB, 로드 평균 74 과부하 상태 — 보수적 하한):
 *   1024×1024 @9스텝 확산 116~197초 · 1088×1920 @9스텝 443초 · 피크 메모리 31.9~38.9GB
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { mfluxZImageBin } from './config.js';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';

/** Z-Image Turbo 권장 스텝 — 모델 카드 기준 8 NFE(스텝 9 지정 시 DiT 포워드 8회). */
export const DEFAULT_ZIMAGE_STEPS = 9;

/** 실측에 쓴 양자화 폭 — 8bit 가 기본, 4bit 는 메모리 절반에 품질 소폭 하락. */
export const ZIMAGE_QUANTIZE_OPTIONS = [4, 6, 8] as const;
export const DEFAULT_ZIMAGE_QUANTIZE = 8;

/**
 * 해상도 제약 — 변은 16의 배수여야 한다(latent 패치 단위).
 * 9:16 세로형은 1080×1920 이 아니라 **1088×1920** 이다 — 1080 은 16의 배수가 아니다.
 */
export const ZIMAGE_DIMENSION_STEP = 16;
export const MIN_ZIMAGE_DIMENSION = 256;
export const MAX_ZIMAGE_DIMENSION = 2048;

const dimensionSchema = z
  .number()
  .int()
  .min(MIN_ZIMAGE_DIMENSION)
  .max(MAX_ZIMAGE_DIMENSION)
  .refine((v) => v % ZIMAGE_DIMENSION_STEP === 0, {
    message: `width/height must be a multiple of ${ZIMAGE_DIMENSION_STEP} (9:16 은 1080×1920 이 아니라 1088×1920)`,
  });

/**
 * 서브프로세스 타임아웃.
 *
 * 실측: 1024²(1.05MP) 9스텝이 부하에 따라 149~210초, 1088×1920(2.09MP) 9스텝이 462초
 * (로드 평균 74 상태). 픽셀 수와 스텝에 선형으로 잡되 부하 변동 여유를 두고,
 * 모델 로드·양자화 기동 여유 120초에 스텝×MP 당 45초를 더해 30분에서 끊는다.
 */
export function zimageTimeoutMs(width: number, height: number, steps: number): number {
  const megapixels = (width * height) / 1_000_000;
  return Math.min(30 * 60_000, 120_000 + Math.ceil(steps * megapixels * 45_000));
}

/**
 * 가중치 캐시 디렉토리 — 최초 호출 판정용.
 *
 * 위 타임아웃은 생성만 잰 것이라, 새 머신의 첫 호출은 31GB 다운로드가 그 안에
 * 끝나지 못해 execFile 이 다운로드 중간에 프로세스를 죽인다. 캐시가 없으면
 * 다운로드 여유(60분)를 얹는다 — zimageTimeoutMs 자체는 생성 시간 계약으로 남겨 둔다.
 */
function weightCacheDir(): string {
  const hfHome = process.env.HF_HOME || join(homedir(), '.cache', 'huggingface');
  return join(hfHome, 'hub', 'models--Tongyi-MAI--Z-Image-Turbo');
}

const WEIGHT_DOWNLOAD_ALLOWANCE_MS = 60 * 60_000;

/** 실행 실패를 사용자가 고칠 수 있는 안내로 바꾼다. */
function installHint(detail: string): string {
  return (
    `${detail}\n\n` +
    `로컬 이미지 생성은 mflux(Apple Silicon 전용, MLX)를 요구한다:\n` +
    `  uv tool install --python 3.12 mflux\n` +
    `다른 경로에 설치했다면 실행 파일을 MFLUX_ZIMAGE_BIN 으로 지정한다 ` +
    `(예: MFLUX_ZIMAGE_BIN=~/.venvs/mflux/bin/mflux-generate-z-image-turbo).\n` +
    `최초 1회 호출 시 Z-Image Turbo 가중치 저장소 약 31GB 를 ~/.cache/huggingface 에 내려받는다.\n` +
    `설치 전까지는 gpt_image_text2img 를 쓸 것 — 그쪽은 OPENAI_API_KEY 만 있으면 된다.`
  );
}

// ── 요청 스키마 ──────────────────────────────────────────────────

export const zimageGenerateSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(32_000),
  width: dimensionSchema.optional().default(1024),
  height: dimensionSchema.optional().default(1024),
  steps: z.number().int().min(1).max(50).optional().default(DEFAULT_ZIMAGE_STEPS),
  seed: z.number().int().min(0).optional(),
  quantize: z
    .union([z.literal(4), z.literal(6), z.literal(8)])
    .optional()
    .default(DEFAULT_ZIMAGE_QUANTIZE),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('image').optional(),
});

export type ZImageGenerateRequest = z.infer<typeof zimageGenerateSchema>;

export interface ZImageResponse {
  success: boolean;
  imagePath?: string;
  error?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  quantize?: number;
  elapsedSeconds?: number;
}

// ── 생성 ────────────────────────────────────────────────────────

/** 텍스트 → 이미지 로컬 생성 — 커버 배경·b-roll·시안 (텍스트 없는 이미지 전용) */
export async function generateLocalImage(request: ZImageGenerateRequest): Promise<ZImageResponse> {
  const bin = mfluxZImageBin();
  if (!existsSync(bin)) {
    return { success: false, error: installHint(`mflux binary not found: "${bin}"`) };
  }

  const outFile = resolveOutputFile(
    request.outputPath || process.cwd(),
    request.filename || `zimage_${Date.now()}.png`,
    'image',
  );

  // 실측에 쓴 플래그 그대로 조립한다 (--prompt/--width/--height/--steps/-q/--output[/--seed]).
  const cliArgs = [
    '--prompt', request.prompt,
    '--width', String(request.width),
    '--height', String(request.height),
    '--steps', String(request.steps),
    '-q', String(request.quantize),
    '--output', outFile,
  ];
  if (request.seed !== undefined) cliArgs.push('--seed', String(request.seed));

  const firstCall = !existsSync(weightCacheDir());
  if (firstCall) {
    console.error('[Z-Image] First call — downloading ~31GB of weights to the huggingface cache first. This can take a long time.');
  }
  console.error(
    `[Z-Image] Generating locally... (${request.width}x${request.height}, ${request.steps} steps, q${request.quantize})`,
  );

  const startedAt = Date.now();
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        bin,
        cliArgs,
        {
          timeout:
            zimageTimeoutMs(request.width, request.height, request.steps) +
            (firstCall ? WEIGHT_DOWNLOAD_ALLOWANCE_MS : 0),
          // 최초 호출은 31GB 다운로드의 tqdm 진행 출력이 수 MB 로 쌓인다 —
          // Supertonic 의 1MB 를 그대로 쓰면 다운로드 중간에 maxBuffer 로 죽는다.
          maxBuffer: 16 * 1024 * 1024,
        },
        (error, _out, errOut) => {
          if (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
              reject(new Error(installHint(`mflux binary not found: "${bin}"`)));
              return;
            }
            // 진행 바를 제외한 stderr 꼬리만 싣는다 — tqdm 라인은 원인이 아니라 소음이다.
            const tail = errOut
              .split('\n')
              .filter((line) => line.trim() && !line.includes('it/s]') && !line.includes('%|'))
              .slice(-5)
              .join('\n');
            reject(new Error(`${error.message}${tail ? `\n${tail}` : ''}`));
            return;
          }
          resolve();
        },
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Z-Image] Error: ${message.split('\n')[0]}`);
    return { success: false, error: message };
  }

  // mflux 는 성공해도 exit 0 에 침묵할 수 있으므로 산출물 존재를 정본으로 판정한다.
  if (!existsSync(outFile)) {
    return {
      success: false,
      error: `mflux exited without producing the output file: ${outFile}`,
    };
  }

  const elapsed = Math.round((Date.now() - startedAt) / 100) / 10;
  console.error(`[Z-Image] Image saved to: ${outFile} (${elapsed}s)`);
  return {
    success: true,
    imagePath: outFile,
    width: request.width,
    height: request.height,
    steps: request.steps,
    seed: request.seed,
    quantize: request.quantize,
    elapsedSeconds: elapsed,
  };
}
