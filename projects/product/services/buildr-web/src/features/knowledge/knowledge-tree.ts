export type KnowledgeTreeNode = {
  key: string;
  label: string;
  description: string;
  href?: string;
  sourceId?: string;
  boundary?: boolean;
  group?: boolean;
  children: KnowledgeTreeNode[];
};
export type KnowledgeBlock =
  | { kind: "markdown"; text: string }
  | { kind: "tree"; nodes: KnowledgeTreeNode[] };
/** Ordinary Markdown links remain the source; bold directories mark the authored business boundary. */
export function parseKnowledgeTree(text: string): KnowledgeTreeNode[] | null {
  const roots: KnowledgeTreeNode[] = [],
    parents: { indent: number; node: KnowledgeTreeNode }[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    const row = line.match(
      /^( *)(?:-|\*) +(?:(\*\*)?`([^`]+)`(?:\*\*)?|\[([^\]]+)\]\(([^)]+)\))\s*(?:[—–-]\s*)?(.*)$/,
    );
    if (!row) return null;
    const indent = row[1].length;
    const node: KnowledgeTreeNode = {
      key: `${index}:${row[3] || row[5]}`,
      label: row[3] || row[4],
      href: row[5],
      description: row[6],
      boundary: Boolean(row[2]),
      children: [],
    };
    while (parents.length && parents.at(-1)!.indent >= indent) parents.pop();
    if (parents.length) parents.at(-1)!.node.children.push(node);
    else roots.push(node);
    parents.push({ indent, node });
  }
  return roots.length ? roots : null;
}
export function knowledgeBlocks(markdown: string): KnowledgeBlock[] {
  const blocks: KnowledgeBlock[] = [],
    lines = markdown.split("\n");
  let start = 0,
    fenced = false;
  const flush = (end: number) => {
    if (end > start)
      blocks.push({
        kind: "markdown",
        text: lines.slice(start, end).join("\n"),
      });
  };
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !/^[-*] +(?:`|\*\*`|\[)/.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && /^ *[-*] +/.test(lines[end])) end++;
    const nodes = parseKnowledgeTree(lines.slice(i, end).join("\n"));
    if (nodes) {
      flush(i);
      blocks.push({ kind: "tree", nodes });
      start = end;
      i = end - 1;
    }
  }
  flush(lines.length);
  return blocks;
}
/** Create a real path tree from explicitly registered related files, without scanning or guessing companions. */
export function relatedFileTree(
  files: {
    id: string;
    path: string;
    title: string;
    summary?: string;
    scope?: { kind: string; id: string };
  }[],
): KnowledgeTreeNode[] {
  const roots: KnowledgeTreeNode[] = [];
  for (const file of files) {
    let level = roots;
    let prefix = "";
    if (file.scope) {
      prefix = `scope:${file.scope.kind}:${file.scope.id}`;
      let group = roots.find((n) => n.key === prefix);
      if (!group) {
        group = {
          key: prefix,
          label: `${file.scope.kind === "service" ? "服务" : "项目"}「${file.scope.id}」`,
          description: "以下路径相对该登记来源",
          group: true,
          children: [],
        };
        roots.push(group);
      }
      level = group.children;
    }
    const parts = file.path.split("/");
    for (const [i, part] of parts.entries()) {
      prefix += (prefix ? "/" : "") + part;
      const leaf = i === parts.length - 1;
      let node = level.find((n) => n.key === prefix);
      if (!node) {
        node = {
          key: prefix,
          label: part + (leaf ? "" : "/"),
          description: leaf ? file.title : "",
          children: [],
        };
        level.push(node);
      }
      if (leaf) {
        node.sourceId = file.id;
        node.description = file.title;
      }
      level = node.children;
    }
  }
  const compact = (nodes: KnowledgeTreeNode[]): KnowledgeTreeNode[] =>
    nodes.map((node) => {
      while (
        !node.sourceId &&
        !node.group &&
        node.children.length === 1 &&
        !node.children[0].sourceId
      ) {
        const child = node.children[0];
        node = { ...child, label: node.label + child.label };
      }
      return { ...node, children: compact(node.children) };
    });
  return compact(roots);
}
