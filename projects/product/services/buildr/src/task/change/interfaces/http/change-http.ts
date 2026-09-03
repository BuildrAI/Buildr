const TASK_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';

export function createChangeHttpContribution(application: any) {
  return Object.freeze({
    id: 'change.http',
    handle: ({ request, suffix, root, respond }: any) => {
      const detail = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/changes/([A-Za-z0-9][A-Za-z0-9._-]*)/(${TASK_ID})$`));
      if (request.method === 'GET' && detail) {
        application.inspectTaskRecord(root, detail[1]);
        return { status: 200, body: application.taskScopedChangeDetail(root, detail[1], detail[2], detail[3]) };
      }
      const list = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/ui-prototypes$`));
      if (request.method === 'GET' && list) return { status: 200, body: application.taskUiPrototypes(root, list[1]) };
      const prototype = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/ui-prototypes/([a-f0-9]{32})$`));
      if (request.method === 'GET' && prototype) {
        respond.uiPrototypeHtml(application.taskUiPrototype(root, prototype[1], prototype[2]).html);
        return true;
      }
      return null;
    },
  });
}
