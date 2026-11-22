"""Choose a video trim within the rendered handles, preserving every speech sample."""
import argparse
import json
import wave

import cv2
import mediapipe as mp
import numpy as np


def trim_start(video, audio, model, lead, count):
    with wave.open(audio, 'rb') as wav:
        pcm = np.frombuffer(wav.readframes(wav.getnframes()), '<i2').astype('float32')
        step = wav.getframerate() // 24
    volume = np.abs(pcm).reshape(-1, step).mean(axis=1)[lead:lead + count]
    if count < 18 or volume.std() < 10:
        return lead
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model), num_faces=1,
        running_mode=mp.tasks.vision.RunningMode.VIDEO)
    cap = cv2.VideoCapture(video)
    mouth = []
    try:
        with mp.tasks.vision.FaceLandmarker.create_from_options(options) as tracker:
            while True:
                ok, rgb = cap.read()
                if not ok:
                    break
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(rgb, cv2.COLOR_BGR2RGB))
                response = tracker.detect_for_video(image, round(len(mouth) * 1000 / 24))
                if not response.face_landmarks:
                    mouth.append(np.nan)
                    continue
                face = response.face_landmarks[0]
                mouth.append((face[14].y - face[13].y) / max(.001, abs(face[291].x - face[61].x)))
    finally:
        cap.release()
    movement = np.asarray(mouth)
    valid = np.isfinite(movement)
    if len(mouth) < lead + count or valid.mean() < .95:
        return lead
    movement = np.interp(np.arange(len(mouth)), np.flatnonzero(valid), movement[valid])
    scores = {}
    for start in range(max(0, lead - 4), min(len(mouth) - count, lead + 4) + 1):
        section = movement[start:start + count]
        scores[start] = np.corrcoef(volume, section)[0, 1] if section.std() > .002 else 0
    best = max(scores, key=scores.get)
    # Natural articulation does not track volume perfectly. Leave weak or
    # ambiguous evidence on its original clock instead of imposing a fixed lag.
    return best if scores[best] >= .30 and scores[best] - scores[lead] >= .12 else lead


if __name__ == '__main__':
    args = argparse.ArgumentParser()
    for name in ('video', 'audio', 'model'):
        args.add_argument('--' + name, required=True)
    for name in ('lead', 'count'):
        args.add_argument('--' + name, type=int, required=True)
    inputs = args.parse_args()
    print(json.dumps({'start': int(trim_start(**vars(inputs)))}))
