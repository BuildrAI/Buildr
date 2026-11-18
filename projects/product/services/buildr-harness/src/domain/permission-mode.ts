import type { PermissionMode } from '../contracts.ts';
import { fail } from './agent-state.ts';

/** Resolve new-turn policy; historical missing fields still mean legacy default. */
export function resolvePermissionMode(value: unknown): PermissionMode {
  if (value === undefined) return 'full-access';
  if (value === 'default' || value === 'full-access') return value;
  fail('agent_permission_invalid', '权限模式无效，请重新选择。');
}
