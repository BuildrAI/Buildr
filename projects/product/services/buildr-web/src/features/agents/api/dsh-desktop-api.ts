import { api } from '../../../api';
import type { ApiClient } from '../../../api/client';
import type { DshConnectionsViewConnections } from '../../../../build/generated/dsh-desktop-http-dto';

export type DshConnection = DshConnectionsViewConnections['connections'][number];
export function createDshDesktopClient(client: ApiClient) {
  return {
    connections(signal?: AbortSignal): Promise<{connections: DshConnection[]}> { return client('/api/v1/app/dsh/connections', {signal}) as Promise<{connections: DshConnection[]}>; },
  };
}
export const dshDesktopApi = createDshDesktopClient(api);
