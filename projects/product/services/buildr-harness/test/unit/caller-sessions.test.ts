import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { HarnessCallerSessions } from '../../src/process/caller-sessions.ts';
import { HARNESS_EXECUTION_CONTRACTS, executionScopeKey } from '../../src/execution-contracts.ts';

const request = (token: string) => ({headers: {authorization: 'Bearer ' + token}} as IncomingMessage);
test('caller negotiation is explicit, idempotent and bound to a token rather than a source assertion', () => {
  let now = 100;
  const issuer = new HarnessCallerSessions('generation', () => now);
  const input = {clientRequestId: 'request', contracts: HARNESS_EXECUTION_CONTRACTS, caller: {kind: 'host', sourceId: 'alpha'}};
  const session = issuer.issue(input);
  assert.deepEqual(issuer.issue(input), session);
  assert.throws(() => issuer.issue({...input, caller: {kind: 'first-party-user', product: 'buildr-harness'}}), {code: 'agent_caller_request_conflict'});
  assert.throws(() => issuer.issue({...input, clientRequestId: 'other', caller: {kind: 'host', sourceId: 'alpha', authoritySources: ['buildr']}}), {code: 'agent_caller_invalid'});
  assert.throws(() => issuer.issue({...input, contracts: {operations: 'v1'}}), {code: 'agent_caller_contract_unsupported'});
  const grant = issuer.authenticate(request(session.token));
  assert.throws(() => issuer.authenticate(request('forged')), {code: 'agent_caller_unauthorized'});
  const alpha = executionScopeKey({sourceId: 'alpha', id: 'same'}), beta = executionScopeKey({sourceId: 'beta', id: 'same'});
  issuer.operation(grant, {operation: 'conversations.read', args: [alpha, 'chat'], targetScope: {sourceId: 'alpha', id: 'same'}});
  assert.throws(() => issuer.operation(grant, {operation: 'conversations.read', args: [beta, 'chat'], targetScope: {sourceId: 'alpha', id: 'same'}}), {code: 'agent_caller_scope_denied'});
  assert.throws(() => issuer.operation(grant, {operation: 'conversations.listAll', args: [[alpha, beta]]}), {code: 'agent_caller_scope_denied'});
  assert.throws(() => issuer.authority(grant, 'buildr'), {code: 'agent_caller_scope_denied'});
  assert.throws(() => issuer.directory(grant, true), {code: 'agent_caller_scope_denied'});
  assert.throws(() => issuer.operation(grant, {operation:'conversations.update',args:[alpha,'chat',{workObjectLinks:[{sourceId:'beta'}]}],targetScope:{sourceId:'alpha',id:'same'}}), {code:'agent_caller_scope_denied'});
  now = session.expiresAt;
  assert.throws(() => issuer.authenticate(request(session.token)), {code: 'agent_caller_unauthorized'});
});

test('first-party visibility does not grant another product authority, and closing revokes the exact session', () => {
  const issuer = new HarnessCallerSessions('generation');
  const session = issuer.issue({clientRequestId: 'user', contracts: HARNESS_EXECUTION_CONTRACTS, caller: {kind: 'first-party-user', product: 'buildr-harness'}});
  const grant = issuer.authenticate(request(session.token));
  issuer.operation(grant, {operation: 'conversations.listAll', args: [['@default', executionScopeKey({sourceId: 'harness-local', id: 'directory'})]]});
  assert.throws(() => issuer.authority(grant, 'buildr'), {code: 'agent_caller_scope_denied'});
  assert.throws(() => issuer.authority(grant, 'harness-local'), {code: 'agent_caller_scope_denied'});
  issuer.directory(grant, true);
  issuer.close(grant);
  assert.throws(() => issuer.authenticate(request(session.token)), {code: 'agent_caller_unauthorized'});
});
