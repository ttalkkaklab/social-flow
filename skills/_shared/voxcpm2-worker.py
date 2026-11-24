"""Run the installed mlx-audio engine for one local app session."""
import json
import os
from pathlib import Path
import sys
import time
import tempfile

protocol = sys.stdout
sys.stdout = sys.stderr
from mlx_audio.tts import load_model
import numpy as np
import soundfile as sf

model = None
for line in sys.stdin:
    try:
        request = json.loads(line)
        started = time.monotonic()
        cold = model is None
        if cold:
            config = json.loads((Path(sys.argv[1]) / "config.json").read_text())
            if config.get("model_type") != "voxcpm2":
                raise ValueError("Select a local VoxCPM2 model directory.")
            loaded_model = load_model(sys.argv[1])
            if loaded_model.sample_rate != 48000:
                raise ValueError("VoxCPM2 must produce 48 kHz audio.")
            model = loaded_model
        loaded = time.monotonic()
        args = {key: request[key] for key in (
            "text", "ref_audio", "prompt_audio", "prompt_text", "instruct",
            "max_tokens", "inference_timesteps", "cfg_value",
        ) if request.get(key) is not None}
        if bool(args.get("prompt_text")) != bool(args.get("prompt_audio")):
            raise ValueError("Continuation needs both an audio file and its transcript.")
        for key in ("ref_audio", "prompt_audio"):
            if key in args and not Path(args[key]).is_file():
                raise FileNotFoundError(args[key])
        output = Path(request["output"])
        segments = [np.asarray(result.audio) for result in model.generate(**args)]
        samples = np.concatenate(segments)
        if not samples.size or not np.isfinite(samples).all():
            raise ValueError("The model returned empty or invalid audio.")
        with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".wav", delete=False) as f:
            tmp = Path(f.name)
        try:
            sf.write(tmp, samples, model.sample_rate, subtype="PCM_16")
            os.link(tmp, output)
        finally:
            tmp.unlink(missing_ok=True)
        reply = dict(cold=cold, load_seconds=loaded-started,
                     synthesis_seconds=time.monotonic()-loaded,
                     audio_seconds=samples.size/model.sample_rate)
    except Exception as error:
        reply = {"error": str(error)}
    print(json.dumps(reply, ensure_ascii=False), file=protocol, flush=True)
