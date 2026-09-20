# Sheetify Basic Pitch ZeroGPU Space

This directory is the deployable, self-controlled Hugging Face Space used by
Sheetify's server-side Gradio adapter.

Create a Hugging Face Space with the **ZeroGPU** hardware, copy `app.py` and
`requirements.txt` into it, and keep the Space private if the deployment needs
authenticated access. Configure Sheetify with the Space base URL:

```text
BASIC_PITCH_ENDPOINT=https://<owner>-<space>.hf.space
BASIC_PITCH_API_NAME=predict
BASIC_PITCH_TOKEN=<server-only-token-if-private>
```

The Space accepts only short audio, applies a small anonymous per-client rate
limit, returns normalized note events, and does not write uploads or raw model
responses to persistent storage. Hugging Face ZeroGPU quota enforcement remains
an external platform gate.
