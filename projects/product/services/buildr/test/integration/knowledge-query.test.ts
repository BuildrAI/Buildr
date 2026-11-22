import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { parseKnowledgeIndex, type KnowledgeIndex } from '../../src/modules/knowledge/domain/knowledge-index.ts';
import { digest, readKnowledgeFile } from '../../src/modules/knowledge/infrastructure/knowledge-files.ts';
import { validateKnowledgeCatalogResponse, validateKnowledgeNavigationResponse, validateKnowledgeResponse } from '../../src/modules/knowledge/interfaces/http/knowledge-http-contracts.ts';
import { prototype, setup, catalogIndex } from '../helpers/knowledge-query-fixture.ts';

test("入口对象可选且只接受已有主题身份，旧索引和详情响应仍兼容", (t) => {
  const old = parseKnowledgeIndex(stringify(prototype));
  assert.equal(Object.hasOwn(old, "entryObject"), false);
  for (const entryObject of [null, "", "missing", "doc", "code", "../object", 1, {}, []]) {
    assert.throws(() => parseKnowledgeIndex(stringify({ ...prototype, entryObject })), {
      code: "knowledge_index_invalid",
    });
  }
  const { root, put, app } = setup(t);
  const index = { ...prototype, entryObject: "object" };
  assert.equal(parseKnowledgeIndex(stringify(index)).entryObject, "object");
  put("projects/demo/knowledge/index.yml", stringify(index));
  const detail = app.read(root, { kind: "project", id: "demo" }, "objects", "object");
  validateKnowledgeResponse(detail);
  assert.equal(detail.index?.entryObject, "object");
  assert.equal(detail.artifacts[0].content, "# 订单\n读取实现");
});

test("主题导航完整保留超过首批的主题顺序和父关系，只读索引且响应闭合", (t) => {
  const { root, put, app } = setup(t);
  const index = catalogIndex();
  index.objects.push(...Array.from({ length: 43 }, (_, position) => ({
    id: `topic-${position}`, title: `主题 ${position}`, summary: `主题说明 ${position}`, parent: "object",
  })));
  index.entryObject = "topic-30";
  put("projects/demo/knowledge/index.yml", stringify(index));
  const indexPath = path.join(root, "projects/demo/knowledge/index.yml");
  const before = fs.readFileSync(indexPath, "utf8");
  const opens: string[] = [];
  const originalOpen = fs.openSync;
  t.mock.method(fs, "openSync", (...args: Parameters<typeof fs.openSync>) => {
    opens.push(String(args[0]));
    return originalOpen(...args);
  });
  const result = app.navigation(root, { kind: "project", id: "demo" });
  validateKnowledgeNavigationResponse(result);
  assert.equal(result.scope.id, "p");
  assert.equal(result.revision, digest(before));
  assert.equal(result.entryObject, "topic-30");
  assert.equal(result.artifactCount, 48);
  assert.deepEqual(result.topics, index.objects.map((topic) => ({ ...topic, parent: topic.parent ?? null })));
  assert.equal(result.topics.length, 45);
  assert.deepEqual(result.artifacts, index.artifacts.map(({ id, title, kind, path, objects }) => ({ id, title, kind, path, objects })));
  assert.equal(result.artifacts.length, 48, "导航包含所有类别，不受分页大小影响");
  assert.deepEqual(new Set(result.artifacts.map(({ kind }) => kind)), new Set(["document", "diagram", "code-map", "terms"]));
  assert.equal(Object.hasOwn(result.artifacts[0], "summary"), false, "主题长说明只在主题摘要中保存一份");
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(opens, [fs.realpathSync(indexPath)]);
  assert.equal(fs.readFileSync(indexPath, "utf8"), before);
  assert.throws(() => validateKnowledgeNavigationResponse({ ...result, index }));
  assert.throws(() => validateKnowledgeNavigationResponse({
    ...result, topics: [{ ...result.topics[0], content: "正文不属于导航" }],
  }));
  for (const extra of [{ content: "正文不属于导航" }, { sources: ["code"] }, { summary: "不重复主题摘要" }])
    assert.throws(() => validateKnowledgeNavigationResponse({ ...result, artifacts: [{ ...result.artifacts[0], ...extra }] }));
  assert.throws(() => validateKnowledgeNavigationResponse({ ...result, artifacts: Array.from({ length: 501 }, () => result.artifacts[0]) }));
  const { artifacts: _artifacts, ...withoutArtifacts } = result;
  assert.throws(() => validateKnowledgeNavigationResponse(withoutArtifacts));
  const { parent: _parent, ...incomplete } = result.topics[0];
  assert.throws(() => validateKnowledgeNavigationResponse({ ...result, topics: [incomplete] }));
  const { artifactCount: _artifactCount, ...withoutCount } = result;
  assert.throws(() => validateKnowledgeNavigationResponse(withoutCount));
  for (const artifactCount of [-1, 501, 1.5, "1", null])
    assert.throws(() => validateKnowledgeNavigationResponse({ ...result, artifactCount }));
  validateKnowledgeNavigationResponse({ ...result, artifactCount: 500 });
});

