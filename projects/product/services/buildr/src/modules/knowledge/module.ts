import { WORKSPACE_APPLICATION } from "../workspace/module.ts";
import { AGENT_ASSETS_APPLICATION } from "../agent-assets/module.ts";
import {
  createKnowledgeQuery,
  type KnowledgeDependencies,
} from "./application/knowledge-query.ts";
import { createKnowledgeHttpContribution } from "./interfaces/http/knowledge-http.ts";
export const KNOWLEDGE_QUERY = "knowledge.query";
export function createKnowledgeModule() {
  return {
    id: "knowledge",
    requires: [WORKSPACE_APPLICATION, AGENT_ASSETS_APPLICATION],
    create(ports: Record<string, KnowledgeDependencies>) {
      const app = createKnowledgeQuery({
        assetCatalog: (root) => ports[WORKSPACE_APPLICATION].assetCatalog(root),
        skillFile: (...args) =>
          ports[AGENT_ASSETS_APPLICATION].skillFile(...args),
        skillDetail: (...args) =>
          ports[AGENT_ASSETS_APPLICATION].skillDetail(...args),
      });
      return {
        provides: { [KNOWLEDGE_QUERY]: app },
        contributions: { http: [createKnowledgeHttpContribution(app)] },
      };
    },
  };
}
