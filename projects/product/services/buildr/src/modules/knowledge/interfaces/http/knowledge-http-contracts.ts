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
const scope = obj({
  kind: { enum: ["project", "service"] },
  id: text,
  code: text,
  title: text,
  directory: text,
  codeRoot: text,
  serviceIds: strings,
  repositoryId: nullable,
});
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
    enum: ["readable", "missing", "unreadable"],
  },
  diagnostic: nullable,
};
const observation = obj(observationFields);
const index = obj({
  schemaVersion: { const: "buildr.knowledge-index/v1" },
  scope: scopeRef,
  entryObject: text,
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
}, ["schemaVersion", "scope", "objects", "sources", "artifacts", "relations"]);
const document = obj({ id: text, path: text, title: text, location: text, group: text, artifactId: nullable, workspacePath: nullable,
  sectionId: text, summary: text, supplementary: { type: "boolean" } });
export const KNOWLEDGE_HTTP_SCHEMAS = {
  ReferenceResponse: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://schemas.buildr.ai/http/knowledge/reference-response',
    title: 'Knowledge',
    ...obj({ path: text, content: text, digest: text, reference: obj({ kind: { enum: ['artifact', 'source', 'document'] }, id: text, links: { type: 'array', minItems: 1, maxItems: 12, items: text } }) }),
  },
  DocumentsResponse: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.buildr.ai/http/knowledge/documents-response",
    title: "Knowledge",
    ...obj({ scope, revision: text, entryDocumentId: nullable, totalCount: { type: "integer", minimum: 0, maximum: 1000 },
      documents: { type: "array", maxItems: 1000, items: document },
      sections: { type: "array", maxItems: 65, items: obj({ id: text, title: text, summary: text,
        count: { type: "integer", minimum: 0, maximum: 1000 } }) },
      truncated: { type: "boolean" }, diagnostics: strings }),
  },
  DocumentResponse: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.buildr.ai/http/knowledge/document-response",
    title: "Knowledge",
    ...obj({ document, content: text, digest: text }),
  },
  NavigationResponse: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.buildr.ai/http/knowledge/navigation-response",
    title: "Knowledge",
    ...obj({
      scope,
      revision: nullable,
      entryObject: nullable,
      artifactCount: { type: "integer", minimum: 0, maximum: 500 },
      topics: {
        type: "array",
        maxItems: 500,
        items: obj({ id: text, title: text, summary: text, parent: nullable }),
      },
      artifacts: {
        type: "array",
        maxItems: 500,
        items: obj({ id: text, title: text, kind: artifactFields.kind, path: text, objects: strings }),
      },
      diagnostics: strings,
    }),
  },
  CatalogResponse: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.buildr.ai/http/knowledge/catalog-response",
    title: "Knowledge",
    ...obj({
      scope,
      revision: nullable,
      view: { enum: ["documents", "diagrams", "maps"] },
      query: text,
      items: {
        type: "array",
        maxItems: 20,
        items: {
          title: "KnowledgeCatalogItem",
          ...obj({
            id: text,
            title: text,
            kind: { enum: ["document", "diagram", "code-map", "terms"] },
            path: text,
            objects: strings,
            summary: text,
          }),
        },
      },
      matchingCount: { type: "integer", minimum: 0 },
      pageSize: { type: "integer", minimum: 1, maximum: 20 },
      hasMore: { type: "boolean" },
      nextCursor: nullable,
      diagnostics: strings,
    }),
  },
  Response: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.buildr.ai/http/knowledge/response",
    title: "Knowledge",
    ...obj(
      {
        scope,
        index: { anyOf: [index, { type: "null" }] },
        revision: nullable,
        item: { anyOf: [object, source, artifact, { type: "null" }] },
        artifacts: {
          type: "array",
          items: obj(
            {
              ...artifactFields,
              ...observationFields,
              diagramSize: { anyOf: [obj({
                width: { type: "number", exclusiveMinimum: 0 },
                height: { type: "number", exclusiveMinimum: 0 },
              }), { type: "null" }] },
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
              "diagramSize",
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
export function validateKnowledgeCatalogResponse(value: unknown) {
  const result = validator.validate(KNOWLEDGE_HTTP_SCHEMAS.CatalogResponse.$id, value);
  if (!result.valid)
    throw new Error(
      "Knowledge catalog response contract failed: " + JSON.stringify(result.errors),
    );
  return value;
}
export function validateKnowledgeNavigationResponse(value: unknown) {
  const result = validator.validate(KNOWLEDGE_HTTP_SCHEMAS.NavigationResponse.$id, value);
  if (!result.valid)
    throw new Error(
      "Knowledge navigation response contract failed: " + JSON.stringify(result.errors),
    );
  return value;
}
export function validateKnowledgeDocumentsResponse(value: unknown) {
  const result = validator.validate(KNOWLEDGE_HTTP_SCHEMAS.DocumentsResponse.$id, value);
  if (!result.valid) throw new Error("Knowledge documents response contract failed: " + JSON.stringify(result.errors));
  return value;
}
export function validateKnowledgeDocumentResponse(value: unknown) {
  const result = validator.validate(KNOWLEDGE_HTTP_SCHEMAS.DocumentResponse.$id, value);
  if (!result.valid) throw new Error("Knowledge document response contract failed: " + JSON.stringify(result.errors));
  return value;
}
export function validateKnowledgeReferenceResponse(value: unknown) {
  const result = validator.validate(KNOWLEDGE_HTTP_SCHEMAS.ReferenceResponse.$id, value);
  if (!result.valid) throw new Error('Knowledge reference response contract failed: ' + JSON.stringify(result.errors));
  return value;
}
