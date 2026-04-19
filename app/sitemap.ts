import type { MetadataRoute } from "next";
import { stat } from "node:fs/promises";
import path from "node:path";
import { source } from "@/lib/source";
import { getSiteUrl } from "@/lib/site-config";

async function getDocMtime(pagePath: string): Promise<Date | undefined> {
  const directPath = path.join(process.cwd(), "content/docs", pagePath);
  const candidates = /\.(md|mdx)$/i.test(directPath)
    ? [directPath]
    : [`${directPath}.mdx`, `${directPath}.md`];

  for (const candidate of candidates) {
    try {
      const s = await stat(candidate);
      return s.mtime;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const pages = source.getPages();

  return Promise.all(
    pages.map(async (page) => {
      const lastModified = await getDocMtime(page.path);
      return {
        url: new URL(page.url, base).toString(),
        lastModified,
        changeFrequency: "weekly" as const,
        priority: page.url === "/" ? 1 : 0.7,
      };
    }),
  );
}
