/**
 * Canonical origin for metadata, sitemap, and robots.
 * In production, set NEXT_PUBLIC_SITE_URL to your primary domain (e.g. https://mbbspedia.com).
 * On Vercel, VERCEL_URL is used as a fallback when unset.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  }
  return "http://localhost:3000";
}
