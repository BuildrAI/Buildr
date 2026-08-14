export const PACKAGE_WORKSPACE_TARGET = 'package/targets/workspace';
export const PACKAGE_RUNTIME_TARGET = 'package/targets/runtime';
export const PACKAGE_BOOTSTRAP_CONTRACT = 'package/bootstrap/contract.yml';

export const GENERATED_USER_REGISTRY_PACKAGE_SOURCES = Object.freeze([
  `${PACKAGE_WORKSPACE_TARGET}/.buildr/workspace.yml`,
  `${PACKAGE_WORKSPACE_TARGET}/projects/manifest.yml`,
  `${PACKAGE_WORKSPACE_TARGET}/rules/manifest.yml`,
  `${PACKAGE_WORKSPACE_TARGET}/skills/manifest.yml`,
  `${PACKAGE_WORKSPACE_TARGET}/commands/manifest.yml`,
  `${PACKAGE_WORKSPACE_TARGET}/components/manifest.yml`,
  `${PACKAGE_WORKSPACE_TARGET}/projects/capabilities.yml`,
  `${PACKAGE_WORKSPACE_TARGET}/projects/commands.yml`,
  `${PACKAGE_WORKSPACE_TARGET}/projects/services/manifest.yml`,
]);

export const LEGACY_PACKAGE_PATHS = Object.freeze([
  'package/workspace',
  'package/agent-skills',
  'package/bootstrap/bootstrap.contract.yml',
]);

export const BUILDR_REQUIRED_BLOCK_START = '<!-- buildr:required begin -->';
