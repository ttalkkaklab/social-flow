/**
 * 생성 미디어 파일 유틸 — fect-mcp-server shared/path-utils.ts 이식(이미지·영상·오디오).
 *
 * 경로 검증(traversal 차단 + 확장자 화이트리스트)과 base64 이미지·오디오 저장을 담당한다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

/** 허용된 파일 확장자 목록 (모듈별) */
export const ALLOWED_EXTENSIONS = {
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'],
  video: ['.mp4', '.webm', '.mov', '.avi'],
  audio: ['.wav', '.mp3', '.ogg', '.webm', '.aac', '.flac'],
} as const;

/**
 * 파일 경로의 안전성을 검증한다.
 *
 * - path traversal (../) 공격을 방지한다.
 * - 허용된 확장자만 통과시킨다.
 */
export function validateFilePath(
  filePath: string,
  options?: { allowedExtensions?: readonly string[] },
): void {
  const resolved = path.resolve(filePath);

  // path traversal 패턴 검사
  if (filePath.includes('..')) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }

  // 확장자 화이트리스트 검사
  if (options?.allowedExtensions) {
    const ext = path.extname(resolved).toLowerCase();
    if (!options.allowedExtensions.includes(ext)) {
      throw new Error(
        `File extension "${ext}" is not allowed. Allowed: ${options.allowedExtensions.join(', ')}`,
      );
    }
  }
}

/** 에러 메시지를 추출한다. */
export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 바이트 수를 사람이 읽기 쉬운 단위(B/KB/MB)로 포맷한다. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * base64 이미지 데이터를 파일로 저장한다.
 *
 * - 부모 디렉토리를 자동 생성한다.
 * - 확장자가 이미지 포맷이 아니면 에러를 발생시킨다.
 * - 저장된 파일의 절대 경로와 크기(bytes)를 반환한다.
 */
export async function saveBase64Image(
  base64Data: string,
  filePath: string,
): Promise<{ filePath: string; size: number }> {
  validateFilePath(filePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });

  const resolved = path.resolve(filePath);
  await fs.promises.mkdir(path.dirname(resolved), { recursive: true });

  const buffer = Buffer.from(base64Data, 'base64');
  await fs.promises.writeFile(resolved, buffer);

  const stats = await fs.promises.stat(resolved);
  return { filePath: resolved, size: stats.size };
}

/**
 * 컨테이너 없는 16-bit 원시 PCM 을 WAV 로 감싼다.
 *
 * TTS(모노 24kHz)와 음악(스테레오 48kHz)이 각각 들고 있던 동일 헤더 생성 코드를
 * 파라미터 하나로 접은 것이다 — 채널 수·샘플레이트만 다르고 나머지는 같다.
 */
export function pcmToWav(pcmData: Buffer, sampleRate: number, numChannels: number): Buffer {
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * 생성 미디어의 저장 경로를 안전하게 조립한다 (디렉토리 생성 포함).
 *
 * filename 은 순수 파일명만 받는다 — path.join 이 `../` 를 정규화해 없애버리므로
 * 조립 후 검증으로는 traversal 을 잡을 수 없다. 분리자 자체를 거부해야 한다.
 */
export function resolveOutputFile(
  outputDir: string,
  filename: string,
  kind: keyof typeof ALLOWED_EXTENSIONS,
): string {
  if (/[/\\]/.test(filename) || filename.includes('..')) {
    throw new Error(`filename must be a bare file name without path separators: "${filename}"`);
  }
  validateFilePath(filename, { allowedExtensions: ALLOWED_EXTENSIONS[kind] });

  const dir = path.resolve(outputDir);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}

/** 생성된 미디어 버퍼를 <디렉토리>/<파일명> 으로 저장하고 절대 경로를 반환한다. */
export function saveMediaFile(
  outputDir: string,
  filename: string,
  data: Buffer,
  kind: keyof typeof ALLOWED_EXTENSIONS,
): string {
  const fullPath = resolveOutputFile(outputDir, filename, kind);
  fs.writeFileSync(fullPath, data);
  return fullPath;
}

/** 오디오 전용 단축 — TTS·음악 클라이언트가 쓴다. */
export function saveAudioFile(outputDir: string, filename: string, data: Buffer): string {
  return saveMediaFile(outputDir, filename, data, 'audio');
}

/**
 * filename 인자용 zod 스키마 — resolveOutputFile 과 같은 규칙을 **호출 전에** 적용한다.
 *
 * 저장 시점 검증만 두면 Veo 처럼 1~6분 걸리는 생성이 다 끝난 뒤에야 파일명이 거부되어
 * 시간과 비용이 통째로 날아간다. 저장 시점 검증은 방어선으로 그대로 둔다.
 */
export function bareFilenameSchema(kind: keyof typeof ALLOWED_EXTENSIONS) {
  const allowed = ALLOWED_EXTENSIONS[kind];
  return z
    .string()
    .min(1)
    .refine((name) => !/[/\\]/.test(name) && !name.includes('..'), {
      message: 'filename must be a bare file name without path separators (use outputPath for the directory)',
    })
    .refine((name) => (allowed as readonly string[]).includes(path.extname(name).toLowerCase()), {
      message: `filename extension must be one of: ${allowed.join(', ')}`,
    });
}

/** 파일 확장자로 입력 미디어 MIME 타입을 결정한다. */
export function mimeFromExtension(filePath: string, kind: 'image' | 'video'): string {
  const ext = path.extname(filePath).toLowerCase();
  if (kind === 'image') {
    return ext === '.png' ? 'image/png'
      : ext === '.gif' ? 'image/gif'
      : ext === '.webp' ? 'image/webp'
      : 'image/jpeg';
  }
  return ext === '.webm' ? 'video/webm'
    : ext === '.mov' ? 'video/quicktime'
    : 'video/mp4';
}
