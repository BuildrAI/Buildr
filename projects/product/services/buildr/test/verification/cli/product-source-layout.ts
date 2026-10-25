import fs from 'node:fs';
import path from 'node:path';
import { isScriptSource } from './source-imports.ts';

const forbiddenProjectRootEntries: any = new Set([
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

const allowedProjectRootEntries: any = new Set([
  'AGENTS.md',
  '.node-version',
  'CLAUDE.md',
  'README.md',
  'buildr',
  'assets',
  'capabilities.yml',
  'commands.yml',
  'docs',
  'knowledge',
  'openspec',
  'preparation.yml',
  'services',
  'tasks',
  'verification.yml',
]);

const requiredServiceRootEntries: any = new Set([
  'AGENTS.md',
  'bin',
  'docs',
  'package-lock.json',
  'package.json',
  'resources',
  'src',
  'test',
  'tools',
]);

const forbiddenServiceRootEntries: any = new Set(['scripts']);
const deferredPackageFiles: any = new Set();

const generatedTrackedPatterns: any[] = [
  /^projects\/product\/services\/(?:buildr|buildr-web)\/build\//u,
  /^projects\/product\/services\/buildr\/web-dist\//u,
  /^projects\/product\/services\/buildr\/package\/targets\/test-context\//u,
  /^projects\/product\/services\/buildr\/src\/(?:modules\/(?:agent-assets|task|workspace)|web)\/.*\/generated\/.*-dto\.ts$/u,
  /^projects\/product\/services\/buildr-web\/src\/api\/generated\/.*-dto\.ts$/u,
  /^projects\/product\/services\/buildr-web\/src\/features\/[^/]+\/.*\/generated\/.*-dto\.ts$/u,
];

export function validateProductSourceLayout({ projectEntries, serviceEntries, packageFiles = [], trackedFiles = [], bridgeSource }: any): any  {
  const findings: any[] = [];

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
    if (!deferredPackageFiles.has(file) && !file.startsWith('targets/test-context/')) {
      findings.push(`Buildr Service package/ contains non-deferred file: ${file}`);
    }
  }
  for (const file of trackedFiles) {
    if (generatedTrackedPatterns.some((pattern: any) => pattern.test(file))) findings.push(`generated artifact must not be tracked: ${file}`);
  }
  if (!/^#!\/bin\/sh\nset -eu\nproject_root=\$\(CDPATH= cd "\$\{0%\/\*\}" && pwd\)\nexec "\$project_root\/services\/buildr\/tools\/development\/run-development-cli" "\$@"\s*$/u.test(bridgeSource)) {
    findings.push('projects/product/buildr must be a thin Service CLI bridge');
  }

  return findings;
}

export const productSourceLayoutContract: any = Object.freeze({
  allowedProjectRootEntries: [...allowedProjectRootEntries].sort(),
  forbiddenProjectRootEntries: [...forbiddenProjectRootEntries].sort(),
  requiredServiceRootEntries: [...requiredServiceRootEntries].sort(),
  deferredPackageFiles: [...deferredPackageFiles].sort(),
  generatedTrackedPatterns: generatedTrackedPatterns.map((pattern: any) => pattern.source),
});

export function validateProductSourceReferences(repositoryRoot: string): string[] {
  const productPrefix = 'projects/product/services/buildr/';
  const roots = [...['bin', 'src', 'resources', 'test', 'docs', 'package', 'tools'].map(root => productPrefix + root),
    'skills/buildr-release', '.github/workflows'];
  const files = new Set([productPrefix + 'AGENTS.md', productPrefix + 'README.md', '.github/pull_request_template.md']);
  const visit = (relative: string): void => {
    const absolute = path.join(repositoryRoot, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const file = relative + '/' + entry.name;
      if (entry.isDirectory()) visit(file);
      else if (isScriptSource(file) || /\.(?:json|md|yml|yaml)$/u.test(file) || !path.extname(file)) files.add(file);
    }
  };
  for (const root of roots) visit(root);
  const retiredTokens = [
    'package/' + 'manifest.yml', 'package/targets/' + 'workspace', 'tools/build/launcher/' + 'assets',
    ['package', 'bootstrap'].join('/'), 'src/web/' + 'web-dist',
  ];
  // A retired scripts root must start a declared path. A scripts directory
  // inside an explicitly bound Skill (including a template path) is current.
  const retiredScriptRoot = /(?:^|[\s"'(\x60=])(?:\.{1,2}\/)*(?:projects\/product\/)?scripts\/(?:release|run-development)(?=[./-]|\b)/u;
  const otherSkillScripts = /skills\/(?!buildr-release(?:\/|$))[^\s"'\x60]*\/scripts\/(?:release|run-development)(?=[./-]|\b)/u;
  const findings: string[] = [];
  for (const relative of [...files].sort()) {
    if (relative.startsWith(productPrefix + 'test/fixtures/') || relative.startsWith(productPrefix + 'docs/archive/')) continue;
    const file = path.join(repositoryRoot, relative);
    if (!fs.existsSync(file)) continue;
    // Only this exact checkout-owned Skill prefix is current. Other retired
    // references in the same file must still be diagnosed.
    const source = fs.readFileSync(file, 'utf8').replaceAll('skills/buildr-release/scripts/', 'buildr-release-source/');
    if (retiredTokens.some(token => source.includes(token)) || retiredScriptRoot.test(source) || otherSkillScripts.test(source)) findings.push(`current Product file references migrated root path: ${relative}`);
  }
  return findings;
}
