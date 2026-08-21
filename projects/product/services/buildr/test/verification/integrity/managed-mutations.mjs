#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const packageManifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
const productionFiles = [];
for (const entry of packageManifest.files.filter((file) => file === 'src/' || file.startsWith('src/'))) {
  if (entry.startsWith('test/verification/')) continue;
  const absolute = path.join(productRoot, entry);
  if (!fs.existsSync(absolute)) continue;
  if (fs.statSync(absolute).isFile()) {
    if (!path.basename(entry).startsWith('verify-')) productionFiles.push(entry);
    continue;
  }
  const visit = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = path.join(dir, item.name);
      if (item.isDirectory()) visit(child);
      else if (!item.name.startsWith('verify-') && item.name.endsWith('.mjs')) {
        productionFiles.push(path.relative(productRoot, child).split(path.sep).join('/'));
      }
    }
  };
  visit(absolute);
}
productionFiles.sort();
const allowed = new Map([
  ['src/infrastructure/filesystem/index.mjs', new Set([
    'publishExclusiveFileLockCandidate', 'moveAndRemoveExclusiveFileLock', 'atomicWriteFile', 'copyDirectory', 'removePath', 'snapshotMutationPath', 'removeMutationRestoreTarget', 'restoreMutationSnapshot', 'withWorkspaceMutation',
  ])],
  ['src/workspace/persistence/workspace-registry-repository.mjs', new Set(['withWorkspaceRegistryMutation'])],
  ['src/system/installation/infrastructure/npm-launcher.mjs', new Set([
    'writeMacLauncherCandidate', 'writeWindowsLauncherCandidate', 'installNpmLauncher', 'uninstallNpmLauncher',
  ])],
  ['src/task/persistence/task-execution-record-body-store.mjs', new Set([
    'syncFile', 'publishTaskExecutionRecordBody', 'cleanupTaskExecutionRecordBody',
  ])],
  ['src/web/infrastructure/instance-runtime.mjs', new Set([
    'acquireLocalAppStartLock', 'releaseLocalAppStartLock', 'clearLocalAppInstance',
  ])],
  ['src/bootstrap/cli/main.mjs', new Set(['writeInternalDownload'])],
  ['src/web/application/preview-lifecycle.mjs', new Set(['clearOwner'])],
  ['src/application/worktree/worktree-application.mjs', new Set(['writeReceipt'])],
  ['src/application/task-finish/task-finish-run.mjs', new Set([
    'acquireFinishTargetLease', 'releaseFinishTargetLease',
  ])],
  ['src/application/task-finish/task-finish-bootstrap-recovery.mjs', new Set([
    'atomicWriteFile', 'prepareTaskFinishBootstrapRecoveryContext', 'finalizeTaskFinishBootstrapRecovery',
  ])],
  ['src/application/task-finish/diagnostics-evidence.mjs', new Set(['createTaskFinishDiagnosticsEvidence'])],
  ['src/infrastructure/git/git-task-contribution.mjs', new Set(['withGitTaskContributionSnapshot'])],
  ['src/application/verification/resource-coordinator.mjs', new Set([
    'atomicWriteJson', 'registerTicketDirectory', 'replaceExpiredLeaseDirectory', 'releaseLeaseDirectory',
  ])],
  ['src/bootstrap/cli/task-finish-bootstrap.mjs', new Set(['atomicWriteFile'])],
  ['src/workspace/interfaces/cli/workspace.mjs', new Set(['createProject', 'createService'])],
  ['src/agent-assets/application/rules.mjs', new Set(['rulesRemoveUnsafe'])],
  ['src/agent-assets/application/skills.mjs', new Set(['copySupportedSkillSource', 'skillsRemoveUnsafe'])],
  ['src/agent-assets/application/components.mjs', new Set(['removeComponentMember', 'installComponentMember'])],
  ['src/application/domains/package-assets.mjs', new Set(['convergeServiceManifest', 'convergeRegistryManifests'])],
  ['src/agent-assets/application/package-maintenance.mjs', new Set(['syncPackageBuiltins'])],
  ['src/agent-assets/application/package-maintenance/builtin-lifecycle.mjs', new Set(['builtinUninstallUnsafe'])],
  ['src/agent-assets/application/package-maintenance/output.mjs', new Set(['buildPackageOutput', 'packageBuild'])],
  ['src/agent-assets/application/package-maintenance/smoke-checks.mjs', new Set([
    'verifyRecursiveRules', 'verifyWorkspaceAssetLifecycle', 'verifyInitializedWorkspace',
    'verifyExistingAgentsCompatibility', 'runPackageWorkspaceSmoke', 'runPackageDomainIntegration',
    'runPackageAggregateSmoke',
  ])],
  ['src/application/workspace-operations.mjs', new Set(['mutationRecover'])],
  ['src/agent-assets/infrastructure/runtime/adapter-contract.mjs', new Set(['reconcileRuntimePlan'])],
  ['src/agent-assets/infrastructure/runtime/skills/render-plan.mjs', new Set(['applySkillRenderPlan'])],
  ['src/agent-assets/infrastructure/runtime/render-claude-code-rules.mjs', new Set(['applyRulesRenderPlan'])],
]);

const violations = [];
for (const relativeFile of productionFiles) {
  const lines = fs.readFileSync(path.join(productRoot, relativeFile), 'utf8').split(/\r?\n/);
  let currentFunction = '<top-level>';
  for (const [index, line] of lines.entries()) {
    const declaration = line.match(/^\s*(?:export\s+)?function\s+([A-Za-z0-9_]+)/);
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

const allowedFunctionCount = [...allowed.values()].reduce((count, functions) => count + functions.size, 0);
console.log(`Managed mutation verification passed. Reviewed ${productionFiles.length} production files and ${allowedFunctionCount} explicit mutation functions.`);
