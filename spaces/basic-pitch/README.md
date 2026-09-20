---
title: Sheetify Basic Pitch
emoji: 🎼
colorFrom: indigo
colorTo: purple
sdk: gradio
app_file: app.py
python_version: "3.11"
---

# Sheetify Basic Pitch Space

This directory is the deployable, self-controlled Hugging Face Space used by
Sheetify's server-side Gradio adapter.

Create a Hugging Face Space with the standard CPU hardware, copy `app.py` and
`requirements.txt` into it, and keep the Space private if the deployment needs
authenticated access. Configure Sheetify with the Space base URL:

```text
BASIC_PITCH_ENDPOINT=https://<owner>-<space>.hf.space
BASIC_PITCH_API_NAME=predict
BASIC_PITCH_TOKEN=<server-only-token-if-private>
```

The Space accepts only short audio, applies a small anonymous per-client rate
limit, returns normalized note events, and deletes uploads after each request.
The default CPU deployment keeps the first launch simple; dedicated hardware
can be selected later without changing Sheetify's provider contract.
