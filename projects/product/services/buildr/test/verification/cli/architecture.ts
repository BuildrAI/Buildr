#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateVerificationRegistry } from '../planner.ts';
import { verificationSteps } from '../registry.ts';
import { validateProductSourceLayout } from './product-source-layout.ts';
import { COMMAND_CATALOG, COMMAND_REGISTRY } from '../../../src/bootstrap/cli/registry.ts';

const reportOnly: any = process.argv.includes('--report');
const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const projectRoot: any = path.resolve(productRoot, '../..');
const repositoryRoot: any = path.resolve(projectRoot, '../..');
const sourceRoot: any = path.join(productRoot, 'src');
const entry: any = path.join(productRoot, 'bin', 'buildr.mjs');
const serviceArchitecture: any = path.join(projectRoot, 'docs', 'architecture', 'service-architecture.md');
const problems: any[] = [];
const trackedFiles: any = execFileSync('git', ['ls-files'], { cwd: repositoryRoot, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const ignoredProjectRootEntries: any = new Set([
  '.agents', '.claude', '.codebuddy', '.cursor', '.qoder', '.trae', '.buildr', '.git',
]);

problems.push(...validateProductSourceLayout({
  projectEntries: fs.readdirSync(projectRoot).filter((entryName: any) => !ignoredProjectRootEntries.has(entryName)),
  serviceEntries: fs.readdirSync(productRoot).filter((entryName: any) => entryName !== 'node_modules'),
  packageFiles: trackedFiles.filter((file: any) => file.startsWith('projects/product/services/buildr/package/')).map((file: any) => file.slice('projects/product/services/buildr/package/'.length)),
  trackedFiles,
  bridgeSource: fs.readFileSync(path.join(projectRoot, 'buildr'), 'utf8'),
}));

function lineCount(file: any): any  {
  return fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/).length;
}

function listFiles(root: any, predicate: any = () => true): any  {
  const files: any[] = [];
  const visit: any = (directory: any) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute: any = path.join(directory, item.name);
      if (item.isDirectory()) visit(absolute);
      else if (predicate(absolute)) files.push(absolute);
    }
  };
  if (fs.existsSync(root)) visit(root);
  return files;
}

const globalApplicationResiduals: any = Object.freeze([]);
const architectureSource: any = fs.existsSync(serviceArchitecture) ? fs.readFileSync(serviceArchitecture, 'utf8') : '';
if (!architectureSource) problems.push('missing Service architecture migration ledger');
for (const residual of globalApplicationResiduals) {
  const row: any = architectureSource.split(/\r?\n/u).find((line: any) => line.includes(`\`${residual}\``));
  if (!row || !row.includes('| `deferred` |')) problems.push(`global Application residual lacks explicit deferred ledger entry: src/${residual}`);
}
for (const retired of ['application/domains/package-assets.mjs', 'application/workspace-operations.mjs']) {
  if (fs.existsSync(path.join(sourceRoot, retired))) problems.push(`retired global Application path still exists: src/${retired}`);
}
for (const file of listFiles(path.join(sourceRoot, 'application'), (item: any) => /\.(?:mjs|ts)$/u.test(item))) {
  const relative: any = path.relative(sourceRoot, file).split(path.sep).join('/');
  const covered: any = globalApplicationResiduals.some((residual: any) => residual.endsWith('/') ? relative.startsWith(residual) : relative === residual);
  if (!covered) problems.push(`global Application production file lacks migration ledger ownership: src/${relative}`);
}
for (const retiredRoot of ['domain', 'interfaces']) {
  for (const file of listFiles(path.join(sourceRoot, retiredRoot), (item: any) => /\.(?:mjs|ts)$/u.test(item))) {
    const relative: any = path.relative(sourceRoot, file).split(path.sep).join('/');
    problems.push(`global ${retiredRoot} production file lacks module ownership: src/${relative}`);
  }
}

for (const required of ['bin', 'src', 'resources', 'test', 'tools', 'docs', 'package']) {
  if (!fs.statSync(path.join(productRoot, required), { throwIfNoEntry: false })?.isDirectory()) {
    problems.push(`missing Product responsibility directory: ${required}/`);
  }
}
if (fs.existsSync(path.join(sourceRoot, 'shared'))) problems.push('src/shared/ is not an allowed ownership root');

const entryContent: any = fs.existsSync(entry) ? fs.readFileSync(entry, 'utf8') : '';
const entryLines: any = entryContent.trimEnd().split(/\r?\n/);
if (!entryContent) problems.push('missing npm executable: bin/buildr.mjs');
if (entryLines.length > 20) problems.push(`bin/buildr.mjs must remain a thin executable (found ${entryLines.length} lines)`);
if (!entryContent.includes("from '../src/bootstrap/cli/main.ts'")) problems.push('bin/buildr.mjs must delegate to src/bootstrap/cli/main.ts');
if (/function\s+(?:doctor|packageCheck|createProject|skillsAdd|componentInstall)\b/.test(entryContent)) problems.push('bin/buildr.mjs contains product implementation');

