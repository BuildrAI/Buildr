import type { TaskMaterialsRecordRequest, TaskMaterialsWriteRequest } from '../../../../../../build/generated/task-dto.ts';
import type { TaskMaterialsApplication } from '../../application/task-materials-application.ts';
import { TASK_ID_SOURCE } from '../../../application/task-validation.ts';
import { TASK_MATERIALS_SCHEMAS, validateMaterials } from '../../application/task-materials-contracts.ts';
import { documentImageQuery } from '../../../../../infrastructure/filesystem/markdown-images.ts';

type Input = {
  request: { method?: string }; suffix: string; root: string; searchParams: URLSearchParams;
  authorizeWrite(): void;
  readJsonBody(maxBytes: number): Promise<unknown>;
  submitTaskRead(operation: string, taskId: string): Promise<unknown>;
  respond: { binary(content: Buffer, contentType: string, options: { disposition: 'inline'; filename: string }): unknown };
};
export function createTaskMaterialsHttpContribution(application: TaskMaterialsApplication) {
  return Object.freeze({ id: 'task.materials.http', handle: async (input: Input) => {
    const materialImage = input.suffix.match(new RegExp(`^/tasks/(${TASK_ID_SOURCE})/materials/([A-Za-z0-9][A-Za-z0-9._-]*)/image$`));
    const projectImage = input.suffix.match(new RegExp(`^/tasks/(${TASK_ID_SOURCE})/document-image/([A-Za-z0-9][A-Za-z0-9._-]*)$`));
    if (input.request.method === 'GET' && (materialImage || projectImage)) {
      const query = documentImageQuery(input.searchParams, Boolean(projectImage));
      const image = materialImage ? application.taskMaterialImage(input.root, materialImage[1], materialImage[2], query)
        : application.taskProjectDocumentImage(input.root, projectImage![1], projectImage![2], query.path!, query);
      input.respond.binary(image.bytes, image.contentType, { disposition: 'inline', filename: image.filename });
      return true;
    }
    const match = input.suffix.match(new RegExp(`^/tasks/(${TASK_ID_SOURCE})/materials(/documents)?$`));
    if (!match || !['GET', 'POST'].includes(input.request.method || '') || (input.request.method === 'GET' && match[2])) return null;
    if (input.searchParams.size) throw Object.assign(new Error('任务材料接口不接受查询参数。'), { code: 'task_api_query_forbidden', status: 400 });
    if (input.request.method === 'GET') {
      validateMaterials(TASK_MATERIALS_SCHEMAS.inspectRequest, {});
      const body = await input.submitTaskRead('materials', match[1]);
      validateMaterials(TASK_MATERIALS_SCHEMAS.response, body, true);
      return { status: 200, body };
    }
    // Authorization must precede body parsing and every application/file action.
    input.authorizeWrite();
    const write = Boolean(match[2]);
    const body = await input.readJsonBody(write ? 4 * 1024 * 1024 : 128 * 1024);
    validateMaterials(write ? TASK_MATERIALS_SCHEMAS.writeRequest : TASK_MATERIALS_SCHEMAS.recordRequest, body);
    const result = write ? application.writeTaskMaterialDocument(input.root, match[1], body as TaskMaterialsWriteRequest) : application.recordTaskMaterials(input.root, match[1], body as TaskMaterialsRecordRequest);
    validateMaterials(write ? TASK_MATERIALS_SCHEMAS.writeResponse : TASK_MATERIALS_SCHEMAS.response, result, true);
    return { status: 200, body: result };
  } });
}
