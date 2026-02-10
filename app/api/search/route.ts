import { source } from "@/lib/source";
import {
  asRecord,
  firstString,
  humanizeFilename,
  normalizeFsPath,
  stripDocExt,
} from "@/lib/mixedbread/chunk-utils";
import { getMixedbreadClient } from "@/lib/mixedbread/client";
import type { SortedResult } from "fumadocs-core/search/server";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const runtime = "nodejs";

const LOCAL_MDX_IMPORT_RE =
  /^\s*import\s+.+?\s+from\s+["']([^"']+\.(?:md|mdx))["'];?\s*$/gm;

interface PageInfo {
  path: string;
  stem: string;
  url: string;
  title: string;
}

const pageInfos: PageInfo[] = source.getPages().map((page) => {
  const normalizedPath = normalizeFsPath(page.path);
  return {
    path: normalizedPath,
    stem: docStemFromPagePath(normalizedPath),
    url: page.url,
    title: page.data.title ?? humanizeFilename(normalizedPath),
  };
});

const docsStemToUrl = new Map<string, string>();
const docsBasenameToPages = new Map<string, PageInfo[]>();
const pageTitleByUrl = new Map<string, string>();

for (const page of pageInfos) {
  docsStemToUrl.set(page.stem, page.url);
  pageTitleByUrl.set(page.url, page.title);

  const basename = page.stem.split("/").pop() ?? "";
  if (!basename) continue;
  const list = docsBasenameToPages.get(basename) ?? [];
  list.push(page);
  docsBasenameToPages.set(basename, list);
}

let fragmentToPageUrlMapPromise: Promise<Map<string, string>> | null = null;

function docStemFromPagePath(pagePath: string): string {
  let stem = stripDocExt(normalizeFsPath(pagePath));
  if (stem === "index") return "";
  if (stem.endsWith("/index")) stem = stem.slice(0, -"/index".length);
  return stem;
}


function toHeadingId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function extractHeadingTitle(text?: string): string {
  if (!text) return "";
  const firstLine = text.trim().split("\n")[0]?.trim();
  if (!firstLine || !firstLine.startsWith("#")) return "";

  return firstLine.replace(/^#+\s*/, "").trim();
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^---[\s\S]*?---\s*/m, " ")
    .replace(/^\s*import\s+.+$/gm, " ")
    .replace(/^\s*---+\s*$/gm, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[>*_~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippetFromText(text?: string, heading?: string): string {
  if (!text) return "";
  const cleaned = stripMarkdown(text);
  if (!cleaned) return "";

  const withoutHeading =
    heading && cleaned.startsWith(heading)
      ? cleaned.slice(heading.length).trim()
      : cleaned;

  if (withoutHeading.length <= 240) return withoutHeading;
  return `${withoutHeading.slice(0, 240).trimEnd()}...`;
}


function extractDocStemFromAnyPath(path: string): string | null {
  const normalized = normalizeFsPath(path).replace(/^\.\//, "");
  const docsIdx = normalized.indexOf("content/docs/");
  if (docsIdx < 0) return null;

  let stem = stripDocExt(normalized.slice(docsIdx + "content/docs/".length));
  if (stem === "index") return "";
  if (stem.endsWith("/index")) stem = stem.slice(0, -"/index".length);
  return stem;
}

async function resolveDocFilePath(pagePath: string): Promise<string | null> {
  const directPath = resolve(process.cwd(), "content/docs", pagePath);
  const candidates = /\.(md|mdx)$/i.test(directPath)
    ? [directPath]
    : [`${directPath}.mdx`, `${directPath}.md`];

  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return normalizeFsPath(candidate);
    } catch {
      // continue
    }
  }

  return null;
}

function getLocalMdxImportSpecifiers(raw: string): string[] {
  const matches = Array.from(raw.matchAll(LOCAL_MDX_IMPORT_RE));
  return matches.map((match) => match[1]).filter(Boolean);
}

async function resolveLocalMdxImportPath(
  baseDir: string,
  specifier: string,
): Promise<string | null> {
  if (!specifier.startsWith(".")) return null;
  const directPath = resolve(baseDir, specifier);
  const candidates = /\.(md|mdx)$/i.test(directPath)
    ? [directPath]
    : [`${directPath}.mdx`, `${directPath}.md`];

  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return normalizeFsPath(candidate);
    } catch {
      // continue
    }
  }

  return null;
}

async function mapImportsToPage(
  filePath: string,
  pageUrl: string,
  map: Map<string, string>,
  visited: Set<string>,
): Promise<void> {
  const normalized = normalizeFsPath(filePath);
  if (visited.has(normalized)) return;
  visited.add(normalized);

  let raw = "";
  try {
    raw = await readFile(normalized, "utf8");
  } catch {
    return;
  }

  const baseDir = dirname(normalized);
  const imports = getLocalMdxImportSpecifiers(raw);
  for (const specifier of imports) {
    const importedPath = await resolveLocalMdxImportPath(baseDir, specifier);
    if (!importedPath) continue;

    if (importedPath.includes("/content/fragments/")) {
      map.set(importedPath, pageUrl);
    }

    await mapImportsToPage(importedPath, pageUrl, map, visited);
  }
}

async function getFragmentToPageUrlMap(): Promise<Map<string, string>> {
  if (fragmentToPageUrlMapPromise) return fragmentToPageUrlMapPromise;

  fragmentToPageUrlMapPromise = (async () => {
    const map = new Map<string, string>();

    await Promise.all(
      pageInfos.map(async (page) => {
        const pageFilePath = await resolveDocFilePath(page.path);
        if (!pageFilePath) return;
        await mapImportsToPage(pageFilePath, page.url, map, new Set<string>());
      }),
    );

    return map;
  })();

  return fragmentToPageUrlMapPromise;
}

