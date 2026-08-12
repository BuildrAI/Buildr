export function retireOrphanedBuiltinSkills({
  manifest,
  receipts,
  receiptByKey,
  skillsManifest,
  targetRoot,
  builtinReceiptKey,
  builtinSnapshot,
  existsDirectory,
  path,
  removeDirectory,
  removeReceipt,
  changed,
  findings,
  checkOnly,
}) {
  const currentIds = new Set(manifest.builtins.skills.flatMap((item) => [item.id, item.replaces?.id].filter(Boolean)));
  const orphanReceipts = receipts.builtins.filter((item) => item.type === 'skill' && !currentIds.has(item.id));

  for (const receipt of orphanReceipts) {
    const manifestIndex = skillsManifest.findIndex((item) => item.id === receipt.id);
    const existing = manifestIndex === -1 ? null : skillsManifest[manifestIndex];
    const expectedPath = receipt.target.replace(/^skills\//, '');
    const targetDir = path.join(targetRoot, receipt.target);
    const liveSnapshot = builtinSnapshot(targetDir, 'skill');
    let reason = null;

    if (!existing && liveSnapshot) reason = 'retired builtin live files have no matching Workspace manifest entry';
    else if (existing && existing.source !== 'buildr') reason = 'retired builtin manifest entry is not Buildr-managed';
    else if (existing && existing.path !== expectedPath) reason = 'retired builtin manifest path does not match its ownership receipt';
    else if (liveSnapshot && liveSnapshot.integrity !== receipt.integrity) reason = 'retired builtin live files differ from the last Buildr ownership receipt';

    findings.push({
      type: 'skill',
      id: receipt.id,
      required: false,
      status: reason ? 'modified' : 'retired',
      path: receipt.target,
      converge: !reason,
      reason,
    });
    if (checkOnly || reason) continue;

    if (existsDirectory(targetDir)) removeDirectory(targetDir);
    if (manifestIndex !== -1) skillsManifest.splice(manifestIndex, 1);
    removeReceipt('skill', { id: receipt.id });
    receiptByKey.delete(builtinReceiptKey('skill', receipt.id));
    changed.push(receipt.target);
  }
}
