import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineDocs, defineConfig } from "fumadocs-mdx/config";
import { remarkCitations } from "./lib/mdx/remark-citations";
import { remarkFragmentDropdownSections } from "./lib/mdx/remark-fragment-dropdown-sections";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      remarkMath,
      remarkMdxMermaid,
      remarkCitations,
      remarkFragmentDropdownSections,
    ],
    rehypePlugins: (v) => [rehypeKatex, ...v],
  },
});
