import defaultMdxComponents from "fumadocs-ui/mdx";
import * as TabsComponents from "fumadocs-ui/components/tabs";
import type { MDXComponents } from "mdx/types";
import { Mermaid } from "./components/mdx/mermaid";
import { ActiveRecallQuiz } from "./components/mdx/active-recall-quiz";
import { Cite, References } from "./components/mdx/citations";
import { ImageZoom } from "./components/image-zoom";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    img: (props) => <ImageZoom {...(props as any)} />,
    Mermaid,
    ActiveRecallQuiz,
    Cite,
    References,
    ...TabsComponents,
    ...components,
  };
}
