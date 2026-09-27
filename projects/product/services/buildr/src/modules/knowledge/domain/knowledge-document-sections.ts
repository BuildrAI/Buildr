export type KnowledgeDocument = {
  id: string;
  path: string;
  title: string;
  location: string;
  group: string;
  artifactId: string | null;
  workspacePath: string | null;
  sectionId: string;
  summary: string;
  supplementary: boolean;
};
export type KnowledgeDocumentSection = {
  id: string;
  title: string;
  summary: string;
  count: number;
};
const MAX_SECTIONS = 64;
const MAX_ENTRIES = 1000;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 4000;
const title = (value: unknown): value is string => text(value) && value.trim().length > 0;
const fields = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));

export function resolveKnowledgeEntryDocument(documents: KnowledgeDocument[], raw: unknown) {
  if (raw === undefined) return { entryDocumentId: null, diagnostics: [] as string[] };
  if (!record(raw) || !fields(raw, ["location", "path"]) || !title(raw.path) ||
      (raw.location !== undefined && !title(raw.location))) {
    return { entryDocumentId: null, diagnostics: ["文档入口格式无效，请从目录选择内容。"] };
  }
  // Entry metadata selects an existing identity; it must never resolve or read a path.
  const entry = documents.find((document) => document.location === (raw.location ?? "scope") && document.path === raw.path);
  return entry
    ? { entryDocumentId: entry.id, diagnostics: [] as string[] }
    : { entryDocumentId: null, diagnostics: ["文档入口不在当前可阅读目录中，请从目录选择内容。"] };
}

// Authored metadata can only decorate already discovered files. It never
// resolves a path or adds a file to the reading boundary.
export function organizeKnowledgeDocuments(discovered: KnowledgeDocument[], raw: unknown) {
  const documents: KnowledgeDocument[] = [];
  const sections: KnowledgeDocumentSection[] = [];
  const diagnostics: string[] = [];
  const available = new Map(discovered.map((item) => [`${item.location}\0${item.path}`, item]));
  const used = new Set<string>();
  const sectionIds = new Set<string>();
  const input = Array.isArray(raw) ? raw : [];
  if (raw !== undefined && !Array.isArray(raw)) diagnostics.push("文档章节编排必须为列表，当前仍展示实际发现的文件。");
  if (input.length > MAX_SECTIONS) diagnostics.push("文档章节编排超过 64 组，仅解释前 64 组，其余文件仍可阅读。");
  let examined = 0;
  for (const [position, candidate] of input.slice(0, MAX_SECTIONS).entries()) {
    if (!record(candidate) || !fields(candidate, ["id", "title", "summary", "entries"]) ||
        typeof candidate.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(candidate.id) ||
        candidate.id === "unorganized" || sectionIds.has(candidate.id) || !title(candidate.title) ||
        !text(candidate.summary) || !Array.isArray(candidate.entries)) {
      diagnostics.push(`第 ${position + 1} 组文档章节格式无效或标识重复，未采用该编排。`);
      continue;
    }
    const section = { id: candidate.id, title: candidate.title, summary: candidate.summary, count: 0 };
    sectionIds.add(section.id);
    for (const [entryPosition, entry] of candidate.entries.entries()) {
      if (++examined > MAX_ENTRIES) break;
      if (!record(entry) || !fields(entry, ["location", "path", "title", "summary", "supplementary"]) ||
          (entry.location !== undefined && !title(entry.location)) || !title(entry.path) ||
          !title(entry.title) || !text(entry.summary) ||
          (entry.supplementary !== undefined && typeof entry.supplementary !== "boolean")) {
        diagnostics.push(`第 ${position + 1} 组第 ${entryPosition + 1} 条文档编排格式无效，未采用。`);
        continue;
      }
      const document = available.get(`${entry.location ?? "scope"}\0${entry.path}`);
      if (!document || used.has(document.id)) {
        diagnostics.push(`第 ${position + 1} 组第 ${entryPosition + 1} 条文档未发现或重复引用，未采用。`);
        continue;
      }
      used.add(document.id);
      section.count += 1;
      documents.push({ ...document, sectionId: section.id, title: entry.title,
        summary: entry.summary, supplementary: entry.supplementary === true });
    }
    if (section.count) sections.push(section);
  }
  if (examined > MAX_ENTRIES) diagnostics.push("文档编排超过 1000 条，仅解释前 1000 条，其余文件仍可阅读。");
  const unorganized = discovered.filter((document) => !used.has(document.id));
  if (unorganized.length) {
    sections.push({ id: "unorganized", title: "其他文档", summary: "尚未编排的实际文档，仍可阅读和搜索。", count: unorganized.length });
    documents.push(...unorganized.map((document) => ({ ...document, sectionId: "unorganized", summary: "", supplementary: false })));
  }
  return { documents, sections, diagnostics };
}
