import { nativeHeight, idleCount } from './live-idle.js';
import { createInterface } from 'node:readline/promises';

export const liveStartChoices = {
  format: 'locked-camera conversation',
  generation: 'GenAI LTX 2.5 picture and native dialogue',
  modelCanvas: [720, nativeHeight],
  standbyClips: idleCount,
  standbySeconds: [3, 5],
  output: [720, 1280],
  spatialUpscale: false,
  faceComposite: false,
  choices: [
    { id: 'ready', label: '준비되면 방송 · 첫 인사와 이어질 멘트, 대기 영상 10개가 준비되면 방송을 시작해요.' },
    { id: 'preview', label: '미리보기 먼저 · 첫 장면을 보고 방송할지 정해요.' },
    { id: 'cancel', label: '취소 · 이번 방송을 시작하지 않아요.' }
  ]
};

export async function liveStartChoice(value?: string) {
  if (!value && process.stdin.isTTY && process.stderr.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      const options = liveStartChoices.choices.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
      const answer = (await rl.question(`고정 화면 대화 · 720×1280 · 모델 생성 대기\n${options}\n선택 번호: `)).trim();
      value = liveStartChoices.choices.find((_, i) => String(i + 1) === answer)?.id ?? answer;
    } finally {
      rl.close();
    }
  }
  if (value !== 'ready' && value !== 'preview' && value !== 'cancel')
    throw Error('A start choice is required. Run choices and pass --start ready|preview|cancel.');
  return value;
}
