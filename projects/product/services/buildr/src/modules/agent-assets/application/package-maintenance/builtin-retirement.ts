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
}: any): any  {
  const currentIds: any = new Set(manifest.builtins.skills.filter((item: any) => item.retired !== true).flatMap((item: any) => [item.id, item.replaces?.id].filter(Boolean)));
  const orphanReceipts = receipts.builtins.filter((item: any) => item.type === 'skill' && !currentIds.has(item.id));

  for (const receipt of orphanReceipts) {
    const manifestIndex = skillsManifest.findIndex((item: any) => item.id === receipt.id);
    const existing = manifestIndex === -1 ? null : skillsManifest[manifestIndex];
    if(existing?.customizedFrom===receipt.id&&existing.source==='workspace'){findings.push({type:'skill',id:receipt.id,status:'customized',path:receipt.target});if(!checkOnly)removeReceipt('skill',{id:receipt.id});continue;}
    const expectedPath = receipt.target.replace(/^skills\//, '');
    const targetDir = path.join(targetRoot, receipt.target);
    const liveSnapshot = builtinSnapshot(targetDir, 'skill');
    let reason: any = null;

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
