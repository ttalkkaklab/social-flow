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
sheet, the character’s selected voice.wav and the broadcast language chosen for this session. Choose a text model
served by the configured gateway. This renderer animates a character portrait and speaks generated
answers. Its input is a portrait with a visible mouth. It needs Node 20+ and FFmpeg with libx264,
AAC and Python 3 with FFmpeg shared libraries (avformat and avutil) for RTMPS output. Set `SOCIAL_FLOW_LIVE_PYTHON` when that interpreter is outside PATH. Use a local
preview before sending video. Write the topic as spoken, opening, welcomes and authored answers in the selected language. A guest character can
use `youtubeCredentialChannel` to select the destination channel's OAuth connection.

## Start a show

Use the host's human-input control or chat. Reuse answers the operator already supplied for this broadcast.

1. First ask which language the host should speak. Run `choices` for common options and allow a different language or regional variant. The project language can be suggested. Wait for the operator’s choice unless their request already names the spoken language for this show. A previous show or the language of their message does not count as a choice. Save the selected language tag in the session config as `speechLanguage` and reuse it for preparation, preview and the reserved show.
2. Ask what the show is about. Save the answer as `topic` in this session's config.
3. Ask for knowledge files or directories, or an explicit choice to use no sources. Save paths in `knowledgeBase` or save an empty array for no sources. Use `node server/dist/character-live.bundle.js knowledge --config FILE` to build the local index before asking for a count. If the sources are in a different language, set `knowledgeLanguage` to their language for OCR and search. The reader accepts text, Markdown, CSV, JSON and PDF. Text PDFs need Poppler. Scanned pages also need Tesseract and the source language pack. Resolve unreadable inputs with the operator.
4. Run `choices` and ask how many distinct question-and-answer videos to prepare. Offer exactly **10, 30, 50 and 100**. More questions cover more viewer requests and take longer to render. Record the operator's choice with `--faq-count N`. A preset from a previous show cannot select for this one.
5. Run `estimate --config FILE --faq-count N` and **tell the operator** the chosen count, cached and missing FAQ clips, estimated generation time, buffer and expected start in their local timezone. The initial estimate assumes 150 seconds per missing clip, then uses the observed upper-quartile duration for this show configuration. The buffer is 20 percent with a two-minute minimum. The estimate is approximate. Relay revised times if preparation slips.
6. Honor the start choice for this broadcast. **Ready** starts ingest after every chosen FAQ body, ten listening clips, two welcomes, the opener and the first topic segment pass preparation. **Preview** records locally and waits for a separate start request. **Cancel** stops before creating a room. A request to start this session is already a ready choice. Share the real watch link and report the live transition.

The live host searches a private file-backed answer library. Exact configured phrases skip text generation. For other questions the model supplies search terms. It sees up to eight candidate answers and source excerpts, checks the subject, units and context, and can choose an existing clip. After a new standalone reply renders, save its question, body and local video path. Personal or context-dependent replies stay out of the shared library. The topic, character and source fingerprint scope reuse. A viewer's available display name is spoken in a separate address clip on the first use of a body in the show. Subsequent viewers hear only the body. Missing or unusable names fall back to the body alone.

Use a calm chest-up portrait with a complete face. Set `broadcastConcept` to the
setting and mood for this show. Use `talkPrompt` for speaking directions. The plugin
prepares ten silent listening clips, each 3–5 seconds at 24 fps. It pins the same
portrait to both ends of every shot. The host should visibly look down to read, nod or
shift their shoulders gently. The runner checks for a held pose across each clip. If a replacement still freezes between identical anchors, it generates a short outward gesture and plays its frames back to the exact starting pose. All ten clips must pass the framing and motion checks before ingest. Ready speech interrupts standby on the
next output frame. If the queue stays empty, shuffle all ten before repeating a clip.
A new shuffle starts with a different clip from the last one played. Once the room is live, play ready viewer replies first, then fresh host segments. While rendering, play verified general FAQ bodies in shuffled order. Newly learned standalone bodies join the current rotation. Welcomes and self-contained topic lines fill decode gaps. Finish each spoken line. Keep personal answers, name clips and the opener out of this rotation.
To prepare these assets earlier and list their paths, run
`node server/dist/character-live.bundle.js prepare-idle --config FILE`. This command
needs no streaming destination. The normal broadcast start also prepares the set.
Before opening ingest the runner prepares the listening pool, a greeting that opens the show
and a first topic segment. Save a chosen subject as `topic` when reserving the room. The opener names it and invites comments, and the receipt keeps it when resuming. Local previews can still use the authored `opening` from an older config. Set a `topic` before reserving a room or starting a broadcast. Optional `standbyLines` supplies two short, distinct welcomes for anyone joining, in the broadcast language.
During the YouTube handshake the encoder plays moving standby. Once the room is live it plays
the greeting. While speech plays, the planner uses the current line, recent spoken exchanges,
real viewer chat and any queued host line to generate the next segment. Optional `hostLines` give
topic cues. The host continues after the last cue.

