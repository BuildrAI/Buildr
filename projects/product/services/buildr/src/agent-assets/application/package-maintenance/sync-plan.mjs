export function createPackageSyncPlan({
  assertSafeSyncMutationPaths,
  missingAncestorForMutation,
  mutationPathFingerprint,
  packageRegistryMutationPaths,
  path,
  readPackageManifest,
  targetPathFromBuiltin,
  toPosixRelative,
}) {
  function packageBuiltinMutationPaths(targetRoot, manifest = readPackageManifest(), receipts = { builtins: [] }, findings = []) {
    const affected = new Set([
      path.join(targetRoot, 'AGENTS.md'),
      path.join(targetRoot, '.gitattributes'),
      path.join(targetRoot, '.gitignore'),
      path.join(targetRoot, 'rules', 'manifest.yml'),
      path.join(targetRoot, 'skills', 'manifest.yml'),
      path.join(targetRoot, 'skills', 'contracts', 'buildr'),
      path.join(targetRoot, 'commands', 'manifest.yml'),
      path.join(targetRoot, '.buildr', 'builtin-receipts.json'),
      ...packageRegistryMutationPaths(targetRoot),
    ]);
    for (const builtin of [...manifest.builtins.rules, ...manifest.builtins.skills]) {
      if (builtin.component) continue;
      const target = targetPathFromBuiltin(targetRoot, builtin);
      affected.add(target);
      const missingParent = missingAncestorForMutation(targetRoot, path.dirname(target));
      if (missingParent) affected.add(missingParent);
      if (builtin.replaces?.target) {
        const predecessorTarget = path.join(targetRoot, builtin.replaces.target);
        affected.add(predecessorTarget);
        const predecessorMissingParent = missingAncestorForMutation(targetRoot, path.dirname(predecessorTarget));
        if (predecessorMissingParent) affected.add(predecessorMissingParent);
      }
    }
    const currentBuiltinKeys = new Set([
      ...manifest.builtins.rules.map((item) => `rule:${item.id}`),
      ...manifest.builtins.skills.map((item) => `skill:${item.id}`),
      ...manifest.builtins.commands.map((item) => `command:${item.id}`),
    ]);
    for (const receipt of receipts.builtins || []) {
      if (receipt.type !== 'skill' || currentBuiltinKeys.has(`${receipt.type}:${receipt.id}`)) continue;
      const target = path.join(targetRoot, receipt.target);
      affected.add(target);
      const missingParent = missingAncestorForMutation(targetRoot, path.dirname(target));
      if (missingParent) affected.add(missingParent);
    }
    for (const retirement of (manifest.capabilityContracts || []).flatMap((contract) => contract.replaces || [])) {
      const target = path.join(targetRoot, retirement.target);
      affected.add(target);
      const missingParent = missingAncestorForMutation(targetRoot, path.dirname(target));
      if (missingParent) affected.add(missingParent);
    }
    // Only proven-safe retirement targets participate in the write transaction.
    for (const finding of findings) {
      if (finding.type === 'rule' && finding.id === 'buildr-core' && finding.status === 'retired') {
        affected.add(path.join(targetRoot, 'rules/buildr/core.md'));
      }
    }
    return assertSafeSyncMutationPaths(targetRoot, [...affected]);
  }

  function builtinSyncPlanSignature(targetRoot, findings, affectedPaths) {
    return JSON.stringify({
      findings: findings.map(({ type, id, required, status, path: targetPath, component, replacementFrom, predecessorRuntimePath, replacementRuntimePath, reason }) => ({
        type, id, required, status, path: targetPath, component: component || null,
        replacementFrom: replacementFrom || null,
        predecessorRuntimePath: predecessorRuntimePath || null,
        replacementRuntimePath: replacementRuntimePath || null,
        reason: reason || null,
      })),
      affectedPaths: affectedPaths.map((item) => ({ path: toPosixRelative(targetRoot, item), fingerprint: mutationPathFingerprint(item) })).sort((left, right) => left.path.localeCompare(right.path)),
    });
  }

  return { packageBuiltinMutationPaths, builtinSyncPlanSignature };
}
