'use strict';
const { createHash } = require('node:crypto');

/** One revision contract for editing, attachment and assembly. */
function speechRevision(line, character) {
  return createHash('sha256').update(JSON.stringify(require('./scene-acting.js').speechRevisionPayload(line,character?.tts))).digest('hex');
}

/** Provider prompt formatting shared by request planning and provenance validation. */
function compileActing(text, acting, voice) {
  voice={...voice};
  for(const key of ['voiceId','model','stylePrompt','voiceDirection'])if(typeof voice[key]==='string')voice[key]=voice[key].trim();
  if(typeof voice.language==='string')voice.language=require('./character-voice.js').normalizeLanguage(voice.language);
  const {resolveTtsModel}=require('./tts-models.js');
  if (!['gemini','elevenlabs','astra-genai'].includes(voice.engine)) throw new Error('Choose a supported engine: Gemini or ElevenLabs v4; local TTS has been removed');
  if (voice.engine==='elevenlabs' && voice.model!==undefined && voice.model!=='eleven_v4') throw new Error('Explicitly update this character to eleven_v4 before generating new speech');
  const contract=resolveTtsModel(voice.engine,voice.model);
  const performance = acting || {};
  const {actingErrors,resolvedStyle,directionSupport}=require('./scene-acting.js');
  const errors=actingErrors(acting);if(errors.length)throw new Error(errors.join('; '));
  const direction=resolvedStyle(voice,acting),support=directionSupport(voice,acting);
  if (!support.supported && voice.engine === 'gemini') throw new Error(support.warnings.join('; '));
  const tags = performance.tags || [];
  if (contract.direction === 'gateway') {
    if (tags.length) throw new Error('Gateway speech does not support inline acting tags');
    return {generator:'tts_astra_genai',generation:{model:voice.model,text,voice:voice.voiceId,speed:voice.speed ?? 1,
      ...(direction ? {instructions:direction} : {})}};
  }
  if (contract.direction === 'inline') {
    if (voice.model !== undefined && voice.model !== 'eleven_v4') throw new Error('Explicitly update this character to eleven_v4 before generating new speech');
    const controls = [performance.direction?.trim(), ...tags].filter(Boolean).map(tag => `[${tag}]`).join(' ');
    return { generator: 'tts_elevenlabs_generate', generation: {
      text: controls ? `${controls} ${text}` : text, voiceId: voice.voiceId,
      model: 'eleven_v4', languageCode: voice.language,
      ...(voice.stability !== undefined ? { stability: voice.stability } : {}),
      ...(voice.similarity !== undefined ? { similarity: voice.similarity } : {}),
    } };
  }
  if (contract.direction === 'metadata') {
    const events = tags.map(tag => `<${tag}>`).join(' ');
    return { generator: 'tts_gemini_38', generation: {
      model: voice.model, voice: voice.voiceId,
      turns: [{ text: events ? `${events} ${text}` : text, ...(direction && support.supported ? { style: direction } : {}) }],
    } };
  }
  if (voice.engine === 'gemini') {
    if (tags.length) throw new Error('Inline acting events require Gemini 3.8; choose its model explicitly or omit tags');
    const stylePrompt = direction;
    return { generator: 'tts_generate', generation: {
      text, voiceName: voice.voiceId, model: voice.model,
      ...(stylePrompt ? { stylePrompt } : {}),
    } };
  }
  throw new Error('Choose a supported engine: Gemini or ElevenLabs v4; local TTS has been removed');
}

// Reject executable legacy modes and caller-supplied capabilities, including nested saved plans.
function hasPostLipSync(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) => {
    if ((key === 'postLipSync' || key === 'post_lipsync') && entry === true) return true;
    if (typeof entry === 'string' && ['mode', 'operation', 'strategy', 'route', 'tool', 'provider', 'model'].includes(key))
      return /^(?:post[-_ ]?lip[-_ ]?sync|musetalk|wav2lip)$/i.test(entry);
    return hasPostLipSync(entry);
  });
}
function assertNoPostLipSync(value) {
  if (hasPostLipSync(value)) throw new Error('post_lipsync_forbidden: generate a new speaking take from the approved inputs');
}

