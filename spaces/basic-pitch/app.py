"""Small, self-controlled Gradio Space for Sheetify's hosted transcription boundary."""

from __future__ import annotations

from collections import defaultdict, deque
from pathlib import Path
from time import monotonic
from typing import Any

import gradio as gr
from basic_pitch import ICASSP_2022_MODEL_PATH
from basic_pitch.inference import predict
from librosa import get_duration

MAX_AUDIO_SECONDS = 180
MAX_REQUESTS_PER_HOUR = 3
request_log: dict[str, deque[float]] = defaultdict(deque)


def _client_key(request: gr.Request | None) -> str:
    return request.client.host if request and request.client else "anonymous"


def _check_rate_limit(key: str) -> None:
    now = monotonic()
    timestamps = request_log[key]
    while timestamps and now - timestamps[0] >= 3600:
        timestamps.popleft()
    if len(timestamps) >= MAX_REQUESTS_PER_HOUR:
        raise gr.Error("Anonymous transcription quota reached. Try again later.")
    timestamps.append(now)


def _normalize_notes(raw_notes: Any) -> list[dict[str, float | int]]:
    notes: list[dict[str, float | int]] = []
    rows = raw_notes.tolist() if hasattr(raw_notes, "tolist") else raw_notes
    for row in rows or []:
        if isinstance(row, dict):
            start = row.get("start_time_s", row.get("start"))
            end = row.get("end_time_s", row.get("end"))
            pitch = row.get("pitch_midi", row.get("pitch"))
            velocity = row.get("velocity", row.get("amplitude"))
        else:
            start, end, pitch, velocity = row[:4]
        if not all(isinstance(value, (int, float)) for value in (start, end, pitch, velocity)):
            continue
        if start < 0 or end <= start or not 0 <= pitch <= 127 or not 0 <= velocity <= 1:
            continue
        notes.append({"start_time_s": float(start), "end_time_s": float(end), "pitch_midi": int(round(pitch)), "velocity": float(velocity)})
    if not notes:
        raise gr.Error("Basic Pitch returned no valid note events.")
    return notes


def transcribe(audio_path: str | None, request: gr.Request | None = None) -> dict[str, Any]:
    if not audio_path:
        raise gr.Error("Upload a short audio file to transcribe.")
    _check_rate_limit(_client_key(request))
    try:
        duration = get_duration(filename=audio_path)
        if duration <= 0 or duration > MAX_AUDIO_SECONDS:
            raise gr.Error(f"Audio must be between 1 second and {MAX_AUDIO_SECONDS} seconds.")

        _, _, raw_notes = predict(audio_path, model_or_model_path=ICASSP_2022_MODEL_PATH)
        return {"model": "spotify-basic-pitch", "duration_seconds": float(duration), "notes": _normalize_notes(raw_notes)}
    finally:
        Path(audio_path).unlink(missing_ok=True)


demo = gr.Interface(
    fn=transcribe,
    inputs=gr.Audio(type="filepath", label="Short licensed audio"),
    outputs=gr.JSON(label="Normalized note events"),
    api_name="predict",
    title="Sheetify Basic Pitch",
    description="Self-controlled transcription for short, authorized audio. Files are processed ephemerally and not retained.",
)

if __name__ == "__main__":
    demo.launch()
