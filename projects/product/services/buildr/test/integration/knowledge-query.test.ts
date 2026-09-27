import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { stringify } from "yaml";
import { createKnowledgeQuery } from "../../src/modules/knowledge/application/knowledge-query.ts";
import {
  parseKnowledgeIndex,
  type KnowledgeIndex,
} from "../../src/modules/knowledge/domain/knowledge-index.ts";
import {
  digest,
  readKnowledgeFile,
} from "../../src/modules/knowledge/infrastructure/knowledge-files.ts";
import {
  validateKnowledgeCatalogResponse,
  validateKnowledgeDocumentResponse,
  validateKnowledgeDocumentsResponse,
  validateKnowledgeNavigationResponse,
  validateKnowledgeResponse,
} from "../../src/modules/knowledge/interfaces/http/knowledge-http-contracts.ts";
import { createKnowledgeHttpContribution } from "../../src/modules/knowledge/interfaces/http/knowledge-http.ts";
const prototype: KnowledgeIndex = {
  schemaVersion: "buildr.knowledge-index/v1",
  scope: { kind: "project", id: "demo" },
  objects: [{ id: "object", title: "订单", summary: "订单职责" }],
  sources: [
    {
      id: "code",
      title: "实现",
      kind: "code",
      path: "src/order.ts",
      observedDigest: digest("export const order = 1;"),
    },
  ],
  artifacts: [
    {
      id: "doc",
      title: "说明",
      kind: "document",
      path: "knowledge/docs/order.md",
      objects: ["object"],
      sources: ["code"],
    },
  ],
  relations: [],
};
function setup(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "buildr-knowledge-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (file: string, content: string) => {
    const p = path.join(root, file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  put("projects/demo/knowledge/index.yml", stringify(prototype));
  put("projects/demo/knowledge/docs/order.md", "# 订单\n读取实现");
  put("projects/demo/src/order.ts", "export const order = 1;");
  const catalog = {
    projects: [
      {
        id: "p",
        workspaceId: "w",
        code: "demo",
        name: "示例",
        description: "",
        source: { type: "workspace", path: "projects/demo" },
        serviceIds: ["s"],
      },
    ],
    services: [
      {
        id: "s",
        workspaceId: "w",
        code: "api",
        name: "共享服务",
        description: "",
        type: "backend",
        repositoryId: "r",
        modulePath: "src",
      },
    ],
    repositories: [
      {
        id: "r",
        workspaceId: "w",
        code: "repo",
        name: "repo",
        description: "",
        source: { type: "workspace" as const, path: "repositories/repo" },
      },
    ],
  };
  const app = createKnowledgeQuery({
    assetCatalog: () => catalog,
    skillFile: () => ({ content: "skill" }),
    skillDetail: () => ({
      skill: {
        id: "skill",
        sourcePath: "skills/test",
        title: "真实技能详情",
        enabled: true,
      },
    }),
  });
  return { root, put, app, catalog };
}
function catalogIndex(): KnowledgeIndex {
  return {
    ...structuredClone(prototype),
    objects: [
      { id: "object", title: "订单 Orders", summary: "订单职责与 transaction" },
      { id: "billing", title: "Billing", summary: "reconciliation 对账" },
    ],
    artifacts: [
      ...Array.from({ length: 45 }, (_, index) => ({
        ...structuredClone(prototype.artifacts[0]),
        id: `doc-${index + 1}`,
        title: index === 0 ? "Refund ROUTE" : `订单说明 ${45 - index}`,
        path: `knowledge/docs/${index === 0 ? "refund" : `order-${index + 1}`}.md`,
        objects: index === 0 ? ["object", "billing"] : ["object"],
      })),
      { ...structuredClone(prototype.artifacts[0]), id: "diagram", kind: "diagram", path: "knowledge/flow.html" },
      { ...structuredClone(prototype.artifacts[0]), id: "map", kind: "code-map", path: "knowledge/code-map/order.md" },
      { ...structuredClone(prototype.artifacts[0]), id: "terms", kind: "terms", path: "knowledge/terms.md" },
    ],
  };
}

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
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(opens, [fs.realpathSync(indexPath)]);
  assert.equal(fs.readFileSync(indexPath, "utf8"), before);
  assert.throws(() => validateKnowledgeNavigationResponse({ ...result, index }));
  assert.throws(() => validateKnowledgeNavigationResponse({
    ...result, topics: [{ ...result.topics[0], content: "正文不属于导航" }],
  }));
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
    assert.equal(app.catalog(root, scope).matchingCount, artifacts.filter(artifact => artifact.kind === "terms").length, "术语纳入说明分类，图与地图保持独立");
  }
  put("projects/demo/knowledge/index.yml", stringify({ ...prototype, objects: [], artifacts: [], sources: [] }));
  const empty = app.navigation(root, scope);
  validateKnowledgeNavigationResponse(empty);
  assert.equal(empty.artifactCount, 0);
  assert.equal(empty.entryObject, null);
  assert.deepEqual(empty.topics, []);
  assert.equal(typeof empty.revision, "string");
});

