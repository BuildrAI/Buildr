export const productLayerOf = (relative: string): string => {
  if (relative === 'infrastructure/contracts/public-json.ts') return 'infrastructure';
  const parts: any = relative.split('/');
  if (parts[0] === 'infrastructure') return 'infrastructure';
  const moduleOffset: any = parts[0] === 'modules' && parts[1] === 'task' && ['change', 'daily-progress', 'work-context'].includes(parts[2]) ? 3 : parts[0] === 'modules' ? 2 : 1;
  if (!['modules', 'web'].includes(parts[0])) return parts[0];
  if (parts.length === moduleOffset + 1 && /^module\.(?:mjs|ts)$/.test(parts[moduleOffset])) return 'module';
  return ({
    domain: 'domain',
    application: 'application',
    persistence: 'infrastructure',
    infrastructure: 'infrastructure',
    interfaces: 'interfaces',
    http: 'interfaces',
    contracts: 'domain',
  } as Record<string, string>)[parts[moduleOffset]] || parts[0];
};
const allowedTargets: any = {
  bootstrap: new Set(['bootstrap', 'interfaces', 'application', 'domain', 'infrastructure', 'module']),
  domain: new Set(['domain']),
  application: new Set(['application', 'domain', 'infrastructure', 'module']),
  infrastructure: new Set(['infrastructure', 'domain']),
  interfaces: new Set(['bootstrap', 'interfaces', 'application', 'domain', 'infrastructure', 'module']),
  module: new Set(['interfaces', 'application', 'domain', 'infrastructure']),
};
const allowedCrossModulePorts: any = new Set([
  'modules/workbench/module.ts -> modules/task/module.ts',
  'modules/workbench/module.ts -> modules/workspace/module.ts',
  'modules/knowledge/module.ts -> modules/workspace/module.ts',
  'modules/knowledge/module.ts -> modules/agent-assets/module.ts',
  'modules/agent-assets/module.ts -> modules/workspace/module.ts',
  'modules/diagnostics/module.ts -> modules/workspace/module.ts',
  'modules/openspec/module.ts -> modules/agent-assets/module.ts',
  'web/infrastructure/instance-runtime.ts -> modules/installation/module.ts',
  'web/module.ts -> modules/installation/module.ts',
  'web/module.ts -> modules/workspace/module.ts',
  'bootstrap/cli/registry.ts -> modules/openspec/module.ts',
  'bootstrap/runtime.ts -> modules/publication/module.ts',
  'bootstrap/runtime.ts -> modules/openspec/module.ts',
  'bootstrap/runtime.ts -> modules/task/change/module.ts',
  'modules/openspec/module.ts -> modules/workspace/module.ts',
  'modules/task/change/module.ts -> modules/openspec/module.ts',
  'modules/task/change/module.ts -> modules/workspace/module.ts',
  'modules/publication/module.ts -> modules/workspace/module.ts',
  'modules/project-testing/module.ts -> modules/workspace/module.ts',
  'modules/task/module.ts -> modules/workspace/module.ts',
  'modules/task/change/module.ts -> modules/task/module.ts',
]);

export function isAllowedProductLayerImport(source: string, target: string): boolean {
  return Boolean(allowedTargets[productLayerOf(source)]?.has(productLayerOf(target)) || allowedCrossModulePorts.has(`${source} -> ${target}`));
}
