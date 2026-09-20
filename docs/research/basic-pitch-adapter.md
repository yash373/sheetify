# Basic Pitch adapter research

Research date: 2026-09-20

## Official findings

- Spotify's official `basic-pitch` repository describes Basic Pitch as a Python library for automatic music transcription. Its prediction API accepts an audio path and returns model output, MIDI data, and note events.
- The official note-event shape contains start time in seconds, end time in seconds, MIDI pitch, amplitude/velocity, and optional pitch-bend values.
- The official command-line flow writes generated MIDI and can also write note events as CSV. The application should consume normalized note events rather than persist raw model output.
- The official TypeScript sibling repository exists, but this application keeps transcription behind a provider-neutral server boundary so the hosted runtime can be replaced without changing the practice UI.

## Adapter boundary

Sheetify sends an audio artifact to a server-side, self-controlled Hugging Face Gradio Space configured by `BASIC_PITCH_ENDPOINT`. `BASIC_PITCH_TOKEN` is read only on the server. The adapter keeps the audio bytes in memory and follows Gradio's upload → queued call → SSE poll flow:

1. `POST {endpoint}/gradio_api/upload` with a multipart `files` field.
2. `POST {endpoint}/gradio_api/call/{BASIC_PITCH_API_NAME}` with `{ "data": [{ "path": "...", "meta": { "_type": "gradio.FileData" } }] }`.
3. `GET {endpoint}/gradio_api/call/{api}/{event_id}` until an SSE `complete` event.

The Space's `complete` payload must contain an object (or a one-item `data` wrapper) with `notes` or `note_events`, where each note has `start_time_s`, `end_time_s`, `pitch_midi`, and `velocity`. The adapter normalizes that into seconds-based note events.

Required server configuration:

- `BASIC_PITCH_ENDPOINT`: the Space base URL, not a `/predict` URL.
- `BASIC_PITCH_TOKEN`: optional for a public Space, required for private/authenticated access, and never exposed to the browser.
- `BASIC_PITCH_API_NAME`: the Space's Gradio API name; defaults to `predict`.
- `BASIC_PITCH_MODEL`: fallback model label; defaults to `basic-pitch`.

The adapter deliberately fails closed when the endpoint is not configured or when the provider response is malformed. Transient 5xx/network failures and bounded queue timeouts are retryable; malformed payloads, client errors, and quota exhaustion are terminal. The caller owns the audio artifact lifecycle and the processing pipeline always invokes its cleanup hook. No audio, raw provider response, or raw transcript is persisted. This repository does not claim that a live Space is deployed or available; deployment and quota are external validation gates.

## Sources

- [Spotify basic-pitch README](https://github.com/spotify/basic-pitch/blob/main/README.md)
- [Spotify basic-pitch inference implementation](https://github.com/spotify/basic-pitch/blob/main/basic_pitch/inference.py)
- [Spotify basic-pitch-ts README](https://github.com/spotify/basic-pitch-ts/blob/main/README.md)
- [Hugging Face Spaces agent API and Gradio upload/call/poll contract](https://huggingface.co/docs/hub/spaces-agents)
