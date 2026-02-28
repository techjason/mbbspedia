type UnknownNode = {
  type: string;
  depth?: number;
  name?: string;
  attributes?: unknown[];
  children?: UnknownNode[];
};

type RootNode = UnknownNode & {
  type: "root";
  children: UnknownNode[];
};

type VFileLike = {
  path?: string;
  history?: string[];
};

function hasChildren(node: UnknownNode): node is UnknownNode & { children: UnknownNode[] } {
  return Array.isArray(node.children);
}

function isHeadingAtDepth(node: UnknownNode, depth: number): boolean {
  return node.type === "heading" && node.depth === depth;
}

function getFilePath(file?: VFileLike): string {
  if (!file) return "";

  const rawPath = file.path ?? file.history?.[0] ?? "";
  return rawPath.replace(/\\/g, "/");
}

function isFragmentFile(file?: VFileLike): boolean {
  const path = getFilePath(file);
  return path.includes("/content/fragments/");
}

function getSectionHeadingDepth(children: UnknownNode[]): number | null {
  const headingCounts = new Map<number, number>();

  for (const child of children) {
    if (child.type !== "heading" || typeof child.depth !== "number") {
      continue;
    }

    headingCounts.set(child.depth, (headingCounts.get(child.depth) ?? 0) + 1);
  }

  // Prefer higher-level section headings first so top-level sections (usually h2)
  // stay as independent collapsible groups.
  const preferredDepths = [2, 1, 3, 4, 5, 6];

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

  return null;
}

function wrapSections(tree: RootNode, headingDepth: number): void {
  const nextChildren: UnknownNode[] = [];
  let index = 0;

  while (index < tree.children.length) {
    const current = tree.children[index];

    if (!isHeadingAtDepth(current, headingDepth)) {
      nextChildren.push(current);
      index += 1;
      continue;
    }

    const sectionChildren: UnknownNode[] = [current];
    index += 1;

    while (index < tree.children.length) {
      const node = tree.children[index];
      // Stop when we hit a sibling heading at the same depth OR a shallower
      // heading that starts a new parent section.
      if (
        node.type === "heading" &&
        typeof node.depth === "number" &&
        node.depth <= headingDepth
      ) {
        break;
      }

      sectionChildren.push(node);
      index += 1;
    }

    nextChildren.push({
      type: "mdxJsxFlowElement",
      name: "FragmentDropdownSection",
      attributes: [],
      children: sectionChildren,
    });
  }

  tree.children = nextChildren;
}

export function remarkFragmentDropdownSections() {
  return (tree: UnknownNode, file?: VFileLike) => {
    if (tree.type !== "root" || !hasChildren(tree) || !isFragmentFile(file)) {
      return;
    }

    const root = tree as RootNode;
    const headingDepth = getSectionHeadingDepth(root.children);
    if (headingDepth === null) {
      return;
    }

    wrapSections(root, headingDepth);
  };
}