test("导航成果总数包含仅有技术图、地图或术语的范围，空索引返回零", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  const nonDocuments = catalogIndex().artifacts.filter(artifact => artifact.kind !== "document");
  for (const artifacts of [...nonDocuments.map(artifact => [artifact]), nonDocuments, []]) {
    put("projects/demo/knowledge/index.yml", stringify({ ...prototype, artifacts }));
    const result = app.navigation(root, scope);
    validateKnowledgeNavigationResponse(result);
    assert.equal(result.artifactCount, artifacts.length);
    assert.deepEqual(result.artifacts.map(({ id }) => id), artifacts.map(({ id }) => id));
    assert.equal(app.catalog(root, scope).matchingCount, artifacts.filter(artifact => artifact.kind === "terms").length, "术语纳入说明分类，图与地图保持独立");
  }
  put("projects/demo/knowledge/index.yml", stringify({ ...prototype, objects: [], artifacts: [], sources: [] }));
  const empty = app.navigation(root, scope);
  validateKnowledgeNavigationResponse(empty);
  assert.equal(empty.artifactCount, 0);
  assert.equal(empty.entryObject, null);
  assert.deepEqual(empty.topics, []);
  assert.deepEqual(empty.artifacts, []);
  assert.equal(typeof empty.revision, "string");
});

