import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePermissionMode } from '../../src/domain/permission-mode.ts';
import { normalizeSendDraft } from '../../src/domain/send-draft.ts';
import { codexThreadPermissions, codexTurnPermissions } from '../../src/executors/codex/permissions.ts';
import { applyDshPermissions } from '../../src/executors/dsh/permissions.ts';

test('new turns default to full-access and explicit modes remain authoritative', () => {
  const draft = { expectedRevision: 'r1', connectionId: 'codex', text: 'work' };
  assert.equal(resolvePermissionMode(undefined), 'full-access');
  assert.equal(normalizeSendDraft(draft).permissionMode, 'full-access');
  for (const mode of ['default', 'full-access'] as const) {
    assert.equal(resolvePermissionMode(mode), mode);
    assert.equal(normalizeSendDraft({ ...draft, permissionMode: mode }).permissionMode, mode);
  }
  for (const value of [null, '', 'invalid', false, 0]) assert.throws(() => resolvePermissionMode(value), { code: 'agent_permission_invalid' });
});

test('Codex maps omitted and explicit modes to thread and turn native policy', () => {
  for (const mode of [undefined, 'full-access'] as const) {
    assert.deepEqual(codexThreadPermissions(mode), { sandbox: 'danger-full-access', approvalPolicy: 'never' });
    assert.deepEqual(codexTurnPermissions(mode, '/workspace'), { approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' } });
  }
  assert.deepEqual(codexThreadPermissions('default'), { sandbox: 'workspace-write', approvalPolicy: 'on-request' });
  assert.equal(codexTurnPermissions('default', '/workspace').sandboxPolicy.type, 'workspaceWrite');
});

test('DSH defaults to full-access when available, otherwise native default; explicit unsupported mode fails before command', async () => {
  for (const fullAccess of [true, false]) {
    let selected: string | undefined;
    const ok = (value: unknown) => ({ ok: true, value });
    const remote = {
      permissionPresets: { catalog: async () => ok({ defaultPreset: 'workspace-write', options: [{ value: 'workspace-write' }, ...(fullAccess ? [{ value: 'danger-full-access' }] : [])] }) },
      commands: {
        list: async () => ok([{ name: 'permission', definitionId: '@deepseek-ai/dsh-permission-presets' }]),
        execute: async (_id: string, command: string) => { selected = command.slice('/permission '.length); return ok({ result: { kind: 'success' } }); },
      },
    };
    const snapshot = async () => ({ projections: { values: { permissions: { currentValue: selected } } } });
    await applyDshPermissions(remote, 'context', undefined, snapshot);
    assert.equal(selected, fullAccess ? 'danger-full-access' : 'workspace-write');
    await applyDshPermissions(remote, 'context', 'default', snapshot);
    assert.equal(selected, 'workspace-write');
    selected = undefined;
    if (!fullAccess) {
      await assert.rejects(applyDshPermissions(remote, 'context', 'full-access', snapshot), { code: 'agent_permission_unavailable' });
      assert.equal(selected, undefined);
    } else {
      await applyDshPermissions(remote, 'context', 'full-access', snapshot);
      assert.equal(selected, 'danger-full-access');
    }
  }
});
