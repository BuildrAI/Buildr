import { compileJsonSchemaCatalog } from "../../../../infrastructure/contracts/json-schema-validator.ts";
const text = { type: "string" };
const nullable = { type: ["string", "null"] };
const strings = { type: "array", items: text };
const obj = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: [...new Set(required)],
});
const scopeRef = obj({ kind: { enum: ["project", "service"] }, id: text });
const object = obj({ id: text, title: text, summary: text, parent: text }, [
  "id",
  "title",
  "summary",
]);
const source = obj(
  {
    id: text,
    title: text,
    kind: { enum: ["code", "spec", "skill", "evidence"] },
    path: text,
    scope: scopeRef,
    summary: text,
    skillId: text,
    link: text,
    observedDigest: text,
    line: { type: "integer" },
  },
  ["id", "title", "kind", "path"],
);
const artifactFields = {
  id: text,
  title: text,
  kind: { enum: ["document", "diagram", "code-map", "terms"] },
  path: text,
  objects: strings,
  sources: strings,
  files: strings,
  graphSource: text,
  graphDigest: text,
  observedDigest: text,
};
const artifact = obj(artifactFields, [
  "id",
  "title",
  "kind",
  "path",
  "objects",
  "sources",
]);
const observationFields = {
  content: nullable,
  digest: nullable,
  path: nullable,
  status: {
    enum: ["aligned", "changed", "unreviewed", "missing", "unreadable"],
  },
  diagnostic: nullable,
};
const observation = obj(observationFields);
const index = obj({
  schemaVersion: { const: "buildr.knowledge-index/v1" },
  scope: scopeRef,
  objects: { type: "array", items: object },
  sources: { type: "array", items: source },
  artifacts: { type: "array", items: artifact },
  relations: {
    type: "array",
    items: obj({
      from: text,
      to: text,
      kind: {
        enum: ["contains", "guides", "implements", "based-on", "explains"],
      },
    }),
  },
});
export const KNOWLEDGE_HTTP_SCHEMAS = {
  Response: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.buildr.ai/http/knowledge/response",
    title: "Knowledge",
    ...obj(
      {
        scope: obj({
          kind: { enum: ["project", "service"] },
          id: text,
          code: text,
          title: text,
          directory: text,
          codeRoot: text,
          serviceIds: strings,
          repositoryId: nullable,
        }),
        index: { anyOf: [index, { type: "null" }] },
        revision: nullable,
        item: { anyOf: [object, source, artifact, { type: "null" }] },
        artifacts: {
          type: "array",
          items: obj(
            {
              ...artifactFields,
              ...observationFields,
              graph: { anyOf: [observation, { type: "null" }] },
            },
            [
              "id",
              "title",
              "kind",
              "path",
              "objects",
              "sources",
              ...Object.keys(observationFields),
              "graph",
            ],
          ),
        },
        observations: {
          type: "array",
          items: obj(
            {
              id: text,
              kind: text,
              ...observationFields,
              location: obj({
                kind: { enum: ["project", "service"] },
                id: text,
                title: text,
                root: text,
                repositoryId: nullable,
              }),
              skill: obj({
                id: text,
                sourcePath: nullable,
                enabled: { type: "boolean" },
              }),
            },
            ["id", "kind", ...Object.keys(observationFields)],
          ),
        },
        diagnostics: strings,
      },
      ["scope", "index", "revision", "item", "observations", "diagnostics"],
    ),
  },
};
const validator = compileJsonSchemaCatalog(
  Object.values(KNOWLEDGE_HTTP_SCHEMAS),
);
export function validateKnowledgeResponse(value: unknown) {
  const result = validator.validate(KNOWLEDGE_HTTP_SCHEMAS.Response.$id, value);
  if (!result.valid)
    throw new Error(
      "Knowledge response contract failed: " + JSON.stringify(result.errors),
    );
  return value;
}
