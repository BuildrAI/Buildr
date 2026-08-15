import fs from 'node:fs';
import path from 'node:path';

const hasGlobMagic = (value) => /[*?\[{]/u.test(value);

export function resolveNodeTestFiles(root, selectors, label = 'node-test') {
  const cwd = path.resolve(root);
  const resolved = [];
  for (const selector of selectors ?? []) {
    const matches = hasGlobMagic(selector)
      ? fs.globSync(selector, { cwd, exclude: ['node_modules/**'] })
      : [selector];
    for (const match of matches) {
      const target = path.resolve(cwd, match);
      const relative = path.relative(cwd, target);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`${label} test selector escapes Product root: ${selector}`);
      }
      if (fs.statSync(target, { throwIfNoEntry: false })?.isFile()) resolved.push(target);
    }
  }
  const unique = [...new Set(resolved)].sort();
  if (unique.length === 0) throw new Error(`${label} resolved no test files: ${(selectors ?? []).join(', ') || '<empty>'}`);
  return unique;
}
