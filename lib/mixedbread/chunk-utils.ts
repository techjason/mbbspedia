export interface MixedbreadChunkLike {
  filename?: string;
  metadata?: unknown;
  generated_metadata?: unknown;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }

  return undefined;
}

export function normalizeFsPath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function stripDocExt(value: string): string {
  return value.replace(/\.(md|mdx)$/i, "");
}

export function humanizeFilename(filename?: string): string {
  if (!filename) return "Untitled";
  const base = filename
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.(md|mdx)$/i, "");
  if (!base) return "Untitled";

  return humanizeSlug(base);
}

export function humanizeSlug(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getChunkPath(chunk: MixedbreadChunkLike): string | undefined {
  const generated = asRecord(chunk.generated_metadata);
  const metadata = asRecord(chunk.metadata);

  return firstString(
    metadata.file_path,
    generated.path,
    metadata.path,
    chunk.filename,
  );
}

export function deriveSourceArticleName(params: {
  path?: string;
  filename?: string;
}): string {
  const normalizedPath = params.path
    ? normalizeFsPath(params.path).replace(/^\.\//, "")
    : undefined;

  if (normalizedPath) {
    const fragmentMarker = "/content/fragments/";
    const fragmentIndex = normalizedPath.indexOf(fragmentMarker);
    if (fragmentIndex >= 0) {
      const relative = normalizedPath.slice(fragmentIndex + fragmentMarker.length);
      const parts = relative.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return humanizeSlug(parts[parts.length - 2]);
      }
    }

    const docsMarker = "/content/docs/";
    const docsIndex = normalizedPath.indexOf(docsMarker);
    if (docsIndex >= 0) {
      const relative = stripDocExt(
        normalizedPath.slice(docsIndex + docsMarker.length),
      );
      const parts = relative.split("/").filter(Boolean);
      if (parts.length > 0) {
        const leaf = parts[parts.length - 1] === "index" ? parts[parts.length - 2] : parts[parts.length - 1];
        if (leaf) return humanizeSlug(leaf);
      }
    }
  }

  return humanizeFilename(params.filename);
}

export function clipText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars).trimEnd()}...`;
}
