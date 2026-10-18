// Deterministic typography fixture; content warnings are intentionally not approvals.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const channel = path.join(root, 'data', 'review-typography');
const board = path.join(channel, 'episodes', 'multilingual', 'storyboard');
fs.mkdirSync(board, { recursive: true });
fs.writeFileSync(path.join(channel, 'profile.md'), '---\nname: Atelier Story\n---\n');
const samples = [
  ['ko', '빛이 들어오는 순간', '창가에 놓인 작은 잔에서 이야기가 시작됩니다.'],
  ['en', 'A quieter kind of morning', 'The camera moves closer as the first light reaches the table.'],
  ['ja', '光が差し込む瞬間', '窓辺の小さなカップから、今日の物語が始まります。骨 直 令'],
  ['zh-Hans', '晨光里的故事', '镜头慢慢靠近，让清晨的光线照亮桌上的茶杯。骨 直 令'],
  ['zh-Hant', '晨光裡的故事', '鏡頭慢慢靠近，讓清晨的光線照亮桌上的茶杯。骨 直 令'],
  ['vi', 'Một buổi sáng dịu dàng', 'Ánh sáng nhẹ nhàng chiếu qua cửa sổ. Hãy kể một câu chuyện thật rõ ràng.'],
  ['de', 'Ein ruhiger Morgen', 'Draußen verändert sich das Licht. Die größte Überraschung liegt im Detail. ÄÖÜ äöü ß ẞ'],
  ['fr', 'La lumière du matin', 'Une scène délicate, où chaque détail révèle l’émotion. Cœur, œuvre et sérénité.'],
  ['es', 'La primera luz del día', '¿Qué historia cuenta esta pequeña taza? Una mañana cálida, llena de posibilidades.'],
];
const doc = {
  channel: 'review-typography', channelName: 'Atelier Story', topic: 'multilingual',
  displayTitle: '빛으로 시작하는 이야기', contentLanguage: 'ko',
  shotLanguages: Object.fromEntries(samples.map(([lang], i) => [i + 1, lang])),
  series: 'Morning studies', status: 'draft', created: '2026-10-18', outro: null,
  keyMessage: '한 장면의 분위기는 작은 빛에서 시작합니다.',
  characters: [{ id: 'narrator', name: 'Mina', panels: { face: 'portrait.png' } }],
  narratorCharacterId: 'narrator', speechPlanVersion: 1,
  sceneNotes: {}, transitions: [], sources: [], platforms: [], seriesNote: '', hook: '빛이 들어오는 순간',
};
const scenes = samples.map(([lang, title, text], i) => ({
  id: i + 1, type: i ? 'points' : 'cover', title, duration: 8,
  beat: i ? 'drip' : 'cover',
  narration: [{ tts: text, sub: text, speaker: 'narrator', delivery: 'voiceover' }],
  shot: { size: 'mcu', angle: 'eye', feel: title, info: text,
    render: { mode: 'still_camera', purpose: 'mood', reason: 'Observe the changing morning light.' } },
  visual: { bg: 'scene.png' },
}));
fs.copyFileSync(path.join(root, 'skills/storyboard/assets/styles/tactile-miniature-v1/conversation.png'), path.join(board, 'scene.png'));
fs.copyFileSync(path.join(root, 'skills/storyboard/assets/styles/tactile-miniature-v1/character.png'), path.join(board, 'portrait.png'));
fs.writeFileSync(path.join(board, 'scenes.js'), 'window.THEME = {brand:"Atelier Story",accent:"#2563eb",accent2:"#5a73b8",ink:"#152438"};\nwindow.SCENES = ' + JSON.stringify(scenes) + ';\nwindow.SB_DOC = ' + JSON.stringify(doc) + ';\n');
fs.writeFileSync(path.join(board, 'storyboard.md'), '# Typography review fixture\n');
require(path.join(root, 'skills/storyboard/references/storyboard-html.js')).storyboardHtml(board);
require(path.join(root, 'skills/channel/references/review-library.js')).exportChannel(channel);
console.log(board);
