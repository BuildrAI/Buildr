import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readSkillText } from './skill-content-repository.ts';
import { parseSkillProjectionReceipt, historicalSkillProjectionOwnershipReceiptTarget, legacySkillProjectionOwnershipReceiptTarget, skillProjectionOwnershipReceiptsEquivalent } from '../infrastructure/runtime/skills/projection-files.ts';
import { RUNTIME_ADAPTERS } from '../infrastructure/runtime/adapter-contract.ts';
import { sourceError, sourceMemberIdentity, type SourceObservation, type SourceObject, type SourceParty } from '../domain/source-observations.ts';

export interface RegisteredSourceSkill { id: string; path?: string; runtimePath?: string; assetIdentity?: string; sourceIdentity?: string; source?: unknown; enabled?: boolean; }
export interface RegisteredSourceRule { id: string; path: string; source: string; enabled?: boolean; state?: string; }
export interface RegisteredSourceContract { id: string; version: number; path: string; }
export interface SourceAssetRead {
  readSkills(root: string): RegisteredSourceSkill[];
  readRules(root: string): RegisteredSourceRule[];
  readContracts(root: string): RegisteredSourceContract[];
  requiredBlock(): string;
  productSkills?: () => Array<{ id: string; path: string }>;
}
export function sourceDigest(content: string): string { return `sha256-${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`; }
export function sourceRelativePath(root: string, locator: string): string {
  const normalized = locator.replaceAll('\\', '/');
  const absolute = path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(root, normalized);
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative) || relative.includes('\0')) throw sourceError('source_path_forbidden', '定位器不在已授权工作空间内。');
  if (relative.split('/').some(segment => segment.startsWith('.env') || ['.ssh', '.aws', '.gnupg', '.git', 'node_modules'].includes(segment)) || /(?:\.pem|\.key|credentials(?:\.[^/]*)?)$/i.test(relative)) throw sourceError('source_path_forbidden', '不读取秘密文件、凭证或内部目录。');
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw sourceError('source_path_forbidden', '定位器跨越符号链接。');
    if (stat && !stat.isDirectory() && !stat.isFile()) throw sourceError('source_path_forbidden', '定位器指向特殊文件。');
  }
  return relative;
}
export function observedVersion(observation: SourceObservation) {
  const digest = observation.observedContent === undefined ? observation.observedDigest : sourceDigest(observation.observedContent);
  if (observation.observedContent !== undefined && observation.observedDigest !== undefined && digest !== observation.observedDigest) throw sourceError('source_observation_conflict', '观察正文与观察摘要不一致。');
  return { ...(observation.observedContent === undefined ? {} : { content: observation.observedContent }), ...(digest ? { digest } : {}) };
}
function party(source: unknown): SourceParty {
  if (source === 'buildr') return 'buildr';
  if (source === 'openspec') return 'openspec';
  if (['workspace', 'project', 'service'].includes(String(source))) return 'workspace';
  return source === undefined || source === null ? 'workspace' : 'unknown';
}
function block(content: string): { text: string; start: number; end: number } | null {
  const startMarker = '<!-- buildr:required begin -->'; const endMarker = '<!-- buildr:required end -->';
  if (content.split(startMarker).length !== 2 || content.split(endMarker).length !== 2) return null;
  const start = content.indexOf(startMarker); const end = content.indexOf(endMarker, start) + endMarker.length;
  return start >= 0 && end > start ? { text: content.slice(start, end), start, end } : null;
}
export function createSourceObjectRepository(assets: SourceAssetRead) {
  function object(workspaceId: string, scope: string, kind: SourceObject['kind'], identity: string, selector: SourceObject['selector'], content: string | null, observation: SourceObservation, providedBy: SourceParty, managedBy: 'buildr' | null, evidence: SourceObject['evidence']): SourceObject {
    const current = content === null ? null : { content, digest: sourceDigest(content) };
    const observed = observedVersion(observation);
    return { identity, kind, workspaceId, scope, selector, providedBy, managedBy, current, observed, historical: !current || !observed.digest ? 'unknown' : observed.digest === current.digest ? 'matched-current' : 'different', evidence };
  }
  function projected(root: string, workspaceId: string, scope: string, relative: string, observation: SourceObservation): SourceObject | null {
    const adapters = Object.values(RUNTIME_ADAPTERS) as Array<{ id: string; traits: { skills?: { root: string } } }>;
    for (const adapter of adapters) {
      const runtimeRoot = adapter.traits.skills?.root;
      if (!runtimeRoot || !relative.startsWith(`${runtimeRoot}/skills/`)) continue;
      const skills = assets.readSkills(root);
      if (observation.locator?.adapterId && observation.locator.adapterId !== adapter.id && !(runtimeRoot === '.agents' && ['dsh', 'agents-standard', 'codex', 'cursor', 'trae'].includes(observation.locator.adapterId))) continue;
      const suffix = relative.slice(`${runtimeRoot}/skills/`.length);
      const candidate = skills.find(skill => skill.enabled !== false && suffix.startsWith(`${skill.runtimePath || skill.id}/`));
      const runtimePath = candidate?.runtimePath || candidate?.id || suffix.split('/')[0];
      const member = suffix.slice(runtimePath.length + 1);
      if (!member) continue;
      const targetDir = `${runtimeRoot}/skills/${runtimePath}`;
      if (observation.locator?.resourceBase && sourceRelativePath(root, observation.locator.resourceBase) !== targetDir) throw sourceError('source_scope_conflict', '实际资源基目录与投射目录不匹配。');
      const owners = runtimeRoot === '.agents' ? ['agents-standard', 'codex', 'cursor', 'trae'] : [adapter.id];
      const receipts: Array<{ file: string; receipt: ReturnType<typeof parseSkillProjectionReceipt> }> = [];
      for (const owner of owners) {
        for (const file of [historicalSkillProjectionOwnershipReceiptTarget(root, 'workspace', owner, runtimePath), legacySkillProjectionOwnershipReceiptTarget(root, runtimeRoot, owner, runtimePath)]) {
          const receiptRelative = sourceRelativePath(root, file);
          if (!fs.existsSync(file)) continue;
          const receipt = parseSkillProjectionReceipt(readSkillText(root, receiptRelative, { requireRootProof: true }).content, '投射回执');
          if (receipt.schemaVersion !== 'buildr.skill-projection/v2' || receipt.destination !== 'workspace' || receipt.runtimePath !== runtimePath || receipt.adapterId !== owner) throw sourceError('source_receipt_conflict', '投射回执范围或身份不匹配。');
          receipts.push({ file: receiptRelative, receipt });
        }
      }
      if (!receipts.length) return null;
      const first = receipts[0];
      if (receipts.some(entry => !skillProjectionOwnershipReceiptsEquivalent(first.receipt, entry.receipt))) throw sourceError('source_receipt_conflict', '当前与兼容投射回执互相冲突。');
      const receipt = first.receipt;
      const productEntry = assets.productSkills?.().find(entry => entry.id === receipt.skillId && entry.id === runtimePath);
      const productSkill = Boolean(productEntry && receipt.assetIdentity === `product:${productEntry.id}` && receipt.sourceIdentity === `product:${productEntry.path}/SKILL.md` && receipt.sourceWorkspaceId === 'buildr-product');
      if (!productSkill && (!candidate || receipt.sourceWorkspaceId !== workspaceId || receipt.skillId !== candidate.id || receipt.assetIdentity !== candidate.assetIdentity || receipt.sourceIdentity !== candidate.sourceIdentity)) throw sourceError('source_scope_conflict', '投射回执不属于当前已登记技能源。');
      const inventory = receipt.files.find((file: { path: string; integrity: string }) => file.path === member);
      if (!inventory) return null;
      const current = readSkillText(root, relative, { requireRootProof: true });
      if (current.digest !== inventory.integrity) throw sourceError('source_receipt_conflict', '投射文件与逐文件回执摘要不一致。');
      const observed = observedVersion(observation);
      if (observed.digest && observed.digest !== inventory.integrity) throw sourceError('source_observation_conflict', '当次观察与当前已验证投射版本不同，不能反推历史归属。');
      return object(workspaceId, '.', 'skill', sourceMemberIdentity(receipt.assetIdentity, member), { assetIdentity: receipt.assetIdentity, skillId: receipt.skillId, relativePath: member, runtimePath, sourceWorkspaceId: receipt.sourceWorkspaceId }, current.content, observation, productSkill ? 'buildr' : party(candidate?.source), 'buildr', [{ authority: 'buildr.skill-projection/v2', locator: first.file, digest: inventory.integrity }, { authority: 'winning-locator', locator: relative }]);
    }
    return null;
  }
  return {
    object,
    read(root: string, workspaceId: string, scope: string, observation: SourceObservation): { objects: SourceObject[]; mixed?: boolean } {
      if (!observation.locator?.path) return { objects: [] };
      const relative = sourceRelativePath(root, observation.locator.path);
      if (relative === 'AGENTS.md') {
        const current = readSkillText(root, relative, { requireRootProof: true }); const currentBlock = block(current.content); const expected = assets.requiredBlock();
        const observed = observedVersion(observation); const observedBlock = observed.content === undefined ? null : block(observed.content);
        if (!currentBlock || currentBlock.text !== expected) throw sourceError('source_required_block_conflict', '核心受管区块与当前随包模板不一致。');
        if (observed.content !== undefined && (!observedBlock || observedBlock.text !== expected)) throw sourceError('source_observation_conflict', '当次正文中的受管区块不能由当前模板证明。');
        const selected = observedBlock || currentBlock;
        const value = object(workspaceId, '.', 'rule', `workspace:${workspaceId}:managed-block:buildr:required`, { managedBlock: 'buildr:required', relativePath: relative }, currentBlock.text, { ...observation, observedContent: observedBlock?.text, observedDigest: observedBlock ? sourceDigest(observedBlock.text) : observed.digest === current.digest ? sourceDigest(currentBlock.text) : undefined }, 'buildr', 'buildr', [{ authority: 'buildr:required-template', locator: 'resources/workspace/AGENTS.md', digest: sourceDigest(expected) }]);
        value.selection = { startOffset: selected.start, endOffset: selected.end, unit: 'utf16' };
        return { objects: [value], mixed: (observed.content || current.content).slice(0, selected.start).replace(/^# AGENTS\.md\s*/, '').trim().length > 0 || (observed.content || current.content).slice(selected.end).trim().length > 0 };
      }
      const projection = projected(root, workspaceId, scope, relative, observation);
      if (projection) return { objects: [projection] };
      for (const skill of relative.startsWith('skills/') ? assets.readSkills(root) : []) {
        if (!skill.path || skill.enabled === false) continue;
        const prefix = `skills/${skill.path}/`;
        if (!relative.startsWith(prefix)) continue;
        const file = relative.slice(prefix.length);
        if (file !== 'SKILL.md' && !['references', 'scripts', 'assets', 'examples', 'agents', 'templates'].includes(file.split('/')[0])) return { objects: [] };
        if (observation.locator.resourceBase && sourceRelativePath(root, observation.locator.resourceBase) !== prefix.slice(0, -1)) throw sourceError('source_scope_conflict', '实际技能源目录不匹配。');
        const current = readSkillText(root, relative, { requireRootProof: true });
        return { objects: [object(workspaceId, '.', 'skill', sourceMemberIdentity(skill.assetIdentity || `workspace:${workspaceId}:skill:${skill.id}`, file), { assetIdentity: skill.assetIdentity || `workspace:${workspaceId}:skill:${skill.id}`, skillId: skill.id, relativePath: file }, current.content, observation, party(skill.source), 'buildr', [{ authority: 'buildr.skills-manifest', locator: 'skills/manifest.yml' }, { authority: 'registered-source', locator: relative, digest: current.digest }])] };
      }
      const rule = assets.readRules(root).find(entry => entry.path === relative && entry.enabled !== false && !['uninstalled', 'missing'].includes(entry.state || 'installed'));
      if (rule) {
        const current = readSkillText(root, relative, { requireRootProof: true });
        return { objects: [object(workspaceId, '.', 'rule', `workspace:${workspaceId}:rule:.:${rule.id}`, { ruleId: rule.id, relativePath: relative }, current.content, observation, party(rule.source), 'buildr', [{ authority: 'buildr.rules-manifest', locator: 'rules/manifest.yml' }, { authority: 'registered-source', locator: relative, digest: current.digest }])] };
      }
      return { objects: [] };
    },
    capability(root: string, workspaceId: string, scope: string, observation: SourceObservation): SourceObject | null {
      const contract = assets.readContracts(root).find(entry => entry.id === observation.capabilityId && entry.version === observation.version);
      if (!contract) return null;
      const relative = sourceRelativePath(root, `skills/${contract.path}`);
      if (observation.locator?.path && sourceRelativePath(root, observation.locator.path) !== relative) throw sourceError('source_scope_conflict', '能力观察定位器与已登记契约不匹配。');
      const current = readSkillText(root, relative, { requireRootProof: true });
      return object(workspaceId, '.', 'capability', `workspace:${workspaceId}:capability:.:${contract.id}@${contract.version}`, { capabilityId: contract.id, version: contract.version, relativePath: relative, viewingScope: scope }, current.content, observation, 'unknown', 'buildr', [{ authority: 'buildr.skills-contracts', locator: 'skills/manifest.yml' }, { authority: 'registered-contract', locator: relative, digest: current.digest }]);
    },
  };
}
