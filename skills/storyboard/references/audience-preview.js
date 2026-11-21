'use strict';

// Offline review stems on the storyboard clock. The delivery mixer uses its rendered clock.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const rate = 48000;
const sample = value => Math.round(value * rate);
const separation = { subtle: 10, normal: 6, strong: 3 };

function previews(board, directory, rows, check) {
  const scenes = {}, changed = [];
  if (!rows.length) return { scenes, changed };
  const shots = board.SCENES || [];
  const cuts = shots.map(s => Number.isFinite(s.duration) && s.duration > 0 ? sample(s.duration) : null);
  function distance(from, to) {
    const durations = cuts.slice(Math.min(from, to), Math.max(from, to));
    return durations.includes(null) ? NaN : durations.reduce((a, b) => a + b, 0) * (to < from ? -1 : 1);
  }
  const durations = new Map();
  function audioSamples(file) {
    if (!durations.has(file)) {
      let count = 0;
      try {
        const info = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','a:0','-show_entries','stream=codec_type,duration:format=duration','-of','json',file], {encoding:'utf8',stdio:['ignore','pipe','pipe']}));
        if (info.streams?.[0]?.codec_type === 'audio') {
          const duration = Number(info.streams[0].duration) || Number(info.format?.duration);
          if (Number.isFinite(duration) && duration > 0) {
            const pcm = execFileSync('ffmpeg',['-nostdin','-v','error','-i',file,'-map','0:a:0','-frames:a','1','-ac','1','-ar','48000','-f','s16le','pipe:1'],{stdio:['ignore','pipe','pipe']});
            if (pcm.length >= 2) count = sample(duration);
          }
        }
      } catch { /* A partially written asset can be tried again at the next board refresh. */ }
      durations.set(file, count);
    }
    return durations.get(file);
  }
  const ordered = new Map(shots.map((shot, index) => [shot.id, index]));
  const folder = 'audience-previews';
  for (const [i, shot] of shots.entries()) {
    if (i && shot.scene === shots[i - 1].scene) continue;
    let next = i + 1;
    while (next < shots.length && shots[next].scene === shot.scene) next++;
    const length = distance(i, next);
    const entries = [], files = [], phrases = [];
    for (const row of rows) {
      const origin = ordered.get(row.shotId);
      if (origin === undefined || origin >= next) continue;
      const effect = shots[origin].sound?.effects?.find(e => e?.audience && e.id === row.id);
      if (!effect) continue;
      const end = effect.end ? ordered.get(effect.end.shotId) : undefined;
      if (end !== undefined && end < i) continue;
      if (origin < i && row.status !== 'placed') continue;
      const located = row.source?.available && row.source.path;
      const available = located ? audioSamples(located) : 0;
      const file = available > 0 ? located : null;
      const sourceHref = file ? path.relative(directory, file).split(path.sep).map(encodeURIComponent).join('/') : null;
      const entry = { shotId:row.shotId, id:row.id, intent:effect.audience.intent, status:row.status, sourceHref };
      if (row.status !== 'placed' || !file || !Number.isFinite(length)) {
        if (origin >= i || (end !== undefined && end >= i)) entries.push(entry);
        continue;
      }
      const start = distance(i, origin) + sample(effect.atSeconds);
      const source = sample(effect.sourceStartSeconds || 0);
      if (!Number.isFinite(start) || !(available > source)) { if (origin >= i) entries.push(entry); continue; }
      let stop = start + available - source;
      let release = 0;
      if (effect.end && end !== undefined) {
        const tail = effect.end.atSeconds === 'end' ? cuts[end] : sample(effect.end.atSeconds);
        if (tail === null || !Number.isFinite(distance(i, end))) { if (origin >= i) entries.push(entry); continue; }
        const authoredEnd = distance(i, end) + tail;
        release = Math.max(0, sample(effect.fadeOutSeconds || 0) - Math.max(0, authoredEnd - stop));
        stop = Math.min(stop, authoredEnd);
      } else {
        const boundary = shots.findIndex((s, j) => j > origin && (s.type === 'broll' || s.type === 'outro'));
        if (boundary >= 0) {
          const limit = distance(i, boundary);
          if (!Number.isFinite(limit)) { if (origin >= i) entries.push(entry); continue; }
          if (limit < stop) { stop = limit; release = Math.min(960, stop - start); }
        }
      }
      const from = Math.max(0, start), to = Math.min(length, stop);
      if (!(to > from)) continue;
      const attack = Math.min(stop - start, Math.max(source > 0 ? 48 : 0, sample(effect.fadeInSeconds || 0)));
      const gap = effect.separationLu ?? separation[effect.intensity || 'normal'];
      if (!Number.isFinite(gap) || gap < 0 || gap > 30) continue;
      phrases.push({ hash:row.source.sha256, source, duration:stop - start, attack, release, gap, skip:from-start, at:from, length:to-from });
      files.push(file);
      entries.push({ ...entry, start:from/rate, end:to/rate });
    }
    if (!entries.length) continue;
    const plan = { entries };
    scenes[shot.scene] = plan;
    if (!phrases.length) continue;
    // The stem contains only resolved placements. Raw-source controls remain separate for unresolved directions.
    const signature = createHash('sha256').update(JSON.stringify([1, length, phrases])).digest('hex');
    const filename = path.join(folder, signature + '.wav'), absolute = path.join(directory, filename);
    try {
      if (!fs.existsSync(absolute) || fs.statSync(absolute).size !== 44 + length * 2) {
        if (check) changed.push(filename);
        else {
          fs.mkdirSync(path.dirname(absolute), { recursive:true });
          const temp = fs.mkdtempSync(path.join(directory, folder, '.render-'));
          try {
            const wav = path.join(temp, 'scene.wav');
            render(files, phrases, length, wav);
            fs.renameSync(wav, absolute);
          } finally { fs.rmSync(temp, { recursive:true, force:true }); }
          changed.push(filename);
        }
      }
      plan.file = filename.split(path.sep).join('/');
    } catch (error) {
      // Keep verified sources playable when the scene render fails.
      plan.unavailable = true;
    }
  }
  return { scenes, changed };
}

