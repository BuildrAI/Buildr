export const RESOURCE_WORKSPACE_ROOT = 'resources/workspace';
export const PACKAGE_RUNTIME_TARGET = 'package/targets/runtime';
export const BOOTSTRAP_CONTRACT_RESOURCE = 'resources/contracts/bootstrap.yml';

export const GENERATED_USER_REGISTRY_RESOURCE_SOURCES = Object.freeze([
  `${RESOURCE_WORKSPACE_ROOT}/.buildr/workspace.yml`,
  `${RESOURCE_WORKSPACE_ROOT}/projects/manifest.yml`,
  `${RESOURCE_WORKSPACE_ROOT}/rules/manifest.yml`,
  `${RESOURCE_WORKSPACE_ROOT}/skills/manifest.yml`,
  `${RESOURCE_WORKSPACE_ROOT}/commands/manifest.yml`,
  `${RESOURCE_WORKSPACE_ROOT}/components/manifest.yml`,
  `${RESOURCE_WORKSPACE_ROOT}/projects/capabilities.yml`,
  `${RESOURCE_WORKSPACE_ROOT}/projects/commands.yml`,
  `${RESOURCE_WORKSPACE_ROOT}/projects/services/manifest.yml`,
]);

export const LEGACY_PACKAGE_PATHS = Object.freeze([
  'package/workspace',
  'package/agent-skills',
  ['package', 'manifest.yml'].join('/'),
  ['package', 'targets', 'workspace'].join('/'),
  ['package', 'bootstrap'].join('/'),
  ['package', 'launchers', 'assets'].join('/'),
  ['package', 'bootstrap', 'bootstrap.contract.yml'].join('/'),
]);

export const BUILDR_REQUIRED_BLOCK_START = '<!-- buildr:required begin -->';
