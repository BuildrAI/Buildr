import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { stringify } from 'yaml';
import { createKnowledgeQuery } from '../../src/modules/knowledge/application/knowledge-query.ts';
import { type KnowledgeIndex } from '../../src/modules/knowledge/domain/knowledge-index.ts';
import { digest } from '../../src/modules/knowledge/infrastructure/knowledge-files.ts';

export const prototype: KnowledgeIndex = {
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

export function setup(t: test.TestContext) {
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

export function catalogIndex(): KnowledgeIndex {
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