const requiredRuntime: any[] = [
  'bootstrap/cli/main.ts', 'bootstrap/cli/registry.ts', 'bootstrap/cli/help.ts',
  'bootstrap/cli/diagnostics.ts', 'bootstrap/cli/identity.ts',
  'bootstrap/runtime.ts', 'bootstrap/module-registry.ts',
  'task/interfaces/cli/task-verification.ts',
  'task/interfaces/cli/git-worktree.ts',
  'web/http/server.ts', 'web/http/router.ts', 'web/http/session.ts', 'web/http/static-files.ts', 'web/http/responses.ts', 'web/module.ts',
  'web/application/instance-lifecycle.ts', 'web/application/preview-lifecycle.ts',
  'web/infrastructure/instance-runtime.ts',
  'web/interfaces/cli/web.ts',
  'system/doctor/module.ts', 'system/doctor/application/diagnostics.ts', 'agent-assets/application/package-maintenance.ts',
  'agent-assets/application/package-maintenance/package-assets.ts', 'workspace/application/workspace-operations.ts',
  'workspace/module.ts', 'workspace/application/workspace-query-application.ts', 'workspace/application/workspace-command-application.ts',
  'workspace/infrastructure/workspace-source-filesystem.ts', 'workspace/infrastructure/workspace-source-git.ts',
  'workspace/application/project-application.ts', 'workspace/application/service-application.ts',
  'workspace/application/project-daily-progress-application.ts',
  'workspace/domain/workspace.ts', 'workspace/domain/project.ts', 'workspace/domain/service.ts',
  'workspace/domain/project-daily-progress.ts',
  'workspace/persistence/workspace-manifest-repository.ts', 'workspace/persistence/workspace-registry-repository.ts',
  'workspace/persistence/project-manifest-repository.ts', 'workspace/persistence/service-manifest-repository.ts',
  'workspace/persistence/project-daily-progress-repository.ts',
  'workspace/interfaces/cli/workspace.ts', 'workspace/interfaces/cli/project.ts', 'workspace/interfaces/cli/service.ts',
  'workspace/interfaces/cli/cli-arguments.ts', 'workspace/interfaces/cli/project-daily-progress.ts',
  'workspace/interfaces/http/workspace-http.ts',
  'task/infrastructure/git-worktree-provider.ts',
  'task/application/task-verification-application.ts', 'task/domain/task-verification.ts',
  'task/persistence/task-review-repository.ts',
  'task/persistence/task-verification-repository.ts',
  'task/module.ts', 'task/domain/task.ts', 'task/domain/task-project.ts', 'task/domain/task-service.ts', 'task/domain/task-change.ts',
  'task/domain/task-review.ts', 'task/application/task-review-application.ts', 'task/persistence/task-review-repository.ts',
  'task/application/task-query-application.ts', 'task/application/task-command-application.ts', 'task/application/task-dto.ts', 'task/application/task-validation.ts', 'task/persistence/task-repository.ts',
  'task/persistence/task-project-repository.ts', 'task/persistence/task-service-repository.ts', 'task/persistence/task-change-repository.ts',
  'task/interfaces/cli/task.ts', 'task/interfaces/cli/task-review.ts',
  'task/interfaces/http/task-http.ts', 'task/interfaces/http/task-review-http.ts',
  'task/interfaces/http/task-lifecycle-core.ts',
  'agent-assets/module.ts', 'agent-assets/interfaces/cli/agent-assets.ts',
  'agent-assets/application/rules.ts', 'agent-assets/application/skills.ts',
  'agent-assets/application/commands.ts', 'agent-assets/application/components.ts', 'task/openspec/application/openspec-application.ts',
  'task/openspec/module.ts', 'task/change/module.ts', 'task/change/application/change-application.ts',
  'system/publication/module.ts', 'system/publication/application/publication-application.ts',
  'agent-assets/application/runtime.ts', 'agent-assets/application/runtime-projection.ts', 'infrastructure/contracts/public-json.ts',
  'infrastructure/platform.ts', 'infrastructure/product-layout.ts', 'infrastructure/process.ts', 'infrastructure/filesystem/index.ts',
  'infrastructure/contracts/declaration-intake.ts', 'system/installation/domain/release-version.ts',
  'infrastructure/index.ts', 'infrastructure/sqlite/workspace-sqlite.ts',
  'agent-assets/infrastructure/runtime/adapter-contract.ts', 'agent-assets/infrastructure/runtime/render-claude-code.ts',
  'system/doctor/application/scope-diagnostics.ts', 'system/doctor/application/service-diagnostics.ts',
  'system/doctor/application/runtime-diagnostics.ts', 'agent-assets/application/package-maintenance/static-validation.ts',
  'agent-assets/application/package-maintenance/smoke-checks.ts', 'agent-assets/application/package-maintenance/verification-registry.ts',
  'agent-assets/application/package-maintenance/output.ts',
];
for (const relative of requiredRuntime) {
  if (!fs.existsSync(path.join(sourceRoot, relative))) problems.push(`missing Product runtime module: src/${relative}`);
}

const packageSmoke: any = path.join(sourceRoot, 'agent-assets/application/package-maintenance/smoke-checks.ts');
if (fs.existsSync(packageSmoke) && /runPackageSmokeChecks/.test(fs.readFileSync(packageSmoke, 'utf8'))) {
  problems.push('package verification must not restore the shared runPackageSmokeChecks monolith');
}