For a free-form message the model supplies search terms and judges the retrieved answers. When it proposes a new sourced answer, verify its factual claims against the retrieved passages. If the material cannot support the answer, say so and keep it out of the reusable library. Set `maxConcurrentVideos` to a positive integer (default 3). During playout the host leaves one slot for chat when at least two are available. Selected replies take the next free slots. Plan the next line against recent chat and pending replies. Discard obsolete host results, let submitted jobs finish and keep replies from a single viewer in order. An on-air line always finishes, including
when the chat intake window closes. Standby fills only gaps between ready spoken segments.
If repeated status checks leave a video submission unresolved, the runner pauses new video requests
and keeps playing available clips. The `live_video_unresolved` event records the receipt for recovery.
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
    "speechLanguage":"en","knowledgeBase":[],"chatModel":"gateway-text-model","topic":"books we read before bed","maxConcurrentVideos":3,
    "youtubeChannelId":"UCxxxxxxxxxxxxxxxxxxxxxx","madeForKids":false}
   ```

4. Optionally configure reactions as an array of objects with a questions array and a short spoken
   answer. An exact configured question uses its authored answer directly. The live runner fills the remaining selected slots with distinct answers grounded in the show material. Only add unconditional answers here. Greetings and sound checks are good candidates. Use
   `warm --config /path/to/config.json --faq-count N` to generate the opening, spoken welcomes and prepared response clips
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
   node server/dist/character-live.bundle.js run --config /path/to/config.json --out /path/to/new-run --seconds 180 --youtube --start ready --faq-count 10 --title 'AI character · live test'
   ```

   If the user wants a link during generation, reserve the unlisted room once after the
   start choice. Use `reserve --youtube --start ready --faq-count N --config FILE --out ROOM --title TITLE`,
   share the returned video ID as an upcoming watch link, then run with
   `--resume-from ROOM --out NEW_RUN --youtube --start ready` and the same config and title.
   Report the actual live transition separately.

6. For TikTok, open the intended account in LIVE Center and select external encoder output.
   Use `--platform tiktok` or the existing `--tiktok` alias. To simulcast, also pass
   `--platform youtube` and the YouTube title. The encoder sends the same program to both
   destinations. The greeting waits for each selected destination: YouTube must report live,
   and the TikTok relay must connect. Verify actual picture and sound in the TikTok viewer.

   In an interactive terminal, leave the ingest variables unset. After preparing the clips,
   the runner asks for the server URL and stream key with terminal echo disabled. Obtain the
   key for this broadcast at that point. For a noninteractive process, supply the complete
   secure URL in `TIKTOK_LIVE_RTMPS_URL` or the pair `TIKTOK_LIVE_SERVER_URL` and
   `TIKTOK_LIVE_STREAM_KEY` in the process environment. Use the exact protocol TikTok issued.
   The pair supports RTMPS and plain RTMP. Plain RTMP transmits the key and media without TLS.
   Keep the values out of commands, session configs and chat. The TikTok upload token does
   not grant LIVE permissions. See [TikTok's encoder instructions](https://inapp.tiktokv.com/falcon/webcast_mt/page/obs_intro/index.html).

   For automatic viewer questions, connect TikFinity Desktop to the intended room on the
   broadcast host and set `"tiktokChat":"tikfinity"` in the session config. The adapter
   reads chat events from `ws://localhost:21213/`. Set `TIKTOK_LIVE_TIKFINITY_URL` for a
   different local port. Event IDs prevent duplicate replies after reconnecting. The bridge
   must be available to report successful chat connectivity. A quiet room can have zero
   questions. This is the [TikFinity Desktop API](https://tikfinity.zerody.one/tiktok/dapi).

   The default `"tiktokChat":"stdin"` also accepts questions from an authorized external
   source, one JSON object per line:
   `{"source":"tiktok","id":"platform-event-id","text":"Viewer question"}`. Operator input
   remains available in both modes. Viewer replies are spoken in the stream.

   ```sh
   node server/dist/character-live.bundle.js run --platform tiktok --start ready --faq-count N --config FILE --out NEW_SESSION --seconds 180
   node server/dist/character-live.bundle.js status --platform tiktok --config FILE --out NEW_SESSION
   ```

   TikTok status reads the last local `tiktok.json` snapshot. It reports relay connection
   and encoder completion separately from public playback, which stays unverified. End the
   broadcast in TikTok as well as stopping the local encoder. Room reservation and API-driven
   closure are available on YouTube. Specify one platform for status on a simulcast.
   Keep the operator present to monitor chat and stop with SIGINT/SIGTERM. The duration sets the chat intake window. A reply accepted inside that window may finish after it closes. On macOS, the runner keeps the broadcast host awake for the session.

Latency measurements and comparable implementations are in [the live latency study](https://github.com/ttalkkaklab/social-flow/blob/1eabc4fb598b99135fe39a1a2be1f7dbe07fd5a9/docs/research/2026-11-22-character-live-latency/README.md).

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
