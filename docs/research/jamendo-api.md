# Jamendo catalog integration notes

Checked 2026-09-20 against the [Jamendo tracks API](https://developer.jamendo.com/v3.0/tracks) and the [Jamendo track file API](https://developer.jamendo.com/v3.0/tracks/file).

- Track search is exposed through `GET /v3.0/tracks` with a `search` parameter that considers track, album, artist, tags, and similar artists.
- The response includes `audiodownload_allowed`. Sheetify must treat that boolean as authoritative before offering a download; Jamendo documents that `audiodownload` can be empty when downloading is not allowed.
- The track response can include `license_ccurl` and `artist_name`, which Sheetify records for attribution and licensing metadata.
- The file endpoint requires a server-side `client_id` and track `id`. Credentials therefore stay in server environment variables and are never sent to the browser.

The application keeps the demo catalog available when `JAMENDO_CLIENT_ID` is absent. That fallback is deterministic development data, not a claim that the demo tracks are licensed for download.
