import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { type KnowledgeIndex } from '../../src/modules/knowledge/domain/knowledge-index.ts';
import { digest } from '../../src/modules/knowledge/infrastructure/knowledge-files.ts';
import { validateKnowledgeCatalogResponse, validateKnowledgeDocumentResponse, validateKnowledgeDocumentsResponse, validateKnowledgeNavigationResponse, validateKnowledgeResponse } from '../../src/modules/knowledge/interfaces/http/knowledge-http-contracts.ts';
import { createKnowledgeHttpContribution } from '../../src/modules/knowledge/interfaces/http/knowledge-http.ts';
import { prototype, setup } from '../helpers/knowledge-query-fixture.ts';

test("文档目录无需主题索引，刷新发现增删与正文标题变化且不写回索引", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  const indexPath = path.join(root, "projects/demo/knowledge/index.yml");
  fs.unlinkSync(indexPath);
  const first = app.documents(root, scope);
  validateKnowledgeDocumentsResponse(first);
  assert.equal(first.totalCount, 1);
  assert.equal(first.entryDocumentId, null);
  assert.equal(first.truncated, false);
  assert.deepEqual(first.diagnostics, []);
  assert.deepEqual(first.sections.map(({ id, count }) => ({ id, count })), [{ id: "unorganized", count: 1 }]);
  assert.match(first.sections[0].summary, /尚未编排/);
  assert.equal(first.documents[0].sectionId, "unorganized");
  assert.equal(first.documents[0].summary, "");
  assert.equal(first.documents[0].supplementary, false);
  assert.equal(first.documents[0].title, "订单");
  assert.equal(first.documents[0].artifactId, null);
  assert.equal(Object.hasOwn(first, "files"), false, "目录响应不暴露内部文件寻址表");
  assert.equal(fs.existsSync(indexPath), false);

  put("projects/demo/README.md", "# 项目说明\n");
  const added = app.documents(root, scope);
  assert.equal(added.totalCount, 2);
  assert.notEqual(added.revision, first.revision);
  put("projects/demo/knowledge/docs/order.md", "# 当前订单说明\n最新正文\n");
  const updated = app.documents(root, scope);
  const order = updated.documents.find((item) => item.path === "knowledge/docs/order.md")!;
  assert.equal(order.id, first.documents[0].id, "同一文件保持目录身份");
  assert.equal(order.title, "当前订单说明");
  assert.notEqual(updated.revision, added.revision);
  const read = app.document(root, scope, order.id);
  validateKnowledgeDocumentResponse(read);
  assert.equal(read.content, "# 当前订单说明\n最新正文\n");
  assert.equal(read.digest, digest(read.content));
  fs.unlinkSync(path.join(root, "projects/demo/README.md"));
  assert.equal(app.documents(root, scope).totalCount, 1);
  assert.equal(fs.existsSync(indexPath), false);

  put("projects/demo/knowledge/index.yml", "invalid: [\n");
  const malformed = app.documents(root, scope);
  assert.equal(malformed.totalCount, 1);
  assert.equal(malformed.documents[0].sectionId, "unorganized");
  assert.equal(app.document(root, scope, malformed.documents[0].id).content, "# 当前订单说明\n最新正文\n");
  assert.match(malformed.diagnostics.join("\n"), /主题索引暂不可读取/);
  assert.equal(fs.readFileSync(indexPath, "utf8"), "invalid: [\n");
});

