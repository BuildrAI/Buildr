#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVerificationRegistry } from '../planner.mjs';
import { verificationSteps } from '../registry.mjs';
import { validateProductSourceLayout } from './product-source-layout.mjs';
import { COMMAND_CATALOG, COMMAND_REGISTRY } from '../../../src/bootstrap/cli/registry.mjs';

const reportOnly = process.argv.includes('--report');
const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const projectRoot = path.resolve(productRoot, '../..');
const sourceRoot = path.join(productRoot, 'src');
const entry = path.join(productRoot, 'bin', 'buildr.mjs');
const problems = [];
const ignoredProjectRootEntries = new Set([
  '.agents', '.claude', '.codebuddy', '.cursor', '.qoder', '.trae', '.buildr', '.git',
]);

problems.push(...validateProductSourceLayout({
  projectEntries: fs.readdirSync(projectRoot).filter((entryName) => !ignoredProjectRootEntries.has(entryName)),
  serviceEntries: fs.readdirSync(productRoot).filter((entryName) => entryName !== 'node_modules'),
  packageFiles: listFiles(path.join(productRoot, 'package')).map((file) => path.relative(path.join(productRoot, 'package'), file).split(path.sep).join('/')),
  bridgeSource: fs.readFileSync(path.join(projectRoot, 'buildr'), 'utf8'),
}));

function lineCount(file) {
  return fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/).length;
}

function listFiles(root, predicate = () => true) {
  const files = [];
  const visit = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) visit(absolute);
      else if (predicate(absolute)) files.push(absolute);
    }
  };
  if (fs.existsSync(root)) visit(root);
  return files;
}

for (const required of ['bin', 'src', 'resources', 'web-dist', 'test', 'tools', 'docs', 'package']) {
  if (!fs.statSync(path.join(productRoot, required), { throwIfNoEntry: false })?.isDirectory()) {
    problems.push(`missing Product responsibility directory: ${required}/`);
  }
}
if (fs.existsSync(path.join(sourceRoot, 'shared'))) problems.push('src/shared/ is not an allowed ownership root');

const entryContent = fs.existsSync(entry) ? fs.readFileSync(entry, 'utf8') : '';
const entryLines = entryContent.trimEnd().split(/\r?\n/);
if (!entryContent) problems.push('missing npm executable: bin/buildr.mjs');
if (entryLines.length > 20) problems.push(`bin/buildr.mjs must remain a thin executable (found ${entryLines.length} lines)`);
if (!entryContent.includes("from '../src/bootstrap/cli/main.mjs'")) problems.push('bin/buildr.mjs must delegate to src/bootstrap/cli/main.mjs');
if (/function\s+(?:doctor|packageCheck|createProject|skillsAdd|componentInstall)\b/.test(entryContent)) problems.push('bin/buildr.mjs contains product implementation');

