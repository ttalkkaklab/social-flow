import { nativeHeight, idleCount } from './live-idle.js';
import { createInterface } from 'node:readline/promises';
const speechLanguages = [
    { tag: 'ko', label: '한국어' },
    { tag: 'en', label: 'English' },
    { tag: 'vi', label: 'Tiếng Việt' },
    { tag: 'ja', label: '日本語' },
    { tag: 'zh', label: '中文' }
];
export async function liveSpeechLanguage(value) {
    if (value === undefined && process.stdin.isTTY && process.stderr.isTTY) {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        try {
            const menu = speechLanguages.map(({ label }, i) => `${i + 1}. ${label}`).join(' · ');
            const answer = (await rl.question(`어떤 언어로 방송할까요?
${menu}
번호나 언어 코드(예: fr-CA)를 입력하세요: `)).trim();
            value = speechLanguages.find((_, i) => answer === String(i + 1))?.tag ?? answer;
        }
        finally {
            rl.close();
        }
    }
    if (value === undefined)
        throw Error('Choose the broadcast language for this session and set speechLanguage in its config.');
    if (typeof value === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value)) {
        try {
            return Intl.getCanonicalLocales(value)[0];
        }
        catch { /* Report invalid tags consistently. */ }
    }
    throw Error('Invalid speechLanguage. Use a language tag such as ko, en-US or vi.');
}
export const faqCounts = [10, 30, 50, 100];
export async function liveFaqCount(value) {
    if (!value && process.stdin.isTTY && process.stderr.isTTY) {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        try {
            value = (await rl.question('미리 준비할 예상 질문 수를 고르세요 (10 / 30 / 50 / 100): ')).trim();
        }
        finally {
            rl.close();
        }
    }
    const count = faqCounts.find(candidate => String(candidate) === value);
    if (!count)
        throw Error('Select the number of prepared FAQ videos for this show with --faq-count 10|30|50|100.');
    return count;
}
export const liveStartChoices = {
    speechLanguages,
    faqCounts,
    format: 'locked-camera conversation',
    generation: 'GenAI LTX 2.5 picture and native dialogue',
    modelCanvas: [720, nativeHeight],
    standbyClips: idleCount,
    spokenStandbyClips: 2,
    standbySeconds: [3, 5],
    output: [720, 1280],
    spatialUpscale: false,
    faceComposite: false,
    choices: [
        { id: 'ready', label: '준비되면 방송 · 선택한 예상 답변 영상과 오프닝, 첫 멘트, 환영 인사 두 편, 대기 영상 열 편을 준비하고 시작해요.' },
        { id: 'preview', label: '미리보기 먼저 · 첫 장면을 보고 방송할지 정해요.' },
        { id: 'cancel', label: '취소 · 이번 방송을 시작하지 않아요.' }
    ]
};
export async function liveStartChoice(value) {
    if (!value && process.stdin.isTTY && process.stderr.isTTY) {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        try {
            const options = liveStartChoices.choices.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
            const answer = (await rl.question(`고정 화면 대화 · 720×1280 · 모델 생성 대기\n${options}\n선택 번호: `)).trim();
            value = liveStartChoices.choices.find((_, i) => String(i + 1) === answer)?.id ?? answer;
        }
        finally {
            rl.close();
        }
    }
    if (value !== 'ready' && value !== 'preview' && value !== 'cancel')
        throw Error('A start choice is required. Run choices and pass --start ready|preview|cancel.');
    return value;
}