test("文档入口选择已发现文件的唯一身份，修改入口刷新版本且正文不变", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  put("README.md", "# 公共阅读入口\n");
  const before = app.documents(root, scope);
  assert.equal(before.entryDocumentId, null, "旧索引不猜测第一篇作为入口");
  const index: KnowledgeIndex = {
    ...structuredClone(prototype),
    entryDocument: { path: "knowledge/docs/order.md" },
    documentSections: [{ id: "start", title: "开始", summary: "", entries: [
      { path: "knowledge/docs/order.md", title: "阅读入口", summary: "当前正文", supplementary: true },
    ] }],
  };
  put("projects/demo/knowledge/index.yml", stringify(index));
  const selected = app.documents(root, scope);
  validateKnowledgeDocumentsResponse(selected);
  assert.equal(selected.entryDocumentId, selected.documents.find(({ path }) => path === "knowledge/docs/order.md")!.id);
  assert.equal(selected.documents.filter(({ id }) => id === selected.entryDocumentId).length, 1);
  assert.equal(selected.totalCount, before.totalCount, "入口不新增目录条目或计数");
  assert.deepEqual(selected.diagnostics, []);
  const body = app.document(root, scope, selected.entryDocumentId!);
  assert.equal(body.content, "# 订单\n读取实现");
  assert.equal(body.document.title, "阅读入口", "入口继续使用同一份编排元数据");
  const detail = app.read(root, scope, "objects", "object");
  validateKnowledgeResponse(detail);
  assert.equal(Object.hasOwn(detail.index!, "entryDocument"), false, "旧主题投影不暴露未校验入口配置");

  index.entryDocument = { location: "workspace", path: "README.md" };
  put("projects/demo/knowledge/index.yml", stringify(index));
  const changed = app.documents(root, scope);
  assert.equal(changed.entryDocumentId, changed.documents.find(({ location }) => location === "workspace")!.id);
  assert.notEqual(changed.entryDocumentId, selected.entryDocumentId);
  assert.notEqual(changed.revision, selected.revision);
  assert.equal(changed.totalCount, selected.totalCount);
  assert.equal(app.document(root, scope, body.document.id).digest, body.digest);
  fs.unlinkSync(path.join(root, "README.md"));
  const removed = app.documents(root, scope);
  assert.equal(removed.entryDocumentId, null);
  assert.equal(removed.totalCount, 1);
  assert.match(removed.diagnostics.join("\n"), /入口不在当前可阅读目录/);
});

test("无效、缺失与越界文档入口仅局部诊断，不扩大目录或阻止主题阅读", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  put("projects/demo/docs/passwords.md", "# 敏感内容\n");
  put("outside/README.md", "# 不可读取\n");
  fs.symlinkSync(path.join(root, "outside/README.md"), path.join(root, "projects/demo/linked.md"));
  const original = app.documents(root, scope);
  const invalid = [null, false, [], "README.md", {}, { path: "" }, { path: "x".repeat(4001) },
    { path: "knowledge/docs/order.md", location: "" }, { path: "knowledge/docs/order.md", extra: true }];
  const unavailable = [{ path: "missing.md" }, { path: "docs/passwords.md" }, { path: "../../outside/README.md" },
    { path: "linked.md" }, { path: path.join(root, "outside/README.md") },
    { location: "other", path: "knowledge/docs/order.md" }];
  for (const entryDocument of [...invalid, ...unavailable]) {
    put("projects/demo/knowledge/index.yml", stringify({ ...prototype, entryDocument }));
    const listing = app.documents(root, scope);
    validateKnowledgeDocumentsResponse(listing);
    assert.equal(listing.entryDocumentId, null);
    assert.deepEqual(listing.documents.map(({ id }) => id), original.documents.map(({ id }) => id));
    assert.equal(listing.totalCount, 1);
    assert.equal(listing.truncated, false);
    assert.equal(listing.diagnostics.length, 1);
    assert.match(listing.diagnostics[0], /文档入口/);
    const detail = app.read(root, scope, "objects", "object");
    validateKnowledgeResponse(detail);
    assert.equal(detail.artifacts[0].content, "# 订单\n读取实现");
    assert.equal(Object.hasOwn(detail.index!, "entryDocument"), false);
    validateKnowledgeNavigationResponse(app.navigation(root, scope));
    validateKnowledgeCatalogResponse(app.catalog(root, scope));
  }
  const { entryDocumentId: _entry, ...missingEntry } = original;
  assert.throws(() => validateKnowledgeDocumentsResponse(missingEntry));
  assert.throws(() => validateKnowledgeDocumentsResponse({ ...original, entryDocumentId: { path: "README.md" } }));
});

