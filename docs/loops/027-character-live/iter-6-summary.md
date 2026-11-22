# November 22 platform and motion checks

The owner selected Pundago and Han Seorin for the live test. Static portraits remain available for local previews. Both broadcast destinations now require moving footage. Audio-driven mouth frames come from MuseTalk. Full-frame listening shots continue while text, voice and mouth frames are being prepared.

The first RTMPS implementation lost the stream key. The new relay passes the full private URL to libavformat on a separate descriptor and forwards the encoded FLV. An early YouTube chat write returned 404. The runner now reads the active video chat ID, waits for a live read and reconciles a definitely rejected write. An interrupted or ambiguous write is never resubmitted. A concurrent LTX benchmark exposed a thermal sleep on the Mac during another run. The final interactive test ran after that benchmark and held a macOS wake assertion during playout.

The confirmed YouTube session was unlisted. A test question asked about Tubi's headband. The same platform message ID reached the end of the generated Korean answer. Review the player samples, audio transcript, media timings, local RTMPS receiver and underlying recordings together.

- [YouTube replay](https://www.youtube.com/watch?v=Ctd1Jp9hJxg)
- [Platform, frame, voice and timing measurements](/Volumes/data/story/pundago/logs/character-live-20261122/confirmed-evidence.json)
- [Decoded reply with audio](/Volumes/data/story/pundago/logs/character-live-20261122/confirmed-reply.mp4)
- [TikTok ingest transport comparison](/Volumes/data/story/pundago/logs/character-live-20261122/tiktok-transport.json)
- [Measured LTX progressive output](/Volumes/data/story/pundago/logs/character-live-20261122/ltx-current/result.json)
