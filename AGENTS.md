# AGENTS.md

## Cursor Cloud specific instructions

### Overview

MBBSPedia is a Next.js 16 + Fumadocs medical knowledge base serving ~240 static MDX pages. All content pages render without any external API keys; search and AI chat require optional Mixedbread/Gemini keys.

### Running the dev server

```bash
pnpm dev
```

Starts at `http://localhost:3000`. First page load compiles MDX and may take several seconds; subsequent navigations are fast.

### Lint

```bash
pnpm lint
```

Uses ESLint 9 with `eslint-config-next`.

### Build

```bash
pnpm build
```

Static generation for ~488 pages takes ~2 minutes. TypeScript checking is included in the build step (no separate `tsc` script).

### Key caveats

- **No test suite**: There are no automated tests (no `jest`, `vitest`, or `playwright` configured). Lint + build are the primary CI checks.
- **Node.js 20+ required**: The project uses APIs that require Node.js 20 or higher.
- **Package manager**: pnpm (uses `pnpm-lock.yaml`; `packageManager` in `package.json` pins the pnpm version). `pnpm-workspace.yaml` only lists `allowBuilds` so `sharp`, `esbuild`, and related packages can run install scripts; do not use npm or add `package-lock.json`.
- **Optional API keys**: `MIXEDBREAD_API_KEY` and `MIXEDBREAD_STORE_IDENTIFIER` enable `/api/search`. Without them, search returns errors but all MDX content pages work.
- **Content generation scripts** (`scripts/generate-notes.mjs`, `scripts/index-rag.mjs`) require `AI_GATEWAY_API_KEY` and local file paths — these are not needed for development or content browsing. Lecture slide PDFs live in `source-pdfs/<specialty>/`; common senior notes live in `source-pdfs/senior-notes/` and are picked up for every specialty.
- **No database or Docker**: This is a purely static-content site with API routes calling external SaaS services.