test("阅读编排按章节与条目顺序显示，补充资料和新增文件均保留唯一身份", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  put("projects/demo/README.md", "# 项目说明\n");
  put("README.md", "# 工作空间说明\n");
  const original = app.documents(root, scope);
  const index = {
    ...structuredClone(prototype),
    documentSections: [
      { id: "use", title: "使用产品", summary: "先了解用途，再阅读示例。", entries: [
        { path: "knowledge/docs/order.md", title: "理解订单", summary: "认识订单职责。" },
        { location: "workspace", path: "README.md", title: "补充背景", summary: "", supplementary: true },
      ] },
      { id: "start", title: "开始使用", summary: "完成最小配置。", entries: [
        { path: "README.md", title: "配置项目", summary: "配置前需要了解什么。" },
      ] },
    ],
  };
  const encoded = stringify(index);
  put("projects/demo/knowledge/index.yml", encoded);
  const listing = app.documents(root, scope);
  validateKnowledgeDocumentsResponse(listing);
  assert.deepEqual(listing.sections, [
    { id: "use", title: "使用产品", summary: "先了解用途，再阅读示例。", count: 2 },
    { id: "start", title: "开始使用", summary: "完成最小配置。", count: 1 },
  ]);
  assert.equal(listing.totalCount, 3);
  assert.deepEqual(listing.documents.map(({ title, sectionId, supplementary }) => ({ title, sectionId, supplementary })), [
    { title: "理解订单", sectionId: "use", supplementary: false },
    { title: "补充背景", sectionId: "use", supplementary: true },
    { title: "配置项目", sectionId: "start", supplementary: false },
  ]);
  for (const document of listing.documents) {
    const found = original.documents.find((item) => item.id === document.id)!;
    assert.ok(found, "编排不另建文档身份");
    for (const key of ["path", "location", "group", "artifactId", "workspacePath"] as const)
      assert.equal(document[key], found[key]);
    const body = app.document(root, scope, document.id);
    validateKnowledgeDocumentResponse(body);
    assert.deepEqual(body.document, document);
  }
  assert.deepEqual(listing.diagnostics, []);
  assert.equal(fs.readFileSync(path.join(root, "projects/demo/knowledge/index.yml"), "utf8"), encoded);

  put("projects/demo/new-guide.md", "# 新增指南\n");
  const updated = app.documents(root, scope);
  assert.equal(updated.totalCount, 4);
  assert.equal(new Set(updated.documents.map((item) => item.id)).size, 4);
  assert.equal(updated.documents.at(-1)!.sectionId, "unorganized");
  assert.equal(updated.sections.at(-1)!.count, 1);
  assert.notEqual(updated.revision, listing.revision);
});

test("仅修改阅读元数据也会刷新目录版本，正文摘要和文件身份保持不变", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  const index = {
    ...structuredClone(prototype),
    documentSections: [{ id: "start", title: "开始", summary: "章节用途", entries: [
      { path: "knowledge/docs/order.md", title: "订单说明", summary: "文档用途", supplementary: false },
    ] }],
  };
  put("projects/demo/knowledge/index.yml", stringify(index));
  const before = app.documents(root, scope);
  const body = app.document(root, scope, before.documents[0].id);
  index.documentSections[0].title = "理解工作";
  index.documentSections[0].entries[0].title = "背景知识";
  index.documentSections[0].entries[0].summary = "提供解释与依据。";
  index.documentSections[0].entries[0].supplementary = true;
  put("projects/demo/knowledge/index.yml", stringify(index));
  const after = app.documents(root, scope);
  assert.notEqual(after.revision, before.revision);
  assert.equal(after.documents[0].id, before.documents[0].id);
  assert.equal(after.documents[0].title, "背景知识");
  assert.equal(after.documents[0].summary, "提供解释与依据。");
  assert.equal(after.documents[0].supplementary, true);
  const reread = app.document(root, scope, body.document.id);
  assert.equal(reread.digest, body.digest);
  assert.equal(reread.content, body.content);
  assert.deepEqual(reread.document, after.documents[0]);
});

