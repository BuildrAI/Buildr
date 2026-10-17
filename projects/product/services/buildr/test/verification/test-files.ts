import fs from 'node:fs';
import path from 'node:path';

const hasGlobMagic: any = (value: any) => /[*?\[{]/u.test(value);

export function resolveNodeTestFiles(root: any, selectors: any, label: any = 'node-test'): any  {
  const cwd: any = path.resolve(root);
  const resolved: any[] = [];
  for (const selector of selectors ?? []) {
    const matches: any = hasGlobMagic(selector)
      ? fs.globSync(selector, { cwd, exclude: ['node_modules/**'] })
      : [selector];
    for (const match of matches) {
      const target: any = path.resolve(cwd, match);
      const relative: any = path.relative(cwd, target);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`${label} test selector escapes Product root: ${selector}`);
      }
      if (fs.statSync(target, { throwIfNoEntry: false })?.isFile()) resolved.push(target);
    }
  }
  const unique: any = [...new Set(resolved)].sort();
  if (unique.length === 0) throw new Error(`${label} resolved no test files: ${(selectors ?? []).join(', ') || '<empty>'}`);
  return unique;
}


/** Membership is supplied by the real executor declarations. Auxiliary platform
 * or compatibility selections do not create a second primary owner. */
export function auditNodeTestFileOwnership(inventory: string[], claims: { id: string; files: string[]; supportingFiles?: string[] }[]) {
  const files = [...new Set(inventory)].sort();
  const known = new Set(files);
  const owners = new Map<string, string[]>();
  const findings: { code: string; file: string; owners?: string[] }[] = [];
  for (const claim of claims) {
    const supporting = new Set(claim.supportingFiles ?? []);
    for (const file of supporting) if (!claim.files.includes(file)) findings.push({ code: 'supporting_file_not_selected', file, owners: [claim.id] });
    for (const file of new Set(claim.files)) {
      if (!known.has(file)) findings.push({ code: 'selected_test_missing', file, owners: [claim.id] });
      if (!supporting.has(file)) owners.set(file, [...(owners.get(file) ?? []), claim.id]);
    }
  }
  for (const file of files) {
    const primary = owners.get(file) ?? [];
    if (primary.length === 0) findings.push({ code: 'test_primary_owner_missing', file });
    else if (primary.length > 1) findings.push({ code: 'test_primary_owner_duplicated', file, owners: primary });
  }
  return { ok: findings.length === 0, findings, owners: Object.fromEntries(owners) };
}
