import Ajv2020 from 'ajv/dist/2020.js';
import type { AgentService } from '../application/agent-service.ts';
import type { ServiceEvent } from '../contracts.ts';
import { AGENT_OPERATION_SCHEMAS } from '../operation-schemas.ts';
import { AgentServiceError } from '../domain/agent-state.ts';

type RemoteMethods<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never };
export interface AgentSubscription { events: AsyncIterable<ServiceEvent>; close(): void }
/** Public asynchronous operations; native SDK objects never cross this boundary. */
export interface AgentOperations {
  generation: string;
  connections: RemoteMethods<AgentService['connections']>;
  conversations: Omit<RemoteMethods<AgentService['conversations']>, 'subscribe' | 'recoverInterrupted'> & { subscribe(scope: string, id: string): Promise<AgentSubscription> };
  models: { accounts: Omit<RemoteMethods<AgentService['models']['accounts']>, 'snapshot'>; catalog: RemoteMethods<AgentService['models']['catalog']>; generate: AgentService['models']['generate'] };
}

const names = {
  connections: ['list','read','prepare','preparation','currentPreparation','cancelPreparation','connect','check','login','loginAttempt','cancelLogin','disconnect'],
  conversations: ['listAll','markSeen','list','create','read','update','generateTitle','prepareHandoff','prepareSend','send','supplement','queueSend','cancelPendingSend','observe','stop','reply','addAttachment','readAttachment','pending','lookupRequest'],
  'models.accounts': ['list','read','preferences','add','login','attempt','cancelLogin','check','disconnect'],
  'models.catalog': ['list'],
} as const;
export const OPERATION_NAMES: readonly string[] = Object.entries(names).flatMap(([group, methods]) => methods.map(method => group + '.' + method));

const Constructor: any = Ajv2020;
const ajv = new Constructor({ strict: true, allErrors: true, allowUnionTypes: true });
const validators = new Map(Object.entries(AGENT_OPERATION_SCHEMAS).map(([name, schema]) => [name, ajv.compile(schema)]));
const inputs: Record<string, [number, string]> = {
  'conversations.queueSend': [2, 'queueSend'], 'conversations.cancelPendingSend': [2, 'cancelPendingSend'],
  'connections.prepare':[1,'prepare'], 'connections.connect':[1,'connect'], 'connections.check':[1,'check'], 'connections.login':[1,'revision'], 'connections.disconnect':[1,'revision'], 'connections.cancelLogin':[2,'revision'],
  'conversations.create':[1,'create'], 'conversations.update':[2,'update'], 'conversations.markSeen':[2,'seen'], 'conversations.generateTitle':[2,'revision'], 'conversations.prepareHandoff':[2,'draft'], 'conversations.prepareSend':[2,'draft'], 'conversations.send':[2,'send'], 'conversations.supplement':[2,'supplement'], 'conversations.stop':[2,'stop'], 'conversations.reply':[3,'reply'],
  'models.accounts.preferences':[1,'modelPreferences'], 'models.accounts.add':[0,'addModelAccount'], 'models.accounts.login':[1,'revision'], 'models.accounts.cancelLogin':[2,'revision'], 'models.accounts.check':[1,'check'], 'models.accounts.disconnect':[1,'revision'],
};
export function validateOperation(name: string, args: unknown): asserts args is any[] {
  if (!OPERATION_NAMES.includes(name) || !Array.isArray(args) || args.length > 6) throw new AgentServiceError('agent_process_operation_invalid', '不支持的执行操作。');
  const input = inputs[name];
  if (input && !validators.get(input[1])!(JSON.parse(JSON.stringify(args[input[0]] ?? (input[1] === 'check' ? {} : null))))) throw new AgentServiceError('agent_process_input_invalid', '执行操作字段无效。');
  if (name === 'conversations.addAttachment') {
    const value = args[2];
    if (!value || typeof value.base64 !== 'string' || value.base64.length > 12 * 1024 * 1024 || !validators.get('attachment')!({ expectedRevision: value.expectedRevision, expectedAttachmentRevision: value.expectedAttachmentRevision, mimeType: value.mimeType })) throw new AgentServiceError('agent_process_input_invalid', '附件字段无效。');
  }
}
export async function dispatchOperation(service: AgentService, name: string, args: any[]): Promise<unknown> {
  validateOperation(name, args);
  if (name === 'conversations.addAttachment') args[2] = { ...args[2], bytes: Buffer.from(args[2].base64, 'base64') };
  const parts = name.split('.'), method = parts.pop()!;
  let owner: any = service;
  for (const part of parts) owner = owner[part];
  // Names are the closed allowlist above; no arbitrary method/property invocation.
  const value = await owner[method](...args);
  if (name === 'conversations.readAttachment') return { base64: value.bytes.toString('base64'), mimeType: value.mimeType };
  return value;
}