test("无效、重复和越界编排只产生局部诊断，不扩大读取范围或影响主题投影", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  put("projects/demo/README.md", "# 项目说明\n");
  put("projects/demo/docs/passwords.md", "# 敏感内容\n");
  put("outside/README.md", "# 外部内容\n");
  const original = app.documents(root, scope);
  const index = {
    ...structuredClone(prototype),
    documentSections: [
      { id: "valid", title: "有效章节", summary: "", entries: [
        { path: "knowledge/docs/order.md", title: "有效标题", summary: "" },
        { path: "knowledge/docs/order.md", title: "重复标题", summary: "" },
        { path: "docs/missing.md", title: "不存在", summary: "" },
        { path: "docs/passwords.md", title: "敏感文件", summary: "" },
        { path: "../../outside/README.md", title: "越界文件", summary: "" },
        { location: "other", path: "README.md", title: "错误来源", summary: "" },
        { path: "README.md", title: "无效属性", summary: "", supplementary: "yes" },
      ] },
      { id: "valid", title: "重复章节", summary: "", entries: [] },
      { id: "unorganized", title: "保留标识", summary: "", entries: [] },
      { id: "invalid", title: "无效章节", entries: [] },
      { id: "empty", title: "空章节", summary: "", entries: [] },
      { id: "missing", title: "缺失章节", summary: "", entries: [
        { path: "missing.md", title: "不存在", summary: "" },
      ] },
    ],
  };
  put("projects/demo/knowledge/index.yml", stringify(index));
  const listing = app.documents(root, scope);
  validateKnowledgeDocumentsResponse(listing);
  assert.deepEqual(listing.documents.map((item) => item.id).sort(), original.documents.map((item) => item.id).sort());
  assert.equal(listing.totalCount, 2);
  assert.equal(listing.documents[0].title, "有效标题");
  assert.equal(listing.documents[1].sectionId, "unorganized");
  assert.equal(listing.documents[1].supplementary, false);
  assert.deepEqual(listing.sections.map(({ id, count }) => ({ id, count })), [
    { id: "valid", count: 1 }, { id: "unorganized", count: 1 },
  ]);
  assert.equal(listing.diagnostics.length, 10);
  assert.equal(listing.truncated, false, "无效编排不代表文件扫描不完整");
  const read = app.read(root, scope, "objects", "object");
  validateKnowledgeResponse(read);
  assert.equal(read.artifacts[0].content, "# 订单\n读取实现");
  assert.equal(Object.hasOwn(read.index!, "documentSections"), false, "主题响应保持闭合，不泄露未校验的阅读编排");
  validateKnowledgeNavigationResponse(app.navigation(root, scope));
  validateKnowledgeCatalogResponse(app.catalog(root, scope));

  put("projects/demo/knowledge/index.yml", stringify({ ...prototype, documentSections: "invalid" }));
  const malformed = app.documents(root, scope);
  assert.equal(malformed.totalCount, 2);
  assert.ok(malformed.documents.every((item) => item.sectionId === "unorganized"));
  assert.match(malformed.diagnostics.join("\n"), /编排必须为列表/);
  validateKnowledgeResponse(app.read(root, scope));
  validateKnowledgeNavigationResponse(app.navigation(root, scope));
  validateKnowledgeCatalogResponse(app.catalog(root, scope));

  put("projects/demo/knowledge/index.yml", stringify({ ...prototype, documentSections: [] }));
  const empty = app.documents(root, scope);
  assert.deepEqual(empty.diagnostics, []);
  assert.ok(empty.documents.every((item) => item.sectionId === "unorganized"));
});