const receiptSuffixes = ['.astra-job.json','.astra-genai.json'];
function verifyReceiptOperation(receipt,suffix,plan,hashBound) {
  assertNoPostLipSync(receipt);
  if (!hashBound || !['native','audio_conditioned'].includes(plan.mode)) return;
  const operation = receipt.operation ?? receipt.mode;
  if (!operation) return;
  const provider = suffix === '.astra-job.json' ? 'astra' :
    receipt.protocol === 'gateway-desktop-v1' ? 'astra-genai-desktop' : 'astra-genai';
  const conditioned = ['audio-to-video','audio2video','scene-to-video'].includes(operation);
  const native = provider === 'astra-genai' && ['image-to-video','scene-to-video','msr'].includes(operation);
  if (provider !== plan.provider || (plan.mode === 'native' ? !native : !conditioned) ||
      typeof receipt.model === 'string' && receipt.model !== plan.model)
    throw new Error('speech_video_source_mismatch: the recorded generation operation or model disagrees with the speech attachment');
}

function performanceKey(shot) {
  const binding = shot.visual?.video?.speechBinding;
  if (!binding?.videoSha256) return;
  return JSON.stringify([shot.id,binding.mode,binding.videoSha256,binding.audio,binding.conditioningAudioSha256]);
}

// Each accepted speech edit already archives the previous board under its SHA-256.
// Recover superseded performances, keeping the latest authored cut for each take.
function speechHistory(board) {
  const fs = require('node:fs'), path = require('node:path');
  const dir = path.resolve(board,'../.work/speech-history');
  let names;
  try { names = fs.readdirSync(dir); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const records = new Map();
  for (const name of names) {
    if (!/^[a-f0-9]{64}\.js$/.test(name)) continue;
    const file = path.join(dir,name), bytes = fs.readFileSync(file);
    if (createHash('sha256').update(bytes).digest('hex') !== name.slice(0,-3))
      throw new Error('speech_history_invalid: a storyboard snapshot no longer matches its content hash');
    if (!bytes.includes('speechBinding')) continue;
    const win = require('./scenes-vm.js').evaluateWindowScript(bytes.toString('utf8'),{filename:file});
    const time = fs.statSync(file,{bigint:true}).mtimeNs;
    for (const shot of win.SCENES ?? []) {
      const performance = performanceKey(shot);
      if (!performance) continue;
      const key = JSON.stringify([performance,shot.visual.video.speechBinding.videoPath,shot.visual.video.clip]);
      if (records.get(key)?.time > time) continue;
      records.set(key,{time,shot});
    }
  }
  return Array.from(records.values(),record => record.shot);
}

// Index the episode's known media folders once. A receipt belongs to the source
// bytes, so copying a video away from its sidecar cannot erase a known operation.
function episodeVideoReceipts(shots,board,extra) {
  const fs = require('node:fs'), path = require('node:path');
  const dirs = new Set([path.resolve(board,'../.work/video'),path.resolve(board,'../output/video/scenes')]);
  const hashes = new Map(), forbidden = [], renders = [];
  function directory(file) {
    if (typeof file === 'string' && file) dirs.add(path.dirname(path.resolve(board,file)));
  }
  directory(extra);
  const archived = speechHistory(board);
  const active = new Set(shots.map(performanceKey));
  const history = archived.filter(shot => !active.has(performanceKey(shot)));
  for (const shot of [...shots,...archived]) {
    const video = shot.visual?.video ?? {}, binding = video.speechBinding;
    for (const file of [video.clip,binding?.videoPath,video.soundtrackRepair?.videoPath]) directory(file);
    for (const source of video.soundtrackRepair?.sources ?? []) directory(source.path);
    if (binding?.videoSha256 && hasPostLipSync(binding)) forbidden.push({sha:binding.videoSha256,
      file:typeof binding.videoPath === 'string' && path.resolve(board,binding.videoPath),frames:binding.performanceSource});
  }
  for (const dir of dirs) {
    let entries;
    try { entries = fs.readdirSync(dir,{withFileTypes:true}); }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue; throw error; }
    for (const entry of entries) {
      const suffix = receiptSuffixes.find(s => entry.name.endsWith(s));
      if (!suffix || !entry.isFile()) continue;
      const sidecar = path.join(dir,entry.name);
      let receipt;
      try { receipt = JSON.parse(fs.readFileSync(sidecar,'utf8')); } catch { continue; }
      const file = sidecar.slice(0,-suffix.length);
      let sha = receipt?.sha256;
      if (!sha && receipt?.videoPath === file && hasPostLipSync(receipt) && fs.existsSync(file))
        sha = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (!/^[a-f0-9]{64}$/.test(sha)) continue;
      if (!hashes.has(sha)) hashes.set(sha,[]);
      const source = {receipt,suffix,sha,file};
      hashes.get(sha).push(source);
      if (receipt.status === 'completed' && receipt.jobId && typeof receipt.videoPath === 'string' &&
          !hasPostLipSync(receipt)) renders.push(source);
      if (hasPostLipSync(receipt)) forbidden.push({sha,file});
    }
  }
  return {hashes,forbidden,history,renders,drivers:new Map(),sceneRenders:new Map()};
}

