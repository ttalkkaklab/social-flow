---
name: live-character
description: >
  Streams a voiced sheet character to YouTube or TikTok and answers live chat. Use for
  "캐릭터 라이브", "버튜버 생방송", "유튜브 틱톡 실시간 방송", "go live with my character".
  Runs a bounded session with an archive. The publish skill uploads finished episodes.
argument-hint: "[channel] [character] [platforms] [duration]"
---

# Character LIVE

Use the project, channel and character the user selected. The runner uses the channel's approved
sheet, the character's saved ASTRA voice, and the project's speech language. Choose a text model
served by the configured gateway. This renderer animates a character portrait and speaks generated
answers. Its input is a portrait with a visible mouth. It needs Node 20+ and FFmpeg with libx264,
AAC and Python 3 with FFmpeg shared libraries (avformat and avutil) for RTMPS output. Set `SOCIAL_FLOW_LIVE_PYTHON` when that interpreter is outside PATH. Use a local
preview before sending video. Set `speechLanguage` for a session in a different language,
and write the opening and any prepared answers in that language. A guest character can
use `youtubeCredentialChannel` to select the destination channel's OAuth connection.

For a person hosting a show, set `motionVideo` to an approved video of that character
inside the project. Frame it from the chest up and keep the whole face visible. Set
`idleVideos` to additional moving shots of the same host to vary the camera while
listening. The encoder continuously plays the performance at 24 fps. It renders each
spoken turn with MuseTalk on the registered voice and cuts to the speaking camera as soon as the reply is ready.
Set `SOCIAL_FLOW_AVATAR_PYTHON` to the Apple Silicon interpreter with
`musetalk-avatar-core` and `musetalk-mlx`, `MUSETALK_MODEL_DIR` to the downloaded
MuseTalk 1.5 MLX weights and `MUSETALK_LANDMARKER` to MediaPipe's face model.
The tested Python 3.12 environment installs the MLX engine and avatar core together:

```sh
uv venv --python 3.12 .avatar-venv
uv pip install --python .avatar-venv/bin/python \
  'git+https://github.com/xocialize/musetalk-mlx.git@c6eb30ebd1ed4d043983209813370153de9346bf' \
  'git+https://github.com/hazelwolf/talking-avatars-mlx.git@9e689f363329e491578fe558f8d819fd6de5fc8c#subdirectory=packages/musetalk-avatar-core'
```

Download the [MuseTalk MLX weights](https://huggingface.co/mlx-community/MuseTalk-1.5-q4) and
the [MediaPipe face model](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task).
The motion renderer prepares the opening before opening a YouTube room. A failed
answer keeps the moving performance on screen and the session reports a failure.
Use `hostLines` for short, in-character remarks when chat is quiet. Preview the
speaking and listening parts separately. The legacy portrait preview is available locally. YouTube and TikTok broadcasts require a moving performance. When only a sheet is available, use its approved face panel as the start frame for a short image-to-video shot and review the face and framing before broadcasting.

1. Read the channel profile and confirm the external destination. Make a session configuration
   outside the plugin, for example in the project's logs. Use the channel ID from its profile.
   Set the correct audience designation. YouTube disables chat for children's content.
2. Choose a panel key from the character's panels.json. Use front-facing artwork with a complete
   face, such as a full-body reference (msr) or face panel. View the portrait cropped to 9:16.
   Calibrate the mouth and optional eyes in this **cropped** image, with x/y denoting the
   center and width/height denoting full extents, all normalized from 0 to 1.
3. Example config (replace the illustrative values from actual channel settings):

   ```json
   {"project":"/path/to/project","channel":"my-channel","character":"host","panel":"face",
    "mouth":{"x":0.50,"y":0.63,"width":0.14,"height":0.06},
    "motionVideo":"data/my-channel/assets/characters/host/performance.mp4",
    "chatModel":"gateway-text-model","opening":"Hello! What would you like to talk about?",
    "youtubeChannelId":"UCxxxxxxxxxxxxxxxxxxxxxx","madeForKids":false}
   ```

4. Optionally configure reactions as an array of objects with a questions array and a short spoken
   answer. The runner matches whole questions ignoring case, spacing and punctuation. Use
   `warm --config /path/to/config.json` to synthesize the opening and these responses with the
   character's voice before going live. Other messages go to the language model and speech
   gateway on demand. The cache stays under the project's .social-flow/live-voices directory.

   Run the shipped CLI with the plugin root as working directory. For a preview, feed an NDJSON
   operator message on standard input. Use a fresh directory under an existing parent for each
   session. Check the recorded voice, character motion and spoken response.

   ```sh
   echo '{"source":"operator","id":"preview-1","text":"What color is your hoodie?"}' |
     node server/dist/character-live.bundle.js run --config /path/to/config.json --out /path/to/new-preview --seconds 90
   ```

5. On a user-requested broadcast, add the requested destinations. YouTube creates a dedicated
   **unlisted** broadcast and non-reusable stream, checks the OAuth channel, and reads live chat.
   The stream automatically starts on ingest and stops when the encoder disconnects.
   An optional `--youtube-probe 'question'` posts one test message as the authorized broadcaster;
   use it for an explicitly requested end-to-end test. Success requires the same platform message
   ID to finish speaking and YouTube to confirm the stream ended.

   ```sh
   node server/dist/character-live.bundle.js check --config /path/to/config.json --youtube
   node server/dist/character-live.bundle.js run --config /path/to/config.json --out /path/to/new-run --seconds 180 --youtube --title 'AI character · live test'
   ```

6. TikTok takes a channel-authorized complete ingest URL from `TIKTOK_LIVE_RTMPS_URL`. Pass
   `--tiktok` alone or alongside YouTube. Confirm the intended LIVE room before starting.
   An approved external chat source can feed lines such as
   `{"source":"tiktok","id":"platform-event-id","text":"Viewer question"}` on stdin.
   The upload OAuth credentials do not grant LIVE access. Without an event source the TikTok
   destination carries the show, but its viewers' messages do not enter the queue.
   Keep the operator present to monitor chat and stop with SIGINT/SIGTERM. The duration is
   bounded even with no terminal attached. On macOS, the runner keeps the broadcast host awake for the session.

The archive is recording.flv, with chat and audio frame timestamps in events.jsonl. Treat run
directories as private. Each unique platform message is considered once within a bounded window.
An accepted reply that misses the session deadline keeps its event ID and processing stage in
the log. A partial reply has its own interrupted event and the run exits with an incomplete result.
Use the saved youtube.json receipt after an interruption: run `status` or `end` with
`--config` and `--out` pointing to the existing session. `status` also inspects an owned
broadcast whose stream binding failed. If `end` reports that the session is still unstarted,
an encoder that logged a final `ready` state may use `run --youtube --resume-from <previous-run>`
with a fresh output directory to send to the same verified room without creating another one.
For a room the operator wants to discard,
use `cancel-unstarted` only when the operator wants to remove that room. The command checks
the session marker, channel, visibility, stream binding and start state before cancellation.
Check Studio for an uncertain create
before any new run. API liveStreamingNotEnabled means YouTube has not granted the channel access.
Never send an ingest key in chat or put it in a config file. The gateway needs its existing
/v1/chat/completions and /v1/audio/speech routes.
