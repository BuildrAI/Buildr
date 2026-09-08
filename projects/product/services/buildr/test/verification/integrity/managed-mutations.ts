#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const packageManifest: any = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
const productionFiles: any[] = [];
for (const entry of packageManifest.files.filter((file: any) => file === 'src/' || file.startsWith('src/'))) {
  if (entry.startsWith('test/verification/')) continue;
  const absolute: any = path.join(productRoot, entry);
  if (!fs.existsSync(absolute)) continue;
  if (fs.statSync(absolute).isFile()) {
    if (!path.basename(entry).startsWith('verify-')) productionFiles.push(entry);
    continue;
  }
  const visit: any = (dir: any) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const child: any = path.join(dir, item.name);
      if (item.isDirectory()) visit(child);
      else if (!item.name.startsWith('verify-') && item.name.endsWith('.ts')) {
        productionFiles.push(path.relative(productRoot, child).split(path.sep).join('/'));
      }
    }
  };
  visit(absolute);
}
productionFiles.sort();
const allowed: any = new Map([
  ['src/infrastructure/testing/context-runtime/node-test.ts', new Set(['defaultNodeTestContextRuntime'])],
  ['src/infrastructure/testing/context-runtime/node-runner.ts', new Set(['runHost'])],
  ['src/infrastructure/filesystem/index.ts', new Set(['copyDirectory', 'removePath'])],
  ['src/infrastructure/filesystem/atomic-files.ts', new Set(['atomicWriteFile'])],
  ['src/infrastructure/filesystem/exclusive-file-lock.ts', new Set(['publishCandidate', 'moveAndRemove'])],
  ['src/infrastructure/filesystem/workspace-mutation.ts', new Set([
    'snapshotMutationPath', 'removeMutationRestoreTarget', 'restoreMutationSnapshot', 'withWorkspaceMutation',
  ])],
  ['src/modules/workspace/persistence/workspace-registry-repository.ts', new Set(['withWorkspaceRegistryMutation'])],
  ['src/infrastructure/sqlite/workspace-sqlite.ts', new Set(['cleanupRetiredLocalData'])],
  ['src/modules/installation/infrastructure/npm-launcher.ts', new Set([
    'writeMacLauncherCandidate', 'writeWindowsLauncherCandidate', 'installNpmLauncher', 'uninstallNpmLauncher',
  ])],
  ['src/web/infrastructure/instance-runtime.ts', new Set([
    'acquireBuildrWebStartLock', 'releaseBuildrWebStartLock', 'clearBuildrWebInstance',
  ])],
  ['src/bootstrap/cli/main.ts', new Set(['writeInternalDownload'])],
  ['src/web/application/preview-lifecycle.ts', new Set(['clearOwner'])],
  ['src/modules/task/infrastructure/worktree-application.ts', new Set(['writeReceipt'])],
  ['src/modules/task/application/finish/task-finish-run.ts', new Set([
    'acquireFinishTargetLease', 'releaseFinishTargetLease',
  ])],
  ['src/modules/task/application/finish/task-finish-bootstrap-recovery.ts', new Set([
    'atomicWriteFile', 'prepareTaskFinishBootstrapRecoveryContext', 'finalizeTaskFinishBootstrapRecovery',
  ])],
  ['src/modules/project-testing/application/verification-application.ts', new Set(['withRetainedControllerPlanArgs'])],
  ['src/bootstrap/cli/task-finish-bootstrap.ts', new Set(['atomicWriteFile'])],
  ['src/modules/agent-assets/application/rules.ts', new Set(['rulesRemoveUnsafe'])],
  ['src/modules/agent-assets/application/skills.ts', new Set(['copySupportedSkillSource', 'skillsRemoveUnsafe'])],
  ['src/modules/agent-assets/application/components.ts', new Set(['removeComponentMember', 'installComponentMember'])],
  ['src/modules/agent-assets/application/package-maintenance/package-assets.ts', new Set(['convergeServiceManifest', 'convergeRegistryManifests'])],
  ['src/modules/agent-assets/application/package-maintenance.ts', new Set(['syncPackageBuiltins'])],
  ['src/modules/agent-assets/application/package-maintenance/builtin-lifecycle.ts', new Set(['builtinUninstallUnsafe'])],
  ['src/modules/agent-assets/application/package-maintenance/output.ts', new Set(['buildPackageOutput', 'packageBuild'])],
  ['tools/verification/package-check/smoke-checks.ts', new Set([
    'verifyRecursiveRules', 'verifyWorkspaceAssetLifecycle', 'verifyInitializedWorkspace',
    'verifyExistingAgentsCompatibility', 'runPackageWorkspaceSmoke', 'runPackageDomainIntegration',
    'runPackageAggregateSmoke',
  ])],
  ['src/modules/workspace/infrastructure/workspace-source-filesystem.ts', new Set(['withStaging', 'createWorkspaceSourceFilesystem'])],
  ['src/modules/workspace/application/workspace-operations.ts', new Set(['recoverWorkspaceMutation'])],
  ['src/modules/agent-assets/infrastructure/runtime/runtime-reconciler.ts', new Set(['reconcileRuntimePlan'])],
  ['src/modules/agent-assets/infrastructure/runtime/skills/render-plan.ts', new Set(['applySkillRenderPlan'])],
  ['src/modules/agent-assets/infrastructure/runtime/render-claude-code-rules.ts', new Set(['applyRulesRenderPlan'])],
]);

const violations: any[] = [];
for (const relativeFile of productionFiles) {
  const lines: any = fs.readFileSync(path.join(productRoot, relativeFile), 'utf8').split(/\r?\n/);
  let currentFunction: any = '<top-level>';
  for (const [index, line] of lines.entries()) {
    const declaration: any = line.match(/^\s*(?:export\s+)?function\s+([A-Za-z0-9_]+)/);
    if (declaration) currentFunction = declaration[1];
    if (!/fs\.(?:rmSync|writeFileSync|appendFileSync|copyFileSync|cpSync|renameSync)\s*\(/.test(line)) continue;
    if (!allowed.get(relativeFile)?.has(currentFunction)) violations.push(`${relativeFile}:${index + 1}: direct mutation in ${currentFunction}`);
  }
}

if (violations.length) {
  console.error('Managed mutation verification failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

const allowedFunctionCount: any = [...allowed.values()].reduce((count: any, functions: any) => count + functions.size, 0);
console.log(`Managed mutation verification passed. Reviewed ${productionFiles.length} production files and ${allowedFunctionCount} explicit mutation functions.`);
