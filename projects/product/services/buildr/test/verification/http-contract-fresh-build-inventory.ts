function entry(owner: any, path: any): any  {
  return Object.freeze({ owner, path });
}

function family(id: any, generator: any, sources: any, outputs: any): any  {
  return Object.freeze({
    id,
    generator: entry('buildr', generator),
    sources: Object.freeze(sources.map((path: any) => entry('buildr', path))),
    outputs: Object.freeze(outputs.map(([owner, path]: any) => entry(owner, path))),
  });
}

export const HTTP_CONTRACT_FRESH_BUILD_SUPPORT: any = Object.freeze([
  entry('buildr', 'src/infrastructure/contracts/json-schema-validator.ts'),
]);

export const HTTP_CONTRACT_FRESH_BUILD_FAMILIES: any = Object.freeze([
  family('task-record', 'tools/contracts/task-dto.ts', [
    'src/task/interfaces/http/task-http-schema.ts',
  ], [
    ['buildr', 'src/task/application/generated/task-dto.ts'],
    ['buildr-web', 'src/features/task-record/api/generated/task-dto.ts'],
  ]),
  family('task-professional', 'tools/contracts/task-professional-dto.ts', [
    'src/task/interfaces/http/task-professional-http-contracts.ts',
  ], [
    ['buildr', 'src/task/interfaces/http/generated/task-professional-http-dto.ts'],
    ['buildr-web', 'src/api/generated/task-professional-http-dto.ts'],
  ]),
  family('workspace-agent-assets', 'tools/contracts/workspace-agent-assets-dto.ts', [
    'src/workspace/interfaces/http/workspace-http-contracts.ts',
    'src/agent-assets/interfaces/http/agent-assets-http-contracts.ts',
  ], [
    ['buildr', 'src/workspace/interfaces/http/generated/workspace-http-dto.ts'],
    ['buildr-web', 'src/api/generated/workspace-http-dto.ts'],
    ['buildr', 'src/agent-assets/interfaces/http/generated/agent-assets-http-dto.ts'],
    ['buildr-web', 'src/api/generated/agent-assets-http-dto.ts'],
  ]),
  family('runtime-system', 'tools/contracts/runtime-system-dto.ts', [
    'src/web/http/buildr-web-http-contracts.ts',
    'src/system/installation/interfaces/http/release-awareness-http-contracts.ts',
    'src/system/publication/interfaces/http/publication-http-contracts.ts',
  ], [
    ['buildr', 'src/web/http/generated/runtime-system-http-dto.ts'],
    ['buildr-web', 'src/api/generated/runtime-system-http-dto.ts'],
  ]),
]);

export const HTTP_CONTRACT_FRESH_BUILD_FILES: any = Object.freeze([
  ...HTTP_CONTRACT_FRESH_BUILD_SUPPORT,
  ...HTTP_CONTRACT_FRESH_BUILD_FAMILIES.flatMap((item: any) => [item.generator, ...item.sources, ...item.outputs]),
]);