function selectUrlFromFragmentFallback(
  fragmentPath: string,
  basename: string,
): string | null {
  const candidates = docsBasenameToPages.get(basename) ?? [];
  if (candidates.length === 1) return candidates[0].url;
  if (candidates.length === 0) return null;

  const fragmentRoot = fragmentPath
    .split("/content/fragments/")[1]
    ?.split("/")[0];
  if (!fragmentRoot) return null;

  const rooted = candidates.filter((page) =>
    page.stem.startsWith(`${fragmentRoot}/`),
  );
  if (rooted.length === 1) return rooted[0].url;

  return null;
}

function deriveUrlFromPath(
  path: string | undefined,
  fragmentToPageUrl: Map<string, string>,
): string | null {
  if (!path) return null;

  const normalizedInput = normalizeFsPath(path).replace(/^\.\//, "");
  const absoluteInput = normalizeFsPath(
    normalizedInput.startsWith("/")
      ? normalizedInput
      : resolve(process.cwd(), normalizedInput),
  );

  const docStem =
    extractDocStemFromAnyPath(absoluteInput) ??
    extractDocStemFromAnyPath(normalizedInput);
  if (docStem !== null) return docsStemToUrl.get(docStem) ?? `/${docStem}`;

  const fragmentPath = absoluteInput.includes("/content/fragments/")
    ? absoluteInput
    : null;
  if (fragmentPath) {
    const mapped = fragmentToPageUrl.get(fragmentPath);
    if (mapped) return mapped;

    const basename = stripDocExt(fragmentPath).split("/").pop() ?? "";
    if (basename) {
      return selectUrlFromFragmentFallback(fragmentPath, basename);
    }
  }

  return null;
}

function normalizeDirectUrlCandidate(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("#")) return null;
  if (trimmed.includes("content/")) return null;
  if (/\.(md|mdx)(?:$|[?#])/i.test(trimmed)) return null;

  return `/${trimmed.replace(/^\/+/, "")}`;
}

interface MixedbreadChunk {
  file_id: string;
  chunk_index: number;
  type?: string;
  text?: string;
  filename?: string;
  generated_metadata?: unknown;
  metadata?: unknown;
}

function toResults(
  chunks: MixedbreadChunk[],
  fragmentToPageUrl: Map<string, string>,
): SortedResult[] {
  const results: SortedResult[] = [];
  const seen = new Set<string>();
  const seenPages = new Set<string>();

  for (const item of chunks) {
    const generated = asRecord(item.generated_metadata);
    const metadata = asRecord(item.metadata);
    const generatedFrontmatter = asRecord(generated.frontmatter);
    const metadataFrontmatter = asRecord(metadata.frontmatter);

    const path = firstString(
      metadata.file_path,
      generated.path,
      metadata.path,
      item.filename,
    );
    const url =
      deriveUrlFromPath(path, fragmentToPageUrl) ??
      normalizeDirectUrlCandidate(firstString(generated.url, metadata.url));
    if (!url) continue;

    const title =
      pageTitleByUrl.get(url) ??
      firstString(
        generated.title,
        metadata.title,
        generatedFrontmatter.title,
        metadataFrontmatter.title,
      ) ??
      humanizeFilename(path);

    if (!seenPages.has(url)) {
      seenPages.add(url);
      results.push({
        id: `page:${url}`,
        type: "page",
        content: title,
        url,
      });
    }

    if (item.type === "text" && item.text) {
      const heading = extractHeadingTitle(item.text);
      if (heading) {
        const headingId = `${item.file_id}-${item.chunk_index}-heading`;
        if (!seen.has(headingId)) {
          seen.add(headingId);
          results.push({
            id: headingId,
            type: "heading",
            content: heading,
            url: `${url}#${toHeadingId(heading)}`,
          });
        }
      }

      const snippet = snippetFromText(item.text, heading);
      if (snippet) {
        const textId = `${item.file_id}-${item.chunk_index}-text`;
        if (!seen.has(textId)) {
          seen.add(textId);
          results.push({
            id: textId,
            type: "text",
            content: snippet,
            url,
          });
        }
      }
    }
  }

  return results;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim();
  if (!query) return Response.json([]);

  const storeIdentifier = process.env.MIXEDBREAD_STORE_IDENTIFIER;
  if (!storeIdentifier) {
    return new Response(
      "Missing required environment variable: MIXEDBREAD_STORE_IDENTIFIER",
      { status: 500 },
    );
  }

  try {
    const [client, fragmentToPageUrl] = await Promise.all([
      Promise.resolve(getMixedbreadClient()),
      getFragmentToPageUrlMap(),
    ]);

    const tag = url.searchParams
      .get("tag")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean)[0];
    const response = await client.stores.search({
      query,
      store_identifiers: [storeIdentifier],
      top_k: 20,
      search_options: { return_metadata: true },
      ...(tag
        ? {
            filters: {
              key: "generated_metadata.tag",
              operator: "eq",
              value: tag,
            },
          }
        : {}),
    });

    return Response.json(
      toResults(response.data as MixedbreadChunk[], fragmentToPageUrl),
    );
  } catch (error) {
    console.error("Mixedbread search failed:", error);
    return new Response("Failed to search Mixedbread store", { status: 502 });
  }
}
