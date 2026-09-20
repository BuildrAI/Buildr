import fs from "node:fs";
import path from "node:path";
import { resolveSourceRoot } from "../../workspace/module.ts";
import type { AssetCatalog } from "../../workspace/module.ts";
import {
  parseKnowledgeIndex,
  knowledgeError,
  type ScopeRef,
  type KnowledgeSource,
} from "../domain/knowledge-index.ts";
import {
  digest,
  readKnowledgeFile,
} from "../infrastructure/knowledge-files.ts";
export type KnowledgeDependencies = {
  assetCatalog(root: string): AssetCatalog;
  skillFile(root: string, id: string, path: string): { content: string };
  skillDetail(
    root: string,
    id: string,
  ): {
    skill: { id: string; sourcePath: string | null; enabled: boolean };
    issue?: string | null;
  };
};
function readDiagramSize(content: string | null) {
  if (!content) return null;
  // Read only the authored main SVG, never a toolbar icon or stale graph source.
  for (const [tag] of content.matchAll(/<svg\b[^>]*>/gi)) {
    const labelledBy = tag.match(/\saria-labelledby\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!labelledBy?.split(/\s+/).includes("archify-diagram-title")) continue;
    const viewBox = tag.match(/\sviewBox\s*=\s*(["'])(.*?)\1/i)?.[2];
    const values = viewBox?.trim().split(/[\s,]+/);
    if (!values || values.length !== 4 || values.some((value) =>
      !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value))) return null;
    const [x, y, width, height] = values.map(Number);
    return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0
      ? { width, height }
      : null;
  }
  return null;
}
export function createKnowledgeQuery(deps: KnowledgeDependencies) {
  function resolve(root: string, ref: ScopeRef) {
    const catalog = deps.assetCatalog(root);
    if (ref.kind === "project") {
      const project = catalog.projects.find(
        (p) => p.id === ref.id || p.code === ref.id,
      );
      if (!project)
        throw knowledgeError("knowledge_scope_missing", "项目不存在。", 404);
      const directory = resolveSourceRoot(root, project.source);
      return {
        kind: ref.kind,
        id: project.id,
        code: project.code,
        title: project.name,
        directory,
        codeRoot: directory,
        serviceIds: project.serviceIds,
        repositoryId: null as string | null,
      };
    }
    const service = catalog.services.find(
      (s) => s.id === ref.id || s.code === ref.id,
    );
    const repository = catalog.repositories.find(
      (r) => r.id === service?.repositoryId,
    );
    if (!service || !repository)
      throw knowledgeError(
        "knowledge_scope_missing",
        "服务或代码库不存在。",
        404,
      );
    const repositoryRoot = resolveSourceRoot(root, repository.source),
      codeRoot = path.resolve(repositoryRoot, service.modulePath || ".");
    if (
      codeRoot !== repositoryRoot &&
      !codeRoot.startsWith(repositoryRoot + path.sep)
    )
      throw knowledgeError(
        "knowledge_scope_invalid",
        "服务模块超出代码库范围。",
      );
    if (
      fs.existsSync(codeRoot) &&
      !((x: string, b: string) => x === b || x.startsWith(b + path.sep))(
        fs.realpathSync(codeRoot),
        fs.realpathSync(repositoryRoot),
      )
    )
      throw knowledgeError("knowledge_scope_invalid", "服务模块真实路径越界。");
    return {
      kind: ref.kind,
      id: service.id,
      code: service.code,
      title: service.name,
      directory: path.join(root, "services", service.code),
      codeRoot,
      serviceIds: [service.id],
      repositoryId: repository.id,
    };
  }
  function load(root: string, ref: ScopeRef) {
    const scope = resolve(root, ref);
    let file;
    try {
      file = readKnowledgeFile(scope.directory, "knowledge/index.yml");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return { scope, index: null, revision: null };
      throw e;
    }
    const index = parseKnowledgeIndex(file.content);
    if (
      index.scope.kind !== scope.kind ||
      ![scope.id, scope.code].includes(index.scope.id)
    )
      throw knowledgeError(
        "knowledge_scope_mismatch",
        "索引与登记范围身份不符。",
      );
    return { scope, index, revision: file.digest };
  }
  function sourceRead(
    root: string,
    scope: ReturnType<typeof resolve>,
    source: KnowledgeSource,
  ) {
    let selected = scope;
    if (source.scope) {
      selected = resolve(root, source.scope);
      if (
        !(selected.kind === scope.kind && selected.id === scope.id) &&
        !(
          scope.kind === "project" &&
          selected.kind === "service" &&
          scope.serviceIds.includes(selected.id)
        )
      )
        throw knowledgeError(
          "knowledge_source_scope_forbidden",
          "来源不属于当前项目关联的服务。",
        );
    }
    if (source.kind === "skill") {
      const detail = deps.skillDetail(root, source.skillId!);
      if (detail.issue)
        throw knowledgeError("knowledge_skill_unavailable", detail.issue);
      const value = deps.skillFile(root, source.skillId!, source.path);
      if (Buffer.byteLength(value.content) > 1024 * 1024)
        throw knowledgeError("knowledge_content_limit", "技能内容超限。");
      return {
        content: value.content,
        digest: digest(value.content),
        path: source.path,
        skill: {
          id: detail.skill.id,
          sourcePath: detail.skill.sourcePath,
          enabled: detail.skill.enabled,
        },
      };
    }
    const directory =
      source.kind === "code" ? selected.codeRoot : selected.directory;
    return {
      ...readKnowledgeFile(directory, source.path),
      location: {
        kind: selected.kind,
        id: selected.id,
        title: selected.title,
        root: directory,
        repositoryId: selected.repositoryId,
      },
    };
  }
  function observe(
    read: () => { content: string; digest: string; path: string },
    expected?: string,
  ) {
    try {
      const value = read();
      return {
        ...value,
        status: expected
          ? value.digest === expected
            ? "aligned"
            : "changed"
          : "unreviewed",
        diagnostic: null,
      };
    } catch (e) {
      return {
        content: null,
        digest: null,
        path: null,
        status:
          (e as NodeJS.ErrnoException).code === "ENOENT"
            ? "missing"
            : "unreadable",
        diagnostic: e instanceof Error ? e.message : "无法读取",
      };
    }
  }
  function read(
    root: string,
    ref: ScopeRef,
    part?: "objects" | "artifacts" | "sources",
    id?: string,
  ) {
    const base = load(root, ref);
    if (!base.index)
      return {
        ...base,
        diagnostics: [],
        item: null,
        artifacts: [],
        observations: [],
      };
    const { index, scope } = base;
    const item = part ? index[part].find((i) => i.id === id) : null;
    if (part && !item)
      throw knowledgeError("knowledge_item_missing", "知识条目不存在。", 404);
    const objectId = part === "objects" ? id : null;
    const artifacts =
      part === "artifacts"
        ? index.artifacts.filter((a) => a.id === id)
        : objectId
          ? index.artifacts.filter((a) => a.objects.includes(objectId))
          : [];
    const sourceIds = new Set(
      artifacts.flatMap((a) => [...a.sources, ...(a.files || [])]),
    );
    if (part === "sources" && id) sourceIds.add(id);
    if (objectId)
      for (const relation of index.relations)
        if (relation.from === objectId) sourceIds.add(relation.to);
        else if (relation.to === objectId) sourceIds.add(relation.from);
    const observations = index.sources
      .filter((s) => sourceIds.has(s.id))
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        ...observe(() => sourceRead(root, scope, s), s.observedDigest),
        ...(part === "sources" ? {} : { content: null }),
      }));
    const rendered = artifacts.map((a) => {
      const observed = observe(
        () => readKnowledgeFile(scope.directory, a.path),
        a.observedDigest,
      );
      return {
        ...a,
        ...observed,
        diagramSize: a.kind === "diagram" ? readDiagramSize(observed.content) : null,
        graph: a.graphSource
          ? observe(
              () => readKnowledgeFile(scope.directory, a.graphSource!),
              a.graphDigest,
            )
          : null,
      };
    });
    return {
      ...base,
      item,
      artifacts: rendered,
      observations,
      diagnostics: [],
    };
  }
  return { read };
}
