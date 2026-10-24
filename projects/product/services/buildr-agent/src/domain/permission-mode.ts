import type { PermissionMode } from '../contracts.ts';
import { fail } from './agent-state.ts';

/** A mode is explicit user intent for this turn; history cannot grant it. */
export function resolvePermissionMode(value: unknown): PermissionMode {
  if (value === undefined) return 'default';
  if (value === 'default' || value === 'full-access') return value;
  fail('agent_permission_invalid', '权限模式无效，请重新选择。');
}
