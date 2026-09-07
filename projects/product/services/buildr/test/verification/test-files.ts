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
