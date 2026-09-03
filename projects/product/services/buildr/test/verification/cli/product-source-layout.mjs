const forbiddenProjectRootEntries = new Set([
  'bin',
  'package',
  'package-lock.json',
  'package.json',
  'scripts',
  'src',
  'test',
  'node_modules',
  'task-environment.yml',
]);

const allowedProjectRootEntries = new Set([
  'AGENTS.md',
  '.node-version',
  'CLAUDE.md',
  'README.md',
  'buildr',
  'capabilities.yml',
  'commands.yml',
  'docs',
  'openspec',
  'preparation.yml',
  'services',
  'verification.yml',
]);

const requiredServiceRootEntries = new Set([
  'AGENTS.md',
  'bin',
  'docs',
  'package',
  'package-lock.json',
  'package.json',
  'resources',
  'src',
  'test',
  'tools',
]);

const forbiddenServiceRootEntries = new Set(['scripts']);
const deferredPackageFiles = new Set([
  'launchers/build.mjs',
  'launchers/manage.mjs',
]);

const generatedTrackedPatterns = [
  /^projects\/product\/services\/buildr\/web-dist\//u,
  /^projects\/product\/services\/buildr\/package\/targets\/test-context\//u,
  /^projects\/product\/services\/buildr\/src\/(?:agent-assets|task|web|workspace)\/.*\/generated\/.*-dto\.ts$/u,
  /^projects\/product\/services\/buildr-web\/src\/api\/generated\/.*-dto\.ts$/u,
];

export function validateProductSourceLayout({ projectEntries, serviceEntries, packageFiles = [], trackedFiles = [], bridgeSource }) {
  const findings = [];

  for (const entry of projectEntries) {
    if (entry === 'node_modules') findings.push('Product Project root must not retain node_modules from a retired package root; remove it and run npm ci in projects/product/services/buildr.');
    else if (forbiddenProjectRootEntries.has(entry)) findings.push(`Project root must not own ${entry}`);
    else if (!allowedProjectRootEntries.has(entry)) findings.push(`unclassified Product root entry: ${entry}`);
  }
  for (const entry of requiredServiceRootEntries) {
    if (!serviceEntries.includes(entry)) findings.push(`Buildr Service root is missing ${entry}`);
  }
  for (const entry of serviceEntries) {
    if (forbiddenServiceRootEntries.has(entry)) findings.push(`Buildr Service root must not retain ${entry}`);
  }
  for (const file of packageFiles) {
    if (!deferredPackageFiles.has(file) && !file.startsWith('targets/runtime/')) {
      findings.push(`Buildr Service package/ contains non-deferred file: ${file}`);
    }
  }
  for (const file of trackedFiles) {
    if (generatedTrackedPatterns.some((pattern) => pattern.test(file))) findings.push(`generated artifact must not be tracked: ${file}`);
  }
  if (!/^#!\/bin\/sh\nset -eu\nproject_root=\$\(CDPATH= cd "\$\{0%\/\*\}" && pwd\)\nexec "\$project_root\/services\/buildr\/tools\/development\/run-development-cli" "\$@"\s*$/u.test(bridgeSource)) {
    findings.push('projects/product/buildr must be a thin Service CLI bridge');
  }

  return findings;
}

export const productSourceLayoutContract = Object.freeze({
  allowedProjectRootEntries: [...allowedProjectRootEntries].sort(),
  forbiddenProjectRootEntries: [...forbiddenProjectRootEntries].sort(),
  requiredServiceRootEntries: [...requiredServiceRootEntries].sort(),
  deferredPackageFiles: [...deferredPackageFiles].sort(),
  generatedTrackedPatterns: generatedTrackedPatterns.map((pattern) => pattern.source),
});
