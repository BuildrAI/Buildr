import type { IncomingMessage } from 'node:http';
import type { DshDesktopApplication } from '../../application/dsh-desktop-application.ts';
import type { DshPageObservations } from '../../application/dsh-page-observations.ts';
import { DSH_DESKTOP_HTTP_SCHEMAS, DSH_DESKTOP_HTTP_REQUESTS, DSH_DESKTOP_HTTP_OPERATIONS, DSH_DESKTOP_HTTP_VALIDATORS } from './dsh-desktop-http-contracts.ts';

type Context = { request: IncomingMessage; pathname: string; searchParams: URLSearchParams; authorizeWrite(): void; readJsonBody(): Promise<unknown> };
const failure = (response = false) => Object.assign(new Error(response ? 'DSH 返回格式无效。' : 'DSH 请求字段无效。'), { code: response ? 'agent_response_invalid' : 'agent_request_invalid', status: response ? 500 : 400 });

export function createDshDesktopHttpContribution(application: DshDesktopApplication, pages: DshPageObservations) {
  const validate = (id: string, input: unknown, response = false) => {
    if (!DSH_DESKTOP_HTTP_VALIDATORS.validate(id, input).valid) throw failure(response);
    return input;
  };
  const query = (id: string, search: URLSearchParams) => {
    if ([...search.keys()].some(key => search.getAll(key).length !== 1)) throw failure();
    return validate(id, Object.fromEntries(search));
  };
  const result = (id: string, body: unknown) => ({ status: 200, body: validate(id, body, true) });
  const wait = async (request: IncomingMessage, action: (signal: AbortSignal) => Promise<string | null>) => {
    const controller = new AbortController(), abort = () => controller.abort();
    request.once('aborted', abort); request.socket.once('close', abort);
    try { return await action(controller.signal); }
    finally { request.removeListener('aborted', abort); request.socket.removeListener('close', abort); }
  };
  return Object.freeze({
    id: 'dsh-desktop.http',
    schemas: { ...DSH_DESKTOP_HTTP_SCHEMAS, ...Object.fromEntries(Object.entries(DSH_DESKTOP_HTTP_REQUESTS).map(([key, value]) => [key + 'Request', value])) },
    operations: DSH_DESKTOP_HTTP_OPERATIONS,
    async handleTopLevel({ request, pathname, searchParams, authorizeWrite, readJsonBody }: Context) {
      if (request.method === 'GET' && pathname === '/api/v1/app/dsh/connections') {
        query(DSH_DESKTOP_HTTP_REQUESTS.empty.$id, searchParams);
        return result(DSH_DESKTOP_HTTP_SCHEMAS.connections.$id, await application.listConnections());
      }
      if (request.method === 'GET' && ['/api/v1/app/dsh/pages/watch', '/api/v1/app/dsh/pages/probe'].includes(pathname)) {
        const { pageId } = query(DSH_DESKTOP_HTTP_REQUESTS.page.$id, searchParams) as { pageId: string };
        if (pathname.endsWith('/watch')) return result(DSH_DESKTOP_HTTP_SCHEMAS.pageWatch.$id, { challengeId: await wait(request, signal => pages.watch(pageId, signal)) });
        return result(DSH_DESKTOP_HTTP_SCHEMAS.pageProbe.$id, { taskUrl: await wait(request, signal => pages.probe(pageId, signal)) });
      }
      if (request.method === 'POST' && pathname === '/api/v1/app/dsh/pages/ack') {
        authorizeWrite(); query(DSH_DESKTOP_HTTP_REQUESTS.empty.$id, searchParams);
        const input = validate(DSH_DESKTOP_HTTP_REQUESTS.pageAck.$id, await readJsonBody()) as Parameters<DshPageObservations['acknowledge']>[0];
        return result(DSH_DESKTOP_HTTP_SCHEMAS.pageAck.$id, pages.acknowledge(input));
      }
      return null;
    },
  });
}
