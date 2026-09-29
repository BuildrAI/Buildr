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
import {
  knowledgeCatalogPage,
  type KnowledgeCatalogRequest,
} from "../domain/knowledge-catalog.ts";
import { discoverKnowledgeDocuments, type DocumentLocation } from "../infrastructure/knowledge-documents.ts";
import { organizeKnowledgeDocuments, resolveKnowledgeEntryDocument } from "../domain/knowledge-document-sections.ts";
import { readKnowledgeReference, type KnowledgeReference, type ReferenceFile } from '../infrastructure/knowledge-references.ts';
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
  ) {
    try {
      const value = read();
      return {
        ...value,
        status: "readable",
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
    const { documentSections: _documentSections, entryDocument: _entryDocument, ...topicIndex } = index;
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
        ...observe(() => sourceRead(root, scope, s)),
        ...(part === "sources" ? {} : { content: null }),
      }));
    const rendered = artifacts.map((a) => {
      const observed = observe(
        () => readKnowledgeFile(scope.directory, a.path),
      );
      return {
        ...a,
        ...observed,
        diagramSize: a.kind === "diagram" ? readDiagramSize(observed.content) : null,
        graph: a.graphSource
          ? observe(
              () => readKnowledgeFile(scope.directory, a.graphSource!),
            )
          : null,
      };
    });
    return {
      ...base,
      index: topicIndex,
      item,
      artifacts: rendered,
      observations,
      diagnostics: [],
    };
  }
  function catalog(root: string, ref: ScopeRef, request: KnowledgeCatalogRequest = {}) {
    const { scope, index, revision } = load(root, ref);
    const scopeIdentity = digest(JSON.stringify([
      fs.realpathSync(root), scope.kind, scope.id, scope.directory,
    ]));
    return {
      scope,
      ...knowledgeCatalogPage(index, revision, scopeIdentity, request),
    };
  }
  function navigation(root: string, ref: ScopeRef) {
    const { scope, index, revision } = load(root, ref);
    return {
      scope,
      revision,
      entryObject: index?.entryObject ?? null,
      artifactCount: index?.artifacts.length ?? 0,
      topics: (index?.objects || []).map(({ id, title, summary, parent }) => ({
        id, title, summary, parent: parent ?? null,
      })),
      artifacts: (index?.artifacts || []).map(({ id, title, kind, path, objects }) => ({
        id, title, kind, path, objects: [...objects],
      })),
      diagnostics: [],
    };
  }
  function documentCatalog(root: string, ref: ScopeRef) {
    const scope = resolve(root, ref);
    const locations: DocumentLocation[] = [{ id: "scope", title: scope.title, root: scope.directory }];
    const registered = new Map<string, string>();
    const indexDiagnostics: string[] = [];
    let documentSections: unknown;
    let entryDocument: unknown;
    let indexRevision: string | null = null;
    let missingLocation = false;
    try {
      const loaded = load(root, ref);
      documentSections = loaded.index?.documentSections;
      entryDocument = loaded.index?.entryDocument;
      indexRevision = loaded.revision;
      for (const artifact of loaded.index?.artifacts ?? []) {
        if (artifact.kind !== "diagram") registered.set(path.join(fs.realpathSync(scope.directory), artifact.path), artifact.id);
      }
    } catch { indexDiagnostics.push("主题索引暂不可读取，文档目录仍按实际文件展示。"); }
    if (scope.kind === "service") {
      locations.push({ id: "code", title: `${scope.title} · 代码库文档`, root: scope.codeRoot });
    } else {
      for (const id of scope.serviceIds) {
        try {
          const service = resolve(root, { kind: "service", id });
          locations.push({ id: `service:${id}:assets`, title: `${service.title} · 服务资料`, root: service.directory },
            { id: `service:${id}:code`, title: `${service.title} · 代码库文档`, root: service.codeRoot });
        } catch { missingLocation = true; indexDiagnostics.push("一项关联服务的文档位置暂不可读取。"); }
      }
    }
    locations.push({ id: "workspace", title: "工作空间公共说明", root, publicOnly: true });
    const result = discoverKnowledgeDocuments(locations, registered);
    const workspaceRoot = fs.realpathSync(root);
    for (const document of result.documents) {
      const file = result.files.get(document.id)!;
      const relative = path.relative(workspaceRoot, path.join(file.root, file.path));
      if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
        document.workspacePath = relative.split(path.sep).join("/");
    }
    const organized = organizeKnowledgeDocuments(result.documents, documentSections);
    const entry = resolveKnowledgeEntryDocument(organized.documents, entryDocument);
    return { scope, ...result, ...organized,
      entryDocumentId: entry.entryDocumentId,
      revision: digest(JSON.stringify([result.revision, indexRevision])),
      truncated: result.truncated || missingLocation,
      diagnostics: [...indexDiagnostics, ...result.diagnostics, ...organized.diagnostics, ...entry.diagnostics] };
  }
  function documents(root: string, ref: ScopeRef) {
    const { files: _files, ...result } = documentCatalog(root, ref);
    return result;
  }
  function document(root: string, ref: ScopeRef, id: string) {
    const catalog = documentCatalog(root, ref);
    const selected = catalog.documents.find((item) => item.id === id);
    const file = catalog.files.get(id);
    if (!selected || !file) throw knowledgeError("knowledge_document_missing", "文档不存在或不在可阅读目录中，请刷新目录。", 404);
    // Re-check the real path after discovery so a replaced symlink cannot be read.
    if (fs.realpathSync(path.join(file.root, file.path)) !== path.join(file.root, file.path))
      throw knowledgeError("knowledge_path_forbidden", "不能通过符号链接读取文档。");
    const { content, digest: contentDigest } = readKnowledgeFile(file.root, file.path);
    return { document: selected, content, digest: contentDigest };
  }
  function reference(root: string, ref: ScopeRef, target: KnowledgeReference, image = false) {
    let start: ReferenceFile;
    if (target.kind === 'document') {
      const catalog = documentCatalog(root, ref);
      const file = catalog.files.get(target.id);
      if (!file) throw knowledgeError('knowledge_document_missing', '文档不存在或已不可读。', 404);
      if (fs.realpathSync(path.join(file.root, file.path)) !== path.join(file.root, file.path))
        throw knowledgeError('knowledge_path_forbidden', '不能通过符号链接读取文档。');
      start = { root: file.root, ...readKnowledgeFile(file.root, file.path) };
    } else {
      const { scope, index } = load(root, ref);
      if (target.kind === 'artifact') {
        const artifact = index?.artifacts.find(item => item.id === target.id && item.kind !== 'diagram');
        if (!artifact) throw knowledgeError('knowledge_item_missing', '引用入口不存在。', 404);
        start = { root: scope.directory, ...readKnowledgeFile(scope.directory, artifact.path) };
      } else {
        const source = index?.sources.find(item => item.id === target.id);
        if (!source || source.kind === 'skill') throw knowledgeError('knowledge_source_scope_forbidden', '该来源不支持本地文件引用。');
        const value = sourceRead(root, scope, source);
        if (!('location' in value)) throw knowledgeError('knowledge_source_scope_forbidden', '来源位置不可读取。');
        start = { root: value.location.root, path: value.path, content: value.content };
      }
    }
    const scope = resolve(root, ref);
    const roots = [scope.directory, scope.codeRoot, path.join(root, 'docs')];
    if (scope.kind === 'project') for (const id of scope.serviceIds) {
      try { const service = resolve(root, { kind: 'service', id }); roots.push(service.directory, service.codeRoot); } catch { /* Unavailable services do not expand reading authority. */ }
    }
    const allowedRoots = roots.flatMap(directory => { try { return [fs.realpathSync(directory)]; } catch { return []; } });
    const workspaceRoot = fs.realpathSync(root);
    const result = readKnowledgeReference(start, target.links, image, file => allowedRoots.some(directory => file.startsWith(directory + path.sep)) ||
      (path.dirname(file) === workspaceRoot && /^(?:readme(?:[._-][\w-]+)?|contributing|security|changelog)\.md$/i.test(path.basename(file))));
    return { ...result, reference: target };
  }
  return { read, catalog, navigation, documents, document, reference };
}