const sourceFiles: any = listFiles(sourceRoot, (file: any) => /\.(?:mjs|ts)$/u.test(file));
const graph: any = new Map();
const layerOf: any = (relative: any) => {
  if (relative === 'infrastructure/contracts/public-json.ts') return 'infrastructure';
  const parts: any = relative.split('/');
  if (parts[0] === 'infrastructure') return 'infrastructure';
  const moduleOffset: any = (
    (parts[0] === 'system' && ['installation', 'doctor', 'publication'].includes(parts[1]))
    || (parts[0] === 'task' && ['change', 'openspec'].includes(parts[1]))
  ) ? 2 : 1;
  if (!['task', 'web', 'workspace', 'agent-assets', 'system', 'verification'].includes(parts[0]) && moduleOffset === 1) return parts[0];
  if (parts.length === moduleOffset + 1 && /^module\.(?:mjs|ts)$/.test(parts[moduleOffset])) return 'module';
  return {
    domain: 'domain',
    application: 'application',
    persistence: 'infrastructure',
    infrastructure: 'infrastructure',
    interfaces: 'interfaces',
    http: 'interfaces',
    contracts: 'domain',
  }[parts[moduleOffset]] || parts[0];
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
  'agent-assets/module.ts -> workspace/module.ts',
  'web/infrastructure/instance-runtime.ts -> system/installation/module.ts',
  'web/module.ts -> system/installation/module.ts',
  'web/module.ts -> workspace/module.ts',
  'bootstrap/cli/registry.ts -> task/openspec/module.ts',
  'bootstrap/runtime.ts -> system/publication/module.ts',
  'bootstrap/runtime.ts -> task/openspec/module.ts',
  'bootstrap/runtime.ts -> task/change/module.ts',
  'task/openspec/module.ts -> workspace/module.ts',
  'task/change/module.ts -> task/openspec/module.ts',
  'task/change/module.ts -> workspace/module.ts',
  'system/publication/module.ts -> workspace/module.ts',
  'verification/module.ts -> workspace/module.ts',
]);