const requiredRuntime = [
  'bootstrap/cli/main.mjs', 'bootstrap/cli/registry.mjs', 'bootstrap/cli/help.mjs',
  'bootstrap/cli/diagnostics.mjs', 'bootstrap/cli/identity.ts', 'bootstrap/cli/task-finish-bootstrap.mjs',
  'bootstrap/runtime.mjs', 'bootstrap/module-registry.mjs', 'bootstrap/legacy-runtime-module.mjs',
  'interfaces/cli/task-verification.mjs',
  'interfaces/cli/task-environment.mjs', 'interfaces/cli/git-worktree.mjs',
  'interfaces/local-app/http/server.mjs', 'interfaces/local-app/runtime/preview-manager.mjs',
  'application/doctor.mjs', 'application/package-maintenance.mjs',
  'application/workspace/workspace-application.mjs', 'domain/workspace/workspace.mjs',
  'application/worktree/git-worktree-provider.mjs',
  'application/task-environment/task-environment-application.mjs',
  'domain/task-environment/task-environment.mjs', 'task/persistence/environment/task-environment-repository.mjs',
  'application/task-finish/task-finish-application.mjs', 'application/task-finish/task-finish-run.mjs',
  'application/task-finish/task-finish-product-executor.mjs',
  'application/task-verification/task-verification-application.mjs', 'domain/task-verification/task-verification.mjs',
  'task/persistence/development/task-development-repository.mjs', 'task/persistence/task-review-repository.mjs',
  'task/persistence/verification/task-verification-repository.mjs', 'task/persistence/index.mjs',
  'task/module.mjs', 'task/domain/record/task-record.mjs',
  'task/domain/task-review.mjs', 'task/application/task-review-application.mjs', 'task/persistence/task-review-repository.mjs',
  'task/application/record/task-record-application.mjs', 'task/persistence/record/task-record-repository.mjs',
  'task/interfaces/cli/task-record.mjs', 'task/interfaces/cli/task-review.mjs',
  'task/interfaces/http/task-record-http.mjs', 'task/interfaces/http/task-review-http.mjs',
  'application/domains/workspace.mjs', 'application/domains/rules.mjs', 'application/domains/skills.mjs',
  'application/domains/commands.mjs', 'application/domains/components.mjs', 'application/domains/openspec.mjs',
  'application/domains/runtime.mjs', 'application/json-contracts.mjs',
  'infrastructure/platform.mjs', 'infrastructure/product-layout.mjs', 'infrastructure/process.mjs', 'infrastructure/filesystem/index.mjs',
  'infrastructure/index.mjs', 'infrastructure/sqlite/workspace-sqlite.mjs',
  'infrastructure/filesystem/workspace-manifest-repository.mjs',
  'infrastructure/runtime/adapter-contract.mjs', 'infrastructure/runtime/render-claude-code.mjs',
  'application/doctor/scope-diagnostics.mjs', 'application/doctor/service-diagnostics.mjs',
  'application/doctor/runtime-diagnostics.mjs', 'application/package-maintenance/static-validation.mjs',
  'application/package-maintenance/smoke-checks.mjs', 'application/package-maintenance/verification-registry.mjs',
  'application/package-maintenance/output.mjs',
];
for (const relative of requiredRuntime) {
  if (!fs.existsSync(path.join(sourceRoot, relative))) problems.push(`missing Product runtime module: src/${relative}`);
}

const packageSmoke = path.join(sourceRoot, 'application/package-maintenance/smoke-checks.mjs');
if (fs.existsSync(packageSmoke) && /runPackageSmokeChecks/.test(fs.readFileSync(packageSmoke, 'utf8'))) {
  problems.push('package verification must not restore the shared runPackageSmokeChecks monolith');
}

const sourceFiles = listFiles(sourceRoot, (file) => /\.(?:mjs|ts)$/u.test(file));
const graph = new Map();
const layerOf = (relative) => {
  const parts = relative.split('/');
  if (parts[0] !== 'task') return parts[0];
  if (parts.length === 2 && parts[1] === 'module.mjs') return 'module';
  return {
    domain: 'domain',
    application: 'application',
    persistence: 'infrastructure',
    interfaces: 'interfaces',
  }[parts[1]] || 'task';
};
const allowedTargets = {
  bootstrap: new Set(['bootstrap', 'interfaces', 'application', 'domain', 'infrastructure', 'module']),
  domain: new Set(['domain']),
  application: new Set(['application', 'domain', 'infrastructure', 'module']),
  infrastructure: new Set(['infrastructure', 'domain']),
  interfaces: new Set(['bootstrap', 'interfaces', 'application', 'domain', 'infrastructure']),
  module: new Set(['interfaces', 'application', 'domain', 'infrastructure']),
};

