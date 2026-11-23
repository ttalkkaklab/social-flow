# Local LTX video on Apple silicon

Use `ltx_video_generate` with an LTX pack served by MLX-Serve on your Mac. FFmpeg writes the returned picture and audio to an MP4. This is the on-device video adapter. The hosted LTX API and an ASTRA gateway have separate setup instructions. [Video routing](../skills/_shared/video-routing.md)

## Install and start the model

The project's September 2026 test used the 4-bit distilled pack on an M4 Max with 128 GB of unified memory. The pack occupied about 36 GB on disk. Download the full repository, including the text encoder. With the Hugging Face CLI installed, run:

```sh
hf download ddalcu/LTX-2.5-MLX-Serve-4bit --local-dir "$HOME/models/LTX-2.5-MLX-Serve-4bit"
```

Start MLX-Serve from a terminal or a service that will stay running for the full render:

```sh
mlx-serve --model "$HOME/models/LTX-2.5-MLX-Serve-4bit" --serve
```

From another terminal, inspect the default local endpoint:

```sh
curl -fsS http://127.0.0.1:11234/v1/models
```

Look for the LTX model ID, its ready state and the `video` capability. The plugin uses `MLX_SERVE_URL` if your service runs at a different address. Supply `MLX_SERVE_API_KEY` to the MCP process if the service requires it. Choose the local MLX video adapter and the installed LTX model during project setup. See the [model card](https://huggingface.co/ddalcu/LTX-2.5-MLX-Serve-4bit) for the pack and its license.

## Plan the render

| Parameter | Local adapter contract |
| --- | --- |
| Width and height | 256–1920 pixels per side. Use multiples of 64 for the default two-stage pipeline, or multiples of 32 with `one_stage`. |
| Frame count | 9 through 241 in steps of 8. The default is 49 frames at 24 fps. |
| Decoded RGB | At most 800 MiB for width × height × frames × 3 bytes. Reduce the canvas or the number of frames if the plan exceeds it. |
| Conditioning | Supply a local first-frame image, and a last-frame image when the plan calls for one. |

In the September test, a 49-frame clip took about 13 minutes at 768×1280. Treat that as one machine's measurement. RAM pressure, model loading, canvas size and other GPU work change the time. For a managed episode, keep the request ID and inspect `video_status` if the connection closes. [Adapter implementation](../server/src/mlx-serve-client.ts)
