/**
 * 생성 미디어 파일 유틸 — fect-mcp-server shared/path-utils.ts 이식(이미지·영상 부분).
 *
 * 경로 검증(traversal 차단 + 확장자 화이트리스트)과 base64 이미지 저장을 담당한다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** 허용된 파일 확장자 목록 (모듈별) */
export const ALLOWED_EXTENSIONS = {
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'],
  video: ['.mp4', '.webm', '.mov', '.avi'],
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