test("导航只投射文章承载图与地图的有界关系，保留地图内嵌图且不读取正文", (t) => {
  const { root, put, app } = setup(t);
  const diagram = { ...prototype.artifacts[0], id: "diagram", title: "订单图", kind: "diagram" as const, path: "knowledge/order.html" };
  const map = { ...prototype.artifacts[0], id: "map", title: "订单代码地图", kind: "code-map" as const, path: "knowledge/code-map/order.md" };
  const terms = { ...prototype.artifacts[0], id: "terms", title: "订单术语", kind: "terms" as const, path: "knowledge/docs/terms.md" };
  const expected = [
    { from: "doc", to: "diagram", kind: "contains" },
    { from: "doc", to: "map", kind: "contains" },
    { from: "map", to: "diagram", kind: "contains" },
    { from: "doc", to: "diagram", kind: "guides" },
    { from: "doc", to: "map", kind: "guides" },
    { from: "terms", to: "map", kind: "contains" },
    { from: "terms", to: "diagram", kind: "guides" },
  ] as const;
  const index: KnowledgeIndex = {
    ...prototype,
    artifacts: [...prototype.artifacts, diagram, map, terms],
    relations: [
      ...expected,
      { from: "doc", to: "diagram", kind: "explains" },
      { from: "object", to: "diagram", kind: "contains" },
      { from: "diagram", to: "doc", kind: "contains" },
      { from: "doc", to: "code", kind: "contains" },
      { from: "doc", to: "doc", kind: "contains" },
      { from: "map", to: "map", kind: "contains" },
      { from: "map", to: "terms", kind: "contains" },
      { from: "map", to: "diagram", kind: "guides" },
      { from: "diagram", to: "map", kind: "guides" },
      { from: "doc", to: "doc", kind: "guides" },
    ],
  };
  put("projects/demo/knowledge/index.yml", stringify(index, { aliasDuplicateObjects: false }));
  const opens: string[] = [], originalOpen = fs.openSync;
  t.mock.method(fs, "openSync", (...args: Parameters<typeof fs.openSync>) => {
    opens.push(String(args[0]));
    return originalOpen(...args);
  });
  const result = app.navigation(root, { kind: "project", id: "demo" });
  validateKnowledgeNavigationResponse(result);
  assert.deepEqual(result.relations, expected);
  assert.equal(result.artifactCount, 4, "原始登记数量仍用于已有知识判断");
  assert.equal(result.artifacts.length, 4, "图与地图登记保留以支持原身份定位");
  assert.deepEqual(opens, [fs.realpathSync(path.join(root, "projects/demo/knowledge/index.yml"))]);
  const { relations: _relations, ...legacy } = result;
  validateKnowledgeNavigationResponse(legacy);
  for (const relations of [
    [{ from: "doc", to: "diagram", kind: "explains" }],
    [{ from: "doc", to: "diagram", kind: "contains", content: "不可夹带正文" }],
    Array.from({ length: 501 }, () => result.relations[0]),
  ]) assert.throws(() => validateKnowledgeNavigationResponse({ ...result, relations }));
});

test("知识目录按索引原序返回 20/20/6 项摘要且不读取正文和来源", (t) => {
  const { root, put, app } = setup(t);
  const index = catalogIndex();
  put("projects/demo/knowledge/index.yml", stringify(index));
  const indexPath = path.join(root, "projects/demo/knowledge/index.yml");
  const before = fs.readFileSync(indexPath, "utf8");
  const opens: string[] = [];
  const originalOpen = fs.openSync;
  t.mock.method(fs, "openSync", (...args: Parameters<typeof fs.openSync>) => {
    opens.push(String(args[0]));
    return originalOpen(...args);
  });
  const scope = { kind: "project" as const, id: "demo" };
  const first = app.catalog(root, scope);
  const second = app.catalog(root, scope, { cursor: first.nextCursor });
  const last = app.catalog(root, scope, { cursor: second.nextCursor });
  for (const page of [first, second, last]) {
    validateKnowledgeCatalogResponse(page);
    assert.deepEqual(Object.keys(page).sort(), [
      "scope", "revision", "view", "query", "items", "matchingCount", "pageSize", "hasMore", "nextCursor", "diagnostics",
    ].sort());
    assert.equal(page.matchingCount, 46);
    assert.equal(page.pageSize, 20);
    assert.equal(page.revision, first.revision);
    for (const item of page.items) assert.deepEqual(Object.keys(item).sort(), [
      "id", "title", "kind", "path", "objects", "summary",
    ].sort());
  }
  assert.deepEqual([first.items.length, second.items.length, last.items.length], [20, 20, 6]);
  assert.deepEqual([first.hasMore, second.hasMore, last.hasMore], [true, true, false]);
  assert.equal(last.nextCursor, null);
  assert.deepEqual([...first.items, ...second.items, ...last.items].map((item) => item.id),
    index.artifacts.filter((item) => item.kind === "document" || item.kind === "terms").map((item) => item.id));
  assert.equal(first.items[0].summary, "订单职责与 transaction · reconciliation 对账");
  assert.deepEqual(opens, Array(3).fill(fs.realpathSync(indexPath)));
  assert.equal(fs.readFileSync(indexPath, "utf8"), before);
  assert.throws(() => validateKnowledgeCatalogResponse({ ...first, index }));
  assert.throws(() => validateKnowledgeCatalogResponse({
    ...first, items: [{ ...first.items[0], content: "not a catalog field" }],
  }));
});

