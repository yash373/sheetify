# Basic Pitch adapter research

Research date: 2026-09-20

## Official findings

- Spotify's official `basic-pitch` repository describes Basic Pitch as a Python library for automatic music transcription. Its prediction API accepts an audio path and returns model output, MIDI data, and note events.
- The official note-event shape contains start time in seconds, end time in seconds, MIDI pitch, amplitude/velocity, and optional pitch-bend values.
- The official command-line flow writes generated MIDI and can also write note events as CSV. The application should consume normalized note events rather than persist raw model output.
- The official TypeScript sibling repository exists, but this application keeps transcription behind a provider-neutral server boundary so the hosted runtime can be replaced without changing the practice UI.

## Adapter boundary

Sheetify sends an audio artifact to a server-side hosted Basic Pitch endpoint configured by `BASIC_PITCH_ENDPOINT`. `BASIC_PITCH_TOKEN` is read only on the server. The adapter accepts a multipart `audio` upload and normalizes the response into seconds-based note events.

The adapter deliberately fails closed when the endpoint is not configured or when the provider response is malformed. The demo job remains deterministic and does not pretend that a real transcription occurred.

## Sources

- [Spotify basic-pitch README](https://github.com/spotify/basic-pitch/blob/main/README.md)
- [Spotify basic-pitch inference implementation](https://github.com/spotify/basic-pitch/blob/main/basic_pitch/inference.py)
- [Spotify basic-pitch-ts README](https://github.com/spotify/basic-pitch-ts/blob/main/README.md)
