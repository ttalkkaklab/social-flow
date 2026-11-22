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

Before each broadcast, run `node server/dist/character-live.bundle.js choices` and
present the returned choices in the user's language using the host's human-input
control (or ask in chat). Wait for the answer. An explicit choice for this
broadcast in the user's request counts. A previous broadcast, a saved config,
an unattended schedule or silence cannot choose for the user.

- **Start when ready** (`--start ready`): prepare ten listening clips and the spoken opening on the production GPU before ingest. Send the watch link as soon as YouTube reports live.
- **Preview first** (`--start preview`): produce a local recording with sound and stop.
  Show it and wait for a start decision. When the user selects start, use a fresh run
  directory. The renderer can reuse the same generated opening.
- **Cancel** (`--start cancel`): leave the broadcast unopened.

Use a calm chest-up portrait with a complete face. Set `broadcastConcept` to the
setting and mood for this show. Use `talkPrompt` for speaking directions. The plugin
prepares ten silent listening clips, each 3–5 seconds at 24 fps. It pins the same
portrait to both ends of every shot. While a reply renders, the encoder plays each
clip once in shuffled order and changes to speech at a clip boundary. A new shuffle
starts with a different clip from the last one played. A concept or reference
change prepares a new set. Matching assets can be reused for the same show.
To prepare these assets earlier and list their paths, run
`node server/dist/character-live.bundle.js prepare-idle --config FILE`. This command
needs no streaming destination. The normal broadcast start also prepares the set.
The encoder opens the destination after validating all ten clips and the opening.
During the YouTube ingest handshake the encoder plays a listening clip. The opening
starts at a clip boundary once YouTube reports live. The encoder trims eight columns from each side of the model’s 736×1280 canvas for 720×1280 playout.

Use the production ASTRA video API (`ASTRA_VIDEO`, optional `ASTRA_VIDEO_URL`) for
listening clips. For speaking frames set `SOCIAL_FLOW_LIVE_GPU_HOST` to the production
SSH alias and `SOCIAL_FLOW_LIVE_GPU_PYTHON` to its absolute LTX Python path. The
bundled launcher uses existing SSH credentials and known host keys, copies the
portrait and voice to a private temporary directory and returns the whole shot.
Sites with their own GPU scheduler can set `SOCIAL_FLOW_LIVE_A2V_COMMAND` to their launcher. It takes the shipped Python script as its first argument,
followed by `--audio WAV --image IMAGE --output MP4 --prompt TEXT`. It must return
after writing the result to the supplied path on the broadcast host. On a CUDA host
with the LTX 2.5 dependencies and split weights, the launcher can be the LTX
environment’s Python interpreter. Set `SOCIAL_FLOW_LTX_MODELS` on that GPU host
when the models directory differs from `/data/ltx/models`. The renderer conditions
the whole frame on the character’s registered voice. Keep host lines brief.

1. Read the channel profile and confirm the external destination. Make a session configuration
   outside the plugin, for example in the project's logs. Use the channel ID from its profile.
   Set the correct audience designation. YouTube disables chat for children's content.
2. Choose a panel key from the character's panels.json. Use front-facing artwork with a complete
   face, such as a full-body reference (msr) or face panel. View the portrait cropped to 9:16.
   Choose a quiet portrait with the full face visible in the vertical crop.
3. Example config (replace the illustrative values from actual channel settings):

   ```json
   {"project":"/path/to/project","channel":"my-channel","character":"host","panel":"face",
    "broadcastConcept":"Late-night radio in a softly lit studio.",
    "talkPrompt":"Locked camera, quiet conversation, shoulders relaxed, speaking the supplied audio.",
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
     node server/dist/character-live.bundle.js run --config /path/to/config.json --out /path/to/new-preview --seconds 90 --start preview
   ```

5. On a user-requested broadcast, add the requested destinations. YouTube creates a dedicated
   **unlisted** broadcast and non-reusable stream, checks the OAuth channel, and reads live chat.
   The stream automatically starts on ingest and stops when the encoder disconnects.
   An optional `--youtube-probe 'question'` posts one test message as the authorized broadcaster;
   use it for an explicitly requested end-to-end test. Success requires the same platform message
   ID to finish speaking and YouTube to confirm the stream ended.

   ```sh
   node server/dist/character-live.bundle.js check --config /path/to/config.json --youtube
   node server/dist/character-live.bundle.js run --config /path/to/config.json --out /path/to/new-run --seconds 180 --youtube --start ready --title 'AI character · live test'
   ```

   If the user wants a link during generation, reserve the unlisted room once after the
   start choice. Use `reserve --youtube --start ready --config FILE --out ROOM --title TITLE`,
   share the returned video ID as an upcoming watch link, then run with
   `--resume-from ROOM --out NEW_RUN --youtube --start ready` and the same config and title.
   Report the actual live transition separately.

6. TikTok takes a channel-authorized complete ingest URL from `TIKTOK_LIVE_RTMPS_URL`. Pass
   `--tiktok` alone or alongside YouTube. Confirm the intended LIVE room before starting.
   An approved external chat source can feed lines such as
   `{"source":"tiktok","id":"platform-event-id","text":"Viewer question"}` on stdin.
   The upload OAuth credentials do not grant LIVE access. Without an event source the TikTok
   destination carries the show, but its viewers' messages do not enter the queue.
   Keep the operator present to monitor chat and stop with SIGINT/SIGTERM. The duration sets the chat intake window. A reply accepted inside that window may finish after it closes. On macOS, the runner keeps the broadcast host awake for the session.

The archive is recording.flv, with chat and audio frame timestamps in events.jsonl. Treat run
directories as private. Each unique platform message is considered once within a bounded window.
An accepted reply that misses the session deadline keeps its event ID and processing stage in
the log. A partial reply has its own interrupted event and the run exits with an incomplete result.
Use the saved youtube.json receipt after an interruption: run `status` or `end` with
`--config` and `--out` pointing to the existing session. `status` also inspects an owned
broadcast whose stream binding failed. If `end` reports that the session is still unstarted,
an encoder that logged a final `ready` state may use `run --youtube --resume-from <previous-run>`
with `--start ready` and a fresh output directory to send to the same verified room without creating another one.
For a room the operator wants to discard,
use `cancel-unstarted` only when the operator wants to remove that room. The command checks
the session marker, channel, visibility, stream binding and start state before cancellation.
Check Studio for an uncertain create
before any new run. API liveStreamingNotEnabled means YouTube has not granted the channel access.
Never send an ingest key in chat or put it in a config file. The gateway needs its existing
/v1/chat/completions and /v1/audio/speech routes.
