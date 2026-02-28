// source.config.ts
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineDocs, defineConfig } from "fumadocs-mdx/config";

// lib/mdx/remark-citations.ts
function hasChildren(node) {
  return Array.isArray(node.children);
}
function getNodeText(node) {
  if (node.type === "text" && typeof node.value === "string") {
    return node.value;
  }
  if (!hasChildren(node)) {
    return "";
  }
  return node.children.map(getNodeText).join("");
}
function isReferencesHeading(node) {
  if (node.type !== "heading" || node.depth !== 2 || !hasChildren(node)) {
    return false;
  }
  return getNodeText(node).trim().toLowerCase() === "references";
}
function parseReferenceLine(line) {
  const match = line.trim().match(/^(?:[-*+]\s*)?(?:\d+\.\s*)?\[(\d+)\]\s+(.+?)\s*$/);
  if (!match) {
    return null;
  }
  const n = Number.parseInt(match[1], 10);
  if (!Number.isFinite(n)) {
    return null;
  }
  return {
    n,
    source: match[2].trim()
  };
}
function parseReferenceItems(listNode) {
  if (listNode.type !== "list" || !hasChildren(listNode)) {
    return [];
  }
  const items = [];
  for (const itemNode of listNode.children) {
    if (!hasChildren(itemNode)) {
      continue;
    }
    const text = itemNode.children.map(getNodeText).join(" ").replace(/\s+/g, " ").trim();
    const parsed = parseReferenceLine(text);
    if (!parsed) {
      continue;
    }
    items.push(parsed);
  }
  return items;
}
function replaceReferencesSections(tree) {
  const nextChildren = [];
  let i = 0;
  while (i < tree.children.length) {
    const current = tree.children[i];
    const next = tree.children[i + 1];
    if (isReferencesHeading(current) && next && next.type === "list") {
      const items = parseReferenceItems(next);
      const node = {
        type: "mdxJsxFlowElement",
        name: "References",
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "items",
            value: {
              type: "mdxJsxAttributeValueExpression",
              value: JSON.stringify(items)
            }
          }
        ],
        children: []
      };
      nextChildren.push(node);
      i += 2;
      continue;
    }
    nextChildren.push(current);
    i += 1;
  }
  tree.children = nextChildren;
}
var SKIP_REWRITE_IN_PARENT = /* @__PURE__ */ new Set([
  "link",
  "linkReference",
  "definition",
  "heading",
  "inlineCode",
  "code"
]);
var SKIP_DESCEND = /* @__PURE__ */ new Set(["inlineCode", "code", "mdxjsEsm", "heading"]);
function splitTextWithCitations(value) {
  const nodes = [];
  let cursor = 0;
  for (const match of value.matchAll(/\[(\d+)\]/g)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (start > cursor) {
      nodes.push({
        type: "text",
        value: value.slice(cursor, start)
      });
    }
    nodes.push({
      type: "mdxJsxTextElement",
      name: "Cite",
      attributes: [
        {
          type: "mdxJsxAttribute",
          name: "n",
          value: match[1]
        }
      ],
      children: []
    });
    cursor = end;
  }
  if (cursor < value.length) {
    nodes.push({
      type: "text",
      value: value.slice(cursor)
    });
  }
  return nodes.length > 0 ? nodes : [{ type: "text", value }];
}
function rewriteInlineCitations(node) {
  if (!hasChildren(node)) {
    return;
  }
  const nextChildren = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string" && !SKIP_REWRITE_IN_PARENT.has(node.type)) {
      nextChildren.push(...splitTextWithCitations(child.value));
    } else {
      nextChildren.push(child);
      if (!SKIP_DESCEND.has(child.type)) {
        rewriteInlineCitations(child);
      }
    }
  }
  node.children = nextChildren;
}
function remarkCitations() {
  return (tree) => {
    if (tree.type !== "root" || !hasChildren(tree)) {
      return;
    }
    replaceReferencesSections(tree);
    rewriteInlineCitations(tree);
  };
}

// lib/mdx/remark-fragment-dropdown-sections.ts
function hasChildren2(node) {
  return Array.isArray(node.children);
}
function isHeadingAtDepth(node, depth) {
  return node.type === "heading" && node.depth === depth;
}
function getFilePath(file) {
  if (!file) return "";
  const rawPath = file.path ?? file.history?.[0] ?? "";
  return rawPath.replace(/\\/g, "/");
}
function isFragmentFile(file) {
  const path = getFilePath(file);
  return path.includes("/content/fragments/");
}
function getSectionHeadingDepth(children) {
  const headingCounts = /* @__PURE__ */ new Map();
  for (const child of children) {
    if (child.type !== "heading" || typeof child.depth !== "number") {
      continue;
    }
    headingCounts.set(child.depth, (headingCounts.get(child.depth) ?? 0) + 1);
  }
  const preferredDepths = [3, 2, 1];
  for (const depth of preferredDepths) {
    if ((headingCounts.get(depth) ?? 0) >= 3) {
      return depth;
    }
  }
  for (const depth of preferredDepths) {
    if ((headingCounts.get(depth) ?? 0) >= 2) {
      return depth;
    }
  }
  for (let depth = 4; depth <= 6; depth += 1) {
    if ((headingCounts.get(depth) ?? 0) >= 3) {
      return depth;
    }
  }
  for (let depth = 4; depth <= 6; depth += 1) {
    if ((headingCounts.get(depth) ?? 0) >= 2) {
      return depth;
    }
  }
  return null;
}
function wrapSections(tree, headingDepth) {
  const nextChildren = [];
  let index = 0;
  while (index < tree.children.length) {
    const current = tree.children[index];
    if (!isHeadingAtDepth(current, headingDepth)) {
      nextChildren.push(current);
      index += 1;
      continue;
    }
    const sectionChildren = [current];
    index += 1;
    while (index < tree.children.length) {
      const node = tree.children[index];
      if (isHeadingAtDepth(node, headingDepth)) {
        break;
      }
      sectionChildren.push(node);
      index += 1;
    }
    nextChildren.push({
      type: "mdxJsxFlowElement",
      name: "FragmentDropdownSection",
      attributes: [],
      children: sectionChildren
    });
  }
  tree.children = nextChildren;
}
function remarkFragmentDropdownSections() {
  return (tree, file) => {
    if (tree.type !== "root" || !hasChildren2(tree) || !isFragmentFile(file)) {
      return;
    }
    const root = tree;
    const headingDepth = getSectionHeadingDepth(root.children);
    if (headingDepth === null) {
      return;
    }
    wrapSections(root, headingDepth);
  };
}

// source.config.ts
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
var docs = defineDocs({
  dir: "content/docs",
  docs: {
    postprocess: {
      includeProcessedMarkdown: true
    }
  }
});
var source_config_default = defineConfig({
  mdxOptions: {
    remarkPlugins: [
      remarkMath,
      remarkMdxMermaid,
      remarkCitations,
      remarkFragmentDropdownSections
    ],
    rehypePlugins: (v) => [rehypeKatex, ...v]
  }
});
export {
  source_config_default as default,
  docs
};
