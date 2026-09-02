function entry(owner, path) {
  return Object.freeze({ owner, path });
}

function family(id, generator, sources, outputs) {
  return Object.freeze({
    id,
    generator: entry('buildr', generator),
    sources: Object.freeze(sources.map((path) => entry('buildr', path))),
    outputs: Object.freeze(outputs.map(([owner, path]) => entry(owner, path))),
  });
}

export const HTTP_CONTRACT_FRESH_BUILD_SUPPORT = Object.freeze([
  entry('buildr', 'src/infrastructure/contracts/json-schema-validator.mjs'),
]);

export const HTTP_CONTRACT_FRESH_BUILD_FAMILIES = Object.freeze([
  family('task-record', 'tools/contracts/task-record-dto.ts', [
    'src/task/interfaces/http/task-record-http-contracts.ts',
  ], [
    ['buildr', 'src/task/interfaces/http/generated/task-record-http-dto.ts'],
    ['buildr-web', 'src/api/generated/task-record-http-dto.ts'],
  ]),
  family('task-professional', 'tools/contracts/task-professional-dto.mjs', [
    'src/task/interfaces/http/task-professional-http-contracts.ts',
  ], [
    ['buildr', 'src/task/interfaces/http/generated/task-professional-http-dto.ts'],
    ['buildr-web', 'src/api/generated/task-professional-http-dto.ts'],
  ]),
  family('workspace-agent-assets', 'tools/contracts/workspace-agent-assets-dto.mjs', [
    'src/workspace/interfaces/http/workspace-http-contracts.mjs',
    'src/agent-assets/interfaces/http/agent-assets-http-contracts.mjs',
  ], [
    ['buildr', 'src/workspace/interfaces/http/generated/workspace-http-dto.ts'],
    ['buildr-web', 'src/api/generated/workspace-http-dto.ts'],
    ['buildr', 'src/agent-assets/interfaces/http/generated/agent-assets-http-dto.ts'],
    ['buildr-web', 'src/api/generated/agent-assets-http-dto.ts'],
  ]),
  family('runtime-system', 'tools/contracts/runtime-system-dto.mjs', [
    'src/web/http/buildr-web-http-contracts.mjs',
    'src/system/installation/interfaces/http/release-awareness-http-contracts.mjs',
    'src/system/publication/interfaces/http/publication-http-contracts.mjs',
  ], [
    ['buildr', 'src/web/http/generated/runtime-system-http-dto.ts'],
    ['buildr-web', 'src/api/generated/runtime-system-http-dto.ts'],
  ]),
]);

export const HTTP_CONTRACT_FRESH_BUILD_FILES = Object.freeze([
  ...HTTP_CONTRACT_FRESH_BUILD_SUPPORT,
  ...HTTP_CONTRACT_FRESH_BUILD_FAMILIES.flatMap((item) => [item.generator, ...item.sources, ...item.outputs]),
]);