function render(files, phrases, length, wav) {
  const inputs = [], filters = [];
  for (const [i, p] of phrases.entries()) {
    const file = files[i];
    inputs.push('-i',file);
    const trim = 'aresample=48000,aformat=channel_layouts=mono,atrim=start_sample=' + p.source + ':end_sample=' + (p.source+p.duration) + ',asetpts=N/SR/TB';
    const meter = spawnSync('ffmpeg',['-hide_banner','-nostats','-i',file,'-af',trim+',apad=whole_dur=1,ebur128=peak=true','-f','null','-'],{encoding:'utf8'});
    if (meter.status !== 0) throw new Error('Could not measure audience excerpt');
    const moments = [...meter.stderr.matchAll(/\bM:\s*(-?[\d.]+)/g)].map(m => Number(m[1]));
    const peak = meter.stderr.match(/\bPeak:\s*(-?[\d.]+) dBFS/);
    const loudest = moments.reduce((max, value) => Math.max(max, value), -Infinity);
    if (!peak || loudest <= -60) throw new Error('Audience excerpt is silent');
    const gain = Math.min(-16 - p.gap - loudest, -1-Number(peak[1]));
    let chain = '['+i+':a]'+trim;
    if (p.attack) chain += ',afade=t=in:ns='+p.attack;
    if (p.release) chain += ',afade=t=out:ss='+Math.max(0,p.duration-p.release)+':ns='+p.release;
    chain += ',volume='+gain+'dB,atrim=start_sample='+p.skip+':end_sample='+(p.skip+p.length)+',asetpts=N/SR/TB,adelay='+p.at+'S:all=1,asetpts=N/SR/TB[s'+i+']';
    filters.push(chain);
  }
  filters.push(phrases.map((_,i) => '[s'+i+']').join('')+'amix=inputs='+phrases.length+':normalize=0,apad,atrim=end_sample='+length+'[out]');
  execFileSync('ffmpeg',['-v','error','-nostdin',...inputs,'-filter_complex',filters.join(';'),'-map','[out]','-ar','48000','-ac','1','-c:a','pcm_s16le','-fflags','+bitexact',wav]);
}

module.exports = { previews };