for (const file of sourceFiles) {
  const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
  const content = fs.readFileSync(file, 'utf8');
  if (/import\s+\*\s+as\s+platform\b/.test(content) && relative !== 'bootstrap/runtime.mjs') {
    problems.push(`wide platform namespace import: src/${relative}`);
  }
  if (relative !== 'bootstrap/runtime.mjs' && /from\s+['"][^'"]*infrastructure\/platform\.mjs['"]/.test(content)) {
    problems.push(`composition-only platform registry import: src/${relative}`);
  }
  if (/const\s+(register[A-Za-z0-9_]+)\s*=\s*\(\.\.\.args\)\s*=>\s*runtime\.\1\(\.\.\.args\)/.test(content)) {
    problems.push(`unused self-registration forwarding wrapper: src/${relative}`);
  }
  if (/from\s+['"][^'"]*(?:test\/|tools\/|scripts\/)/.test(content)) problems.push(`Product runtime imports checkout-only code: src/${relative}`);
  const edges = [];
  for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), specifier);
    if (!fs.existsSync(target)) problems.push(`src/${relative} imports missing module ${specifier}`);
    if (!target.startsWith(sourceRoot + path.sep)) continue;
    const targetRelative = path.relative(sourceRoot, target).split(path.sep).join('/');
    edges.push(targetRelative);
    const sourceLayer = layerOf(relative);
    const targetLayer = layerOf(targetRelative);
    if (!allowedTargets[sourceLayer]?.has(targetLayer)) problems.push(`reverse Product layer import: src/${relative} -> src/${targetRelative}`);
  }
  graph.set(relative, edges);
}

const visiting = new Set();
const visited = new Set();
const visitCycle = (file, stack = []) => {
  if (visiting.has(file)) problems.push(`Product runtime import cycle: ${[...stack, file].join(' -> ')}`);
  if (visited.has(file) || visiting.has(file)) return;
  visiting.add(file);
  for (const next of graph.get(file) || []) visitCycle(next, [...stack, file]);
  visiting.delete(file);
  visited.add(file);
};
for (const file of graph.keys()) visitCycle(file);

