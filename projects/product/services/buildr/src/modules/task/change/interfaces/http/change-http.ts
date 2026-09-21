type ChangeHttpInput = { request: { method?: string }; suffix: string; root: string; submitTaskRead(operation: string, taskId: string, input?: Record<string, string>): Promise<any>; respond: { uiPrototypeHtml(html: string): unknown } };
const TASK_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';

export function createChangeHttpContribution() {
  return Object.freeze({
    id: 'change.http',
    handle: async ({ request, suffix, submitTaskRead, respond }: ChangeHttpInput) => {
      const document = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/documents/([A-Za-z0-9][A-Za-z0-9._-]*)/(.+)$`));
      if (request.method === 'GET' && document) {
        let documentPath: string;
        try { documentPath = document[3].split('/').map(decodeURIComponent).join('/'); }
        catch { throw Object.assign(new Error('文档路径编码无效。'), { code: 'task_document_path_forbidden', status: 400 }); }
        return { status: 200, body: await submitTaskRead('documents', document[1], { project: document[2], documentPath }) };
      }
      const detail = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/changes/([A-Za-z0-9][A-Za-z0-9._-]*)/(${TASK_ID})$`));
      if (request.method === 'GET' && detail) {
        return { status: 200, body: await submitTaskRead('change', detail[1], { project: detail[2], change: detail[3] }) };
      }
      const list = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/ui-prototypes$`));
      if (request.method === 'GET' && list) return { status: 200, body: await submitTaskRead('prototypes', list[1]) };
      const prototype = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/ui-prototypes/([a-f0-9]{32})$`));
      if (request.method === 'GET' && prototype) {
        const result = await submitTaskRead('prototype', prototype[1], { prototypeId: prototype[2] });
        respond.uiPrototypeHtml(result.html);
        return true;
      }
      return null;
    },
  });
}