test("阅读编排限制章节和条目数量，超过上限的实际文件仍保留在其他文档", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  const sections = Array.from({ length: 65 }, (_, index) => {
    const file = `guides/${index}.md`;
    put(`projects/demo/${file}`, `# 指南 ${index}\n`);
    return { id: `section-${index}`, title: `章节 ${index}`, summary: "", entries: [
      { path: file, title: `指南 ${index}`, summary: "" },
    ] };
  });
  put("projects/demo/knowledge/index.yml", stringify({ ...prototype, documentSections: sections }));
  const sectionLimit = app.documents(root, scope);
  validateKnowledgeDocumentsResponse(sectionLimit);
  assert.equal(sectionLimit.sections.length, 65, "64 个作者章节及其他文档");
  assert.equal(sectionLimit.totalCount, 66);
  assert.equal(sectionLimit.sections.at(-1)!.count, 2);
  assert.match(sectionLimit.diagnostics.join("\n"), /超过 64 组/);
  assert.equal(sectionLimit.documents.find((item) => item.path === "guides/64.md")!.sectionId, "unorganized");

  const entries = Array.from({ length: 1001 }, (_, index) => ({
    path: index === 1000 ? "knowledge/docs/order.md" : "guides/0.md", title: `条目 ${index}`, summary: "",
  }));
  put("projects/demo/knowledge/index.yml", stringify({ ...prototype,
    documentSections: [{ id: "limited", title: "条目上限", summary: "", entries }],
  }));
  const entryLimit = app.documents(root, scope);
  validateKnowledgeDocumentsResponse(entryLimit);
  assert.equal(entryLimit.totalCount, 66);
  assert.equal(entryLimit.sections[0].count, 1, "重复引用不重复计数");
  assert.equal(entryLimit.sections.at(-1)!.count, 65);
  assert.equal(entryLimit.documents.find((item) => item.path === "knowledge/docs/order.md")!.sectionId, "unorganized");
  assert.match(entryLimit.diagnostics.join("\n"), /超过 1000 条/);
});

test("文档目录连接项目、关联服务与公共说明，重叠真实范围去重且保留已有成果绑定", (t) => {
  const { root, put, app, catalog } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  catalog.repositories[0].source.path = "projects/demo";
  put("projects/demo/src/README.md", "# 服务源码说明\n");
  put("services/api/README.md", "# 服务资产说明\n");
  put("README.md", "# 工作空间\n");
  put("README.en.md", "# Workspace\n");
  put("CONTRIBUTING.md", "# 贡献约定\n");
  put("docs/guide.md", "# 公共指南\n");
  put("private-notes.md", "# 工作空间非公共笔记\n");
  put("projects/unrelated/README.md", "# 未关联项目\n");
  put("services/unrelated/README.md", "# 未关联服务\n");
  const indexBefore = fs.readFileSync(path.join(root, "projects/demo/knowledge/index.yml"), "utf8");
  const result = app.documents(root, scope);
  validateKnowledgeDocumentsResponse(result);
  assert.equal(result.totalCount, 7);
  assert.equal(new Set(result.documents.map((item) => item.id)).size, 7);
  assert.deepEqual(result.documents.map((item) => item.title).sort(), [
    "订单", "服务源码说明", "服务资产说明", "工作空间", "Workspace", "贡献约定", "公共指南",
  ].sort());
  assert.equal(result.documents.filter((item) => item.title === "服务源码说明").length, 1);
  const existing = result.documents.find((item) => item.title === "订单")!;
  assert.equal(existing.artifactId, "doc");
  assert.equal(existing.location, "scope");
  assert.equal(existing.workspacePath, "projects/demo/knowledge/docs/order.md");
  assert.equal(result.documents.find((item) => item.title === "服务资产说明")!.location, "service:s:assets");
  assert.equal(result.documents.find((item) => item.title === "公共指南")!.location, "workspace");
  assert.equal(result.documents.find((item) => item.title === "公共指南")!.workspacePath, "docs/guide.md");
  assert.equal(fs.readFileSync(path.join(root, "projects/demo/knowledge/index.yml"), "utf8"), indexBefore);

  const service = app.documents(root, { kind: "service", id: "s" });
  validateKnowledgeDocumentsResponse(service);
  assert.equal(service.scope.id, "s");
  assert.equal(service.documents.some((item) => item.title === "订单"), false, "服务目录不扩散到整个关联项目");
  assert.equal(service.documents.filter((item) => item.title === "服务源码说明").length, 1);
  assert.equal(app.document(root, { kind: "service", id: "s" }, service.documents.find((item) => item.title === "服务源码说明")!.id).content, "# 服务源码说明\n");
});

