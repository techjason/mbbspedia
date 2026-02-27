import { getLLMText } from "@/lib/get-llm.text";
import { source } from "@/lib/source";

// Keep this dynamic so Vercel doesn't try to pre-render/store a huge ISR fallback body.
export const dynamic = "force-dynamic";

export async function GET() {
  const scan = source.getPages().map(getLLMText);
  const scanned = await Promise.all(scan);

  return new Response(scanned.join("\n\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
