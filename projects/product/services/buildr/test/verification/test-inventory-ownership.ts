import fs from 'node:fs';
import path from 'node:path';
import { verificationSteps } from './registry.ts';
import { auditNodeTestFileOwnership, resolveNodeTestFiles } from './test-files.ts';

/** Every .test/.spec file under the service test tree, sorted for stable audits. */
export function collectServiceTestInventory(serviceRoot: string): string[] {
  const visit = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? visit(target) : /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name) ? [target] : [];
  }).sort();
  return visit(path.join(serviceRoot, 'test'));
}

/** Primary ownership claims derived from the real candidate executor declarations. */
export function serviceOwnershipClaims(serviceRoot: string): { id: string; files: string[]; supportingFiles: string[] }[] {
  const scripts = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8')).scripts;
  return verificationSteps.filter((step: any) => step.serviceOwned ? path.resolve(step.serviceRoot) === path.resolve(serviceRoot) : path.basename(serviceRoot) === 'buildr' && (step.profiles.includes('candidate') || step.id === 'e2e-browser:core')).flatMap((step: any) => {
    let selectors = step.serviceOwned ? step.testFiles : step.executor.files ?? step.executor.discoveredFiles ?? [];
    if (step.executor.type === 'npm') {
      const script = scripts[step.executor.args?.[1]] ?? '';
      selectors = script.match(/\btest\/[^\s"']+\.(?:test|spec)\.[cm]?[jt]sx?/gu) ?? [];
    } else if (step.executor.file === 'test/verification/run-node-tests.ts') selectors = step.executor.args;
    if (selectors.length === 0) return [];
    const files = resolveNodeTestFiles(serviceRoot, selectors, step.id);
    return [{ id: step.id, files, supportingFiles: (step.executor.supportingFiles ?? []).map((file: string) => path.resolve(serviceRoot, file)) }];
  });
}

export function auditServiceTestOwnership(serviceRoot: string) {
  return auditNodeTestFileOwnership(collectServiceTestInventory(serviceRoot), serviceOwnershipClaims(serviceRoot));
}

export function auditProjectTestOwnership(buildrRoot: string) {
  const services = ['buildr', 'buildr-web', 'buildr-agent', 'dsh-plugin'];
  const findings = services.flatMap(service => auditServiceTestOwnership(path.resolve(buildrRoot, '..', service)).findings.map((finding: any) => ({ service, ...finding })));
  return { ok: findings.length === 0, findings };
}