test("文档目录排除非阅读资产、敏感文件与符号链接，旧文件被替换后不能沿旧身份读取", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  const excluded = [
    ".local/note.md", "knowledge/.hidden.md", "openspec/specs/rule.md", "skills/method/SKILL.md",
    "rules/rule.md", "resources/help.md", "components/component.md", "node_modules/pkg/README.md",
    "build/result.md", "dist/result.md", "test/fixtures/sample.md", "test/__fixtures__/sample.md",
    "test/test-fixtures/sample.md", "knowledge/archive/old.md", "credentials/ordinary.md",
    "docs/passwords.md", "docs/secret-guide.md", "tokens/ordinary.md", "AGENTS.md", "SKILL.md",
  ];
  for (const file of excluded) put(`projects/demo/${file}`, "# 不应发现\n");
  put("projects/demo/docs/binary.md", "# 不是普通正文\0binary");
  put("outside/README.md", "# 外部私密正文\n");
  const project = path.join(root, "projects/demo");
  fs.symlinkSync(path.join(root, "outside/README.md"), path.join(project, "linked.md"));
  fs.symlinkSync(path.join(project, "knowledge/docs/order.md"), path.join(project, "same-scope-link.md"));
  fs.symlinkSync(path.join(root, "outside"), path.join(project, "linked-directory"), "dir");
  const result = app.documents(root, scope);
  assert.deepEqual(result.documents.map((item) => item.path), ["knowledge/docs/order.md"]);
  const originalId = result.documents[0].id;
  fs.unlinkSync(path.join(project, "knowledge/docs/order.md"));
  fs.symlinkSync(path.join(root, "outside/README.md"), path.join(project, "knowledge/docs/order.md"));
  assert.equal(app.documents(root, scope).totalCount, 0);
  assert.throws(() => app.document(root, scope, originalId), { code: "knowledge_document_missing" });
  assert.throws(() => app.document(root, scope, "../../outside/README.md"), { code: "knowledge_document_missing" });
});

test("文档正文读取继续限制大小和文本类型，目录契约拒绝夹带内容或内部路径", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  put("projects/demo/docs/large.md", `# 超限正文\n${"a".repeat(1024 * 1024)}`);
  put("projects/demo/docs/late-binary.md", `# 后段二进制\n${"a".repeat(9000)}\0`);
  const listing = app.documents(root, scope);
  const large = listing.documents.find((item) => item.path === "docs/large.md")!;
  const binary = listing.documents.find((item) => item.path === "docs/late-binary.md")!;
  assert.ok(large);
  assert.ok(binary);
  assert.throws(() => app.document(root, scope, large.id), { code: "knowledge_content_limit" });
  assert.throws(() => app.document(root, scope, binary.id), { code: "knowledge_binary_forbidden" });
  validateKnowledgeDocumentsResponse(listing);
  assert.throws(() => validateKnowledgeDocumentsResponse({ ...listing, files: { private: "/private" } }));
  assert.throws(() => validateKnowledgeDocumentsResponse({ ...listing,
    documents: [{ ...listing.documents[0], content: "正文不能夹在目录中" }],
  }));
  for (const totalCount of [-1, 1001, 1.5, "1"])
    assert.throws(() => validateKnowledgeDocumentsResponse({ ...listing, totalCount }));
  const valid = listing.documents.find((item) => item.path === "knowledge/docs/order.md")!;
  const read = app.document(root, scope, valid.id);
  assert.throws(() => validateKnowledgeDocumentResponse({ ...read, root }));
});