const bootstrapRuntimeConsumers = new Set([
  'bootstrap/cli/registry.mjs',
  'interfaces/internal/task-development-driver-runner.mjs',
  'interfaces/internal/task-finish-maintenance-driver.mjs',
  'interfaces/internal/task-finish-retained-cleanup.mjs',
  'interfaces/internal/task-finish-target-lease-driver.mjs',
  'interfaces/internal/task-planning-identity-driver-runner.mjs',
  'interfaces/internal/task-retrospective-driver-runner.mjs',
  'interfaces/local-app/http/read-worker.mjs',
]);
for (const file of sourceFiles) {
  const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
  const content = fs.readFileSync(file, 'utf8');
  if (/(?:from\s+|import\()['"][^'"]*bootstrap\/runtime\.mjs/.test(content) && !bootstrapRuntimeConsumers.has(relative)) {
    problems.push(`new Bootstrap runtime consumer outside compatibility baseline: src/${relative}`);
  }
}

const facadeLimits = new Map([
  ['src/infrastructure/runtime/render-claude-code.mjs', 100],
  ['src/application/doctor.mjs', 250],
  ['src/application/package-maintenance.mjs', 550],
  ['test/verification/verify-buildr-product-fast', 20],
  ['test/verification/candidate.mjs', 100],
]);
for (const [relative, limit] of facadeLimits) {
  const file = path.join(productRoot, relative);
  if (!fs.existsSync(file)) problems.push(`missing stable facade: ${relative}`);
  else if (lineCount(file) > limit) problems.push(`${relative} must remain a composition facade (found ${lineCount(file)} lines, limit ${limit})`);
}

for (const module of ['arguments.mjs', 'manifests.mjs', 'contributions.mjs', 'sources.mjs', 'render-plan.mjs']) {
  if (!fs.existsSync(path.join(sourceRoot, 'infrastructure', 'runtime', 'skills', module))) problems.push(`missing runtime Skill renderer module: ${module}`);
}
const workspaceVerificationRoot = path.join(productRoot, 'test', 'verification', 'workspace');
const workspaceVerificationFiles = ['fixture.mjs', 'suites.mjs', 'workspace-lifecycle.mjs', 'ownership-recovery.mjs', 'runtime-reconciliation.mjs'];
for (const file of workspaceVerificationFiles) {
  if (!fs.existsSync(path.join(workspaceVerificationRoot, file))) problems.push(`missing Workspace E2E module: ${file}`);
}

const registryValidation = validateVerificationRegistry();
if (!registryValidation.ok) problems.push(`invalid verification registry: ${JSON.stringify(registryValidation.findings)}`);
for (const suite of ['workspace-lifecycle', 'ownership-recovery', 'runtime-reconciliation']) {
  if (!verificationSteps.some((step) => step.executor.type === 'workspace-suite' && step.executor.selector === suite)) {
    problems.push(`verification registry is missing Workspace E2E suite: ${suite}`);
  }
}
const candidateSource = fs.readFileSync(path.join(productRoot, 'test', 'verification', 'candidate.mjs'), 'utf8');
if (!candidateSource.includes("profiles: ['candidate']")) problems.push('candidate verifier must select the complete candidate profile');
if (/\b(?:nodeStep|commandStep|runBatch|workspaceSuiteSteps|candidateStepBudget)\b/.test(candidateSource)) {
  problems.push('candidate verifier must not inline step commands, batches, suites, or budgets');
}
for (const module of ['registry.mjs', 'planner.mjs', 'dag-scheduler.mjs', 'executor.mjs', 'plan-runner.mjs', 'changed.mjs', 'focus.mjs']) {
  if (!fs.existsSync(path.join(productRoot, 'test', 'verification', module))) problems.push(`missing verification planning module: ${module}`);
}
for (const required of ['candidate-tarball', 'docs-quality', 'workspace-lifecycle', 'package-static', 'runtime-adapter-parity', 'openspec-candidate-audit', 'release-tarball-smoke']) {
  if (!verificationSteps.some((step) => step.id === required && step.profiles.includes('candidate'))) problems.push(`candidate profile is missing required gate: ${required}`);
}
if (verificationSteps.filter((step) => step.executor.type === 'candidate-artifact').length !== 1) problems.push('verification registry must declare exactly one candidate artifact');

const packageJson = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
if (packageJson.bin?.buildr !== 'bin/buildr.mjs') problems.push('package.json bin must expose bin/buildr.mjs');
const candidatePackageSource = fs.readFileSync(path.join(productRoot, 'test', 'verification', 'release', 'candidate-package.mjs'), 'utf8');
if (!candidatePackageSource.includes('buildApplicationPayload(') || !candidatePackageSource.includes('createReleaseArtifact(')) {
  problems.push('formal candidate must build the application payload and create the release artifact from that frozen payload');
}
if (/npm(?:Executable)?[^\n]*\[\s*['"]pack['"][^\n]*productRoot/u.test(candidatePackageSource)) {
  problems.push('formal candidate must not npm pack the development product root');
}
if (packageJson.scripts?.['test:focus'] !== 'node test/verification/focus.mjs') problems.push('package.json must expose the unified focus selector');
if (packageJson.scripts?.['test:release'] !== 'node test/verification/release/release-smoke.mjs') problems.push('package.json must retain the cross-platform release smoke entry');
if (packageJson.scripts?.['test:launcher-platform'] !== 'node test/verification/release/release-smoke.mjs --platform-launcher') problems.push('package.json must expose the explicit platform Launcher integration entry');
if (!fs.existsSync(path.join(productRoot, 'test', 'verification', 'release', 'platform-launcher-invocation.mjs'))) problems.push('platform Launcher integration module is missing');
if (packageJson.exports) problems.push('internal Product modules must not be declared through package exports');

const registry = path.join(sourceRoot, 'bootstrap', 'cli', 'registry.mjs');
if (fs.existsSync(registry)) {
  const source = fs.readFileSync(registry, 'utf8');
  if (!source.includes('COMMAND_REGISTRY')) problems.push('command registry must expose one explicit COMMAND_REGISTRY');
  const keys = COMMAND_CATALOG.map((item) => item.key);
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicates.length) problems.push(`duplicate command registry keys: ${[...new Set(duplicates)].join(', ')}`);
  const surfaces = new Set(['primary', 'agent-machine', 'maintenance']);
  for (const descriptor of COMMAND_CATALOG) {
    if (!surfaces.has(descriptor.surface)) problems.push(`command has invalid surface: ${descriptor.key}`);
    if (!descriptor.summary?.trim()) problems.push(`command is missing summary: ${descriptor.key}`);
    if (!Array.isArray(descriptor.help) || !descriptor.help.some((line) => line.startsWith('Usage:'))) problems.push(`command is missing canonical help: ${descriptor.key}`);
    if (descriptor.executable && (typeof descriptor.match !== 'function' || typeof descriptor.run !== 'function')) problems.push(`executable command is missing match/run: ${descriptor.key}`);
    if (!descriptor.executable && (descriptor.match || descriptor.run)) problems.push(`aggregate command must not execute: ${descriptor.key}`);
  }
  if (COMMAND_REGISTRY.some((item) => !item.executable)) problems.push('COMMAND_REGISTRY must contain executable descriptors only');
  for (const retired of ['openspec audit', 'openspec baseline create', 'openspec check', 'openspec sync-plan', 'openspec sync-apply', 'skills migrate-project-assets']) {
    if (keys.includes(retired)) problems.push(`retired command remains in catalog: ${retired}`);
  }
  if (!source.includes('registerCommandHelp(runtime, commandCatalog)')) problems.push('dispatch and help must consume the same per-runtime command catalog');
  if (!source.includes("runtimeContributions(runtime, 'cli')")) problems.push('command registry must merge module CLI contributions from Bootstrap');
}

const taskRecordApplication = path.join(sourceRoot, 'task', 'application', 'record', 'task-record-application.mjs');
const taskRecordInterface = path.join(sourceRoot, 'task', 'interfaces', 'cli', 'task-record.mjs');
const taskRecordHttpInterface = path.join(sourceRoot, 'task', 'interfaces', 'http', 'task-record-http.mjs');
const taskRecordModule = path.join(sourceRoot, 'task', 'module.mjs');
const bootstrapRuntime = path.join(sourceRoot, 'bootstrap', 'runtime.mjs');
const legacyRuntimeModule = path.join(sourceRoot, 'bootstrap', 'legacy-runtime-module.mjs');
for (const relative of [
  'domain/task-record/task-record.mjs',
  'application/task-record/task-record-application.mjs',
  'infrastructure/sqlite/task-record-repository.mjs',
  'interfaces/cli/task-record.mjs',
]) {
  if (fs.existsSync(path.join(sourceRoot, relative))) problems.push(`legacy Task Record implementation must be removed: src/${relative}`);
}
if (fs.existsSync(taskRecordApplication)) {
  const source = fs.readFileSync(taskRecordApplication, 'utf8');
  if (/node:process|process\.(?:stdout|stderr|exitCode)|parseCli|taskRecordCommand/.test(source)) {
    problems.push('Task Record Application must not own CLI parsing, output, or process exit state');
  }
}
if (fs.existsSync(taskRecordInterface)) {
  const source = fs.readFileSync(taskRecordInterface, 'utf8');
  if (!source.includes('export function taskRecordCommand') || !source.includes('runtime.createTaskRecord')) {
    problems.push('Task Record CLI interface must adapt registry actions to the shared Application');
  }
}
if (fs.existsSync(taskRecordHttpInterface)) {
  const source = fs.readFileSync(taskRecordHttpInterface, 'utf8');
  for (const symbol of ['handleTaskRecordHttpRequest', 'runtime.queryTaskRecordViews', 'runtime.inspectTaskRecordView', 'runtime.updateTaskRecord', 'runtime.completeTaskRecord', 'runtime.abandonTaskRecord']) {
    if (!source.includes(symbol)) problems.push(`Task Record HTTP interface must own ${symbol}`);
  }
}
if (fs.existsSync(taskRecordModule)) {
  const source = fs.readFileSync(taskRecordModule, 'utf8');
  const repositoryIndex = source.indexOf('registerTaskRecordRepository(privateComposition)');
  const applicationIndex = source.indexOf('registerTaskRecordApplication(privateComposition)');
  for (const required of ['TASK_RECORD_MODULE', 'requires:', 'provides:', 'contributions:', 'TASK_RECORD_APPLICATION', 'TASK_RECORD_PERSISTENCE_READ', 'TASK_RECORD_COMPATIBILITY']) {
    if (!source.includes(required)) problems.push(`Task Record module must expose ${required}`);
  }
  if (repositoryIndex === -1 || applicationIndex === -1 || repositoryIndex > applicationIndex) problems.push('Task Record module must privately compose repository before application');
}
if (fs.existsSync(path.join(sourceRoot, 'application', 'compose-runtime.mjs'))) problems.push('Application layer must not retain a composition root');
if (fs.existsSync(bootstrapRuntime)) {
  const source = fs.readFileSync(bootstrapRuntime, 'utf8');
  for (const required of ["from '../task/module.mjs'", 'createModuleRegistry', 'registerLegacyRuntime', 'installTaskRecordModule', '__bootstrapContributions']) {
    if (!source.includes(required)) problems.push(`Bootstrap runtime must include ${required}`);
  }
  if (/registerTaskRecord(?:Repository|Application)/.test(source)) problems.push('Bootstrap runtime must not register Task Record internals directly');
}
if (!fs.existsSync(legacyRuntimeModule)) problems.push('Bootstrap legacy runtime module is missing');

const localAppServer = path.join(sourceRoot, 'interfaces', 'local-app', 'http', 'server.mjs');
if (fs.existsSync(localAppServer)) {
  const source = fs.readFileSync(localAppServer, 'utf8');
  if (/task\/interfaces\/(?:cli|http)|task-(?:record|review)-http/.test(source)) problems.push('Buildr Web HTTP Host must not import Task adapters directly');
  if (!source.includes('for (const contribution of httpContributions)') || !source.includes('contribution.handle(')) problems.push('Buildr Web HTTP Host must dispatch module HTTP contributions');
}

const legacyTaskRecordConsumers = new Set([
  'application/change/change-application.mjs',
  'application/project-daily-progress/project-daily-progress-application.mjs',
  'application/task-development/task-development-application.mjs',
  'application/task-entry/task-entry-snapshot-application.mjs',
  'application/task-environment/task-environment-application.mjs',
  'application/task-execution-record/task-execution-record-application.mjs',
  'application/task-finish/task-finish-application.mjs',
  'application/task-finish/task-finish-delivery-terminal.mjs',
  'application/task-planning-identity/task-planning-identity-application.mjs',
  'application/task-retrospective/task-retrospective-application.mjs',
  'application/task-terminal-delivery/task-terminal-delivery-application.mjs',
  'application/task-verification/task-verification-application.mjs',
  'application/worktree/git-worktree-provider.mjs',
  'task/persistence/environment/task-environment-repository.mjs',
  'task/persistence/coordination/parent-coordination-repository.mjs',
  'task/persistence/development/task-development-repository.mjs',
  'task/persistence/execution-record/task-execution-record-repository.mjs',
  'task/persistence/finish/task-finish-repository.mjs',
  'task/persistence/overview/task-overview-repository.mjs',
  'task/persistence/retrospective/task-retrospective-repository.mjs',
  'task/persistence/verification/task-verification-repository.mjs',
  'interfaces/local-app/http/server.mjs',
  'interfaces/local-app/runtime/preview-manager.mjs',
]);
const legacyTaskRecordMethod = /\.(?:assertCanonicalTaskWorkspace|taskRecordDirectory|ensureTaskRecordDirectory|readTaskRecordPersistence|prepareTaskRecordPersistence|listTaskRecordPersistence|queryTaskRecordViewPersistence|readTaskRecordViewPersistence|createTaskRecordPersistence|mutateTaskRecordPersistence|writeTaskRecordPersistence|listTaskRecords|queryTaskRecordViews|inspectTaskRecord|inspectTaskRecordView|createTaskRecord|updateTaskRecord|activateTaskRecord|completeTaskRecord|completeTaskRecordFromFinish|abandonTaskRecord)\(/;
for (const file of sourceFiles) {
  const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
  if (relative.startsWith('task/') || relative.startsWith('bootstrap/')) continue;
  if (legacyTaskRecordMethod.test(fs.readFileSync(file, 'utf8')) && !legacyTaskRecordConsumers.has(relative)) {
    problems.push(`new wide Runtime Task Record consumer outside compatibility baseline: src/${relative}`);
  }
}

const taskEnvironmentApplication = path.join(sourceRoot, 'application', 'task-environment', 'task-environment-application.mjs');
const taskEnvironmentInterface = path.join(sourceRoot, 'interfaces', 'cli', 'task-environment.mjs');
if (fs.existsSync(taskEnvironmentApplication)) {
  const source = fs.readFileSync(taskEnvironmentApplication, 'utf8');
  if (/process\.(?:stdout|stderr|exitCode)|taskEnvironmentCommand|assertNoUnknownOptions|positionalArgs/.test(source)) {
    problems.push('Task Environment Application must not own CLI parsing, output, or process exit state');
  }
}

const taskReviewApplication = path.join(sourceRoot, 'task', 'application', 'task-review-application.mjs');
const taskReviewInterface = path.join(sourceRoot, 'task', 'interfaces', 'cli', 'task-review.mjs');
if (fs.existsSync(taskReviewApplication)) {
  const source = fs.readFileSync(taskReviewApplication, 'utf8');
  if (/node:process|process\.(?:stdout|stderr|exitCode)|taskReviewCommand|parseTaskReviewCli/.test(source)) {
    problems.push('Task Review Application must not own CLI parsing, output, or process exit state');
  }
  if (!source.includes('runtime.readTaskReviewResultPersistence') || !source.includes('runtime.writeTaskReviewResultPersistence')) {
    problems.push('Task Review Application must remain the shared reader/writer over the narrow repository');
  }
}
if (fs.existsSync(taskReviewInterface)) {
  const source = fs.readFileSync(taskReviewInterface, 'utf8');
  if (!source.includes('export function taskReviewCommand') || !source.includes('runtime.inspectTaskReview') || !source.includes('runtime.recordTaskReview')) {
    problems.push('Task Review CLI interface must adapt both actions to the shared Application');
  }
}

const taskVerificationApplication = path.join(sourceRoot, 'application', 'task-verification', 'task-verification-application.mjs');
const taskVerificationInterface = path.join(sourceRoot, 'interfaces', 'cli', 'task-verification.mjs');
if (fs.existsSync(taskVerificationApplication)) {
  const source = fs.readFileSync(taskVerificationApplication, 'utf8');
  if (/node:process|process\.(?:stdout|stderr|exitCode)|taskVerificationCommand|parseTaskVerificationCli/.test(source)) {
    problems.push('Task Verification Application must not own CLI parsing, output, or process exit state');
  }
  if (!source.includes('runtime.readTaskVerificationResultPersistence') || !source.includes('runtime.writeTaskVerificationResultPersistence')) {
    problems.push('Task Verification Application must remain the shared reader/writer over the narrow repository');
  }
}
if (fs.existsSync(taskVerificationInterface)) {
  const source = fs.readFileSync(taskVerificationInterface, 'utf8');
  if (!source.includes('export function taskVerificationCommand') || !source.includes('runtime.inspectTaskVerification') || !source.includes('runtime.recordTaskVerification')) {
    problems.push('Task Verification CLI interface must adapt both actions to the shared Application');
  }
}
if (fs.existsSync(taskEnvironmentInterface)) {
  const source = fs.readFileSync(taskEnvironmentInterface, 'utf8');
  if (!source.includes('export async function taskEnvironmentCommand') || !source.includes('runtime.prepareTaskEnvironment')) {
    problems.push('Task Environment CLI interface must adapt registry actions to the shared Application');
  }
}

const dailyProgressApplication = path.join(sourceRoot, 'application', 'project-daily-progress', 'project-daily-progress-application.mjs');
const dailyProgressInterface = path.join(sourceRoot, 'interfaces', 'cli', 'project-daily-progress.mjs');
if (fs.existsSync(dailyProgressApplication)) {
  const source = fs.readFileSync(dailyProgressApplication, 'utf8');
  if (/node:process|process\.(?:stdout|stderr|exitCode)|projectDailyProgressCommand/.test(source)) {
    problems.push('Daily Progress Application must not own CLI parsing, output, or process exit state');
  }
  if (!source.includes('runtime.writeDailyProgressDocument') || !source.includes('runtime.inspectTaskRecord')) {
    problems.push('Daily Progress Application must write files through the store and only inspect Task Record');
  }
}
if (fs.existsSync(dailyProgressInterface)) {
  const source = fs.readFileSync(dailyProgressInterface, 'utf8');
  if (!source.includes('export function projectDailyProgressCommand') || !source.includes('runtime.recordProjectDailyProgress')) {
    problems.push('Daily Progress CLI interface must adapt registry actions to the shared Application');
  }
}

const gitWorktreeProvider = path.join(sourceRoot, 'application', 'worktree', 'git-worktree-provider.mjs');
const gitWorktreeInterface = path.join(sourceRoot, 'interfaces', 'cli', 'git-worktree.mjs');
if (fs.existsSync(gitWorktreeProvider)) {
  const source = fs.readFileSync(gitWorktreeProvider, 'utf8');
  if (/process\.(?:stdout|stderr|exitCode)|gitWorktreeCommand|assertNoUnknownOptions|positionalArgs/.test(source)) {
    problems.push('Git worktree provider must not own CLI parsing, output, or process exit state');
  }
}
if (fs.existsSync(gitWorktreeInterface)) {
  const source = fs.readFileSync(gitWorktreeInterface, 'utf8');
  if (!source.includes('export function gitWorktreeCommand') || !source.includes('runtime.prepareGitWorktrees')) {
    problems.push('Git worktree CLI interface must adapt registry actions to the narrow provider Application');
  }
}

const legacyRootTokens = [
  'package/' + 'manifest.yml',
  'package/targets/' + 'workspace',
  'package/launchers/' + 'assets',
  ['package', 'bootstrap'].join('/'),
  'src/interfaces/local-app/' + 'web-dist',
  'scripts/' + 'release',
  'scripts/' + 'run-development',
];
const currentRoots = ['bin', 'src', 'resources', 'web-dist', 'test', 'docs', 'package', 'tools'];
for (const root of currentRoots) {
  for (const file of listFiles(path.join(productRoot, root), (item) => /\.(?:mjs|js|json|md|yml|yaml)$/.test(item) || !path.extname(item))) {
    const relative = path.relative(productRoot, file).split(path.sep).join('/');
    const content = fs.readFileSync(file, 'utf8');
    const historicalDocumentation = relative.startsWith('docs/archive/');
    if (legacyRootTokens.some((token) => content.includes(token)) && !relative.startsWith('test/fixtures/') && !historicalDocumentation) {
      problems.push(`current Product file references migrated root path: ${relative}`);
    }
  }
}

const workspaceRoot = path.resolve(productRoot, '..', '..');
const currentCallers = [
  path.join(productRoot, 'AGENTS.md'),
  path.join(productRoot, 'README.md'),
  path.join(workspaceRoot, '.github', 'pull_request_template.md'),
  path.join(workspaceRoot, '.github', 'workflows', 'publish.yml'),
  path.join(workspaceRoot, '.github', 'workflows', 'verify.yml'),
  path.join(workspaceRoot, 'skills', 'buildr-release', 'SKILL.md'),
];
for (const file of currentCallers) {
  if (!fs.existsSync(file)) continue;
  if (legacyRootTokens.some((token) => fs.readFileSync(file, 'utf8').includes(token))) {
    problems.push(`current Product caller references migrated root path: ${path.relative(workspaceRoot, file).split(path.sep).join('/')}`);
  }
}

if (problems.length) {
  const heading = reportOnly ? 'CLI architecture gaps:' : 'CLI architecture verification failed:';
  console.error(heading);
  for (const problem of problems) console.error(`- ${problem}`);
  if (!reportOnly) process.exit(1);
} else {
  console.log('CLI architecture verification passed: bin/src/resources/web-dist/test/tools/docs ownership, deferred package allowlist, runtime inventory, one-way imports, command registry, and npm boundary.');
}
