const forbiddenProjectRootEntries = new Set([
  'bin',
  'package',
  'package-lock.json',
  'package.json',
  'scripts',
  'src',
  'test',
  'node_modules',
]);

const allowedProjectRootEntries = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'buildr',
  'capabilities.yml',
  'commands.yml',
  'docs',
  'openspec',
  'services',
  'task-environment.yml',
  'verification.yml',
]);

const requiredServiceRootEntries = new Set([
  'AGENTS.md',
  'bin',
  'package',
  'package-lock.json',
  'package.json',
  'scripts',
  'src',
  'test',
]);

export function validateProductSourceLayout({ projectEntries, serviceEntries, bridgeSource }) {
  const findings = [];

  for (const entry of projectEntries) {
    if (entry === 'node_modules') findings.push('Product Project root must not retain node_modules from a retired package root; remove it and run npm ci in projects/product/services/buildr.');
    else if (forbiddenProjectRootEntries.has(entry)) findings.push(`Project root must not own ${entry}`);
    else if (!allowedProjectRootEntries.has(entry)) findings.push(`unclassified Product root entry: ${entry}`);
  }
  for (const entry of requiredServiceRootEntries) {
    if (!serviceEntries.includes(entry)) findings.push(`Buildr Service root is missing ${entry}`);
  }
  if (!/^#!\/bin\/sh\nset -eu\nproject_root=\$\(CDPATH= cd "\$\{0%\/\*\}" && pwd\)\nexec "\$project_root\/services\/buildr\/scripts\/run-development-cli" "\$@"\s*$/u.test(bridgeSource)) {
    findings.push('projects/product/buildr must be a thin Service CLI bridge');
  }

  return findings;
}

export const productSourceLayoutContract = Object.freeze({
  allowedProjectRootEntries: [...allowedProjectRootEntries].sort(),
  forbiddenProjectRootEntries: [...forbiddenProjectRootEntries].sort(),
  requiredServiceRootEntries: [...requiredServiceRootEntries].sort(),
});
