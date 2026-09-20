# LTX 2.5 on MLX Core — install runbook

`mlx_video_generate` talks to MLX Core / mlx-serve on `http://127.0.0.1:11234`. This page is
the setup the tool assumes. Measurements below come from a MacBook Pro M4 Max (128GB unified,
macOS 26.6.2) on 2026-09-19; the plugin itself pins no model id — it picks a ready model that
advertises capability `video`.

## 1. Get the pack

The 4-bit distilled pack is the one to take:

| pack | on disk | resident while generating |
|---|---|---|
| `ddalcu/LTX-2.5-MLX-Serve-4bit` | ~36GB | 27.4GB |
| `ddalcu/LTX-2.5-MLX-Serve-8bit` | ~60GB | — (not measured; 4-bit output was already clean) |

**`mlx-serve pull` alone does not give you a working pack.** It skips the repository's
subfolders, so the text encoder never lands and the engine refuses to start. Pull the whole
repository instead:

```bash
pip install -U "huggingface_hub[cli]"
hf download ddalcu/LTX-2.5-MLX-Serve-4bit --local-dir ~/models/LTX-2.5-MLX-Serve-4bit
```

Check the text encoder is there before starting the server — a pack without it looks fine on
disk and fails at the first request.

`--local-dir` and `--model` take any path, so the pack does not have to sit under `$HOME`. Set
`HF_HOME` to the same volume before downloading, or `huggingface_hub` stages another copy of the
36GB in `~/.cache/huggingface` on the way through. A separate volume must be one that mounts at
boot — the server starts before a removable disk is there and reports no video capability.

## 2. Start the server so that video is registered

Point the server at the folder — **from launchd, not from a shell an agent owns**:

```bash
# ~/Library/LaunchAgents/com.ttalkkaklab.mlx-serve.plist → ProgramArguments:
#   mlx-serve --model /path/to/LTX-2.5-MLX-Serve-4bit --serve
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ttalkkaklab.mlx-serve.plist
curl -s http://127.0.0.1:11234/v1/models | jq '.data[] | {id, state, capabilities}'
# {"id":"LTX-2.5-MLX-Serve-4bit","state":"ready","capabilities":["video"]}
```

Three things to know:

- **A generation that dies at ~51s is the parent shell, not the model.** Started as a child of an
  agent's shell, the server is torn down with the process group when that turn ends, and every
  request dies at the same second (51.7s measured three times in a row on 2026-09-20). `nohup`
  does not survive it. Under launchd the same model and the same request ran the full 13 minutes.
  A 768×1280 49-frame clip takes ~13 minutes, so no interactive shell outlives it.
- `mlx-serve serve` (catalog mode) does **not** register `POST /v1/video/generations`. The
  request comes back 404 and `mlx_video_generate` reports the server as down for video. Use
  `--model <path> --serve`.
- The model id differs per start mode — the folder name above, `ddalcu/LTX-2.5-…` in catalog
  mode. The server does not validate the `model` field either way (a wrong id still answers
  200), so let the tool pick the model instead of passing one.

The last two live in MLX Core.app, not in this repository.

## 3. What the request has to satisfy

| | value | why |
|---|---|---|
| width/height | multiple of 64 | two-stage LTX grid; `pipeline:"one_stage"` relaxes it to 32 |
| max canvas | 1920×1088 | model ceiling |
| numFrames | 8k+1 — 9, 17, … 241 | LTX latent depth. Any other count is answered **200 with the server's own default**, not refused |
| fps | 24 | server fixes it; produce's builder is 30fps, so a splice re-encodes |
| steps | ignored | the distilled pack runs a fixed 8 |
| decoded RGB | ≤ 800MB | Node heap ceiling here, not a model limit: 1088×1920 caps at 133 frames (5.5s), 768×1280 at 241 (10.0s, the schema maximum) |

The schema refuses each of these before the POST, so a mistake costs no GPU time.

## 4. What it costs in wall-clock

2-second clip (49 frames), 4-bit pack, nothing else on the GPU:

| canvas | time |
|---|---|
| 768×1280 | 12min 47s |
| 1088×1920 | 42min 37s |

Scaling is not linear — a linear estimate from the pack's own benchmark was off by 3.8× and
6×. Treat this as a batch-render lane: it does not replace `veo_*` / `seedance_*` for a cut
with a deadline. It earns its place when the clip must not leave the machine, or when there
is time to spare and no budget.

Audio comes back with the video (16kHz, 2 channels), which `veo_*` also does and
`seedance_*` does not. It arrives a frame shorter than the picture, so the mux does not pass
`-shortest` — that flag used to drop the final frame.

## 5. License

LTX-2.x Community License: free commercially for organizations under $10M annual revenue,
with an AI-generation disclosure obligation and a ban on training other models on the output.
Publishing to YouTube/Threads/Instagram is unrestricted at our size. The MLX conversion above
carries no contact gate; the original Hugging Face repository does.
