export const RATE: number, BYTES: number, LIMIT: number, POLICY: string;
export interface SpeechSegment { startSeconds: number; expectedText: string }
export interface SpeechPiece { kind: string; index: number; firstUnit: number; lastUnit: number; startSample: number; endSample: number; expectedText: string }
export function hash(x: string | Buffer): string;
export function digest(x: unknown): string;
export function decode(media: string): Buffer;
export function plan(segments: SpeechSegment[], totalSamples: number, text: string): SpeechPiece[];
export function manifest(p: any): string;
export function listeningFailures(p: any): string[];
export function validate(p: any, pcm: Buffer, text: string, requirePass?: boolean): string[];
