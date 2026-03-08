#!/usr/bin/env node

import { gateway, generateText, Output } from "ai";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";
import { createInterface } from "node:readline/promises";
import { z } from "zod";

const DOCS_ROOT = path.join(process.cwd(), "content", "docs");
const PUBLIC_ROOT = path.join(process.cwd(), "public", "memory-palaces");
const DEFAULT_IMAGE_MODEL = "google/gemini-3-pro-image";
const DEFAULT_TEXT_MODEL = "google/gemini-3-flash";
const FRONTMATTER_RE = /^---[\s\S]*?\n---\n?/;
const IMPORT_EXPORT_LINE_RE = /^\s*(import|export)\s.+$/gm;
const RESULT_PREVIEW_LIMIT = 24;
const KNOWN_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

const BLUEPRINT_SCHEMA = z.object({
  sceneTitle: z.string().min(1),
  sceneSetting: z.string().min(1),
  anchors: z.array(
    z.object({
      number: z.number().int().min(1).max(99),
      coveredTargetIds: z.array(z.number().int().min(1)).min(1),
      scene: z.string().min(1),
      visualCue: z.string().min(1),
      medicalMeaning: z.string().min(1),
    }),
  ),
});

function printUsage() {
  console.log(`Usage:
  npm run generate:memory-palace -- [options]

Options:
  --article "<doc-stem>"       Use a specific article without interactive selection.
  --force                      Overwrite existing memory palace assets without prompting.
  --image-model "<provider/model>"
                               Image model. Default: ${DEFAULT_IMAGE_MODEL}
  --text-model "<provider/model>"
                               Text model. Default: ${DEFAULT_TEXT_MODEL}
  --help                       Show this help.

Examples:
  npm run generate:memory-palace
  npm run generate:memory-palace -- --article "general-surgery/lower-gi/acute-appendicitis"
  npm run generate:memory-palace -- --article "family-medicine/chest-pain" --force
`);
}

