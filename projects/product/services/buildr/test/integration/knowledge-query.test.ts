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
import { validateKnowledgeResponse } from "../../src/modules/knowledge/interfaces/http/knowledge-http-contracts.ts";
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
test("真实增改删与维护后再读，零写入且未影响成果保留", (t) => {
  const { root, put, app } = setup(t);
  const scope = { kind: "project" as const, id: "demo" };
  const indexPath = path.join(root, "projects/demo/knowledge/index.yml");
  const original = fs.readFileSync(indexPath, "utf8");
  const first = app.read(root, scope, "objects", "object");
  validateKnowledgeResponse(first);
  assert.equal(first.observations[0].status, "aligned");
  assert.equal(first.observations[0].content, null);
  put("projects/demo/src/order.ts", "export const order = 2;");
  assert.equal(
    app.read(root, scope, "objects", "object").observations[0].status,
    "changed",
  );
  assert.equal(fs.readFileSync(indexPath, "utf8"), original);
  const updated = structuredClone(prototype);
  updated.sources[0].observedDigest = digest("export const order = 2;");
  put("projects/demo/knowledge/index.yml", stringify(updated));
  assert.equal(
    app.read(root, scope, "objects", "object").observations[0].status,
    "aligned",
  );
  assert.equal(
    app.read(root, scope, "objects", "object").artifacts[0].content,
    first.artifacts[0].content,
  );
  fs.unlinkSync(path.join(root, "projects/demo/src/order.ts"));
  assert.equal(
    app.read(root, scope, "objects", "object").observations[0].status,
    "missing",
  );
  put("projects/demo/src/new.ts", "new implementation");
  updated.sources[0].path = "src/new.ts";
  updated.sources[0].observedDigest = digest("new implementation");
  put("projects/demo/knowledge/index.yml", stringify(updated));
  assert.equal(
    app.read(root, scope, "sources", "code").observations[0].content,
    "new implementation",
  );
  assert.equal(
    app.read(root, scope, "objects", "object").observations[0].status,
    "aligned",
  );
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
  assert.equal(result.observations[0].status, "aligned");
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
    "<html><body>diagram</body></html>",
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
  }) as { status: number; body: unknown };
  assert.equal(result.status, 200);
  assert.ok(result.body);
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
  index.artifacts[0] = {
    ...index.artifacts[0],
    kind: "diagram",
    path: "knowledge/diagram.html",
    sources: [],
  };
  index.sources = [];
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
  const { url, initialWorkspaceId: id } = await instance.ready;
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
