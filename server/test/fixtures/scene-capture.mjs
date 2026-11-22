// Offline adapter used by the contract regression. Capture the actual file parts and their
// ownership at serialization. This adapter has no endpoint, credentials or generation method.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export function captureScene(request) {
  const body = new FormData();
  const attach = (field, path) => body.append(field, new Blob([readFileSync(path)]), basename(path));
  const { images, audio, ...scene } = request;
  const voices = new Map();
  const shots = scene.shots.map(shot => shot.dialogue ? {...shot,dialogue:shot.dialogue.map(line => {
    if (!line.voice) return line;
    const {path,...reference} = line.voice;
    if (!voices.has(path)) {
      const part = 'voice-' + voices.size;
      attach(part,path);
      voices.set(path,part);
    }
    return {...line,voice:{...reference,part:voices.get(path)}};
  })} : shot);
  const manifest = { ...scene, shots, images:images.map(({path,...image}, i) => {
    const part = 'image-' + i;
    attach(part,path);
    return {...image, part};
  }) };
  if (audio) {
    const {path,...track} = audio;
    attach('audio',path);
    manifest.audio = {...track,part:'audio'};
  }
  body.set('scene',JSON.stringify(manifest));
  return new Request('https://offline.invalid/scene', {method:'POST',body});
}

export async function readCapture(request) {
  const parts = await request.formData();
  const manifest = JSON.parse(parts.get('scene'));
  const read = async input => {
    const file = parts.get(input.part);
    const bytes = Buffer.from(await file.arrayBuffer());
    return { ...input, filename:file.name, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex') };
  };
  const shots = await Promise.all(manifest.shots.map(async shot => shot.dialogue ? {...shot,dialogue:await Promise.all(
    shot.dialogue.map(async line => line.voice ? {...line,voice:await read(line.voice)} : line)
  )} : shot));
  return { ...manifest, shots, images:await Promise.all(manifest.images.map(read)),
    ...(manifest.audio ? {audio:await read(manifest.audio)} : {}) };
}
