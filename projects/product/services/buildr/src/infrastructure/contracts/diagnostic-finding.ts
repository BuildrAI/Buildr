export function addDoctorFinding(result: any, status: string, code: string, message: string, extra: any = {}): void {
  const gitFinding = /(?:git|remote|branch|dirty|worktree)/.test(code);
  const prefix = code.split('.')[0];
  const aliases: Record<string, string> = {
    projects: 'project', project: 'project', services: 'service', service: 'service', runtime: 'runtime',
    components: 'component', component: 'component', commands: 'command', command: 'command',
    capability: 'capability', mutation: 'transaction', installation: 'installation', launcher: 'installation',
  };
  const domain = extra.domain || (gitFinding ? 'git' : (aliases[prefix] || 'workspace'));
  const defaultActions: Record<string, string[]> = {
    workspace: ['inspect', 'sync'], project: ['inspect', 'create', 'update', 'sync'], service: ['inspect', 'create', 'update', 'sync'],
    git: ['inspect', 'finish'], runtime: ['inspect', 'render', 'sync'], component: ['inspect', 'reconcile', 'sync'],
    command: ['inspect', 'execute'], capability: ['inspect', 'execute'], transaction: ['recover'], installation: ['inspect', 'update'],
  };
  const scope = extra.scope || (extra.project && extra.service ? `projects/${extra.project}/services/${extra.service}` : extra.project ? `projects/${extra.project}` : '.');
  const affectedActions = Array.isArray(extra.affectedActions) ? extra.affectedActions : defaultActions[domain];
  const ownershipUnit = extra.ownershipUnit || extra.path || `${domain}:${scope}`;
  result.findings.push({ status, code, message, domain, scope, affectedActions, ownershipUnit, ...extra });
}