function parseArgs(argv) {
  const options = {
    article: undefined,
    force: false,
    imageModel: DEFAULT_IMAGE_MODEL,
    textModel: DEFAULT_TEXT_MODEL,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--article") {
      options.article = String(argv[i + 1] ?? "").trim();
      i += 1;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--image-model") {
      options.imageModel = String(argv[i + 1] ?? "").trim();
      i += 1;
      continue;
    }

    if (arg === "--text-model") {
      options.textModel = String(argv[i + 1] ?? "").trim();
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function loadDotEnvFiles() {
  const envFiles = [".env.local", ".env"];

  for (const envFile of envFiles) {
    const absolutePath = path.join(process.cwd(), envFile);

    let content;
    try {
      content = await readFile(absolutePath, "utf8");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }

      throw error;
    }

    const parsed = parseEnv(content);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function stripDocExt(value) {
  return value.replace(/\.(md|mdx)$/i, "");
}

function normalizeDocStem(value) {
  return stripDocExt(String(value ?? ""))
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function humanizeFileName(fileName) {
  return fileName
    .replace(/\.(md|mdx)$/i, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function extractFrontmatter(raw) {
  const match = raw.match(FRONTMATTER_RE);
  return match ? match[0] : "";
}

function parseFrontmatterValue(frontmatter, key) {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const match = frontmatter.match(pattern);
  if (!match) return "";

  const value = match[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function cleanMdxText(raw) {
  return raw
    .replace(FRONTMATTER_RE, "")
    .replace(IMPORT_EXPORT_LINE_RE, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[(\d+)\]/g, " ")
    .replace(/[`*_>#-]+/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanInlineMdxText(raw) {
  return String(raw ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[(\d+)\]/g, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRecallTargets(summaryRaw) {
  const lines = String(summaryRaw ?? "").split(/\r?\n/);
  const recallTargets = [];
  let section = "";
  let subsection = "";

  const pushTarget = (text) => {
    const cleanedText = cleanInlineMdxText(text).replace(/:\s*$/, "").trim();
    if (!cleanedText) {
      return;
    }

    recallTargets.push({
      id: recallTargets.length + 1,
      section,
      subsection,
      text: cleanedText,
    });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const calloutMatch = trimmed.match(
      /^<Callout\b[^>]*title=(["'])(.*?)\1[^>]*>/i,
    );
    if (calloutMatch) {
      section = cleanInlineMdxText(calloutMatch[2]);
      subsection = "";
      continue;
    }

    if (trimmed.startsWith("</Callout")) {
      subsection = "";
      continue;
    }

    const numberedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numberedMatch) {
      pushTarget(numberedMatch[1]);
      continue;
    }

    const bulletMatch = trimmed.match(/^-\s+(.*)$/);
    if (bulletMatch) {
      pushTarget(bulletMatch[1]);
      continue;
    }

    const boldLabelBodyMatch = trimmed.match(/^\*\*(.+?)\*\*:\s*(.+)$/);
    if (boldLabelBodyMatch) {
      const label = cleanInlineMdxText(boldLabelBodyMatch[1]);
      const body = cleanInlineMdxText(boldLabelBodyMatch[2]);

      if (!body) {
        subsection = label;
        continue;
      }

      pushTarget(`${label}: ${body}`);
      continue;
    }

    const wholeBoldMatch = trimmed.match(/^\*\*(.+?)\*\*$/);
    if (wholeBoldMatch) {
      const cleaned = cleanInlineMdxText(wholeBoldMatch[1]);
      if (!cleaned) {
        continue;
      }

      if (cleaned.endsWith(":")) {
        subsection = cleaned.replace(/:\s*$/, "").trim();
        continue;
      }

      pushTarget(cleaned);
      continue;
    }

    pushTarget(trimmed);
  }

  return recallTargets;
}

function formatRecallTargetForPrompt(target) {
  const scope = [target.section, target.subsection].filter(Boolean).join(" > ");
  return `[${target.id}] ${scope ? `${scope} :: ` : ""}${target.text}`;
}

function formatRecallTargetForLegend(target) {
  return target.text;
}

function formatRecallTargetsForPrompt(recallTargets) {
  return recallTargets.map(formatRecallTargetForPrompt).join("\n");
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }

    throw error;
  }
}

async function walkFiles(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const dirent of dirents) {
    const absolutePath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      files.push(...(await walkFiles(absolutePath)));
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

async function scanArticles() {
  const files = await walkFiles(DOCS_ROOT);
  const articles = [];

  for (const absolutePath of files) {
    if (!absolutePath.endsWith(".mdx")) continue;
    if (path.basename(absolutePath).toLowerCase() === "index.mdx") continue;

    const relativePath = path
      .relative(DOCS_ROOT, absolutePath)
      .replace(/\\/g, "/");
    const raw = await readFile(absolutePath, "utf8");
    const frontmatter = extractFrontmatter(raw);
    const title =
      parseFrontmatterValue(frontmatter, "title") ||
      humanizeFileName(path.basename(relativePath));
    const description = parseFrontmatterValue(frontmatter, "description");
    const docStem = normalizeDocStem(relativePath);

    articles.push({
      absolutePath,
      relativePath,
      docStem,
      title,
      description,
      searchText: normalizeSearchText(`${title} ${docStem}`),
    });
  }

  articles.sort(
    (a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
      a.docStem.localeCompare(b.docStem, undefined, { sensitivity: "base" }),
  );

  return articles;
}

function scoreArticle(article, filter) {
  if (!filter) return 1;
  const searchText = article.searchText;
  if (searchText === filter) return 6;
  if (searchText.startsWith(filter)) return 5;
  if (searchText.includes(filter)) return 4;
  const docStem = normalizeSearchText(article.docStem);
  if (docStem.startsWith(filter)) return 3;
  if (docStem.includes(filter)) return 2;
  return 0;
}

async function promptForArticleSelection(articles) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Interactive article selection requires a TTY. Re-run with --article <doc-stem>.",
    );
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const rawFilter = await rl.question(
        `Filter articles (${articles.length} total, blank for all): `,
      );
      const filter = normalizeSearchText(rawFilter);
      const ranked = articles
        .map((article) => ({
          article,
          score: scoreArticle(article, filter),
        }))
        .filter((entry) => entry.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.article.title.localeCompare(b.article.title, undefined, {
              sensitivity: "base",
            }),
        );

      if (ranked.length === 0) {
        console.log("No matching articles. Try another filter.");
        continue;
      }

      const visible = ranked
        .slice(0, RESULT_PREVIEW_LIMIT)
        .map((entry) => entry.article);
      console.log("");
      visible.forEach((article, index) => {
        console.log(`${index + 1}. ${article.title} (${article.docStem})`);
      });
      if (ranked.length > visible.length) {
        console.log(
          `Showing the first ${visible.length} of ${ranked.length} matches. Narrow the filter to reduce the list.`,
        );
      }
      console.log("");

      const answer = await rl.question(
        `Select article [1-${visible.length}] or press Enter to refine: `,
      );
      const trimmed = answer.trim();
      if (!trimmed) {
        console.log("");
        continue;
      }

      const selectedIndex = Number.parseInt(trimmed, 10);
      if (
        !Number.isFinite(selectedIndex) ||
        selectedIndex < 1 ||
        selectedIndex > visible.length
      ) {
        console.log("Invalid selection. Enter one of the listed numbers.");
        console.log("");
        continue;
      }

      return visible[selectedIndex - 1];
    }
  } finally {
    rl.close();
  }
}

function resolveArticleByStem(articles, docStem) {
  const normalized = normalizeDocStem(docStem);
  const exactMatch = articles.find((article) => article.docStem === normalized);
  if (exactMatch) return exactMatch;

  const basenameMatches = articles.filter(
    (article) => path.posix.basename(article.docStem) === normalized,
  );

  if (basenameMatches.length === 1) {
    return basenameMatches[0];
  }

  if (basenameMatches.length > 1) {
    throw new Error(
      `Article stem "${docStem}" is ambiguous. Use the full doc stem, e.g. ${basenameMatches
        .map((article) => `"${article.docStem}"`)
        .join(", ")}.`,
    );
  }

  throw new Error(`Could not find article: ${docStem}`);
}

function resolveMemoryPalaceImportSpecifier(summaryImportSpecifier) {
  if (summaryImportSpecifier.endsWith("/summary.mdx")) {
    return summaryImportSpecifier.replace(
      /\/summary\.mdx$/,
      "/memory-palace.mdx",
    );
  }

  return path.posix.join(
    path.posix.dirname(summaryImportSpecifier),
    "memory-palace.mdx",
  );
}

async function resolveSelectedArticle(article) {
  const docSource = await readFile(article.absolutePath, "utf8");
  const frontmatter = extractFrontmatter(docSource);
  const title =
    parseFrontmatterValue(frontmatter, "title") ||
    article.title ||
    humanizeFileName(path.basename(article.absolutePath));
  const description =
    parseFrontmatterValue(frontmatter, "description") ||
    article.description ||
    "";
  const summaryMatch = docSource.match(
    /^import\s+SummarySection\s+from\s+["']([^"']+)["'];?\s*$/m,
  );

  if (!summaryMatch) {
    throw new Error(
      `Selected article does not import SummarySection: ${article.docStem}`,
    );
  }

  const summaryImportSpecifier = summaryMatch[1];
  const summaryAbsPath = path.resolve(
    path.dirname(article.absolutePath),
    summaryImportSpecifier,
  );
  const summaryExists = await fileExists(summaryAbsPath);
  if (!summaryExists) {
    throw new Error(
      `Could not resolve summary fragment for ${article.docStem}: ${summaryAbsPath}`,
    );
  }

  const fragmentDir = path.dirname(summaryAbsPath);
  const memoryPalaceAbsPath = path.join(fragmentDir, "memory-palace.mdx");
  const memoryPalaceImportSpecifier = resolveMemoryPalaceImportSpecifier(
    summaryImportSpecifier,
  );
  const summaryRaw = await readFile(summaryAbsPath, "utf8");

  return {
    ...article,
    title,
    description,
    docSource,
    summaryAbsPath,
    summaryImportSpecifier,
    summaryRaw,
    summaryText: cleanMdxText(summaryRaw),
    fragmentDir,
    memoryPalaceAbsPath,
    memoryPalaceImportSpecifier,
  };
}

function normalizeBlueprint(blueprint, recallTargets) {
  const anchors = [...blueprint.anchors].sort((a, b) => a.number - b.number);
  const validTargetIds = new Set(recallTargets.map((target) => target.id));
  const targetCoverageCounts = new Map();

  anchors.forEach((anchor, index) => {
    if (anchor.number !== index + 1) {
      throw new Error(
        `Blueprint numbering must be sequential starting at 1. Received ${anchor.number} at position ${index + 1}.`,
      );
    }
  });

  const normalizedAnchors = anchors.map((anchor) => {
    const coveredTargetIds = [...new Set(anchor.coveredTargetIds)].sort(
      (a, b) => a - b,
    );

    if (coveredTargetIds.length === 0) {
      throw new Error(
        `Anchor ${anchor.number} must cover at least one target.`,
      );
    }

    for (const targetId of coveredTargetIds) {
      if (!validTargetIds.has(targetId)) {
        throw new Error(
          `Anchor ${anchor.number} references unknown target ID ${targetId}.`,
        );
      }

      targetCoverageCounts.set(
        targetId,
        (targetCoverageCounts.get(targetId) ?? 0) + 1,
      );
    }

    return {
      number: anchor.number,
      coveredTargetIds,
      scene: anchor.scene.trim(),
      visualCue: anchor.visualCue.trim(),
      medicalMeaning: anchor.medicalMeaning.trim(),
    };
  });

  const missingTargets = recallTargets.filter(
    (target) => !targetCoverageCounts.has(target.id),
  );
  if (missingTargets.length > 0) {
    throw new Error(
      `Blueprint is missing recall targets: ${missingTargets
        .slice(0, 8)
        .map((target) => target.id)
        .join(", ")}${missingTargets.length > 8 ? ", ..." : ""}.`,
    );
  }

  const duplicateCoverage = [...targetCoverageCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([targetId]) => targetId);
  if (duplicateCoverage.length > 0) {
    throw new Error(
      `Blueprint covers some recall targets more than once: ${duplicateCoverage
        .slice(0, 8)
        .join(", ")}${duplicateCoverage.length > 8 ? ", ..." : ""}.`,
    );
  }

  return {
    sceneTitle: blueprint.sceneTitle.trim(),
    sceneSetting: blueprint.sceneSetting.trim(),
    anchors: normalizedAnchors,
  };
}

async function generateBlueprint({
  title,
  description,
  recallTargets,
  textModel,
}) {
  const { output } = await generateText({
    model: gateway(textModel),
    output: Output.object({ schema: BLUEPRINT_SCHEMA }),
    system:
      "You design high-retention medical memory palaces. Produce a concrete, visually coherent scene plan that can be drawn as one sketch. Coverage must be exact and complete.",
    prompt: `Create a numbered memory-palace blueprint for the following article.

Topic title: ${title}
Topic description: ${description || "N/A"}

Mandatory recall targets (${recallTargets.length} total):
${formatRecallTargetsForPrompt(recallTargets)}

Requirements:
- Every target ID above is mandatory.
- Every target ID must appear exactly once in anchors[].coveredTargetIds.
- Use as many numbered loci as needed to cover all recall targets without dropping details.
- You may group closely related target IDs into one locus only if the scene remains drawable and medicalMeaning explicitly covers every grouped target.
- If grouping would hide or blur an exam-significant fact, split it into more loci.
- Do not collapse enumerated lists into vague summaries. If the source names six complications separately, all six must remain individually covered in coveredTargetIds and in medicalMeaning.
- Number the loci sequentially starting from 1.
- Each locus must be easy to sketch in a hand-drawn, sketchy educational style.
- Design the palace as one unified environment with a single dominant setting.
- Do not create loci that feel like separate poster panels or disconnected mini-illustrations.
- Keep the whole scene visually coherent as one memory palace.
- If a concept can only be communicated by writing a word, use a pictorial metaphor instead.
- Prefer a complete palace over an over-compressed palace.
- medicalMeaning must explicitly mention the facts represented by all coveredTargetIds for that locus.

Output rules:
- Include coveredTargetIds on every anchor.
- Keep scene and visualCue concrete and drawable.
- Keep medicalMeaning concise but complete.
`,
  });

  return normalizeBlueprint(output, recallTargets);
}

function buildImagePrompt({ title, description, blueprint, recallTargets }) {
  const recallTargetMap = new Map(
    recallTargets.map((target) => [target.id, target]),
  );
  const anchorLines = blueprint.anchors
    .map(
      (anchor) =>
        `${anchor.number}. Scene: ${anchor.scene}. Visual cue: ${
          anchor.visualCue
        }. Must visually encode: ${anchor.coveredTargetIds
          .map((targetId) =>
            formatRecallTargetForPrompt(recallTargetMap.get(targetId)),
          )
          .join(" | ")}. Meaning: ${anchor.medicalMeaning}.`,
    )
    .join("\n");

  return `Create a sketchy-style medical memory palace illustration for the topic "${title}".

Topic description: ${description || "N/A"}
Overall scene title: ${blueprint.sceneTitle}
Overall scene setting: ${blueprint.sceneSetting}

Numbered loci to include exactly once each:
${anchorLines}

Visual requirements:
- Landscape composition with a roughly 4:3 feel.
- Arabic numerals must be clearly visible next to each locus.
- Use a light paper or notebook-page background.
- Keep it as one coherent memory palace, not a collage of unrelated panels.
- No legend table, no paragraph text, no citations, no reference list.
- Avoid dense prose labels; if text is used, keep it minimal and secondary to the drawing.
- This must look like one sketchbook spread of a single imagined place, not a labeled medical infographic.
- Use only the numbered markers for indexing. Do NOT render labels, captions, banners, titles, acronyms, scoreboards, arrows with words, section names, or explanatory text anywhere in the image.
- Express concepts through visual metaphor, anatomy, props, pose, motion, costume, scale, and exaggeration, not through text.
- Avoid boxed callout panels, comic-book frames, cutaway mini-scenes, or infographic layout blocks.
- Avoid a classroom poster look. Prefer a hand-drawn panoramic sketch with one shared setting.
- Keep the composition uncluttered but immersive, with continuous ground, walls, roads, pipes, or architectural structure tying the loci together.
- Arabic numerals should be present and readable near each locus, but they should be small secondary markers, not the main visual feature.
- No legend table, no paragraph text, no citations, no reference list inside the image.`;
}

function buildLegendRowsFromBlueprint({ blueprint, recallTargets }) {
  const recallTargetMap = new Map(
    recallTargets.map((target) => [target.id, target]),
  );

  return blueprint.anchors.map((anchor) => ({
    number: anchor.number,
    visualCue: anchor.visualCue.trim(),
    meaning: anchor.coveredTargetIds
      .map((targetId) => recallTargetMap.get(targetId))
      .filter(Boolean)
      .map((target) => `- ${formatRecallTargetForLegend(target)}`)
      .join("\n"),
  }));
}

function extensionFromMediaType(mediaType) {
  const normalized = String(mediaType ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "image/png") return "png";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  return "png";
}

function escapeTableCell(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br />")
    .trim();
}

function buildMemoryPalaceFragment({ title, imagePublicPath, legendRows }) {
  const tableRows = legendRows
    .map(
      (row) =>
        `| ${row.number} | ${escapeTableCell(row.visualCue)} | ${escapeTableCell(
          row.meaning,
        )} |`,
    )
    .join("\n");

  return `![Sketchy memory palace for ${title}](${imagePublicPath})

_Sketchy memory palace for ${title}_

| No. | Visual Cue | Meaning |
| --- | --- | --- |
${tableRows}
`;
}

function ensureMemoryPalaceImport(docSource, importSpecifier) {
  if (
    /^import\s+MemoryPalaceSection\s+from\s+["'][^"']+["'];?\s*$/m.test(
      docSource,
    )
  ) {
    return docSource;
  }

  const summaryImportMatch = docSource.match(
    /^(import\s+SummarySection\s+from\s+["'][^"']+["'];?)\n+/m,
  );
  if (!summaryImportMatch) {
    throw new Error(
      "Could not find SummarySection import to anchor Memory Palace import.",
    );
  }

  const inserted = `${summaryImportMatch[1]}\nimport MemoryPalaceSection from ${JSON.stringify(
    importSpecifier,
  )};\n\n`;
  return docSource.replace(summaryImportMatch[0], inserted);
}

function ensureMemoryPalaceTabItem(docSource) {
  const tabsMatch = docSource.match(/<Tabs items=\{\[([\s\S]*?)\]\}>/);
  if (!tabsMatch) {
    throw new Error(
      "Could not find `<Tabs items={[...]} >` block in article doc.",
    );
  }

  const itemsSource = tabsMatch[1];
  if (
    itemsSource.includes('"Memory Palace"') ||
    itemsSource.includes("'Memory Palace'")
  ) {
    return docSource;
  }

  if (
    !itemsSource.includes('"Summary"') &&
    !itemsSource.includes("'Summary'")
  ) {
    throw new Error('Could not find "Summary" entry in tab items array.');
  }

  const updatedItemsSource = itemsSource.replace(
    /("Summary"|'Summary')/,
    '$1, "Memory Palace"',
  );

  return docSource.replace(
    tabsMatch[0],
    `<Tabs items={[${updatedItemsSource}]}>`,
  );
}

function ensureMemoryPalaceTabBlock(docSource) {
  if (/<Tab value="Memory Palace">/.test(docSource)) {
    return docSource;
  }

  const summaryTabMatch = docSource.match(
    /<Tab value="Summary">[\s\S]*?<\/Tab>/,
  );
  if (!summaryTabMatch) {
    throw new Error(
      'Could not find `<Tab value="Summary">` block in article doc.',
    );
  }

  const memoryPalaceBlock = `<Tab value="Memory Palace">
  <MemoryPalaceSection components={props.components} />

</Tab>`;

  return docSource.replace(
    summaryTabMatch[0],
    `${summaryTabMatch[0]}\n\n${memoryPalaceBlock}`,
  );
}

async function findExistingImageAssets(docStem) {
  const matches = [];

  for (const extension of KNOWN_IMAGE_EXTENSIONS) {
    const absolutePath = path.join(PUBLIC_ROOT, `${docStem}.${extension}`);
    if (await fileExists(absolutePath)) {
      matches.push(absolutePath);
    }
  }

  return matches;
}

async function confirmOverwriteIfNeeded({ selectedArticle, force }) {
  const existingImageAssets = await findExistingImageAssets(
    selectedArticle.docStem,
  );
  const fragmentExists = await fileExists(selectedArticle.memoryPalaceAbsPath);
  const needsOverwrite = fragmentExists || existingImageAssets.length > 0;

  if (!needsOverwrite) {
    return { fragmentExists, existingImageAssets };
  }

  if (force) {
    return { fragmentExists, existingImageAssets };
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `Memory palace assets already exist for ${selectedArticle.docStem}. Re-run with --force to overwrite.`,
    );
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      `Memory palace assets already exist for ${selectedArticle.docStem}. Overwrite? [y/N] `,
    );
    const confirmed = /^y(es)?$/i.test(answer.trim());
    if (!confirmed) {
      throw new Error(
        "Aborted without overwriting existing memory palace assets.",
      );
    }
  } finally {
    rl.close();
  }

  return { fragmentExists, existingImageAssets };
}

async function removeExistingImageAssets(pathsToDelete, keepPath) {
  for (const existingPath of pathsToDelete) {
    if (keepPath && path.resolve(existingPath) === path.resolve(keepPath)) {
      continue;
    }

    await unlink(existingPath);
  }
}

async function main() {
  await loadDotEnvFiles();

  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY is required in .env.local or .env.");
  }

  const articles = await scanArticles();
  if (articles.length === 0) {
    throw new Error("No article docs were found under content/docs.");
  }

  const selectedArticleBase = options.article
    ? resolveArticleByStem(articles, options.article)
    : await promptForArticleSelection(articles);

  const selectedArticle = await resolveSelectedArticle(selectedArticleBase);
  const recallTargets = extractRecallTargets(selectedArticle.summaryRaw);
  if (recallTargets.length === 0) {
    throw new Error(
      `Could not extract recall targets from summary: ${selectedArticle.summaryAbsPath}`,
    );
  }
  const { existingImageAssets } = await confirmOverwriteIfNeeded({
    selectedArticle,
    force: options.force,
  });

  console.log(
    `[memory-palace] Selected article: ${selectedArticle.title} (${selectedArticle.docStem})`,
  );
  console.log(
    `[memory-palace] Extracted ${recallTargets.length} recall targets from summary.`,
  );
  console.log(
    `[memory-palace] Generating blueprint with ${options.textModel}...`,
  );
  const blueprint = await generateBlueprint({
    title: selectedArticle.title,
    description: selectedArticle.description,
    recallTargets,
    textModel: options.textModel,
  });

  console.log(`[memory-palace] Generating image with ${options.imageModel}...`);
  const imageResult = await generateText({
    model: gateway(options.imageModel),
    prompt: buildImagePrompt({
      title: selectedArticle.title,
      description: selectedArticle.description,
      blueprint,
      recallTargets,
    }),
  });

  const imageFiles = (imageResult.files ?? []).filter((file) =>
    file.mediaType?.startsWith("image/"),
  );
  const image = imageFiles[0];
  if (!image) {
    throw new Error("Image model returned no image.");
  }

  const imageExtension = extensionFromMediaType(image.mediaType);
  const imageAbsolutePath = path.join(
    PUBLIC_ROOT,
    `${selectedArticle.docStem}.${imageExtension}`,
  );
  const imagePublicPath =
    `/memory-palaces/${selectedArticle.docStem}.${imageExtension}`.replace(
      /\\/g,
      "/",
    );

  console.log(
    "[memory-palace] Building legend rows from validated coverage...",
  );
  const legendRows = buildLegendRowsFromBlueprint({
    blueprint,
    recallTargets,
  });

  const fragmentSource = buildMemoryPalaceFragment({
    title: selectedArticle.title,
    imagePublicPath,
    legendRows,
  });

  const updatedDocSource = [
    (source) =>
      ensureMemoryPalaceImport(
        source,
        selectedArticle.memoryPalaceImportSpecifier,
      ),
    ensureMemoryPalaceTabItem,
    ensureMemoryPalaceTabBlock,
  ].reduce((source, transform) => transform(source), selectedArticle.docSource);

  await mkdir(path.dirname(imageAbsolutePath), { recursive: true });
  await mkdir(selectedArticle.fragmentDir, { recursive: true });
  await writeFile(imageAbsolutePath, image.uint8Array);
  await removeExistingImageAssets(existingImageAssets, imageAbsolutePath);
  await writeFile(selectedArticle.memoryPalaceAbsPath, fragmentSource, "utf8");
  await writeFile(selectedArticle.absolutePath, updatedDocSource, "utf8");

  console.log(`[memory-palace] Wrote image: ${imageAbsolutePath}`);
  console.log(
    `[memory-palace] Wrote fragment: ${selectedArticle.memoryPalaceAbsPath}`,
  );
  console.log(
    `[memory-palace] Updated article: ${selectedArticle.absolutePath}`,
  );
}

main().catch((error) => {
  console.error("[memory-palace] Failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
