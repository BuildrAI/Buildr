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
  ['src/infrastructure/filesystem/index.ts', new Set([
    'publishExclusiveFileLockCandidate', 'moveAndRemoveExclusiveFileLock', 'atomicWriteFile', 'copyDirectory', 'removePath', 'snapshotMutationPath', 'removeMutationRestoreTarget', 'restoreMutationSnapshot', 'withWorkspaceMutation',
  ])],
  ['src/workspace/persistence/workspace-registry-repository.ts', new Set(['withWorkspaceRegistryMutation'])],
  ['src/infrastructure/sqlite/workspace-sqlite.ts', new Set(['cleanupRetiredLocalData'])],
  ['src/system/installation/infrastructure/npm-launcher.ts', new Set([
    'writeMacLauncherCandidate', 'writeWindowsLauncherCandidate', 'installNpmLauncher', 'uninstallNpmLauncher',
  ])],
  ['src/web/infrastructure/instance-runtime.ts', new Set([
    'acquireBuildrWebStartLock', 'releaseBuildrWebStartLock', 'clearBuildrWebInstance',
  ])],
  ['src/bootstrap/cli/main.ts', new Set(['writeInternalDownload'])],
  ['src/web/application/preview-lifecycle.ts', new Set(['clearOwner'])],
  ['src/task/infrastructure/worktree-application.ts', new Set(['writeReceipt'])],
  ['src/task/application/finish/task-finish-run.ts', new Set([
    'acquireFinishTargetLease', 'releaseFinishTargetLease',
  ])],
  ['src/task/application/finish/task-finish-bootstrap-recovery.ts', new Set([
    'atomicWriteFile', 'prepareTaskFinishBootstrapRecoveryContext', 'finalizeTaskFinishBootstrapRecovery',
  ])],
  ['src/verification/infrastructure/resource-coordinator.ts', new Set([
    'atomicWriteJson', 'registerTicketDirectory', 'replaceExpiredLeaseDirectory', 'releaseLeaseDirectory',
  ])],
  ['src/verification/application/verification-application.ts', new Set(['withRetainedControllerPlanArgs'])],
  ['src/bootstrap/cli/task-finish-bootstrap.ts', new Set(['atomicWriteFile'])],
  ['src/agent-assets/application/rules.ts', new Set(['rulesRemoveUnsafe'])],
  ['src/agent-assets/application/skills.ts', new Set(['copySupportedSkillSource', 'skillsRemoveUnsafe'])],
  ['src/agent-assets/application/components.ts', new Set(['removeComponentMember', 'installComponentMember'])],
  ['src/agent-assets/application/package-maintenance/package-assets.ts', new Set(['convergeServiceManifest', 'convergeRegistryManifests'])],
  ['src/agent-assets/application/package-maintenance.ts', new Set(['syncPackageBuiltins'])],
  ['src/agent-assets/application/package-maintenance/builtin-lifecycle.ts', new Set(['builtinUninstallUnsafe'])],
  ['src/agent-assets/application/package-maintenance/output.ts', new Set(['buildPackageOutput', 'packageBuild'])],
  ['src/agent-assets/application/package-maintenance/smoke-checks.ts', new Set([
    'verifyRecursiveRules', 'verifyWorkspaceAssetLifecycle', 'verifyInitializedWorkspace',
    'verifyExistingAgentsCompatibility', 'runPackageWorkspaceSmoke', 'runPackageDomainIntegration',
    'runPackageAggregateSmoke',
  ])],
  ['src/workspace/infrastructure/workspace-source-filesystem.ts', new Set(['withStaging', 'createWorkspaceSourceFilesystem'])],
  ['src/workspace/application/workspace-operations.ts', new Set(['recoverWorkspaceMutation'])],
  ['src/agent-assets/infrastructure/runtime/adapter-contract.ts', new Set(['reconcileRuntimePlan'])],
  ['src/agent-assets/infrastructure/runtime/skills/render-plan.ts', new Set(['applySkillRenderPlan'])],
  ['src/agent-assets/infrastructure/runtime/render-claude-code-rules.ts', new Set(['applyRulesRenderPlan'])],
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
