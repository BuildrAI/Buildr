export function createBuiltinReplacement(deps) {
  const { builtinReceiptKey, builtinSnapshot, copyDirectoryIfChanged, existsDirectory, path } = deps;

  function handleSkillReplacement({
    builtin,
    changed,
    checkOnly,
    desired,
    existing,
    findings,
    isRestore,
    liveSnapshot,
    newSnapshot,
    receiptByKey,
    removeDirectory,
    removeReceipt,
    skillsById,
    skillsManifest,
    sourceDir,
    targetDir,
    restoreOutcomes,
    updateReceipt,
    targetRoot,
  }) {
    const replacement = builtin.replaces || null;
    if (!replacement) return false;
    const predecessorRecord = skillsById.get(replacement.id) || null;
    const predecessor = predecessorRecord?.skill || null;
    const recordRestoreOutcome = (status, reason = null) => {
      if (!isRestore) return;
      restoreOutcomes.push({
        id: builtin.id,
        type: 'skill',
        status,
        replacementFrom: replacement.id,
        path: builtin.target,
        reason,
      });
    };
    if (existing && predecessor) {
      findings.push({
        type: 'skill', id: builtin.id, required: builtin.required === true, status: 'modified',
        path: builtin.target, replacementFrom: replacement.id,
        predecessorRuntimePath: replacement.runtimePath, replacementRuntimePath: builtin.runtimePath || builtin.id,
        reason: 'current and predecessor identities both exist',
      });
      recordRestoreOutcome('blocked', 'current and predecessor identities both exist');
      return true;
    }
    if (existing) return false;

    const predecessorDir = path.join(targetRoot, replacement.target);
    const predecessorSnapshot = builtinSnapshot(predecessorDir, 'skill');
    const predecessorReceipt = receiptByKey.get(builtinReceiptKey('skill', replacement.id)) || null;
    let status = null;
    let reason = null;
    if (!predecessor) {
      if (predecessorSnapshot || predecessorReceipt) {
        status = 'modified';
        reason = 'legacy predecessor exists without a matching Buildr manifest entry';
      }
    } else if (predecessor.source !== 'buildr') {
      status = 'modified';
      reason = 'legacy predecessor is not Buildr-managed';
    } else if (predecessor.path !== replacement.target.replace(/^skills\//, '')
      || (predecessor.runtimePath || replacement.id) !== replacement.runtimePath) {
      status = 'modified';
      reason = 'legacy predecessor manifest paths do not match the package replacement declaration';
    } else if (liveSnapshot) {
      status = 'modified';
      reason = 'replacement target already exists';
    } else if (predecessor.state === 'uninstalled' || predecessor.enabled === false) {
      if (isRestore) status = predecessorSnapshot ? 'installed' : 'missing';
      else if (predecessorSnapshot) {
        status = 'modified';
        reason = 'uninstalled predecessor still has live files';
      } else status = 'uninstalled';
    } else if (!predecessorSnapshot) {
      status = 'missing';
      reason = 'legacy predecessor source is missing';
    } else if ((predecessorReceipt
      && predecessorReceipt.target === replacement.target
      && predecessorReceipt.integrity === predecessorSnapshot.integrity)
      || (builtin.legacyIntegrities || []).includes(predecessorSnapshot.integrity)) {
      status = 'installed';
    } else if (isRestore) {
      status = 'installed';
      reason = 'legacy predecessor content accepted by explicit builtin restore';
    } else {
      status = 'modified';
      reason = 'legacy predecessor content is not a recognized official version';
    }

    if (!status) return false;
    findings.push({
      type: 'skill', id: builtin.id, required: builtin.required === true, status, path: builtin.target,
      replacementFrom: replacement.id, predecessorRuntimePath: replacement.runtimePath,
      replacementRuntimePath: builtin.runtimePath || builtin.id, reason,
    });
    if (checkOnly) {
      recordRestoreOutcome(['modified', 'missing'].includes(status) ? 'blocked' : 'ready', reason);
      return true;
    }
    if (status === 'modified' || status === 'missing') {
      recordRestoreOutcome('blocked', reason || `legacy predecessor is ${status}`);
      return true;
    }

    removeReceipt('skill', { id: replacement.id });
    if (status === 'uninstalled') {
      skillsManifest[predecessorRecord.index] = { ...desired, enabled: false, state: 'uninstalled', ...(predecessor.reason ? { reason: predecessor.reason } : {}) };
      return true;
    }
    if (existsDirectory(predecessorDir)) {
      removeDirectory(predecessorDir);
      changed.push(replacement.target);
    }
    if (copyDirectoryIfChanged(sourceDir, targetDir)) changed.push(builtin.target);
    skillsManifest[predecessorRecord.index] = desired;
    updateReceipt('skill', builtin, newSnapshot);
    recordRestoreOutcome('restored');
    return true;
  }

  return { handleSkillReplacement };
}