test("知识目录分类、多词检索及规范化查询保留原有匹配范围", (t) => {
  const { root, put, app } = setup(t);
  put("projects/demo/knowledge/index.yml", stringify(catalogIndex()));
  const scope = { kind: "project" as const, id: "demo" };
  const filtered = app.catalog(root, scope, { q: "  BILLING\tREFUND  transaction 对账 " });
  assert.equal(filtered.query, "billing refund transaction 对账");
  assert.deepEqual(filtered.items.map((item) => item.id), ["doc-1"]);
  assert.equal(filtered.nextCursor, null);
  assert.deepEqual(app.catalog(root, scope, { q: "docs/order-30.md" }).items.map((item) => item.id), ["doc-30"]);
  assert.equal(app.catalog(root, scope, { q: "missing" }).matchingCount, 0);
  assert.deepEqual(app.catalog(root, scope, { view: "diagrams" }).items.map((item) => item.id), ["diagram"]);
  assert.deepEqual(app.catalog(root, scope, { view: "maps" }).items.map((item) => item.id), ["map"]);
  assert.equal(app.catalog(root, scope, { pageSize: 100 }).items.length, 20);
  const first = app.catalog(root, scope, { q: " ORDERS   transaction ", pageSize: 10 });
  const second = app.catalog(root, scope, { q: "orders transaction", pageSize: "10", cursor: first.nextCursor });
  assert.equal(first.matchingCount, 46);
  assert.equal(second.items[0].id, "doc-11");
  for (const pageSize of [0, -1, 1.5, "2x", "", "Infinity"])
    assert.throws(() => app.catalog(root, scope, { pageSize }), { code: "knowledge_catalog_request_invalid", status: 400 });
  assert.throws(() => app.catalog(root, scope, { view: "sources" }), { code: "knowledge_catalog_request_invalid", status: 400 });
});

test("知识目录游标拒绝损坏、条件变化、跨范围和索引变化", (t) => {
  const { root, put, app, catalog } = setup(t);
  const index = catalogIndex();
  put("projects/demo/knowledge/index.yml", stringify(index));
  const scope = { kind: "project" as const, id: "demo" };
  const first = app.catalog(root, scope);
  const cursor = first.nextCursor!;
  const token = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  for (const value of ["", "not-json", `${cursor}=`, Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify({ ...token, offset: -1 })).toString("base64url"),
    Buffer.from(JSON.stringify({ ...token, offset: 1000 })).toString("base64url"),
  ]) assert.throws(() => app.catalog(root, scope, { cursor: value }), { code: "knowledge_catalog_cursor_invalid", status: 400 });
  for (const changed of [{ view: "maps" }, { q: "different" }, { pageSize: 10 }])
    assert.throws(() => app.catalog(root, scope, { ...changed, cursor }), { code: "knowledge_catalog_cursor_mismatch", status: 400 });
  catalog.projects.push({ ...catalog.projects[0], id: "p2", code: "other", source: { type: "workspace", path: "projects/other" } });
  put("projects/other/knowledge/index.yml", stringify({ ...index, scope: { kind: "project", id: "other" } }));
  assert.throws(() => app.catalog(root, { kind: "project", id: "other" }, { cursor }), { code: "knowledge_catalog_cursor_mismatch", status: 400 });
  const other = setup(t);
  other.put("projects/demo/knowledge/index.yml", stringify(index));
  assert.throws(() => other.app.catalog(other.root, scope, { cursor }), { code: "knowledge_catalog_cursor_mismatch", status: 400 });
  assert.equal(app.catalog(root, { kind: "project", id: "p" }, { cursor }).items[0].id, "doc-21");
  index.artifacts[0].title = "新的标题";
  put("projects/demo/knowledge/index.yml", stringify(index));
  assert.throws(() => app.catalog(root, scope, { cursor }), { code: "knowledge_catalog_changed", status: 409 });
  assert.equal(app.catalog(root, scope).items[0].title, "新的标题");
  fs.unlinkSync(path.join(root, "projects/demo/knowledge/index.yml"));
  assert.throws(() => app.catalog(root, scope, { cursor }), { code: "knowledge_catalog_changed", status: 409 });
  const absent = app.catalog(root, scope);
  validateKnowledgeCatalogResponse(absent);
  assert.equal(absent.revision, null);
  assert.deepEqual(absent.items, []);
  assert.equal(absent.matchingCount, 0);
  assert.equal(absent.hasMore, false);
  assert.equal(absent.nextCursor, null);
  assert.deepEqual(absent.diagnostics, []);
  assert.equal(app.read(root, scope).index, null);
});

