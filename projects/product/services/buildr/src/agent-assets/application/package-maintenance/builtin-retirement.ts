import fs from 'node:fs';
import path from 'node:path';

// A single historical asset, not a generic migration registry. Unknown bytes
// remain recoverable and never become a second required product rule.
export function retireLegacyCoreRule({ targetRoot, rulesManifest, receiptByKey, builtinSnapshot, removeReceipt, changed, findings, checkOnly }: any): any  {
  const id = 'buildr-core';
  const target = 'rules/buildr/core.md';
  const index = rulesManifest.rules.findIndex((rule: any) => rule.id === id);
  const entry = rulesManifest.rules[index];
  const receipt = receiptByKey.get('rule:buildr-core');
  const ownedEntry = entry?.source === 'buildr' && entry.path === target;
  let present = false;
  let unsafe = false;
  for (const relative of ['rules', 'rules/buildr', target]) {
    try {
      const stat = fs.lstatSync(path.join(targetRoot, relative));
      if (stat.isSymbolicLink() || (relative === target ? !stat.isFile() : !stat.isDirectory())) {
        unsafe = true;
        present = true;
        break;
      }
      if (relative === target) present = true;
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
      break;
    }
  }
  if (!entry && !receipt && !present) return;
  let reason: any = null;
  if (unsafe) reason = '遗留核心规则不是安全的工作空间普通文件，已保留。';
  else if (entry && !ownedEntry) reason = '遗留核心规则登记归属或路径不明，已保留。';
  else if (!receipt || receipt.target !== target) reason = '遗留核心规则缺少匹配安装回执，已保留。';
  else if (present && !ownedEntry) reason = '遗留核心规则文件没有匹配受管登记，已保留。';
  else if (present && builtinSnapshot(path.join(targetRoot, target), 'rule')?.integrity !== receipt.integrity) reason = '遗留核心规则已被修改，已保留。';

  findings.push({ type: 'rule', id, required: false, status: reason ? 'modified' : 'retired', path: target, converge: !reason, reason });
  if (checkOnly) return;
  if (reason) {
    if (ownedEntry) rulesManifest.rules[index] = { ...entry, enabled: false, required: false, state: 'modified', reason: `${reason} 核心规则已内联到 AGENTS.md；请确认遗留内容的保留位置。` };
    return;
  }
  if (present) {
    fs.unlinkSync(path.join(targetRoot, target));
    changed.push(target);
  }
  if (ownedEntry) rulesManifest.rules.splice(index, 1);
  removeReceipt('rule', { id });
}

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
  const currentIds: any = new Set(manifest.builtins.skills.flatMap((item: any) => [item.id, item.replaces?.id].filter(Boolean)));
  const orphanReceipts = receipts.builtins.filter((item: any) => item.type === 'skill' && !currentIds.has(item.id));

  for (const receipt of orphanReceipts) {
    const manifestIndex = skillsManifest.findIndex((item: any) => item.id === receipt.id);
    const existing = manifestIndex === -1 ? null : skillsManifest[manifestIndex];
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
