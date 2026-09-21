This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

### Hosted transcription configuration

Licensed songs use a self-controlled Hugging Face ZeroGPU Space through the server-side Basic Pitch adapter. Set these variables in the server environment; do not prefix them with `NEXT_PUBLIC_`:

```text
BASIC_PITCH_ENDPOINT=https://<owner>-<space>.hf.space
BASIC_PITCH_TOKEN=<server-only Hugging Face token>
BASIC_PITCH_API_NAME=predict
BASIC_PITCH_MODEL=basic-pitch
NEON_DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

The endpoint is the Space base URL. Sheetify uploads audio in memory, submits the Gradio queue, polls its SSE result, and retains only normalized note events. A deployed Space, valid token, ZeroGPU quota, and provider behavior still require live validation; tests use mocked fetch responses and do not establish those external gates.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

### Local sheets and supported audio

Uploaded audio is processed in the browser and is not uploaded by the local MVP. MP3, WAV, OGG, and FLAC inputs are limited to 25 MB and 3 minutes. Generated MusicXML, note events, and sheet metadata are stored in the versioned `sheetify-sheets` IndexedDB database on the current device for 30 days; this supports large arrangements beyond localStorage limits and survives navigation and refresh. Existing valid localStorage sheets are migrated once.

The catalog UI distinguishes authorized downloadable audio from metadata-only sources. A metadata result cannot enter transcription, and a provider is not treated as operational merely because an environment variable exists. Hosted catalog transcription remains server-controlled through `BASIC_PITCH_ENDPOINT` and a server-only token.

If browser storage is unavailable or a saved sheet cannot be verified, Sheetify stays on the current screen and offers a recoverable error instead of opening a broken practice URL. Practice mode reads local IndexedDB first and falls back to the protected server sheet route when a local copy is unavailable.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
