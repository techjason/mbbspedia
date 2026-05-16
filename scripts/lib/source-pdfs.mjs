import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const SOURCE_PDFS_ROOT = "source-pdfs";

export function slugifySourceSegment(value, fallback = "general-surgery") {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || fallback;
}

export function getSpecialtySourcePdfDir(specialty) {
  return path.join(SOURCE_PDFS_ROOT, slugifySourceSegment(specialty));
}

export async function listSourcePdfs(
  sourceDir,
  { missingLabel = "Source PDFs" } = {},
) {
  const absoluteSourceDir = path.resolve(process.cwd(), sourceDir);

  try {
    const entries = await readdir(absoluteSourceDir, { withFileTypes: true });
    return entries
      .filter(
        (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"),
      )
      .map((entry) => ({
        fileName: entry.name,
        absolutePath: path.join(absoluteSourceDir, entry.name),
      }))
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      console.warn(`[${missingLabel}] Directory not found: ${absoluteSourceDir}`);
      return [];
    }

    throw error;
  }
}

export async function listSourceNoteFiles(
  sourceDir,
  { missingLabel = "SourceNotes" } = {},
) {
  const absoluteSourceDir = path.resolve(process.cwd(), sourceDir);

  try {
    const entries = await readdir(absoluteSourceDir, { withFileTypes: true });
    return entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const ext = path.extname(entry.name).toLowerCase();
        return (
          ext === ".md" || ext === ".mdx" || ext === ".txt" || ext === ".pdf"
        );
      })
      .map((entry) => {
        const absolutePath = path.join(absoluteSourceDir, entry.name);
        const relativePath = path.relative(process.cwd(), absolutePath);
        const label = path.basename(entry.name, path.extname(entry.name));
        return {
          id: slugifySourceSegment(relativePath, "note"),
          path: absolutePath,
          label: label || path.basename(entry.name),
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      console.warn(`[${missingLabel}] Directory not found: ${absoluteSourceDir}`);
      return [];
    }

    throw error;
  }
}