test("再次读取显示当前正文与来源，无需更新旧摘要且读取不写索引", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  const indexPath = path.join(root, "projects/demo/knowledge/index.yml");
  const original = fs.readFileSync(indexPath, "utf8");
  const first = app.read(root, scope, "objects", "object");
  validateKnowledgeResponse(first);
  assert.equal(first.observations[0].status, "readable");
  assert.equal(first.observations[0].content, null);
  put("projects/demo/src/order.ts", "export const order = 2;");
  put("projects/demo/knowledge/docs/order.md", "# 当前正文\n本地文件已修改。");
  const latest = app.read(root, scope, "objects", "object");
  validateKnowledgeResponse(latest);
  assert.equal(
    latest.observations[0].status,
    "readable",
  );
  assert.equal(latest.artifacts[0].content, "# 当前正文\n本地文件已修改。");
  assert.equal(latest.artifacts[0].status, "readable");
  assert.equal(latest.observations[0].digest, digest("export const order = 2;"));
  assert.equal(app.read(root, scope, "sources", "code").observations[0].content, "export const order = 2;");
  assert.equal(fs.readFileSync(indexPath, "utf8"), original);
  assert.equal(fs.readFileSync(path.join(root, "projects/demo/knowledge/docs/order.md"), "utf8"), latest.artifacts[0].content);
  fs.unlinkSync(path.join(root, "projects/demo/src/order.ts"));
  const missing = app.read(root, scope, "objects", "object");
  assert.equal(missing.observations[0].status, "missing");
  assert.equal(missing.artifacts[0].content, latest.artifacts[0].content);
  assert.equal(missing.artifacts[0].status, "readable");
  assert.equal(fs.readFileSync(indexPath, "utf8"), original);
  put("projects/demo/src/new.ts", "new implementation");
  const updated = structuredClone(prototype);
  updated.sources[0].path = "src/new.ts";
  put("projects/demo/knowledge/index.yml", stringify(updated));
  assert.equal(
    app.read(root, scope, "sources", "code").observations[0].content,
    "new implementation",
  );
  assert.equal(
    app.read(root, scope, "objects", "object").observations[0].status,
    "readable",
  );
});

test("旧正文、来源和图源摘要均不影响当前可读性，自引用索引无需特殊核对", (t) => {
  const { root, put, app } = setup(t);
  const index = structuredClone(prototype);
  index.artifacts[0].observedDigest = digest("old document");
  index.artifacts[0].graphSource = "knowledge/graph.json";
  index.artifacts[0].graphDigest = digest("old graph");
  index.sources.push({ id: "navigation-index", title: "当前索引", kind: "evidence", path: "knowledge/index.yml", observedDigest: digest("old index") });
  index.artifacts[0].sources.push("navigation-index");
  const original = stringify(index);
  put("projects/demo/knowledge/index.yml", original);
  put("projects/demo/knowledge/graph.json", '{"version":1}');
  const first = app.read(root, { kind: "project", id: "demo" }, "artifacts", "doc");
  validateKnowledgeResponse(first);
  assert.equal(first.artifacts[0].status, "readable");
  assert.equal(first.artifacts[0].graph!.status, "readable");
  assert.equal(first.artifacts[0].graph!.content, '{"version":1}');
  assert.ok(first.observations.every((entry) => entry.status === "readable"));
  put("projects/demo/knowledge/graph.json", '{"version":2}');
  const next = app.read(root, { kind: "project", id: "demo" }, "artifacts", "doc");
  assert.equal(next.artifacts[0].graph!.content, '{"version":2}');
  assert.equal(next.artifacts[0].graph!.digest, digest('{"version":2}'));
  assert.equal(next.artifacts[0].graph!.status, "readable");
  fs.unlinkSync(path.join(root, "projects/demo/knowledge/graph.json"));
  const missing = app.read(root, { kind: "project", id: "demo" }, "artifacts", "doc");
  assert.equal(missing.artifacts[0].graph!.status, "missing");
  assert.equal(missing.artifacts[0].status, "readable");
  assert.equal(fs.readFileSync(path.join(root, "projects/demo/knowledge/index.yml"), "utf8"), original);
});

