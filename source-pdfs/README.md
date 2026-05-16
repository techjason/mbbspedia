# Source PDFs

Drop local PDFs here by specialty:

```text
source-pdfs/
  general-surgery/
  medicine/
  psychiatry/
  paediatrics/
```

The scripts use `source-pdfs/<specialty>/` by default for both RAG indexing
and note generation. PDF files in this directory are intentionally ignored by
git because they may be restricted or large.

Typical workflow:

```bash
npm run index:rag -- --specialty medicine
npm run generate:notes -- --specialty medicine "atrial fibrillation"
```
