import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";
import { structure, type StructuredData } from "fumadocs-core/mdx-plugins/remark-structure";
import { findPath } from "fumadocs-core/page-tree";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";

interface SearchIndexInput {
  locale?: string;
  url: string;
  path: string;
  absolutePath?: string;
  data: {
    title?: string;
    description?: string;
    structuredData?: StructuredData;
    load?: () => Promise<{ structuredData?: StructuredData }>;
  };
}

const FRONTMATTER_RE = /^---[\s\S]*?\n---\n?/;
const IMPORT_LINE_RE =
  /^\s*import\s+.+?\s+from\s+["']([^"']+\.mdx?)["'];?\s*$/gm;
const IMPORT_EXPORT_LINE_RE = /^\s*(import|export)\s.+$/gm;

function isBreadcrumbLabel(name: unknown): name is string {
  return typeof name === "string" && name.length > 0;
}

function cleanMdxForIndexing(content: string): string {
  return content
    .replace(FRONTMATTER_RE, "")
    .replace(IMPORT_EXPORT_LINE_RE, "")
    .trim();
}

async function resolveLocalMdxImport(
  baseDir: string,
  specifier: string,
): Promise<string | null> {
  if (!specifier.startsWith(".")) return null;

  const directPath = resolve(baseDir, specifier);
  const candidates = directPath.endsWith(".mdx")
    ? [directPath]
    : [directPath, `${directPath}.mdx`];

  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Try the next path candidate.
    }
  }

  return null;
}

async function collectImportedMdxText(
  rawMdx: string,
  baseDir: string,
  visited: Set<string>,
): Promise<string> {
  IMPORT_LINE_RE.lastIndex = 0;
  const chunks: string[] = [];

  let match = IMPORT_LINE_RE.exec(rawMdx);
  while (match) {
    const specifier = match[1];
    const importPath = await resolveLocalMdxImport(baseDir, specifier);

    if (importPath && !visited.has(importPath)) {
      visited.add(importPath);
      const importedRaw = await readFile(importPath, "utf8");
      chunks.push(cleanMdxForIndexing(importedRaw));
      chunks.push(
        await collectImportedMdxText(
          importedRaw,
          dirname(importPath),
          visited,
        ),
      );
    }

    match = IMPORT_LINE_RE.exec(rawMdx);
  }

  return chunks.filter(Boolean).join("\n");
}

async function getStructuredData(page: SearchIndexInput): Promise<StructuredData> {
  if (page.data.structuredData) return page.data.structuredData;
  if (typeof page.data.load === "function") {
    const loaded = await page.data.load();
    if (loaded.structuredData) return loaded.structuredData;
  }

  return { headings: [], contents: [] };
}

async function getImportedStructuredData(
  page: SearchIndexInput,
): Promise<StructuredData | null> {
  if (!page.absolutePath) return null;

  const rawPage = await readFile(page.absolutePath, "utf8");
  const baseDir = dirname(page.absolutePath);
  const visited = new Set<string>([page.absolutePath]);
  const importedText = await collectImportedMdxText(rawPage, baseDir, visited);
  if (!importedText) return null;

  return structure(importedText);
}

async function buildIndex(page: SearchIndexInput) {
  const structuredData = await getStructuredData(page);
  const importedStructuredData = await getImportedStructuredData(page);
  let breadcrumbs: string[] | undefined;

  const pageTree = source.getPageTree(page.locale);
  const path = findPath(
    pageTree.children,
    (node) => node.type === "page" && node.url === page.url,
  );

  if (path) {
    breadcrumbs = [];
    path.pop();
    if (isBreadcrumbLabel(pageTree.name)) breadcrumbs.push(pageTree.name);
    for (const segment of path) {
      if (!isBreadcrumbLabel(segment.name)) continue;
      breadcrumbs.push(segment.name);
    }
  }

  return {
    title: page.data.title ?? page.path.replace(/\.mdx?$/, ""),
    breadcrumbs,
    description: page.data.description,
    url: page.url,
    id: page.url,
    structuredData: importedStructuredData
      ? {
          headings: [
            ...structuredData.headings,
            ...importedStructuredData.headings,
          ],
          contents: [
            ...structuredData.contents,
            ...importedStructuredData.contents,
          ],
        }
      : structuredData,
  };
}

export const { GET } = createFromSource(source, {
  // https://docs.orama.com/docs/orama-js/supported-languages
  language: "english",
  buildIndex,
});
