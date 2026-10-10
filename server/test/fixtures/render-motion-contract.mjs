import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const refs = fileURLToPath(new URL('../../../skills/produce/references/', import.meta.url));
const template = readFileSync(new URL('../../../skills/storyboard/references/motion-slide-template.html', import.meta.url), 'utf8');
const { slideEvidence } = require(join(refs, 'measure-motion.js'));
const root = resolve(process.argv[2] || '/tmp/social-flow-motion-html');
mkdirSync(join(root, 'slides'), { recursive: true });
writeFileSync(join(root, 'scenes.js'), 'window.SCENES=[{title:"",narration:[{tts:"Motion comparison"}],visual:{slide:{kind:"diagram",motion:true}}}];');

function run(bin, args) {
  const result = spawnSync(bin, args, { encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
}
const cases = ['thin-line', 'static', 'flicker', 'background-only', 'subject-action'];
const results = [];
for (const kind of cases) {
  const dir = join(root, kind); mkdirSync(dir, { recursive: true });
  let html = template.replace('const SLIDE_SHOT = 0;', 'const SLIDE_SHOT = 1;');
  const start = html.indexOf('  function renderSlide(S, h) {');
  const end = html.indexOf('\n  /* 바탕 기본값', start);
  html = html.slice(0, start) + `  function renderSlide(S, h) {
    return h.stage('flat') + '<div id="actor"></div>' + ${kind === 'thin-line' ? "h.link(1, {sv:true})" : "''"};
  }\n` + html.slice(end);
  // All test-only motion is explicitly sought to the requested time, with no wall-clock animation.
  html = html.replace('</head>', `<style>
    html,body,#root,#stage {background:#181818!important} #stage {position:fixed!important;inset:0!important;padding:0!important;transform:none!important}
    #actor{position:absolute;left:300px;top:850px;width:400px;height:200px;background:#606060}
    .link{margin:0!important} .rv:has(.link){position:absolute;top:1100px;left:0;width:1080px}
  </style></head>`);
  html = html.replace('</body>', `<script>
    window.__ready().then(()=>{
      const t=Number(new URLSearchParams(location.search).get('t'));
      window.__setSegs({1:3000}); window.__seek(t,1);
      const actor=document.getElementById('actor');
      if('${kind}'==='flicker') actor.style.background=(Math.round(t/250)%2?'#616161':'#606060');
      if('${kind}'==='background-only') document.getElementById('stage').style.setProperty('background',Math.round(t/250)%2?'#505050':'#a0a0a0','important');
      if('${kind}'==='subject-action'){actor.style.left='50px';actor.style.top='750px';actor.style.height='600px';actor.style.width=(900*t/3000)+'px';actor.style.background='#f0f0f0';}
    });
  </script></body>`);
  const file = join(root, 'slides', `s1-${kind}.html`); writeFileSync(file, html);
  for (let frame = 0; frame <= 12; frame++) {
    run('bash', [join(refs, 'capture-frames.sh'), `${pathToFileURL(file)}?t=${frame * 250}`, join(dir, `f${String(frame).padStart(4, '0')}.png`)]);
  }
  const source = join(dir, 'source.mkv'), encoded = join(dir, 'encoded.mp4');
  run('ffmpeg', ['-y', '-v', 'error', '-framerate', '4', '-i', join(dir, 'f%04d.png'), '-c:v', 'ffv1', source]);
  run('ffmpeg', ['-y', '-v', 'error', '-i', source, '-r', '30', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', encoded]);
  const evidence = { kind, source: slideEvidence(source), encoded: slideEvidence(encoded) };
  results.push(evidence); console.log(JSON.stringify(evidence));
  for (const value of [evidence.source, evidence.encoded]) assert.equal(value.findings.length > 0, !['background-only', 'subject-action'].includes(kind));
}
writeFileSync(join(root, 'evidence.json'), JSON.stringify(results, null, 2) + '\n');