// Imported native clips may have no local receipt. A matching recorded operation
// takes precedence over an attachment label, including after a copy or remux.
function assertVideoSpeechProvenance(videoPath, sha256, plan = {}, index) {
  const fs = require('node:fs');
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  let driver;
  function verify(receipt,suffix,hashBound,originalFile) {
    verifyReceiptOperation(receipt,suffix,plan,hashBound);
    let original = hashBound && require('./character-speech.js').recordedConditioningDriver(receipt,suffix);
    if (hashBound && receipt.operation === 'scene-to-video' && ['native','audio_conditioned'].includes(plan.mode)) {
      const contract = require('./scene-speech-receipt.js');
      const file = [originalFile,...(index?.hashes.get(receipt.sha256) ?? [])
        .filter(item => item.receipt.fingerprint === receipt.fingerprint).map(item => item.file)]
        .find(path => path && fs.existsSync(path + '.scene-request.json')) ?? originalFile;
      const wire = contract.readSceneRequest(file,receipt);
      original = contract.verifySceneSpeech(wire,plan);
      if (index) index.sceneRenders.set(videoPath,wire.body);
    }
    if (!original) return;
    if (driver && original !== driver) throw new Error('conditioning_audio_unverified: conflicting drivers for the same video');
    driver = original;
  }
  for (const suffix of receiptSuffixes) {
    let receipt;
    try {
      receipt = JSON.parse(fs.readFileSync(videoPath + suffix, 'utf8'));
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('Invalid receipt');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new Error('speech_video_receipt_invalid: cannot verify the generation receipt for ' + videoPath);
    }
    sha256 ??= digest(videoPath);
    if (receipt.sha256 ? receipt.sha256 !== sha256 : receipt.videoPath !== videoPath) continue;
    verify(receipt,suffix,receipt.sha256 === sha256,videoPath);
  }
  if (!index || !(index.hashes.size || index.forbidden.length) || !fs.existsSync(videoPath)) return driver;
  sha256 ??= digest(videoPath);
  for (const {receipt,suffix,file} of index.hashes.get(sha256) ?? []) verify(receipt,suffix,true,file);
  let frames;
  for (const source of index.forbidden) {
    if (source.sha === sha256) throw new Error('post_lipsync_forbidden: the bound video belongs to a known post-render lip-sync source');
    if (!source.frames && source.file && fs.existsSync(source.file) && digest(source.file) === source.sha)
      source.frames = videoPerformanceSource(source.file,true);
    if (!source.frames) continue;
    frames ??= videoPerformanceSource(videoPath,true);
    if (sameVideoFrames(source.frames,frames))
      throw new Error('post_lipsync_forbidden: these video frames belong to a known post-render lip-sync source');
  }
  if (['native','audio_conditioned'].includes(plan.mode)) {
    let sound;
    const audio = file => {
      const signal = require('./audio-signal.js');
      return signal.inspect(file).status === 'signal' ? signal.decodedAudioHash(file) : 'silent';
    };
    for (const source of index.renders) {
      if (source.sha === sha256 || !fs.existsSync(source.file)) continue;
      if (source.intact === undefined) source.intact = digest(source.file) === source.sha;
      if (!source.intact) continue;
      if (!source.frames) {
        try { source.frames = videoPerformanceSource(source.file,true); }
        catch { source.intact = false; continue; } // An unreadable sibling cannot identify frames in another file.
      }
      frames ??= videoPerformanceSource(videoPath,true);
      if (!sameVideoFrames(source.frames,frames)) continue;
      verify(source.receipt,source.suffix,true,source.file);
      source.sound ??= audio(source.file);
      sound ??= audio(videoPath);
      if (source.sound !== sound)
        throw new Error('post_lipsync_forbidden: an existing render cannot acquire a replacement dialogue soundtrack');
    }
  }
  if (driver) index.drivers.set(videoPath,driver);
  return driver;
}

