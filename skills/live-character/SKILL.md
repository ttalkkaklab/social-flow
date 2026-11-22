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
sheet, the character’s selected voice.wav and the project’s speech language. Choose a text model
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

- **Start when ready** (`--start ready`): prepare ten moving listening clips, two short spoken welcomes, the opening and the first topic segment before ingest. Send the watch link as soon as YouTube reports live.
- **Preview first** (`--start preview`): produce a local recording with sound and stop.
  Show it and wait for a start decision. When the user selects start, use a fresh run
  directory. The renderer can reuse the same generated opening.
- **Cancel** (`--start cancel`): leave the broadcast unopened.

Use a calm chest-up portrait with a complete face. Set `broadcastConcept` to the
setting and mood for this show. Use `talkPrompt` for speaking directions. The plugin
prepares ten silent listening clips, each 3–5 seconds at 24 fps. It pins the same
portrait to both ends of every shot. The host should visibly look down to read, nod or
shift their shoulders gently. The runner checks for a held pose across each clip. If a replacement still freezes between identical anchors, it generates a short outward gesture and plays its frames back to the exact starting pose. All ten clips must pass the framing and motion checks before ingest. Ready speech interrupts standby on the
next output frame. If the queue stays empty, shuffle all ten before repeating a clip.
A new shuffle starts with a different clip from the last one played. Once the room is live, play ready viewer replies first, then fresh host segments. While rendering, rotate audience-wide welcomes and previously aired self-contained topic lines. Finish each spoken line. Keep viewer answers and the opener out of this rotation.
To prepare these assets earlier and list their paths, run
`node server/dist/character-live.bundle.js prepare-idle --config FILE`. This command
needs no streaming destination. The normal broadcast start also prepares the set.
Before opening ingest the runner prepares the listening pool, a greeting that opens the show
and a first topic segment. Save a chosen subject as `topic` when reserving the room. The opener names it and invites comments, and the receipt keeps it when resuming. Existing configs without a topic use their authored `opening`. Optional `standbyLines` supplies two short, distinct welcomes for anyone joining, in the broadcast language.
During the YouTube handshake the encoder plays moving standby. Once the room is live it plays
the greeting. While speech plays, the planner uses the current line, recent spoken exchanges,
real viewer chat and any queued host line to generate the next segment. Optional `hostLines` give
topic cues. The host continues after the last cue.

One model call decides whether a viewer message merits an answer and writes it. Set `maxConcurrentVideos` to a positive integer (default 3). During playout the host leaves one slot for chat when at least two are available. Selected replies take the next free slots. Plan the next line against recent chat and pending replies. Discard obsolete host results, let submitted jobs finish and keep replies from a single viewer in order. An on-air line always finishes, including
when the chat intake window closes. Standby fills only gaps between ready spoken segments.
The event log records chat admission, skipped messages, generation, and the first frame and last
audio sample sent. If YouTube exhausts the chat quota, tell the operator that new messages
may be missed. Standby frames are center-cropped for 720×1280 playout.

Set `ASTRA_GENAI_URL` and `ASTRA_GENAI_API_KEY` for the production GenAI gateway.
It generates listening shots and speaking clips. Existing verified standby clips can be reused.
Each spoken turn uses GenAI image-to-video with the distilled LTX model and MSR conditioning.
The host portrait anchors the first frame and pairs with the character’s approved
`voice.wav` in subject slot 1. The sample guides timbre. Put the intended words in the
dialogue, in the broadcast language. The model generates the picture and speech together.
The encoder plays both tracks from that result. Store the voice sample in the character
directory, at most 10 seconds long. Keep each spoken line short enough for a 15-second shot.
Check pronunciation, timbre and mouth movement in the local preview.
The renderer keeps completed clips and job receipts in the project’s `.social-flow/live-genai/`.
If interrupted, use the same inputs to recover the same job. A receipt with an uncertain
submission needs reconciliation before another submission. Superseded host jobs occupy their slot until their request settles. The gateway may queue requests even when the client submits several.
When chat uses a different GenAI gateway from video, set `ASTRA_GENAI_CHAT_URL` and
`ASTRA_GENAI_CHAT_API_KEY` for chat alone. The video gateway must advertise
`image_conditioning` and `voice_references` on `/v1/ltx/msr/capabilities`.

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
    "talkPrompt":"Locked camera, quiet conversation, shoulders relaxed, speaking the authored dialogue.",
    "chatModel":"gateway-text-model","topic":"books we read before bed","maxConcurrentVideos":3,
    "youtubeChannelId":"UCxxxxxxxxxxxxxxxxxxxxxx","madeForKids":false}
   ```

4. Optionally configure reactions as an array of objects with a questions array and a short spoken
   answer. An exact configured question uses its authored answer directly. Only add unconditional answers here. Greetings and sound checks are good candidates. Use
   `warm --config /path/to/config.json` to generate the opening, spoken welcomes and prepared response clips
   before going live. Already completed configured replies play from the local video cache. For a new message the chat model writes the answer and GenAI renders
   the spoken clip. Exact repeated requests reuse the saved clip and receipt.

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

Latency measurements and comparable implementations are in [the live latency study](../../docs/research/2026-11-22-character-live-latency/README.md).

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
Never send an ingest key in chat or put it in a config file. Chat uses /v1/chat/completions. Speaking clips use the GenAI LTX image-to-video route.
