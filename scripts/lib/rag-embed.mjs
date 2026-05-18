import { embed, embedMany } from "ai";

export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-large";

/** Max strings per embedMany call — keeps total tokens under gateway limits (e.g. 300k/request). */
const DEFAULT_EMBED_BATCH_SIZE = 100;

function addUsageTotals(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  for (const key of Object.keys(b)) {
    const va = a[key];
    const vb = b[key];
    if (typeof va === "number" && typeof vb === "number") {
      out[key] = va + vb;
    }
  }
  return out;
}

export async function embedSingleValue({ model = DEFAULT_EMBEDDING_MODEL, value }) {
  const { embedding, usage } = await embed({
    model,
    value,
    maxRetries: 2,
  });

  return { embedding, usage };
}

export async function embedValues({
  model = DEFAULT_EMBEDDING_MODEL,
  values,
  maxParallelCalls = 4,
  batchSize = DEFAULT_EMBED_BATCH_SIZE,
}) {
  if (!Array.isArray(values) || values.length === 0) {
    return { embeddings: [], usage: undefined };
  }

  const embeddings = [];
  let usage;

  for (let i = 0; i < values.length; i += batchSize) {
    const batch = values.slice(i, i + batchSize);
    const result = await embedMany({
      model,
      values: batch,
      maxParallelCalls,
      maxRetries: 2,
    });
    embeddings.push(...result.embeddings);
    usage = addUsageTotals(usage, result.usage);
  }

  return { embeddings, usage };
}