test("主题导航 HTTP 使用当前项目或服务范围，旧索引与无索引不自动指定入口", (t) => {
  const { root, put, app } = setup(t);
  const http = createKnowledgeHttpContribution(app);
  const respond = { diagramHtml: () => assert.fail("navigation cannot render HTML") };
  const request = (suffix: string, method = "GET") => http.handle({ root, request: { method }, suffix, respond });
  const project = request("/knowledge/project/demo/navigation") as { status: number; body: ReturnType<typeof app.navigation> };
  assert.equal(project.status, 200);
  assert.equal(project.body.scope.id, "p");
  assert.equal(project.body.entryObject, null);
  assert.equal(project.body.artifactCount, 1);
  assert.equal(project.body.topics.length, 1);
  put("services/api/knowledge/index.yml", stringify({ ...prototype, scope: { kind: "service", id: "api" }, entryObject: "object" }));
  const service = request("/knowledge/service/s/navigation") as typeof project;
  validateKnowledgeNavigationResponse(service.body);
  assert.equal(service.body.scope.kind, "service");
  assert.equal(service.body.scope.id, "s");
  assert.equal(service.body.scope.directory, path.join(root, "services/api"));
  assert.equal(service.body.entryObject, "object");
  assert.equal(service.body.artifactCount, 1);
  assert.equal(request("/knowledge/project/demo/navigation", "POST"), null);
  assert.deepEqual(request("/knowledge/project/%2F/navigation"), { status: 400, body: { error: "knowledge_identity_invalid" } });
  fs.unlinkSync(path.join(root, "projects/demo/knowledge/index.yml"));
  const missing = request("/knowledge/project/p/navigation") as typeof project;
  validateKnowledgeNavigationResponse(missing.body);
  assert.equal(missing.body.revision, null);
  assert.equal(missing.body.entryObject, null);
  assert.equal(missing.body.artifactCount, 0);
  assert.deepEqual(missing.body.topics, []);
  assert.deepEqual(missing.body.diagnostics, []);
  assert.equal(fs.existsSync(path.join(root, "projects/demo/knowledge/index.yml")), false);
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

test("目录 HTTP 使用独立摘要协议，既有详情读取仍返回正文与关联", (t) => {
  const { root, put, app } = setup(t);
  const index = catalogIndex();
  put("projects/demo/knowledge/index.yml", stringify(index));
  put("projects/demo/knowledge/docs/refund.md", "# Refund\n正文内容");
  const http = createKnowledgeHttpContribution(app);
  const respond = { diagramHtml: () => assert.fail("catalog cannot render HTML") };
  const first = http.handle({ root, request: { method: "GET" }, suffix: "/knowledge/project/demo/catalog", respond,
    searchParams: new URLSearchParams("view=documents&pageSize=20") }) as { status: number; body: ReturnType<typeof app.catalog> };
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 20);
  validateKnowledgeCatalogResponse(first.body);
  const next = http.handle({ root, request: { method: "GET" }, suffix: "/knowledge/project/demo/catalog", respond,
    searchParams: new URLSearchParams({ view: "documents", pageSize: "20", cursor: first.body.nextCursor! }) }) as typeof first;
  assert.equal(next.body.items[0].id, "doc-21");
  assert.equal(http.handle({ root, request: { method: "POST" }, suffix: "/knowledge/project/demo/catalog", respond }), null);
  const detail = http.handle({ root, request: { method: "GET" }, suffix: "/knowledge/project/demo/artifacts/doc-1", respond }) as { status: number; body: ReturnType<typeof app.read> };
  assert.equal(detail.status, 200);
  validateKnowledgeResponse(detail.body);
  assert.equal(detail.body.artifacts[0].content, "# Refund\n正文内容");
  assert.equal(detail.body.index?.artifacts.length, 48);
  assert.equal(detail.body.observations[0].status, "readable");
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
test("HTTP GET 读取真实成果，图示经受限 HTML 响应，非读取动作不处理", (t) => {
  const { root, put, app } = setup(t);
  const index = structuredClone(prototype);
  index.artifacts[0].kind = "diagram";
  index.artifacts[0].path = "knowledge/diagram.html";
  put("projects/demo/knowledge/index.yml", stringify(index));
  put(
    "projects/demo/knowledge/diagram.html",
    '<html><body><svg viewBox="0 0 16 16"></svg><svg viewBox="0 0 1550 760" aria-labelledby="archify-diagram-title archify-diagram-description">diagram</svg></body></html>',
  );
  let html = "";
  const http = createKnowledgeHttpContribution(app);
  const respond = {
    diagramHtml: (value: string) => {
      html = value;
    },
  };
  assert.equal(
    http.handle({
      root,
      request: { method: "POST" },
      suffix: "/knowledge/project/demo",
      respond,
    }),
    null,
  );
  const result = http.handle({
    root,
    request: { method: "GET" },
    suffix: "/knowledge/project/demo/objects/object",
    respond,
  }) as { status: number; body: { artifacts: Array<{ content: null; diagramSize: { width: number; height: number } | null }> } };
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.artifacts[0].diagramSize, { width: 1550, height: 760 });
  assert.equal(result.body.artifacts[0].content, null);
  assert.throws(() => validateKnowledgeResponse({ ...result.body, artifacts: [
    { ...result.body.artifacts[0], diagramSize: { width: 0, height: 760 } },
  ] }));
  assert.equal(
    http.handle({
      root,
      request: { method: "GET" },
      suffix: "/knowledge/project/demo/artifacts/doc/view",
      respond,
    }),
    true,
  );
  assert.match(html, /diagram/);
});

test("图示尺寸来自当前主 SVG，缺失、非法及非图示尺寸局部回退", (t) => {
  const { root, put, app } = setup(t);
  const index = structuredClone(prototype);
  index.artifacts[0] = { ...index.artifacts[0], kind: "diagram", path: "knowledge/diagram.html", graphSource: "knowledge/graph.json" };
  put("projects/demo/knowledge/index.yml", stringify(index));
  put("projects/demo/knowledge/graph.json", '{"meta":{"viewBox":[10,10]}}');
  const read = () => app.read(root, { kind: "project", id: "demo" }, "objects", "object").artifacts[0];
  for (const [viewBox, expected] of [
    ["0 0 1080 688", { width: 1080, height: 688 }],
    ["-10, -20, 1.38e3, 740", { width: 1380, height: 740 }],
    ["0 0 0 740", null], ["0 0 1380 -740", null],
    ["0 0 Infinity 740", null], ["0 0 1e999 740", null],
    ["0 0 0x500 740", null], ["1380 740", null], ["", null],
  ] as const) {
    put("projects/demo/knowledge/diagram.html", `<svg aria-labelledby='archify-diagram-title' viewBox='${viewBox}'></svg>`);
    assert.deepEqual(read().diagramSize, expected, viewBox);
  }
  for (const html of ['<svg viewBox="0 0 1380 740"></svg>', '<svg aria-labelledby="archify-diagram-title"></svg>']) {
    put("projects/demo/knowledge/diagram.html", html);
    assert.equal(read().diagramSize, null);
  }
  fs.unlinkSync(path.join(root, "projects/demo/knowledge/diagram.html"));
  assert.equal(read().diagramSize, null);
  assert.equal(read().status, "missing");
  index.artifacts[0].kind = "document";
  put("projects/demo/knowledge/index.yml", stringify(index));
  put("projects/demo/knowledge/diagram.html", '<svg aria-labelledby="archify-diagram-title" viewBox="0 0 1380 740"></svg>');
  assert.equal(read().diagramSize, null);
});

test("技能详情附加字段保持窄读取协议", (t) => {
  const { root, put, app } = setup(t);
  const index = structuredClone(prototype);
  index.sources[0] = {
    id: "code",
    title: "方法",
    kind: "skill",
    skillId: "skill",
    path: "SKILL.md",
  };
  put("projects/demo/knowledge/index.yml", stringify(index));
  const result = app.read(
    root,
    { kind: "project", id: "demo" },
    "sources",
    "code",
  );
  validateKnowledgeResponse(result);
  assert.equal(result.observations[0].content, "skill");
});

test("生产 HTTP 宿主允许知识地址刷新，隔离图示不放宽页面策略", async (t) => {
  const { copyPreparedProjectWorkspace } =
    await import("../helpers/prepared-fixtures.ts");
  const { createRuntime, runtimeProvide } =
    await import("../../src/bootstrap/runtime.ts");
  const { createLocalWorkspaceServer } =
    await import("../../src/web/http/server.ts");
  const { base, root } = copyPreparedProjectWorkspace(t, "knowledge-http");
  const previous = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, "app-data");
  t.after(() => {
    if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previous;
  });
  const project = path.join(root, "projects/demo");
  fs.mkdirSync(path.join(project, "knowledge"), { recursive: true });
  const index = structuredClone(prototype);
  index.entryObject = "object";
  index.artifacts[0] = {
    ...index.artifacts[0],
    kind: "diagram",
    path: "knowledge/diagram.html",
    sources: [],
  };
  index.sources = [];
  index.artifacts.push(...Array.from({ length: 45 }, (_, position) => ({
    ...structuredClone(prototype.artifacts[0]), id: `doc-${position}`, sources: [],
  })));
  fs.writeFileSync(path.join(project, "knowledge/index.yml"), stringify(index));
  fs.writeFileSync(
    path.join(project, "knowledge/diagram.html"),
    '<html><body><h1>真实图示</h1><script>document.body.dataset.live="true"</script></body></html>',
  );
  const staticRoot = path.join(base, "web-dist");
  fs.mkdirSync(staticRoot);
  fs.writeFileSync(
    path.join(staticRoot, "index.html"),
    '<html><head><meta name="buildr-session" content="__BUILDR_SESSION_TOKEN__"></head><body>Buildr knowledge</body></html>',
  );
  const runtime = createRuntime(),
    workspace = runtimeProvide(runtime, "workspace.application");
  const instance = createLocalWorkspaceServer(runtime, {
    targetRoot: root,
    staticRoot,
    ensureRegisteredTarget: workspace.ensureRegisteredTarget,
    resolveRegisteredWorkspace: workspace.resolveRegisteredWorkspace,
  });
  const { url, initialWorkspaceId: id, sessionToken } = await instance.ready;
  t.after(() => new Promise<void>((resolve) => instance.server.close(resolve)));
  for (const page of ["project/demo", "service/api"]) {
    const response = await fetch(`${url}/workspaces/${id}/knowledge/${page}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Buildr knowledge/);
    assert.match(
      response.headers.get("content-security-policy") || "",
      /script-src 'self'/,
    );
  }
  const response = await fetch(
    `${url}/api/v1/workspaces/${id}/knowledge/project/demo/objects/object`,
  );
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  validateKnowledgeResponse(body);
  assert.equal(body.artifacts[0].content, null, "JSON must not duplicate executable diagram HTML");
  assert.equal(typeof body.artifacts[0].digest, "string");
  const frame = await fetch(
    `${url}/api/v1/workspaces/${id}/knowledge/project/demo/artifacts/doc/view`,
  );
  assert.equal(frame.status, 200);
  assert.match(await frame.text(), /真实图示/);
  const policy = frame.headers.get("content-security-policy") || "";
  assert.match(policy, /sandbox allow-scripts/);
  assert.doesNotMatch(policy, /allow-same-origin|allow-top-navigation/);
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /form-action 'none'/);
  const stale = await fetch(
    `${url}/api/v1/workspaces/${id}/knowledge/project/demo/artifacts/doc/view?v=old`,
  );
  assert.equal(stale.status, 409);
  const arbitrary = await fetch(
    `${url}/api/v1/workspaces/${id}/knowledge/project/demo?path=/etc/passwd`,
  );
  assert.equal(arbitrary.status, 400);
  const catalogUrl = `${url}/api/v1/workspaces/${id}/knowledge/project/demo/catalog`;
  const navigationUrl = `${url}/api/v1/workspaces/${id}/knowledge/project/demo/navigation`;
  const navigation = await fetch(navigationUrl);
  assert.equal(navigation.status, 200, await navigation.clone().text());
  const navigationBody = await navigation.json();
  validateKnowledgeNavigationResponse(navigationBody);
  assert.equal(navigationBody.scope.id, body.scope.id);
  assert.equal(navigationBody.entryObject, "object");
  assert.equal(navigationBody.artifactCount, 46);
  assert.deepEqual(navigationBody.topics, [{ id: "object", title: "订单", summary: "订单职责", parent: null }]);
  assert.equal((await fetch(`${navigationUrl}?path=/etc/passwd`)).status, 400);
  const catalog = await fetch(`${catalogUrl}?view=documents&pageSize=20`);
  assert.equal(catalog.status, 200, await catalog.clone().text());
  const page = await catalog.json();
  validateKnowledgeCatalogResponse(page);
  assert.equal(page.items.length, 20);
  assert.equal(page.matchingCount, 45);
  assert.equal(Object.hasOwn(page, "index"), false);
  const next = await fetch(`${catalogUrl}?${new URLSearchParams({ cursor: page.nextCursor })}`);
  assert.equal(next.status, 200);
  assert.equal((await next.json()).items[0].id, "doc-20");
  const invalid = await fetch(`${catalogUrl}?cursor=broken`);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "knowledge_catalog_cursor_invalid");
  const invalidPath = await fetch(`${catalogUrl}?path=/etc/passwd`);
  assert.equal(invalidPath.status, 400);
  fs.appendFileSync(path.join(project, "knowledge/index.yml"), "\n");
  const changed = await fetch(`${catalogUrl}?${new URLSearchParams({ cursor: page.nextCursor })}`);
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).error.code, "knowledge_catalog_changed");
  const indexFile = path.join(project, "knowledge/index.yml");
  const originalIndex = fs.readFileSync(indexFile, "utf8");
  const documentFile = path.join(project, "knowledge/docs/order.md");
  fs.mkdirSync(path.dirname(documentFile), { recursive: true });
  fs.writeFileSync(documentFile, "# 最新本地正文\n");
  const documentUrl = `${url}/api/v1/workspaces/${id}/knowledge/project/demo/artifacts/doc-0`;
  const latest = await fetch(documentUrl);
  assert.equal(latest.status, 200);
  const currentBody = await latest.json();
  assert.equal(currentBody.artifacts[0].content, "# 最新本地正文\n");
  assert.equal(currentBody.artifacts[0].status, "readable");
  const documentsUrl = `${url}/api/v1/workspaces/${id}/knowledge/project/demo/documents`;
  const documentsResponse = await fetch(documentsUrl);
  assert.equal(documentsResponse.status, 200, await documentsResponse.clone().text());
  const documentsBody = await documentsResponse.json();
  validateKnowledgeDocumentsResponse(documentsBody);
  const discovered = documentsBody.documents.find((item: { path: string }) => item.path === "knowledge/docs/order.md");
  assert.ok(discovered);
  const documentResponse = await fetch(`${documentsUrl}/${discovered.id}`);
  assert.equal(documentResponse.status, 200, await documentResponse.clone().text());
  const discoveredBody = await documentResponse.json();
  validateKnowledgeDocumentResponse(discoveredBody);
  assert.equal(discoveredBody.content, "# 最新本地正文\n");
  assert.equal(discoveredBody.digest, currentBody.artifacts[0].digest);
  assert.equal((await fetch(`${documentsUrl}?path=/etc/passwd`)).status, 400);
  assert.equal((await fetch(`${documentsUrl}/${discovered.id}?path=/etc/passwd`)).status, 400);
  assert.equal((await fetch(`${documentsUrl}/${"0".repeat(64)}`)).status, 404);
  const writeHeaders = { origin: url, "x-buildr-session": sessionToken, "content-type": "application/json" };
  for (const [method, action] of [["GET", "changes"], ["POST", "confirm"], ["PUT", "content"]]) {
    const unsupported = await fetch(`${documentUrl}/${action}`, {
      method, headers: writeHeaders,
      ...(method === "GET" ? {} : { body: JSON.stringify({ revision: currentBody.revision, artifactDigest: currentBody.artifacts[0].digest, content: "不得写入", sourceObservations: [] }) }),
    });
    assert.equal(unsupported.status, 404, `${method} ${action} must not expose a maintenance API`);
  }
  assert.equal(fs.readFileSync(indexFile, "utf8"), originalIndex);
  assert.equal(fs.readFileSync(documentFile, "utf8"), "# 最新本地正文\n");
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

test("原型保持原隔离策略，图示只额外允许本地导出且保留原始HTML",async()=>{
 const {uiPrototypeHtmlResponse,diagramHtmlResponse}=await import('../../src/web/http/responses.ts');
 const read=(fn:typeof uiPrototypeHtmlResponse)=>{let headers:Record<string,string>={},body='';fn({writeHead:(_s:number,h:Record<string,string>)=>{headers=h;},end:(s:string)=>{body=s;}},'<html><link rel="icon" href="data:image/svg+xml,test"><body>原文</body></html>');return {headers,body};};
 const proto=read(uiPrototypeHtmlResponse),diagram=read(diagramHtmlResponse);
 assert.doesNotMatch(proto.headers['content-security-policy'],/allow-downloads/);
 assert.match(diagram.headers['content-security-policy'],/sandbox allow-scripts allow-downloads/);
 assert.doesNotMatch(diagram.headers['content-security-policy'],/allow-same-origin|allow-top-navigation/);
 assert.match(diagram.headers['content-security-policy'],/connect-src 'none'/);
 assert.equal(diagram.body,proto.body);assert.match(diagram.body,/<link rel="icon"/);
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

test("文档目录无需主题索引，刷新发现增删与正文标题变化且不写回索引", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  const indexPath = path.join(root, "projects/demo/knowledge/index.yml");
  fs.unlinkSync(indexPath);
  const first = app.documents(root, scope);
  validateKnowledgeDocumentsResponse(first);
  assert.equal(first.totalCount, 1);
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
