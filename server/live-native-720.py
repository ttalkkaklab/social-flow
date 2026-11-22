"""Render a 736x1280 speaking portrait on a CUDA LTX 2.5 worker."""
import argparse
import os
import wave
from pathlib import Path


def render(audio, image, output, prompt):
    import torch
    from ltx_core.components.guiders import MultiModalGuider, MultiModalGuiderParams
    from ltx_core.components.noisers import GaussianNoiser
    from ltx_core.components.schedulers import LTX2Scheduler
    from ltx_core.model.audio_vae import encode_audio
    from ltx_core.model.video_vae import AUTO_TILING, get_video_chunks_number
    from ltx_core.types import AudioLatentShape, VideoPixelShape
    from ltx_pipelines.ti2vid_one_stage import TI2VidOneStagePipeline
    from ltx_pipelines.utils.args import ImageConditioningInput
    from ltx_pipelines.utils.blocks import AudioConditioner
    from ltx_pipelines.utils.denoisers import GuidedDenoiser
    from ltx_pipelines.utils.helpers import combined_image_conditionings, ensure_tiling_config, tiling_scale_factors_for_vae
    from ltx_pipelines.utils.media_io import decode_audio_from_file, encode_video
    from ltx_pipelines.utils.model_paths import ModelPaths
    from ltx_pipelines.utils.types import ModalitySpec

    models = Path(os.environ.get("SOCIAL_FLOW_LTX_MODELS", "/data/ltx/models"))
    paths = ModelPaths.from_split(
        transformer_path=str(models / "diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors"),
        text_encoder_path=str(models / "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors"),
        video_vae_path=str(models / "vae/ltx-2.5-video-vae-bf16.safetensors"),
        audio_vae_path=str(models / "vae/ltx-2.5-audio-vae-bf16.safetensors"),
    )
    device, dtype = torch.device("cuda"), torch.bfloat16
    with wave.open(audio, "rb") as wav:
        samples, rate = wav.getnframes(), wav.getframerate()
    if not 0 < samples <= rate * 30.5:
        raise ValueError("Speech track exceeds the render limit")
    fps, width, height = 24, 736, 1280
    frames, remainder = divmod(samples * fps, rate)
    if remainder or frames < 9 or (frames - 1) % 8:
        raise ValueError("Conditioning audio must span exactly 8n + 1 video frames")
    with torch.inference_mode():
        pipe = TI2VidOneStagePipeline(paths, [], device=device)
        generator = torch.Generator(device=device).manual_seed(42)
        ctx, negative = pipe.prompt_encoder([
            prompt + " The speaker visibly opens and closes her mouth as she articulates each syllable with relaxed expression. A clean unlettered image from a fixed camera.",
            "subtitles, captions, letters, text, logos, watermark, silently closed mouth, frozen face, dancing, singing, rapid gestures, zoom, moving camera",
        ])
        voice = decode_audio_from_file(audio, device, 0.0, None)
        if voice.waveform.shape[-2] == 1:
            from dataclasses import replace
            voice = replace(voice, waveform=voice.waveform.repeat_interleave(2, dim=-2))
        conditioner = AudioConditioner(paths.audio_vae(), dtype, device)
        latent = conditioner(lambda enc: encode_audio(voice, enc, None))
        length = AudioLatentShape.from_duration(batch=1, duration=frames / fps, channels=8, mel_bins=16).frames
        latent = torch.nn.functional.pad(latent[:, :, :length], (0, 0, 0, max(0, length - latent.shape[2])))
        images = pipe.image_conditioner.resolve_crf([ImageConditioningInput(image, 0, 1.0)])
        cond = pipe.image_conditioner(lambda enc: combined_image_conditionings(
            images=images, height=height, width=width, video_encoder=enc, dtype=dtype, device=device,
        ))
        video, _ = pipe.stage(
            denoiser=GuidedDenoiser(
                v_context=ctx.video_encoding, a_context=ctx.audio_encoding,
                video_guider=MultiModalGuider(
                    params=MultiModalGuiderParams(cfg_scale=3.0, stg_scale=1.0, rescale_scale=0.7,
                                                  modality_scale=3.0, stg_blocks=[28]),
                    negative_context=negative.video_encoding),
                audio_guider=MultiModalGuider(params=MultiModalGuiderParams()),
            ),
            sigmas=LTX2Scheduler().execute(steps=20).to(device=device, dtype=torch.float32),
            noiser=GaussianNoiser(generator=generator), width=width, height=height, frames=frames, fps=fps,
            video=ModalitySpec(context=ctx.video_encoding, conditionings=cond),
            audio=ModalitySpec(context=ctx.audio_encoding, frozen=True, noise_scale=0.0, initial_latent=latent),
        )
        tiling = ensure_tiling_config(
            AUTO_TILING, scale_factors=tiling_scale_factors_for_vae(paths.video_vae()),
            vae_checkpoint_path=paths.video_vae(), device=device, diffvae_optimization=pipe.video_decoder.diffvae_optimization,
            video_shape=VideoPixelShape(batch=1, frames=frames, width=width, height=height, fps=fps),
        )
        rgb = pipe.video_decoder(video.latent, tiling, generator=generator, dtype=dtype)
        encode_video(video=rgb, fps=fps, audio=None, output_path=output,
                     video_chunks_number=get_video_chunks_number(frames, tiling))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for field in ("audio", "image", "output", "prompt"):
        parser.add_argument("--" + field, required=True)
    args = parser.parse_args()
    render(args.audio, args.image, args.output, args.prompt)