test("文档数量达到发现上限时返回局部计数与明确截断，深层目录也不能假报完整", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  const deepPath = Array.from({ length: 34 }, (_, i) => `level-${i}`).join("/");
  put(`projects/demo/${deepPath}/deep.md`, "# 深层文件\n");
  const deep = app.documents(root, scope);
  assert.equal(deep.documents.some((item) => item.title === "深层文件"), false);
  assert.equal(deep.truncated, true, "未扫描的深层范围必须明确标记为截断");
  assert.match(deep.diagnostics.join("\n"), /层级/);
  fs.rmSync(path.join(root, "projects/demo/level-0"), { recursive: true });
  for (let index = 0; index < 1001; index++) put(`projects/demo/manuals/entry-${index}.md`, `# 条目 ${index}\n`);
  const limited = app.documents(root, scope);
  validateKnowledgeDocumentsResponse(limited);
  assert.equal(limited.totalCount, 1000);
  assert.equal(limited.documents.length, 1000);
  assert.equal(limited.truncated, true);
  assert.match(limited.diagnostics.join("\n"), /扫描上限/);
});

test("大量非文档条目也受扫描预算约束，不能以零篇文档假报已发现全部", (t) => {
  const { root, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  const project = path.join(root, "projects/demo");
  const entries = path.join(project, "generated-input");
  fs.mkdirSync(entries);
  for (let index = 0; index < 20001; index++) fs.writeFileSync(path.join(entries, `${index}.txt`), "");
  const listing = app.documents(root, scope);
  validateKnowledgeDocumentsResponse(listing);
  assert.equal(listing.truncated, true);
  assert.match(listing.diagnostics.join("\n"), /扫描上限/);
  assert.equal(listing.totalCount, listing.documents.length);
  assert.ok(listing.totalCount < 1000, "条目预算与文档数量上限是两条独立边界");
});

test('实际正文引用无需登记，逐步核对当前链接并拒绝伪造、越界及符号链接', t => {
  const { root, put, app } = setup(t);
  put('projects/demo/knowledge/docs/order.md', '# 订单\n[规则](../../AGENTS.md#边界)\n[链接](alias.md)\n[凭证](../../secret.md)\n[越界](../../../../outside.md)\n```md\n[伪造](../../other.md)\n```\n');
  put('projects/demo/AGENTS.md', '# 规则\n## 边界\n[另一条](knowledge/docs/next.md)\n');
  put('projects/demo/knowledge/docs/next.md', '# 接续\n当前内容');
  put('projects/demo/other.md', '不允许');
  put('projects/demo/secret.md', '不允许');
  fs.symlinkSync(path.join(root, 'projects/demo/AGENTS.md'), path.join(root, 'projects/demo/knowledge/docs/alias.md'));
  const reference = { kind: 'artifact' as const, id: 'doc', links: ['../../AGENTS.md#边界'] };
  const read = app.reference(root, { kind: 'project', id: 'demo' }, reference);
  assert.equal(read.path, 'AGENTS.md');
  assert.match(read.content!, /## 边界/);
  assert.equal(app.reference(root, { kind: 'project', id: 'demo' }, { ...reference, links: [...reference.links, 'knowledge/docs/next.md'] }).path, 'knowledge/docs/next.md');
  for (const href of ['../../other.md', 'alias.md', '../../secret.md', '../../../../outside.md'])
    assert.throws(() => app.reference(root, { kind: 'project', id: 'demo' }, { ...reference, links: [href] }), /引用|路径|读取/);
  put('projects/demo/knowledge/docs/order.md', '# 订单\n链接已移除');
  assert.throws(() => app.reference(root, { kind: 'project', id: 'demo' }, reference), /当前正文/);
});

test('本地图片引用只交付类型匹配的有界图片，普通文档入口仍不支持任意文件', t => {
  const { root, put, app } = setup(t);
  put('projects/demo/knowledge/docs/order.md', '# 图片\n![有效](photo.png)\n![伪装](fake.png)\n![远程](https://example.com/image.png)\n![矢量](image.svg)\n');
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(path.join(root, 'projects/demo/knowledge/docs/photo.png'), bytes);
  put('projects/demo/knowledge/docs/fake.png', '<script>bad()</script>');
  put('projects/demo/knowledge/docs/image.svg', '<svg><script>bad()</script></svg>');
  const reference = { kind: 'artifact' as const, id: 'doc', links: ['photo.png'] };
  const value = app.reference(root, { kind: 'project', id: 'demo' }, reference, true);
  assert.equal(value.contentType, 'image/png');
  assert.deepEqual(value.bytes, bytes);
  for (const href of ['fake.png', 'https://example.com/image.png', 'image.svg'])
    assert.throws(() => app.reference(root, { kind: 'project', id: 'demo' }, { ...reference, links: [href] }, true));
  const documents = app.documents(root, { kind: 'project', id: 'demo' });
  const document = documents.documents.find(item => item.path === 'knowledge/docs/order.md')!;
  assert.deepEqual(app.reference(root, { kind: 'project', id: 'demo' }, { ...reference, kind: 'document', id: document.id }, true).bytes, bytes);
  const http = createKnowledgeHttpContribution(app);
  let delivered: Buffer | undefined;
  const result = http.handle({ request: { method: 'GET' }, root, suffix: '/knowledge/project/demo/reference/image', searchParams: new URLSearchParams({ reference: JSON.stringify(reference) }), respond: { diagramHtml() {}, binary(content, type) { delivered = content; assert.equal(type, 'image/png'); } } });
  assert.equal(result, true);
  assert.deepEqual(delivered, bytes);
  assert.throws(() => http.handle({ request: { method: 'GET' }, root, suffix: '/knowledge/project/demo/reference', searchParams: new URLSearchParams({ reference: JSON.stringify({ ...reference, links: Array(13).fill('photo.png') }) }), respond: { diagramHtml() {} } }), /无效/);
});

test('引用保留点路径和编码空格，行内代码与未闭合围栏不能授权读取', t => {
  const { root, put, app } = setup(t);
  put('projects/demo/knowledge/docs/order.md', '# 来源\n[实际](./name%20space.md)\n`[示例](inline.md)`\n```md\n[示例](unclosed.md)\n');
  for (const file of ['name space.md', 'inline.md', 'unclosed.md']) put(`projects/demo/knowledge/docs/${file}`, '# 实际文件');
  const read = (href: string) => app.reference(root, { kind: 'project', id: 'demo' }, { kind: 'artifact', id: 'doc', links: [href] });
  assert.equal(read('./name%20space.md').path, 'knowledge/docs/name space.md');
  for (const href of ['inline.md', 'unclosed.md', 'name%20space.md']) assert.throws(() => read(href), /当前正文/);
  put('projects/demo/src/order.ts', '// [示例](../knowledge/docs/inline.md)');
  assert.throws(() => app.reference(root, { kind: 'project', id: 'demo' }, { kind: 'source', id: 'code', links: ['../knowledge/docs/inline.md'] }), /仅 Markdown/);
});

test('工作空间公共文档中的引用不能读取未关联项目', t => {
  const { root, put, app } = setup(t);
  put('README.md', '# 公共入口\n[当前](projects/demo/AGENTS.md)\n[其他](projects/private/guide.md)');
  put('projects/demo/AGENTS.md', '# 当前规则');
  put('projects/private/guide.md', '# 其他项目');
  const id = app.documents(root, { kind: 'project', id: 'demo' }).documents.find(item => item.location === 'workspace' && item.path === 'README.md')!.id;
  const reference = { kind: 'document' as const, id, links: ['projects/demo/AGENTS.md'] };
  assert.match(app.reference(root, { kind: 'project', id: 'demo' }, reference).content!, /当前规则/);
  assert.throws(() => app.reference(root, { kind: 'project', id: 'demo' }, { ...reference, links: ['projects/private/guide.md'] }), /不属于当前范围/);
});
