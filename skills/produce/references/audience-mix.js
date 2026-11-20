'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { renderedClock } = require('./music-timeline.js');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
function main([mode, rate, seconds, boardFile, from, to]) {
  const fps = Number(rate), length = Number(seconds);
  const rows = fs.readFileSync('work/edit-timeline.tsv','utf8').trim().split('\n').map(line => line.split('\t'));
  if (mode === 'resolve') {
    const plan = JSON.parse(fs.readFileSync('sfx-spans.json', 'utf8'));
    // The sound editor can return a sub-millisecond trim. anchorTime snaps it to a PCM sample.
    const { anchorTime } = renderedClock(plan, rows, fps, length, t => Number.isFinite(t) && t >= 0);
    const resolved = plan.spans.map(span => {
      const start = anchorTime(span.start);
      if (start >= anchorTime({ ...span.start, atSeconds: 'end' })) throw new Error('audience_span_invalid: start at or beyond the rendered cut end: ' + span.id);
      const stop = span.end ? anchorTime(span.end) : span.limit ? anchorTime(span.limit) : length;
      let fade = span.fadeOutSeconds ?? 0;
      if (!(stop > start && fade >= 0 && fade <= stop - start + 1e-8)) throw new Error('audience_span_invalid: ' + span.id);
      const duration = Number(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0',span.assetPath], {encoding:'utf8'}).trim());
      if (!(duration > 0)) throw new Error('Unreadable audience asset: ' + span.assetPath);
      const played = Math.min(duration, stop - start);
      if (!span.end && span.limit && duration > played) fade = Math.min(0.02, played);
      // Fade starts relative to the authored endpoint. A shorter asset may already be silent.
      const fadeStart = Math.max(0, stop - start - fade);
      console.log([start, span.assetPath, span.separationLu, stop - start, fade].join('\t'));
      return { ...span, bodyStartSeconds:start, bodyEndSeconds:start + played, sourceSeconds:duration, fadeStartSeconds:fade ? start + fadeStart : null, listening:'not_reviewed' };
    });
    fs.writeFileSync('work/audience-resolved.json', JSON.stringify(resolved, null, 2) + '\n');
    return;
  }
  if (mode !== 'compare') throw new Error('expected resolve or compare');
  const board = evaluateWindowScript(fs.readFileSync(boardFile, 'utf8'));
  const ordered = board.SCENES, a = ordered.findIndex(s => s.id === from), b = ordered.findIndex(s => s.id === to);
  if (a < 0 || b < a || ordered.slice(a,b+1).some(s => ['broll','outro'].includes(s.type))) throw new Error('Choose continuous body shots in playback order');
  const shots = board.SCENES.map((s,card) => ({id:s.id,card}));
  const clock = renderedClock({version:1,spans:[],shots},rows,fps,length);
  const start = clock.anchorTime({shotId:from,atSeconds:0}), end = clock.anchorTime({shotId:to,atSeconds:'end'});
  // Float PCM retains identical base samples, including headroom above 0 dBFS. Use one
  // shared playback gain for both previews, measured over the actual selected region.
  const sources = ['work/audience-base.wav','work/audience-on.wav'];
  const clip = ['-ss', String(start), '-t', String(end-start)];
  const peaks = sources.map(file => {
    const child = require('node:child_process').spawnSync('ffmpeg',['-hide_banner','-nostats',...clip,'-i',file,'-af','astats=metadata=0','-f','null','-'], { encoding:'utf8' });
    const peaks = [...(child.stderr || '').matchAll(/Peak level dB: (-inf|[-\d.]+)/g)].map(m => m[1] === '-inf' ? -Infinity : Number(m[1]));
    if (child.status !== 0 || !peaks.length || peaks.some(Number.isNaN)) throw new Error('Cannot measure comparison headroom: '+file);
    return Math.max(...peaks);
  });
  const gain = Math.min(0,-1-Math.max(...peaks));
  const tmp = fs.mkdtempSync('work/audience-compare-');
  try {
    for (const [i, name] of ['off','on'].entries()) {
      const out = path.join(tmp,name+'.mov');
      execFileSync('ffmpeg',['-y','-v','error',...clip,'-i','work/video.mp4',...clip,'-i',sources[i],
        '-map','0:v:0','-map','1:a:0','-af','volume='+gain+'dB','-c:v','libx264','-crf','15','-c:a','pcm_s24le',out]);
    }
    for (const name of ['off','on']) fs.renameSync(path.join(tmp,name+'.mov'),'audience-'+name+'.mov');
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
  console.log(JSON.stringify({ from,to,bodyStartSeconds:start,bodyEndSeconds:end,gainDb:gain,files:['audience-off.mov','audience-on.mov'],listening:'not_reviewed' }));
}
if (require.main === module) { try { main(process.argv.slice(2)); } catch(e) {console.error(e.message);process.exitCode=1;} }