for (const file of sourceFiles) {
  const relative: any = path.relative(sourceRoot, file).split(path.sep).join('/');
  const content: any = fs.readFileSync(file, 'utf8');
  if (/import\s+\*\s+as\s+platform\b/.test(content) && relative !== 'bootstrap/runtime.ts') {
    problems.push(`wide platform namespace import: src/${relative}`);
  }
  if (relative !== 'bootstrap/runtime.ts' && /from\s+['"][^'"]*infrastructure\/platform\.ts['"]/.test(content)) {
    problems.push(`composition-only platform registry import: src/${relative}`);
  }
  if (/const\s+(register[A-Za-z0-9_]+)\s*=\s*\(\.\.\.args\)\s*=>\s*runtime\.\1\(\.\.\.args\)/.test(content)) {
    problems.push(`unused self-registration forwarding wrapper: src/${relative}`);
  }
  if (/from\s+['"][^'"]*(?:test\/|tools\/|scripts\/)/.test(content)) problems.push(`Product runtime imports checkout-only code: src/${relative}`);
  const edges: any[] = [];
  for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const specifier: any = match[1];
    if (!specifier.startsWith('.')) continue;
    const requestedTarget: any = path.resolve(path.dirname(file), specifier);
    const typescriptSourceTarget: any = file.endsWith('.ts') && requestedTarget.endsWith('.js')
      ? `${requestedTarget.slice(0, -3)}.ts`
      : requestedTarget;
    const target: any = fs.existsSync(requestedTarget) ? requestedTarget : typescriptSourceTarget;
    if (!fs.existsSync(target)) problems.push(`src/${relative} imports missing module ${specifier}`);
    if (!target.startsWith(sourceRoot + path.sep)) continue;
    const targetRelative: any = path.relative(sourceRoot, target).split(path.sep).join('/');
    edges.push(targetRelative);
    const sourceLayer: any = layerOf(relative);
    const targetLayer: any = layerOf(targetRelative);
    if (!allowedTargets[sourceLayer]?.has(targetLayer)
      && !allowedCrossModulePorts.has(`${relative} -> ${targetRelative}`)) {
      problems.push(`reverse Product layer import: src/${relative} -> src/${targetRelative}`);
    }
  }
  graph.set(relative, edges);
}

const visiting: any = new Set();
const visited: any = new Set();
const visitCycle: any = (file: any, stack: any = []) => {
  if (visiting.has(file)) problems.push(`Product runtime import cycle: ${[...stack, file].join(' -> ')}`);
  if (visited.has(file) || visiting.has(file)) return;
  visiting.add(file);
  for (const next of graph.get(file) || []) visitCycle(next, [...stack, file]);
  visiting.delete(file);
  visited.add(file);
};
for (const file of graph.keys()) visitCycle(file);

const bootstrapRuntimeConsumers: any = new Set([
  'bootstrap/cli/registry.ts',
  'web/http/read-worker.ts',
]);
for (const file of sourceFiles) {
  const relative: any = path.relative(sourceRoot, file).split(path.sep).join('/');
  const content: any = fs.readFileSync(file, 'utf8');
  if (/(?:from\s+|import\()['"][^'"]*bootstrap\/runtime\.ts/.test(content) && !bootstrapRuntimeConsumers.has(relative)) {
    problems.push(`new Bootstrap runtime consumer outside the explicit runtime-port baseline: src/${relative}`);
  }
}

const facadeLimits: any = new Map([
  ['src/agent-assets/infrastructure/runtime/render-claude-code.ts', 100],
  ['src/system/doctor/application/diagnostics.ts', 250],
  ['src/agent-assets/application/package-maintenance.ts', 550],
  ['test/verification/verify-buildr-product-fast', 20],
  ['test/verification/candidate.ts', 100],
]);
for (const [relative, limit] of facadeLimits) {
  const file: any = path.join(productRoot, relative);
  if (!fs.existsSync(file)) problems.push(`missing stable facade: ${relative}`);
  else if (lineCount(file) > limit) problems.push(`${relative} must remain a composition facade (found ${lineCount(file)} lines, limit ${limit})`);
}

for (const module of ['arguments.ts', 'manifests.ts', 'contributions.ts', 'sources.ts', 'render-plan.ts']) {
  if (!fs.existsSync(path.join(sourceRoot, 'agent-assets', 'infrastructure', 'runtime', 'skills', module))) problems.push(`missing runtime Skill renderer module: ${module}`);
}
const workspaceVerificationRoot: any = path.join(productRoot, 'test', 'verification', 'workspace');
const workspaceVerificationFiles: any[] = ['fixture.ts', 'suites.ts', 'workspace-lifecycle.ts', 'ownership-recovery.ts', 'runtime-reconciliation.ts'];
for (const file of workspaceVerificationFiles) {
  if (!fs.existsSync(path.join(workspaceVerificationRoot, file))) problems.push(`missing Workspace E2E module: ${file}`);
}

const registryValidation: any = validateVerificationRegistry();
if (!registryValidation.ok) problems.push(`invalid verification registry: ${JSON.stringify(registryValidation.findings)}`);
for (const suite of ['workspace-lifecycle', 'ownership-recovery', 'runtime-reconciliation']) {
  if (!verificationSteps.some((step: any) => step.executor.type === 'workspace-suite' && step.executor.selector === suite)) {
    problems.push(`verification registry is missing Workspace E2E suite: ${suite}`);
  }
}
const candidateSource: any = fs.readFileSync(path.join(productRoot, 'test', 'verification', 'candidate.ts'), 'utf8');
if (
  !candidateSource.includes("profile: 'candidate'")
  || !candidateSource.includes("request.profile === 'daily-full' ? 'core' : request.profile")
  || !candidateSource.includes('profiles: [registryProfile]')
) {
  problems.push('candidate verifier must default to the complete candidate profile while allowing daily-full and the core compatibility lane');
}
if (/\b(?:nodeStep|commandStep|runBatch|workspaceSuiteSteps|candidateStepBudget)\b/.test(candidateSource)) {
  problems.push('candidate verifier must not inline step commands, batches, suites, or budgets');
}
for (const module of ['registry.ts', 'planner.ts', 'dag-scheduler.ts', 'executor.ts', 'plan-runner.ts', 'changed.ts', 'focus.ts']) {
  if (!fs.existsSync(path.join(productRoot, 'test', 'verification', module))) problems.push(`missing verification planning module: ${module}`);
}
for (const required of ['candidate-tarball', 'docs-quality', 'workspace-lifecycle', 'package-static', 'runtime-adapter-parity', 'openspec-candidate-audit', 'release-tarball-smoke']) {
  if (!verificationSteps.some((step: any) => step.id === required && step.profiles.includes('candidate'))) problems.push(`candidate profile is missing required gate: ${required}`);
}
if (verificationSteps.filter((step: any) => step.executor.type === 'candidate-artifact').length !== 1) problems.push('verification registry must declare exactly one candidate artifact');

const packageJson: any = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
if (packageJson.bin?.buildr !== 'bin/buildr.mjs') problems.push('package.json bin must expose bin/buildr.mjs');
const candidatePackageSource: any = fs.readFileSync(path.join(productRoot, 'test', 'verification', 'release', 'candidate-package.ts'), 'utf8');
if (!candidatePackageSource.includes('buildApplicationPayload(') || !candidatePackageSource.includes('createReleaseArtifact(')) {
  problems.push('formal candidate must build the application payload and create the release artifact from that frozen payload');
}
if (/npm(?:Executable)?[^\n]*\[\s*['"]pack['"][^\n]*productRoot/u.test(candidatePackageSource)) {
  problems.push('formal candidate must not npm pack the development product root');
}
if (packageJson.scripts?.['test:focus'] !== 'node test/verification/focus.ts') problems.push('package.json must expose the unified focus selector');
if (packageJson.scripts?.['test:release'] !== 'node test/verification/release/release-smoke.ts') problems.push('package.json must retain the cross-platform release smoke entry');
if (packageJson.scripts?.['test:launcher-platform'] !== 'node test/verification/release/release-smoke.ts --platform-launcher') problems.push('package.json must expose the explicit platform Launcher integration entry');
if (!fs.existsSync(path.join(productRoot, 'test', 'verification', 'release', 'platform-launcher-invocation.ts'))) problems.push('platform Launcher integration module is missing');
const expectedPackageExports: any = {
  './test-context': {
    types: './package/targets/test-context/index.d.ts',
    import: './test-context.mjs',
    default: './test-context.mjs',
  },
  './package.json': './package.json',
  './*': './*',
};
if (JSON.stringify(packageJson.exports) !== JSON.stringify(expectedPackageExports)) {
  problems.push('package exports must expose only the documented Test Context facade and compatibility subpaths');
}
if (!packageJson.files?.includes('test-context.mjs')) problems.push('npm package must include the public Test Context facade');

const registry: any = path.join(sourceRoot, 'bootstrap', 'cli', 'registry.ts');
if (fs.existsSync(registry)) {
  const source: any = fs.readFileSync(registry, 'utf8');
  if (!source.includes('COMMAND_REGISTRY')) problems.push('command registry must expose one explicit COMMAND_REGISTRY');
  const keys: any = COMMAND_CATALOG.map((item: any) => item.key);
  const duplicates: any = keys.filter((key: any, index: any) => keys.indexOf(key) !== index);
  if (duplicates.length) problems.push(`duplicate command registry keys: ${[...new Set(duplicates)].join(', ')}`);
  const surfaces: any = new Set(['primary', 'agent-machine', 'maintenance']);
  for (const descriptor of COMMAND_CATALOG) {
    if (!surfaces.has(descriptor.surface)) problems.push(`command has invalid surface: ${descriptor.key}`);
    if (!descriptor.summary?.trim()) problems.push(`command is missing summary: ${descriptor.key}`);
    if (!Array.isArray(descriptor.help) || !descriptor.help.some((line: any) => line.startsWith('Usage:'))) problems.push(`command is missing canonical help: ${descriptor.key}`);
    if (descriptor.executable && (typeof descriptor.match !== 'function' || typeof descriptor.run !== 'function')) problems.push(`executable command is missing match/run: ${descriptor.key}`);
    if (!descriptor.executable && (descriptor.match || descriptor.run)) problems.push(`aggregate command must not execute: ${descriptor.key}`);
  }
  if (COMMAND_REGISTRY.some((item: any) => !item.executable)) problems.push('COMMAND_REGISTRY must contain executable descriptors only');
  for (const retired of ['openspec audit', 'openspec baseline create', 'openspec check', 'openspec sync-plan', 'openspec sync-apply', 'skills migrate-project-assets']) {
    if (keys.includes(retired)) problems.push(`retired command remains in catalog: ${retired}`);
  }
  if (!source.includes('registerCommandHelp(runtime, commandCatalog)')) problems.push('dispatch and help must consume the same per-runtime command catalog');
  if (!source.includes("runtimeContributions(runtime, 'cli')")) problems.push('command registry must merge module CLI contributions from Bootstrap');
}

const taskQueryApplication: any = path.join(sourceRoot, 'task', 'application', 'task-query-application.ts');
const taskCommandApplication: any = path.join(sourceRoot, 'task', 'application', 'task-command-application.ts');
const taskInterface: any = path.join(sourceRoot, 'task', 'interfaces', 'cli', 'task.ts');
const taskRecordHttpInterface: any = path.join(sourceRoot, 'task', 'interfaces', 'http', 'task-http.ts');
const taskRecordModule: any = path.join(sourceRoot, 'task', 'module.ts');
const bootstrapRuntime: any = path.join(sourceRoot, 'bootstrap', 'runtime.ts');
const legacyRuntimeModule: any = path.join(sourceRoot, 'bootstrap', 'legacy-runtime-module.mjs');
for (const relative of [
  'domain/task-record/task-record.ts',
  'application/task-record/task-record-application.ts',
  'infrastructure/sqlite/task-record-repository.ts',
  'interfaces/cli/task.ts',
]) {
  if (fs.existsSync(path.join(sourceRoot, relative))) problems.push(`legacy Task Record implementation must be removed: src/${relative}`);
}
for (const relative of ['task/domain/record', 'task/application/record', 'task/persistence/record']) {
  if (fs.existsSync(path.join(sourceRoot, relative))) problems.push(`redundant Task Record terminal directory must be removed: src/${relative}`);
}
for (const application of [taskQueryApplication, taskCommandApplication]) {
  if (!fs.existsSync(application)) continue;
  const source: any = fs.readFileSync(application, 'utf8');
  if (/node:process|process\.(?:stdout|stderr|exitCode)|parseCli|taskCommand/.test(source)) problems.push('Task Application must not own CLI parsing, output, or process exit state');
}
if (fs.existsSync(taskInterface)) {
  const source: any = fs.readFileSync(taskInterface, 'utf8');
  if (!source.includes('export function taskCommand') || !source.includes('runtime.createTask')) {
    problems.push('Task Record CLI interface must adapt registry actions to the shared Application');
  }
}
if (fs.existsSync(taskRecordHttpInterface)) {
  const source: any = fs.readFileSync(taskRecordHttpInterface, 'utf8');
  for (const symbol of ['handleTaskHttpRequest', 'runtime.queryTasks', 'runtime.inspectTaskView', 'runtime.updateTask', 'runtime.completeTask', 'runtime.abandonTask']) {
    if (!source.includes(symbol)) problems.push(`Task Record HTTP interface must own ${symbol}`);
  }
}
if (fs.existsSync(taskRecordModule)) {
  const source: any = fs.readFileSync(taskRecordModule, 'utf8');
  const repositoryIndex: any = source.indexOf('taskRepository: createTaskRepository()');
  const applicationIndex: any = source.indexOf('registerTaskQueryApplication(privateComposition');
  for (const required of ['TASK_MODULE', 'requires:', 'provides:', 'contributions:', 'TASK_QUERY_APPLICATION', 'TASK_COMMAND_APPLICATION', 'TASK_RUNTIME_PORT']) {
    if (!source.includes(required)) problems.push(`Task Record module must expose ${required}`);
  }
  if (repositoryIndex === -1 || applicationIndex === -1 || repositoryIndex > applicationIndex) problems.push('Task Record module must privately compose repository before application');
  for (const repository of ['createTaskRepository()', 'createTaskProjectRepository()', 'createTaskServiceRepository()', 'createTaskChangeRepository()']) {
    if (!source.includes(repository)) problems.push(`Task Record module must compose ${repository}`);
  }
}
if (fs.existsSync(path.join(sourceRoot, 'application', 'compose-runtime.mjs'))) problems.push('Application layer must not retain a composition root');
if (fs.existsSync(bootstrapRuntime)) {
  const source: any = fs.readFileSync(bootstrapRuntime, 'utf8');
  for (const required of ["from '../task/module.ts'", 'createModuleRegistry', 'createSystemDoctorModule', 'installTaskModule', '__bootstrapContributions']) {
    if (!source.includes(required)) problems.push(`Bootstrap runtime must include ${required}`);
  }
  if (/registerTaskRecord(?:Repository|Application)/.test(source)) problems.push('Bootstrap runtime must not register Task Record internals directly');
}
if (fs.existsSync(legacyRuntimeModule)) problems.push('Bootstrap legacy runtime module must be removed');

const buildrWebServer: any = path.join(sourceRoot, 'web', 'http', 'server.ts');
const buildrWebRouter: any = path.join(sourceRoot, 'web', 'http', 'router.ts');
if (fs.existsSync(buildrWebServer)) {
  const source: any = fs.readFileSync(buildrWebServer, 'utf8');
  const routerSource: any = fs.existsSync(buildrWebRouter) ? fs.readFileSync(buildrWebRouter, 'utf8') : '';
  if (/task\/interfaces\/(?:cli|http)|task-(?:record|review)-http/.test(source)) problems.push('Buildr Web HTTP Host must not import Task adapters directly');
  if (!routerSource.includes('for (const contribution of httpContributions)') || !routerSource.includes('contribution.handle(')) problems.push('Buildr Web HTTP Host must dispatch module HTTP contributions');
  if (/runtime\.(?:listRegisteredWorkspaces|registerLocalWorkspace|getWorkspace|listProjects|projectDetail|listServices|serviceDetail)\(/.test(source)) problems.push('Buildr Web HTTP Host must not own Workspace Core routes');
  if (/registerLocalWorkspaceAppInterface|startBuildrWeb|manageBuildrWebPreview|scheduledMaintenance/.test(source)) problems.push('Buildr Web HTTP Host must not own instance lifecycle or CLI registration');
}

const workspaceModule: any = path.join(sourceRoot, 'workspace', 'module.ts');
if (!fs.existsSync(workspaceModule)) problems.push('Workspace Core module entry is missing');
else {
  const moduleSource: any = fs.readFileSync(workspaceModule, 'utf8');
  if (!moduleSource.includes("WORKSPACE_MODULE_ID = 'workspace-core'") || !moduleSource.includes('createWorkspaceCliContributions') || !moduleSource.includes('createWorkspaceHttpContribution')) {
    problems.push('Workspace Core module must explicitly contribute CLI and HTTP adapters');
  }
  for (const required of ['PROJECT_DAILY_PROGRESS_APPLICATION', 'createProjectDailyProgressRepository', 'registerProjectDailyProgressApplication', 'projectDailyProgressCommand']) {
    if (!moduleSource.includes(required)) problems.push(`Workspace module must own Daily Progress ${required}`);
  }
}
for (const legacy of [
  'application/domains/workspace.mjs',
  'application/project/project-application.mjs',
  'application/service/service-application.mjs',
  'application/workspace/workspace-application.mjs',
  'domain/project/project.mjs',
  'domain/service/service.mjs',
  'domain/workspace/workspace.mjs',
  'infrastructure/filesystem/project-manifest-repository.mjs',
  'infrastructure/filesystem/service-manifest-repository.mjs',
  'infrastructure/filesystem/workspace-manifest-repository.mjs',
  'infrastructure/filesystem/workspace-registry-repository.mjs',
  'domain/project-daily-progress/project-daily-progress.mjs',
  'application/project-daily-progress/project-daily-progress-application.mjs',
  'infrastructure/filesystem/project-daily-progress-store.mjs',
  'interfaces/cli/project-daily-progress.mjs',
]) {
  if (fs.existsSync(path.join(sourceRoot, legacy))) problems.push(`legacy Workspace Core entry must be removed: ${legacy}`);
}

const webModule: any = path.join(sourceRoot, 'web', 'module.ts');
const webCli: any = path.join(sourceRoot, 'web', 'interfaces', 'cli', 'web.ts');
if (!fs.existsSync(webModule) || !fs.existsSync(webCli)) problems.push('Buildr Web instance lifecycle module entry is missing');
else {
  const moduleSource: any = fs.readFileSync(webModule, 'utf8');
  const cliSource: any = fs.readFileSync(webCli, 'utf8');
  if (!moduleSource.includes("WEB_MODULE_ID = 'web-instance-lifecycle'") || !moduleSource.includes('createWebCliContributions')) problems.push('Buildr Web module must explicitly contribute lifecycle CLI commands');
  for (const key of ['web preview start', 'web preview list', 'web preview stop', 'web']) {
    if (!cliSource.includes(`key: "${key}"`)) problems.push(`Buildr Web module is missing CLI contribution: ${key}`);
  }
}
for (const legacy of ['instance-manager.mjs', 'preview-manager.mjs', 'scheduled-maintenance.mjs']) {
  if (fs.existsSync(path.join(sourceRoot, 'interfaces', 'local-app', 'runtime', legacy))) problems.push(`legacy Buildr Web lifecycle entry must be removed: ${legacy}`);
}

const legacyTaskRecordConsumers: any = new Set([
  'application/change/change-application.mjs',
  'task/change/module.ts',
  'task/change/interfaces/http/change-http.ts',
  'workspace/application/project-daily-progress-application.ts',
  'task/application/task-verification-application.ts',
  'task/infrastructure/git-worktree-provider.ts',
  'task/persistence/task-retrospective-document.ts',
  'task/persistence/task-verification-repository.ts',
  'web/http/server.ts',
  'web/application/preview-lifecycle.ts',
]);
const legacyTaskRecordMethod: any = /\.(?:assertCanonicalTaskWorkspace|taskDirectory|ensureTaskDirectory|readTask|prepareTask|queryTaskViews|readTaskView|createTaskPersistence|mutateTaskPersistence|writeTaskPersistence|queryTasks|inspectTask|inspectTaskView|createTask|updateTask|activateTask|completeTask|abandonTask)\(/;
for (const file of sourceFiles) {
  const relative: any = path.relative(sourceRoot, file).split(path.sep).join('/');
  if (relative.startsWith('task/') || relative.startsWith('bootstrap/')) continue;
  if (legacyTaskRecordMethod.test(fs.readFileSync(file, 'utf8')) && !legacyTaskRecordConsumers.has(relative)) {
    problems.push(`new wide Runtime Task Record consumer outside the explicit runtime-port baseline: src/${relative}`);
  }
}

const taskReviewApplication: any = path.join(sourceRoot, 'task', 'application', 'task-review-application.ts');
const taskReviewInterface: any = path.join(sourceRoot, 'task', 'interfaces', 'cli', 'task-review.mjs');
if (fs.existsSync(taskReviewApplication)) {
  const source: any = fs.readFileSync(taskReviewApplication, 'utf8');
  if (/node:process|process\.(?:stdout|stderr|exitCode)|taskReviewCommand|parseTaskReviewCli/.test(source)) {
    problems.push('Task Review Application must not own CLI parsing, output, or process exit state');
  }
  if (!source.includes('runtime.readTaskReviewResultPersistence') || !source.includes('runtime.writeTaskReviewResultPersistence')) {
    problems.push('Task Review Application must remain the shared reader/writer over the narrow repository');
  }
}
if (fs.existsSync(taskReviewInterface)) {
  const source: any = fs.readFileSync(taskReviewInterface, 'utf8');
  if (!source.includes('export function taskReviewCommand') || !source.includes('runtime.inspectTaskReview') || !source.includes('runtime.recordTaskReview')) {
    problems.push('Task Review CLI interface must adapt both actions to the shared Application');
  }
}

const taskVerificationApplication: any = path.join(sourceRoot, 'application', 'task-verification', 'task-verification-application.ts');
const taskVerificationInterface: any = path.join(sourceRoot, 'interfaces', 'cli', 'task-verification.ts');
if (fs.existsSync(taskVerificationApplication)) {
  const source: any = fs.readFileSync(taskVerificationApplication, 'utf8');
  if (/node:process|process\.(?:stdout|stderr|exitCode)|taskVerificationCommand|parseTaskVerificationCli/.test(source)) {
    problems.push('Task Verification Application must not own CLI parsing, output, or process exit state');
  }
  if (!source.includes('runtime.readTaskVerificationReportPersistence') || !source.includes('runtime.writeTaskVerificationReportPersistence')) {
    problems.push('Task Verification Application must remain the shared reader/writer over the narrow repository');
  }
}
if (fs.existsSync(taskVerificationInterface)) {
  const source: any = fs.readFileSync(taskVerificationInterface, 'utf8');
  if (!source.includes('export function taskVerificationCommand') || !source.includes('runtime.inspectTaskVerification') || !source.includes('runtime.recordTaskVerification')) {
    problems.push('Task Verification CLI interface must adapt both actions to the shared Application');
  }
}
const dailyProgressApplication: any = path.join(sourceRoot, 'workspace', 'application', 'project-daily-progress-application.ts');
const dailyProgressInterface: any = path.join(sourceRoot, 'workspace', 'interfaces', 'cli', 'project-daily-progress.ts');
if (fs.existsSync(dailyProgressApplication)) {
  const source: any = fs.readFileSync(dailyProgressApplication, 'utf8');
  if (/node:process|process\.(?:stdout|stderr|exitCode)|projectDailyProgressCommand/.test(source)) {
    problems.push('Daily Progress Application must not own CLI parsing, output, or process exit state');
  }
  if (!source.includes('runtime.dailyProgressRepository.writeDailyProgressDocument') || !source.includes('runtime.inspectTask')) {
    problems.push('Daily Progress Application must write files through the store and only inspect Task Record');
  }
}
if (fs.existsSync(dailyProgressInterface)) {
  const source: any = fs.readFileSync(dailyProgressInterface, 'utf8');
  if (!source.includes('export function projectDailyProgressCommand') || !source.includes('runtime.recordProjectDailyProgress')) {
    problems.push('Daily Progress CLI interface must adapt registry actions to the shared Application');
  }
}
if ([buildrWebServer, buildrWebRouter].some((file: any) => fs.existsSync(file) && /inspect(?:Project|Task)DailyProgress/.test(fs.readFileSync(file, 'utf8')))) {
  problems.push('Buildr Web HTTP Host must not own Daily Progress routes');
}

const gitWorktreeProvider: any = path.join(sourceRoot, 'application', 'worktree', 'git-worktree-provider.mjs');
const gitWorktreeInterface: any = path.join(sourceRoot, 'task', 'interfaces', 'cli', 'git-worktree.ts');
if (fs.existsSync(gitWorktreeProvider)) {
  const source: any = fs.readFileSync(gitWorktreeProvider, 'utf8');
  if (/process\.(?:stdout|stderr|exitCode)|gitWorktreeCommand|assertNoUnknownOptions|positionalArgs/.test(source)) {
    problems.push('Git worktree provider must not own CLI parsing, output, or process exit state');
  }
}
if (fs.existsSync(gitWorktreeInterface)) {
  const source: any = fs.readFileSync(gitWorktreeInterface, 'utf8');
  if (!source.includes('export function gitWorktreeCommand') || !source.includes('runtime.prepareGitWorktrees')) {
    problems.push('Git worktree CLI interface must adapt registry actions to the narrow provider Application');
  }
}

const legacyRootTokens: any[] = [
  'package/' + 'manifest.yml',
  'package/targets/' + 'workspace',
  'package/launchers/' + 'assets',
  ['package', 'bootstrap'].join('/'),
  'src/web/' + 'web-dist',
  'scripts/' + 'release',
  'scripts/' + 'run-development',
];
const currentRoots: any[] = ['bin', 'src', 'resources', 'test', 'docs', 'package', 'tools'];
for (const root of currentRoots) {
  for (const file of listFiles(path.join(productRoot, root), (item: any) => /\.(?:mjs|js|json|md|yml|yaml)$/.test(item) || !path.extname(item))) {
    const relative: any = path.relative(productRoot, file).split(path.sep).join('/');
    const content: any = fs.readFileSync(file, 'utf8');
    const historicalDocumentation: any = relative.startsWith('docs/archive/');
    if (legacyRootTokens.some((token: any) => content.includes(token)) && !relative.startsWith('test/fixtures/') && !historicalDocumentation) {
      problems.push(`current Product file references migrated root path: ${relative}`);
    }
  }
}

const workspaceRoot: any = path.resolve(productRoot, '..', '..');
const currentCallers: any[] = [
  path.join(productRoot, 'AGENTS.md'),
  path.join(productRoot, 'README.md'),
  path.join(workspaceRoot, '.github', 'pull_request_template.md'),
  path.join(workspaceRoot, '.github', 'workflows', 'publish.yml'),
  path.join(workspaceRoot, '.github', 'workflows', 'verify.yml'),
  path.join(workspaceRoot, 'skills', 'buildr-release', 'SKILL.md'),
];
for (const file of currentCallers) {
  if (!fs.existsSync(file)) continue;
  if (legacyRootTokens.some((token: any) => fs.readFileSync(file, 'utf8').includes(token))) {
    problems.push(`current Product caller references migrated root path: ${path.relative(workspaceRoot, file).split(path.sep).join('/')}`);
  }
}

if (problems.length) {
  const heading: any = reportOnly ? 'CLI architecture gaps:' : 'CLI architecture verification failed:';
  console.error(heading);
  for (const problem of problems) console.error(`- ${problem}`);
  if (!reportOnly) process.exit(1);
} else {
  console.log('CLI architecture verification passed: source/generated lifecycle, bin/src/resources/test/tools/docs ownership, deferred package allowlist, runtime inventory, one-way imports, command registry, and npm boundary.');
}
