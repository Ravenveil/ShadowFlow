# ShadowFlow Server

RunSession backend API for ShadowFlow's Skill Studio.

## Install

```bash
cd server
npm install
```

### Install Size — Story 15.15

Story 15.15 (multi-format export) introduced two heavy dev dependencies:

- **`@sparticuz/chromium` (~64 MB on disk)** — self-contained Chromium binary
  used by puppeteer-core to render HTML artifacts to PDF without needing a
  system Chrome install.
- **`puppeteer-core` (~9.4 MB)** — headless browser driver.

Together they add roughly **75 MB** to `server/node_modules`. First-time
`npm install` requires a stable connection.

If you don't need PDF export and want a slimmer install, remove
`puppeteer-core` and `@sparticuz/chromium` from `server/package.json`. The
`/api/export/:id/pdf` endpoint will then return `503 PDF_ENGINE_UNAVAILABLE`
on every call (gracefully — the rest of the API stays up). Markdown export
(`turndown`, ~212 KB) and ZIP export are unaffected.

## Run

```bash
# Dev (auto-reload via tsx watch)
npm run dev

# One-shot start
npm start

# Type check (no emit)
npx tsc --noEmit
```

## Tests

Standalone smoke tests, run via `tsx`. No Jest / Vitest harness on the server
side yet — each test file is its own self-contained runner that exits 1 on
failure.

```bash
npx tsx src/parser.test.ts
npx tsx src/assembler.test.ts
npx tsx src/design-systems.test.ts
npx tsx src/routes/export.test.ts
npx tsx src/exporters/markdown.test.ts
npx tsx src/exporters/pdf.test.ts          # e2e chromium step skips on envs
                                           # where the binary can't extract
npx tsx src/storage/runs.test.ts
```

## Endpoints (selected)

- `GET /api/skills` — list of skills loaded from `.shadowflow/skills/`
- `POST /api/runs` — start a RunSession
- `GET /api/runs/:id/stream` — SSE stream
- `GET /api/export/:session_id/zip` — ZIP project (15.6)
- `GET /api/export/:session_id/pdf?filename=*.html&page=A4|Letter&viewport=WxH`
  — render HTML artifact to PDF (15.15). Returns 503
  `PDF_ENGINE_UNAVAILABLE` if chromium failed to launch.
- `GET /api/export/:session_id/markdown?filename=*.html` — turndown HTML →
  Markdown (15.15)