test("错误路径、凭证、二进制、超限及符号链接仅影响相关来源", (t) => {
  const { root, put, app } = setup(t);
  put("outside.txt", "private");
  put("projects/demo/src/binary.ts", "abc\0def");
  put("projects/demo/src/large.ts", "a".repeat(1024 * 1024 + 1));
  put("projects/demo/src/secrets.json", "private");
  put("projects/demo/credentials/ordinary.ts", "private");
  fs.symlinkSync(
    path.join(root, "projects/demo/credentials/ordinary.ts"),
    path.join(root, "projects/demo/src/alias.ts"),
  );
  assert.throws(() =>
    readKnowledgeFile(path.join(root, "projects/demo"), "src/alias.ts"),
  );

  fs.symlinkSync(
    path.join(root, "outside.txt"),
    path.join(root, "projects/demo/src/linked.ts"),
  );
  for (const file of [
    "../../outside.txt",
    "/etc/passwd",
    "src/binary.ts",
    "src/large.ts",
    "src/secrets.json",
    "src/linked.ts",
    ".env",
  ])
    assert.throws(
      () => readKnowledgeFile(path.join(root, "projects/demo"), file),
      file,
    );
  const changed = structuredClone(prototype);
  changed.sources.push({
    id: "bad",
    title: "越界",
    kind: "code",
    path: "../../outside.txt",
  });
  changed.artifacts[0].sources.push("bad");
  put("projects/demo/knowledge/index.yml", stringify(changed));
  const result = app.read(
    root,
    { kind: "project", id: "demo" },
    "objects",
    "object",
  );
  assert.equal(result.observations[0].status, "readable");
  assert.equal(result.observations[1].content, null);
  assert.equal(result.observations[1].status, "unreadable");
});

test("共享服务唯一归属，分支实例与项目限制由登记身份决定", (t) => {
  const { root, put, app, catalog } = setup(t);
  put(
    "services/api/knowledge/index.yml",
    stringify({
      ...prototype,
      scope: { kind: "service", id: "s" },
      sources: [{ ...prototype.sources[0], path: "order.ts" }],
    }),
  );
  put("services/api/knowledge/docs/order.md", "shared");
  put("repositories/repo/src/order.ts", "branch A");
  catalog.repositories.push({
    ...catalog.repositories[0],
    id: "r2",
    code: "repo-b",
    source: { type: "workspace", path: "repositories/repo-b" },
  });
  catalog.services.push({
    ...catalog.services[0],
    id: "s2",
    code: "api-b",
    repositoryId: "r2",
  });
  put("repositories/repo-b/src/order.ts", "branch B");
  put(
    "services/api-b/knowledge/index.yml",
    stringify({
      ...prototype,
      scope: { kind: "service", id: "s2" },
      sources: [{ ...prototype.sources[0], path: "order.ts" }],
    }),
  );
  assert.equal(
    app.read(root, { kind: "service", id: "s2" }, "sources", "code")
      .observations[0].content,
    "branch B",
  );
  assert.equal(
    app.read(root, { kind: "service", id: "s" }, "sources", "code")
      .observations[0].content,
    "branch A",
  );
  assert.equal(app.read(root, { kind: "service", id: "api" }).scope.id, "s");
  const cross = structuredClone(prototype);
  cross.sources[0] = {
    ...cross.sources[0],
    scope: { kind: "service", id: "s2" },
    path: "order.ts",
  };
  put("projects/demo/knowledge/index.yml", stringify(cross));
  assert.equal(
    app.read(root, { kind: "project", id: "demo" }, "sources", "code")
      .observations[0].status,
    "unreadable",
  );
  cross.sources[0].scope = { kind: "service", id: "s" };
  catalog.projects.push({
    ...catalog.projects[0],
    id: "p2",
    code: "other",
    source: { type: "workspace", path: "projects/other" },
  });
  put(
    "projects/other/knowledge/index.yml",
    stringify({ ...cross, scope: { kind: "project", id: "other" } }),
  );
  assert.equal(
    app.read(root, { kind: "project", id: "other" }, "sources", "code")
      .observations[0].content,
    "branch A",
  );

  put("projects/demo/knowledge/index.yml", stringify(cross));
  assert.equal(
    app.read(root, { kind: "project", id: "demo" }, "sources", "code")
      .observations[0].content,
    "branch A",
  );
});

