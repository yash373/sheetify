# Sheetify catalog

Sheetify ships a static, searchable metadata index of 10,000 works. The index
is intentionally separate from audio authorization:

- 5,299 entries come from Open Opus works classified as `Keyboard`.
- 4,701 entries come from the official IMSLP work index, ranked toward common
  piano and keyboard forms when the Open Opus set does not already contain the
  work.

The catalog links back to the source metadata. It does not imply that a source
provides a downloadable recording, or that a work is public domain in every
jurisdiction.

Only a source with an explicit permitted audio URL can enter the hosted
transcription job. Metadata-only entries are browseable and direct the user to
provide audio they are authorized to use. User uploads are transcribed locally
in the browser and are not persisted as source audio.

The catalog snapshot is stored in `lib/catalog-index.json`. Refreshing it must
preserve the 10,000-entry count, the provider split, source URLs, and the
processing boundary described above.
