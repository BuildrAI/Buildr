import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectDistributionEvidence} from '../src/distribution-evidence.ts';

/** Read only the exact package bytes; never substitute source-checkout approval. */
export function inspectArtifactDistribution(tarball: string, packageName: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-distribution-check-'));
  const tar = (args: string[]) => {
    const result = spawnSync('tar', args, {encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024});
    if (result.error || result.status !== 0) throw result.error ?? new Error('distribution_archive_unreadable');
    return result.stdout;
  };
  try {
    if (!['@buildr-ai/buildr', '@buildr-ai/buildr-harness'].includes(packageName)) throw new Error('distribution_product_invalid');
    const files = tar(['-tzf', tarball]).trim().split('\n');
    for (const file of files) {
      if (!file.startsWith('package/') || file.includes('\\') || file.split('/').some(part => part === '.' || part === '..')) throw new Error('distribution_archive_unsafe');
    }
    // Product staging refuses links. Keep that invariant before extracting any
    // evidence, including archives handed in independently of the builder.
    if (tar(['-tvzf', tarball]).trim().split('\n').some(line => !/^[-d]/u.test(line))) throw new Error('distribution_archive_unsafe');
    const harness = packageName === '@buildr-ai/buildr-harness';
    const evidence = harness ? 'package/build/third-party' : 'package/payload/product/distribution';
    const decisions = harness ? 'package/resources/distribution-decisions.json' : evidence + '/decisions.json';
    const support = harness ? 'package/resources/platform-support.json' : evidence + '/platform-support.json';
    for (const file of ['package/package.json', evidence + '/evidence.json', decisions, support]) if (!files.includes(file)) throw new Error('distribution_evidence_missing');
    tar(['-xzf', tarball, '-C', root, 'package/package.json', evidence, ...(harness ? [decisions, support] : [])]);
    if (JSON.parse(fs.readFileSync(path.join(root, 'package/package.json'), 'utf8')).name !== packageName) throw new Error('distribution_product_mismatch');
    const result = inspectDistributionEvidence(path.join(root, evidence), JSON.parse(fs.readFileSync(path.join(root, decisions), 'utf8')).decisions);
    const platformSupport = JSON.parse(fs.readFileSync(path.join(root, support), 'utf8'));
    if (platformSupport.schemaVersion !== 1 || platformSupport.productId !== (harness ? 'buildr-harness' : 'buildr-development')
      || !platformSupport.platforms || !Object.keys(platformSupport.platforms).length) throw new Error('distribution_support_invalid');
    const findings = [...result.findings];
    if (platformSupport.publicationApproved !== true) findings.push({
      name: packageName, version: 'product', code: 'support-approval-missing',
      reason: '平台支持声明尚未取得准确发行范围的批准。',
    });
    return {...result, platformSupport, findings, status: findings.length ? 'blocked' as const : 'eligible' as const, publicationApproved: findings.length === 0};
  } catch (error) {
    return {status: 'blocked' as const, publicationApproved: false, findings: [{
      name: packageName, code: 'artifact-evidence-unavailable', reason: error instanceof Error ? error.message : '无法核对发行物证据。',
    }]};
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  if (process.argv.length !== 4) throw new Error('Usage: inspect-artifact-distribution.ts <tarball> <@buildr-ai/buildr|@buildr-ai/buildr-harness>');
  const result = inspectArtifactDistribution(path.resolve(process.argv[2]!), process.argv[3]!);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'eligible') process.exitCode = 1;
}
