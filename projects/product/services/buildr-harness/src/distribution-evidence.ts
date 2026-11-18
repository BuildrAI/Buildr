import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {checkDistribution, type DistributionComponent, type DistributionDecision} from './distribution.ts';

export interface DistributionEvidence {
  schemaVersion: 1;
  components: Array<DistributionComponent & {evidence: Array<{file: string; sha256: string}>}>;
}

/** Checks the supplied artifact's own evidence, not the publisher's current installation. */
export function inspectDistributionEvidence(root: string, decisions: DistributionDecision[]) {
  const evidence = JSON.parse(fs.readFileSync(path.join(root, 'evidence.json'), 'utf8')) as DistributionEvidence;
  if (evidence.schemaVersion !== 1 || !Array.isArray(evidence.components)) throw new Error('distribution_evidence_invalid');
  const base = fs.realpathSync(root);
  const findings: Array<{name: string; version: string; code: string; reason: string}> = [];
  const identities = new Set<string>();
  for (const component of evidence.components) {
    const identity = component.name + '@' + component.version;
    if (!component.name || !component.version || identities.has(identity) || !component.evidence?.length) {
      findings.push({name: component.name, version: component.version, code: 'evidence-missing', reason: '依赖身份重复、缺失或没有许可来源。'});
    }
    identities.add(identity);
    for (const item of component.evidence ?? []) {
      const file = path.resolve(base, item.file);
      const relative = path.relative(base, file);
      if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)
        || !fs.lstatSync(file, {throwIfNoEntry: false})?.isFile()
        || fs.realpathSync(file) !== file
        || !/^[a-f0-9]{64}$/u.test(item.sha256)
        || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== item.sha256) {
        findings.push({name: component.name, version: component.version, code: 'evidence-invalid', reason: '许可文件缺失、越界或摘要与发行证据不符。'});
      }
    }
  }
  const result = checkDistribution(evidence.components, decisions);
  return {...result, status: findings.length || result.status === 'blocked' ? 'blocked' as const : 'eligible' as const,
    publicationApproved: findings.length === 0 && result.publicationApproved,
    findings: [...findings, ...result.findings]};
}
