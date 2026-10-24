import type { PermissionMode } from '../../contracts.ts';
import { resolvePermissionMode } from '../../domain/permission-mode.ts';

/** Buildr default is deliberately workspace-write/on-request, rather than a sticky native default. */
export function codexThreadPermissions(mode: PermissionMode | undefined) {
  return resolvePermissionMode(mode) === 'full-access'
    ? { sandbox: 'danger-full-access', approvalPolicy: 'never' }
    : { sandbox: 'workspace-write', approvalPolicy: 'on-request' };
}
export function codexTurnPermissions(mode: PermissionMode | undefined, cwd: string) {
  return resolvePermissionMode(mode) === 'full-access'
    ? { approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' } }
    : { approvalPolicy: 'on-request', sandboxPolicy: { type: 'workspaceWrite', writableRoots: [cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false } };
}