// Keep the stream identities even when an editor saves new bytes over the same path.
function videoPerformanceSource(file, silentConditioned = false) {
  const {execFileSync} = require('node:child_process');
  const input = ['-nostdin','-v','error','-xerror','-i',file,'-map','0:V:0'];
  const hash = options => execFileSync('ffmpeg',[...input,...options,'-f','hash','-hash','sha256','-'],
    {encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']}).trim();
  const picture = hash(['-fps_mode','passthrough','-c:v','rawvideo','-pix_fmt','yuv420p']);
  const encodedPicture = hash(['-c:v','copy']);
  return {version:2,picture,encodedPicture,...(!silentConditioned && {audio:require('./audio-signal.js').decodedAudioHash(file)})};
}

function externalPictureSource(file) {
  let source;
  try { source = videoPerformanceSource(file,true); }
  catch { return; } // Historical voiceover cards could bind a placeholder before picture delivery.
  const signal = require('./audio-signal.js');
  if (signal.inspect(file).status === 'signal') source.audio = signal.decodedAudioHash(file);
  return source;
}

function sameVideoFrames(left,right) {
  if (!left?.picture || !right?.picture) return false;
  // Unversioned bindings stored either compressed packets or decoded frames in
  // "picture". Retain both identities on new imports so the original can move.
  return left.picture === right.picture || left.picture === right.encodedPicture ||
    left.encodedPicture === right.picture ||
    Boolean(left.encodedPicture && left.encodedPicture === right.encodedPicture);
}

// One source interval can only carry one spoken performance. Adjacent authored
// trims may share the same scene render. Keep checks local to an episode.
function assertVideoPerformanceOwnership(shots, boardDir, candidate, receipts) {
  const fs = require('node:fs'), path = require('node:path');
  const media = new Map();
  function source(shot) {
    const binding = shot.visual?.video?.speechBinding;
    if (!['voiceover','native','audio_conditioned'].includes(binding?.mode) || !binding.videoSha256) return;
    if (binding.mode !== 'voiceover' && !binding.audio?.length) return;
    const start = shot.edit?.in ?? 0, end = shot.edit?.out ?? Infinity;
    if (!Number.isFinite(start) || start < 0 || !(end > start) || (end !== Infinity && !Number.isFinite(end)))
      throw new Error('speech_video_performance_conflict: invalid dialogue source interval for ' + shot.id);
    const visible = shot.narration?.some(line => line.delivery === 'on_screen' && line.tts?.trim());
    return {id:shot.id, start, end, visible, binding, revisions:JSON.stringify((binding.audio ?? []).map(line => [line.revision,line.sha256]))};
  }
  function identity(entry) {
    const {videoPath,videoSha256,performanceSource,conditioningAudioSha256} = entry.binding;
    if (!media.has(videoSha256)) {
      const file = typeof videoPath === 'string' && path.resolve(boardDir,videoPath);
      const original = file && fs.existsSync(file) && createHash('sha256').update(fs.readFileSync(file)).digest('hex') === videoSha256;
      // New bindings retain the original streams when an editor has replaced the file.
      // Recompute historical or assembled claims whenever the bound bytes are present.
      const measured = original && (entry.binding.mode === 'voiceover' ? externalPictureSource(file) :
        videoPerformanceSource(file,Boolean(conditioningAudioSha256)));
      media.set(videoSha256,measured || performanceSource);
    }
    return media.get(videoSha256);
  }
  function check(left,right,active = false) {
    if (left.end <= right.start || right.end <= left.start) return;
    if (left.binding.mode === 'voiceover' && right.binding.mode === 'voiceover') return;
    const samePlan = left.binding.mode === right.binding.mode && left.revisions === right.revisions &&
      left.binding.conditioningAudioSha256 === right.binding.conditioningAudioSha256;
    if (samePlan && left.binding.videoSha256 === right.binding.videoSha256) return;
    const a = identity(left), b = identity(right);
    if (active && candidate && left.id === right.id && left.binding.videoSha256 !== right.binding.videoSha256 &&
        (left.visible || right.visible) && !a?.picture) {
      // Pre-fingerprint bindings need the old bytes to distinguish a new take from
      // an overdub. If those bytes are gone, require an identified completed render.
      const fresh = receipts?.hashes.get(right.binding.videoSha256)?.some(({receipt}) =>
        receipt.status === 'completed' && receipt.jobId &&
        ['msr','image-to-video','scene-to-video','audio-to-video','audio2video'].includes(receipt.operation ?? receipt.mode));
      if (!fresh) throw new Error('speech_video_performance_conflict: restore the original legacy clip or supply a completed render receipt for its replacement');
    }
    const samePicture = (left.visible || right.visible) && sameVideoFrames(a,b);
    const changedSoundtrack = samePicture && a.audio !== b.audio;
    const sameMedia = samePicture || (a?.audio && a.audio === b?.audio) || left.binding.videoSha256 === right.binding.videoSha256;
    const external = left.binding.mode === 'voiceover' || right.binding.mode === 'voiceover';
    if (changedSoundtrack || (!external && !samePlan && sameMedia))
      throw new Error('speech_video_performance_conflict: ' + left.id + ' and ' + right.id +
        ' assign a different recording or performance to the same footage or soundtrack over an overlapping source interval');
  }
  const prior = [];
  const next = candidate && source(candidate);
  for (const shot of shots) {
    const entry = source(shot);
    if (!entry) continue;
    if (candidate) {
      if (next && (entry.id !== next.id || entry.binding.videoSha256 !== next.binding.videoSha256)) check(entry,next,true);
    } else {
      if (entry.binding.performanceSource) {
        const current = identity(entry), recorded = entry.binding.performanceSource;
        const match = recorded.version === undefined ? sameVideoFrames(current,recorded) :
          recorded.version === 2 && current?.picture === recorded.picture && current?.encodedPicture === recorded.encodedPicture;
        if (!match || current?.audio !== recorded.audio)
          throw new Error('speech_video_performance_conflict: the source streams for ' + entry.id + ' changed after attachment');
      }
      for (const earlier of prior) check(earlier,entry);
      prior.push(entry);
    }
  }
  for (const shot of receipts?.history ?? []) {
    const earlier = source(shot);
    if (!earlier) continue;
    for (const entry of next ? [next] : prior) check(earlier,entry);
  }
}

module.exports = { speechRevision, compileActing, hasPostLipSync, assertNoPostLipSync, assertVideoSpeechProvenance, episodeVideoReceipts, assertVideoPerformanceOwnership, videoPerformanceSource, externalPictureSource };
