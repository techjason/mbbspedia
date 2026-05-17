# MBBSPedia

MBBSPedia is a Next.js + Fumadocs medical knowledge base for MBBS revision.

## Purpose

- Provide structured, searchable revision notes.
- Keep claims traceable through visible citations.
- Publish only content derived from permitted public sources.
- Use end-of-section `ActiveRecallQuestions` accordion prompts for self-testing (no AI grading).

## Source and Compliance Policy

This repository is intended for a public website. Public content must follow these rules:

- Allowed: public guidelines, public-domain material, and content with explicit reuse permission.
- Prohibited in public content: lecture slides from restricted LMS platforms, private teaching handouts, and private senior notes.
- AI outputs are draft assistance only and must be verified against permitted sources before publication.
- References must be visible on published pages.

If a page includes restricted-derived content, mark it as `restricted-derived` and rewrite from permitted sources before keeping it public.

## Medical Disclaimer

This project is for education only. It is not medical advice, not a diagnostic tool, and not a substitute for clinical supervision, local protocols, or specialist care.

## Project Structure

- `app/`: Next.js App Router pages and API routes.
- `content/docs/`: Topic entry pages.
- `content/fragments/`: Reusable section content rendered inside topic tabs.
- `components/mdx/`: Custom MDX components, including citations.
- `lib/mdx/remark-citations.ts`: Citation and references transform plugin.
- `scripts/`: Content-generation and retrieval tooling.
- `source-pdfs/`: Local ignored PDF drop folder for RAG and note generation.

## Development

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/installation)

### Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
pnpm build
pnpm start
```

### Source PDFs for RAG

Use `source-pdfs/<specialty>/` as the local lecture-slide PDF drop folder for
RAG indexing and AI-assisted note generation. Put common senior notes in
`source-pdfs/senior-notes/`; those notes are automatically included for every
specialty. For example:

```text
source-pdfs/senior-notes/
source-pdfs/general-surgery/
source-pdfs/medicine/
source-pdfs/psychiatry/
source-pdfs/paediatrics/
```

PDFs in `source-pdfs/` are ignored by git. Senior notes may be `.pdf`, `.md`,
`.mdx`, or `.txt`. Keep restricted or private source material local, and verify
generated public content against permitted sources before publication.

To index and generate from a specialty folder:

```bash
pnpm run index:rag -- --specialty medicine
pnpm run generate:notes -- --specialty medicine "atrial fibrillation"
```

The specialty shortcuts use the same folders, e.g. `pnpm run index:rag:psychiatry`
reads from `source-pdfs/psychiatry/` plus `source-pdfs/senior-notes/`. Explicit
`--slides-dir`, `--senior-note`, and `--senior-notes-dir` flags still work for
one-off additions.

### Mixedbread Search

Search is configured to use Mixedbread when the following environment
variables are available:

- `MIXEDBREAD_API_KEY`
- `MIXEDBREAD_STORE_IDENTIFIER`
- `MIXEDBREAD_BASE_URL` (optional)

The UI calls `/api/search`, and the server route queries Mixedbread to avoid
browser CORS issues and keep API keys server-side.

If you want the GitHub Actions sync workflow to upload content automatically,
add these repository secrets under Settings > Secrets and variables > Actions:

- `MIXEDBREAD_API_KEY`
- `MIXEDBREAD_STORE_IDENTIFIER` (optional; defaults to `mbbspedia`)

Without `MIXEDBREAD_API_KEY`, the `Mixedbread Content Sync` workflow now exits
cleanly with a skip notice instead of failing the whole run.

To upload docs and fragments from repo root:

```bash
pnpm exec mxbai store upload "mbbspedia" "content/**/*.mdx" --strategy high_quality
```

### Lint

```bash
pnpm lint
```

## Content Editing Workflow

1. Edit topic files under `content/docs/` and fragments under `content/fragments/`.
2. Keep inline citation markers in content and maintain the references section.
3. Verify each cited source is publicly permissible for redistribution.
4. Update or remove material that cannot be attributed to permitted sources.

## Citation System

The project uses a custom MDX citation pipeline:

- Inline markers like `[1]` are converted to `<Cite n="1" />`.
- `## References` lists are converted to rendered `<References />` blocks.
- References are intentionally visible for auditability and trust.

Key files:

- `lib/mdx/remark-citations.ts`
- `components/mdx/citations.tsx`
- `mdx-components.tsx`

## Corrections and Takedown

If you identify potential copyright issues, inaccurate content, or outdated recommendations, open a repository issue with:

- Page path or URL
- Exact text to review
- Supporting context or source

Maintainers should prioritize removal or correction when rights or safety concerns are raised.
