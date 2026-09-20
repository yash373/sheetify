# Jamendo catalog integration notes

Checked 2026-09-20 against the [Jamendo tracks API](https://developer.jamendo.com/v3.0/tracks) and the [Jamendo track file API](https://developer.jamendo.com/v3.0/tracks/file).

- Track search is exposed through `GET /v3.0/tracks` with a `search` parameter that considers track, album, artist, tags, and similar artists.
- The response includes `audiodownload_allowed`. Sheetify must treat that boolean as authoritative before offering a download; Jamendo documents that `audiodownload` can be empty when downloading is not allowed.
- The track response can include `license_ccurl` and `artist_name`, which Sheetify records for attribution and licensing metadata.
- Sheetify records the catalog URL, provider track ID, direct authorized download URL, explicit download permission, attribution text, commercial-use status, derivative/adaptation status, and the metadata verification timestamp. Missing or ambiguous `audiodownload_allowed`/`audiodownload` values are rejected from the processable catalog.
- The file endpoint requires a server-side `client_id` and track `id`. Credentials therefore stay in server environment variables and are never sent to the browser.

## Source policy

Jamendo is the only enabled licensed catalog provider. The provider registry is deliberately explicit: a source is supported only when its official API documents both the catalog metadata and an application-level permission signal for downloading. The application never scrapes pages, invents direct URLs, or accepts a user-supplied audio URL.

No second adapter is enabled at this time. The repository contains no current official, permission-bearing evidence for another provider that meets this contract, so other sources are unsupported rather than inferred or partially integrated. Demo results are fixtures for local development and are not live-provider evidence.

Server downloads are in-memory only, restricted to HTTPS hosts authorized for the provider, bounded by response size and catalog duration, and cleaned after transcription. Redirects, non-audio responses, malformed responses, unauthorized hosts, and failed permission checks fail closed.

The application keeps the demo catalog available when `JAMENDO_CLIENT_ID` is absent. That fallback is deterministic development data, not a claim that the demo tracks are licensed for download.
