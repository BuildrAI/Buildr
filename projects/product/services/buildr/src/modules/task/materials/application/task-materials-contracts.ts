import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';

type Schema = Record<string, unknown>;
const text = { type: 'string', minLength: 1, maxLength: 1024, pattern: '\\S' };
const digest = { type: 'string', pattern: '^sha256-[0-9a-f]{64}$' };
const observed = { anyOf: [{ const: 'absent' }, digest] };
const closed = (properties: Record<string, unknown>, required = Object.keys(properties)): Schema => ({ type: 'object', additionalProperties: false, properties, required });
const nullable = (value: Schema): Schema => ({ anyOf: [value, { type: 'null' }] });
const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const referenceProperties = {
  id: { ...text, pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$' },
  role: { enum: ['solution', 'implementation', 'delivery'] }, title: text,
  source: { oneOf: [closed({ kind: { const: 'task' }, path: text }), closed({ kind: { const: 'project' }, project: { ...text, pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$' }, path: text })] },
};
export const TASK_MATERIALS_DEFINITIONS = Object.freeze({
  TaskMaterialDiagnostic: closed({ code: text, message: { type: 'string', minLength: 1 } }),
  TaskMaterialReference: closed(referenceProperties),
  TaskMaterialsManifest: closed({ schemaVersion: { const: 'buildr.task-materials/v2' }, documents: { type: 'array', maxItems: 100, items: ref('TaskMaterialReference') } }),
  TaskMaterialImageContext: closed({ documentDigest: digest, sourceIdentity: digest }),
  TaskMaterialDocument: closed({ ...referenceProperties, exists: { type: 'boolean' }, content: nullable({ type: 'string' }), actualDigest: nullable(digest), provenance: nullable({ enum: ['task-local', 'task-worktree-candidate', 'retained-project'] }), diagnostic: nullable(ref('TaskMaterialDiagnostic')), imageContext: ref('TaskMaterialImageContext') }, [...Object.keys(referenceProperties), 'exists', 'content', 'actualDigest', 'provenance', 'diagnostic']),
});
function schema(name: string, title: string, body: Schema) {
  return Object.freeze({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://schemas.buildr.ai/http/task-materials/${name}/v2`, title, ...body, $defs: TASK_MATERIALS_DEFINITIONS });
}
export const TASK_MATERIALS_SCHEMAS = Object.freeze({
  inspectRequest: schema('inspect/request', 'TaskMaterialsInspectRequest', closed({})),
  recordRequest: schema('record/request', 'TaskMaterialsRecordRequest', closed({ expectedCurrent: observed, documents: { type: 'array', maxItems: 100, items: ref('TaskMaterialReference') } })),
  writeRequest: schema('write/request', 'TaskMaterialsWriteRequest', closed({ path: text, content: { type: 'string', maxLength: 512 * 1024 }, expectedDocumentDigest: observed })),
  response: schema('inspect/response', 'TaskMaterialsResponse', closed({ schemaVersion: { const: 'buildr.task-materials-result/v2' }, taskId: { type: 'string', pattern: '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$' }, materialsDigest: observed, materials: ref('TaskMaterialsManifest'), documents: { type: 'array', maxItems: 100, items: ref('TaskMaterialDocument') }, diagnostics: { type: 'array', items: ref('TaskMaterialDiagnostic') } })),
  writeResponse: schema('write/response', 'TaskMaterialsWriteResponse', closed({ schemaVersion: { const: 'buildr.task-materials-write-result/v2' }, taskId: text, path: text, actualDigest: digest })),
});
export const LEGACY_TASK_MATERIALS_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.buildr.ai/task-materials/legacy-manifest/v1',
  ...closed({ schemaVersion: { const: 'buildr.task-materials/v1' }, documents: { type: 'array', maxItems: 100, items: closed({ ...referenceProperties, role: { enum: ['brief', 'solution', 'implementation', 'delivery'] } }) } }),
});
export const TASK_MATERIALS_VALIDATORS = compileJsonSchemaCatalog([...Object.values(TASK_MATERIALS_SCHEMAS), LEGACY_TASK_MATERIALS_SCHEMA]);
export function validateMaterials(schema: { $id: string }, input: unknown, response = false): void {
  if (!TASK_MATERIALS_VALIDATORS.validate(schema.$id, input).valid) throw Object.assign(new Error('任务材料数据不符合公开契约。'), { code: response ? 'task_materials_response_invalid' : 'task_materials_input_invalid', status: response ? 500 : 400 });
}
