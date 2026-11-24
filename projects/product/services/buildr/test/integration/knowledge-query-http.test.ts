import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { validateKnowledgeCatalogResponse, validateKnowledgeDocumentResponse, validateKnowledgeDocumentsResponse, validateKnowledgeNavigationResponse, validateKnowledgeResponse } from '../../src/modules/knowledge/interfaces/http/knowledge-http-contracts.ts';
import { createKnowledgeHttpContribution } from '../../src/modules/knowledge/interfaces/http/knowledge-http.ts';
import { prototype, setup, catalogIndex } from '../helpers/knowledge-query-fixture.ts';

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
  assert.deepEqual(missing.body.artifacts, []);
  assert.deepEqual(missing.body.diagnostics, []);
  assert.equal(fs.existsSync(path.join(root, "projects/demo/knowledge/index.yml")), false);
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
  index.entryDocument = { path: "knowledge/docs/order.md" };
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
  t.after(() => new Promise<void>((resolve) => instance.server.close(() => resolve())));
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
  assert.equal(navigationBody.artifacts.length, 46);
  assert.deepEqual(navigationBody.artifacts[0], { id: "doc", title: "说明", kind: "diagram", path: "knowledge/diagram.html", objects: ["object"] });
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
  assert.equal(documentsBody.entryDocumentId, discovered.id);
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
