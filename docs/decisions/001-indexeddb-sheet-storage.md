# ADR 001: Store generated sheets in IndexedDB

## Status

Accepted for the local-first MVP.

## Decision

Generated practice sheets are stored in a versioned IndexedDB database named `sheetify-sheets`, using the `sheets` object store keyed by `sheetId`. Each entry contains the complete sheet package, schema version, generation timestamp, and a 30-day expiry.

The browser API is asynchronous and explicit: `saveSheet`, `getSheet`, `listSheets`, `deleteSheet`, and `clearExpiredSheets`. The cache compatibility helpers remain available for song/difficulty lookup and recently-practiced UI behavior, but they delegate to IndexedDB.

Valid entries from the previous `sheetify:*` localStorage keys are migrated once. A localStorage marker prevents repeated migration. LocalStorage is no longer used for large sheet payloads; it remains only as migration compatibility metadata.

## Consequences

- MusicXML and note-event payloads can exceed the previous 450 KB localStorage guard.
- Every creation path must await a write and read-back verification before navigating to practice mode.
- Practice hydration checks local IndexedDB first, then the protected server sheet route.
- Storage-unavailable and corrupt-entry states are visible and recoverable rather than silently redirecting to a missing sheet.
