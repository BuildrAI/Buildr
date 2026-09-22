import { parse } from "yaml";
export type ScopeRef = { kind: "project" | "service"; id: string };
export type KnowledgeObject = {
  id: string;
  title: string;
  summary: string;
  parent?: string;
};
export type KnowledgeSource = {
  summary?: string;
  id: string;
  title: string;
  kind: "code" | "spec" | "skill" | "evidence";
  path: string;
  scope?: ScopeRef;
  skillId?: string;
  link?: string;
  observedDigest?: string;
  line?: number;
};
export type KnowledgeArtifact = {
  id: string;
  title: string;
  kind: "document" | "diagram" | "code-map" | "terms";
  path: string;
  objects: string[];
  sources: string[];
  files?: string[];
  graphSource?: string;
  graphDigest?: string;
  observedDigest?: string;
};
export type KnowledgeIndex = {
  schemaVersion: "buildr.knowledge-index/v1";
  scope: ScopeRef;
  objects: KnowledgeObject[];
  artifacts: KnowledgeArtifact[];
  sources: KnowledgeSource[];
  relations: {
    from: string;
    to: string;
    kind: "contains" | "guides" | "implements" | "based-on" | "explains";
  }[];
};
export function knowledgeError(code: string, message: string, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
const invalid = (message: string): never => {
  throw knowledgeError("knowledge_index_invalid", message);
};
const record = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === "object" && !Array.isArray(v));
const text = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 4000;
const id = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(v);
const scope = (v: unknown): v is ScopeRef =>
  record(v) && ["project", "service"].includes(String(v.kind)) && id(v.id);
function fields(value: unknown, names: string[]) {
  if (!record(value) || Object.keys(value).some((key) => !names.includes(key)))
    invalid("知识索引包含未知字段。");
}
export function parseKnowledgeIndex(content: string): KnowledgeIndex {
  let raw: unknown;
  try {
    raw = parse(content, { maxAliasCount: 0, uniqueKeys: true });
  } catch {
    return invalid("知识索引格式无效。");
  }
  if (
    !record(raw) ||
    raw.schemaVersion !== "buildr.knowledge-index/v1" ||
    !scope(raw.scope)
  )
    return invalid("知识索引版本或范围无效。");
  for (const key of ["objects", "artifacts", "sources", "relations"])
    if (!Array.isArray(raw[key]) || raw[key].length > 500)
      return invalid(`知识索引 ${key} 必须为不超过 500 项的列表。`);
  fields(raw, [
    "schemaVersion",
    "scope",
    "objects",
    "artifacts",
    "sources",
    "relations",
  ]);
  fields(raw.scope, ["kind", "id"]);
  const index = raw as unknown as KnowledgeIndex,
    all = [...index.objects, ...index.artifacts, ...index.sources];
  const ids = new Set<string>();
  for (const entry of all) {
    if (
      !record(entry) ||
      !id(entry.id) ||
      !text(entry.title) ||
      ids.has(entry.id)
    )
      return invalid("知识对象标识缺失或重复。");
    ids.add(entry.id);
  }
  for (const o of index.objects)
    fields(o, ["id", "title", "summary", "parent"]);
  for (const a of index.artifacts)
    fields(a, [
      "id",
      "title",
      "kind",
      "path",
      "objects",
      "sources",
      "files",
      "graphSource",
      "graphDigest",
      "observedDigest",
    ]);
  for (const s of index.sources) {
    fields(s, [
      "id",
      "title",
      "kind",
      "path",
      "scope",
      "summary",
      "skillId",
      "link",
      "observedDigest",
      "line",
    ]);
    if (s.scope) fields(s.scope, ["kind", "id"]);
  }
  for (const r of index.relations) fields(r, ["from", "to", "kind"]);
  const objectIds = new Set(index.objects.map((o) => o.id)),
    sourceIds = new Set(index.sources.map((s) => s.id));
  for (const o of index.objects)
    if (
      !text(o.summary) ||
      (o.parent !== undefined && !objectIds.has(o.parent))
    )
      return invalid(`对象 ${o.id} 的说明或上级无效。`);
  for (const o of index.objects) {
    const seen = new Set([o.id]);
    let p = o.parent;
    while (p) {
      if (seen.has(p)) return invalid("对象层级存在循环。");
      seen.add(p);
      p = index.objects.find((x) => x.id === p)?.parent;
    }
  }
  for (const a of index.artifacts)
    if (
      !["document", "diagram", "code-map", "terms"].includes(a.kind) ||
      !text(a.path) ||
      !Array.isArray(a.objects) ||
      !a.objects.every((o) => objectIds.has(o)) ||
      !Array.isArray(a.sources) ||
      !a.sources.every((s) => sourceIds.has(s)) ||
      (a.files !== undefined &&
        (!Array.isArray(a.files) || !a.files.every((s) => sourceIds.has(s)))) ||
      (a.observedDigest !== undefined &&
        !/^[a-f0-9]{64}$/.test(a.observedDigest)) ||
      (a.graphSource !== undefined && !text(a.graphSource)) ||
      (a.graphDigest !== undefined && !/^[a-f0-9]{64}$/.test(a.graphDigest))
    )
      return invalid(`成果 ${a.id} 的类型或关联无效。`);
  for (const s of index.sources)
    if (
      !["code", "spec", "skill", "evidence"].includes(s.kind) ||
      !text(s.path) ||
      (s.summary !== undefined && !text(s.summary)) ||
      (s.scope !== undefined && !scope(s.scope)) ||
      (s.link !== undefined && !text(s.link)) ||
      (s.kind === "skill" && !id(s.skillId)) ||
      (s.observedDigest !== undefined &&
        !/^[a-f0-9]{64}$/.test(s.observedDigest)) ||
      (s.line !== undefined && (!Number.isInteger(s.line) || s.line < 1))
    )
      return invalid(`来源 ${s.id} 无效。`);
  for (const r of index.relations)
    if (
      !record(r) ||
      !ids.has(r.from) ||
      !ids.has(r.to) ||
      !["contains", "guides", "implements", "based-on", "explains"].includes(
        r.kind,
      )
    )
      return invalid("知识关系包含非法目标或类型。");
  return index;
}