test("索引重复身份、非法关系、循环层级拒绝，无索引保留未建设状态", (t) => {
  for (const mutate of [
    (i: KnowledgeIndex) => i.objects.push(i.objects[0]),
    (i: KnowledgeIndex) =>
      i.relations.push({ from: "object", to: "missing", kind: "explains" }),
    (i: KnowledgeIndex) => (i.objects[0].parent = "object"),
  ]) {
    const i = structuredClone(prototype);
    mutate(i);
    assert.throws(() => parseKnowledgeIndex(stringify(i)));
  }
  const { root, app } = setup(t);
  fs.unlinkSync(path.join(root, "projects/demo/knowledge/index.yml"));
  assert.equal(app.read(root, { kind: "project", id: "demo" }).index, null);
});

test("文件说明和成果文件保持独立关联，旧索引兼容且不接受未知文件标识",(t)=>{
 const {root,put,app}=setup(t); const index=structuredClone(prototype);
 index.sources.push({id:'article-file',title:'正文',kind:'evidence',path:'knowledge/docs/order.md',summary:'解释订单职责的实际架构文章。'});
 index.artifacts[0].files=['article-file'];
 put('projects/demo/knowledge/index.yml',stringify(index));
 const result=app.read(root,{kind:'project',id:'demo'},'artifacts','doc');validateKnowledgeResponse(result);
 assert.deepEqual(result.artifacts[0].sources,['code']);assert.deepEqual(result.artifacts[0].files,['article-file']);
 assert.ok(result.observations.some(o=>o.id==='article-file'));
 const source=app.read(root,{kind:'project',id:'demo'},'sources','article-file');
 assert.equal(source.index?.sources.find(s=>s.id==='article-file')?.summary,'解释订单职责的实际架构文章。');
 assert.equal(source.observations[0].content,'# 订单\n读取实现');
 index.artifacts[0].files=['unknown'];assert.throws(()=>parseKnowledgeIndex(stringify(index)),/关联无效/);
 assert.ok(parseKnowledgeIndex(stringify(prototype)));
});

test("不同类别恰好同名身份仍需关联授权",(t)=>{
 const {root,put,app,catalog}=setup(t);
 catalog.services[0].id='p';catalog.projects[0].serviceIds=[];
 put('repositories/repo/src/private.ts','private service source');
 const index=structuredClone(prototype);index.sources[0].scope={kind:'service',id:'p'};index.sources[0].path='private.ts';
 put('projects/demo/knowledge/index.yml',stringify(index));
 const result=app.read(root,{kind:'project',id:'demo'},'sources','code');
 assert.equal(result.observations[0].status,'unreadable');assert.equal(result.observations[0].content,null);assert.match(result.observations[0].diagnostic||'',/不属于当前项目关联/);
});
