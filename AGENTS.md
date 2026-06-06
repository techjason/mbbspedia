# AGENTS.md

## Cursor Cloud specific instructions

### Overview

MBBSPedia is a Next.js 16 + Fumadocs medical knowledge base serving ~240 static MDX pages. All content pages render without any external API keys.

### Running the dev server

```bash
npm run dev
```

Starts at `http://localhost:3000`. First page load compiles MDX and may take several seconds; subsequent navigations are fast.

### Lint

```bash
npm run lint
```

Uses ESLint 9 with `eslint-config-next`.

### Build

```bash
npm run build
```

Static generation for ~488 pages takes ~2 minutes. TypeScript checking is included in the build step (no separate `tsc` script).

### Key caveats

- **No test suite**: There are no automated tests (no `jest`, `vitest`, or `playwright` configured). Lint + build are the primary CI checks.
- **Node.js 20+ required**: The project uses APIs that require Node.js 20 or higher.
- **Package manager**: npm (uses `package-lock.json`). Do not use pnpm or yarn.
- **Content generation scripts** (`scripts/generate-notes.mjs`) require `AI_GATEWAY_API_KEY` and local file paths — these are not needed for development or content browsing. Lecture slide PDFs live in `source-pdfs/<specialty>/`; common senior notes live in `source-pdfs/senior-notes/` and are picked up for every specialty.
- **No database or Docker**: This is a purely static-content site with API routes calling external SaaS services.
