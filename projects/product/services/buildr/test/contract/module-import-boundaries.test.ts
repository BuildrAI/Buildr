import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const sourceRoot: any = path.resolve(import.meta.dirname, '../../src');
const PRIVATE_LAYERS: any = new Set(['application', 'infrastructure', 'persistence']);

function sourceFiles(directory: any = sourceRoot): any  {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry: any) => {
    const target: any = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.isFile() && entry.name.endsWith('.ts') ? [target] : [];
  });
}

function moduleOwner(file: any): any  {
  const parts: any = path.relative(sourceRoot, file).split(path.sep);
  return parts[0] === 'system' ? `system/${parts[1]}` : parts[0];
}

function ownerRelativeParts(file: any): any  {
  const parts: any = path.relative(sourceRoot, file).split(path.sep);
  return parts[0] === 'system' ? parts.slice(2) : parts.slice(1);
}

function imports(file: any): any  {
  const content: any = fs.readFileSync(file, 'utf8');
  const specifiers: any = [...content.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/gu)].map((match: any) => match[1]);
  return specifiers.filter((specifier: any) => specifier.startsWith('.')).map((specifier: any) => ({
    specifier,
    target: path.resolve(path.dirname(file), specifier),
  })).filter(({ target }: any) => target.startsWith(`${sourceRoot}${path.sep}`));
}

test('全局 Infrastructure 不反向依赖业务模块，跨模块消费者不导入私有技术层', () => {
  const problems: any[] = [];
  for (const file of sourceFiles()) {
    const owner: any = moduleOwner(file);
    for (const { specifier, target } of imports(file)) {
      const targetOwner: any = moduleOwner(target);
      if (owner === 'infrastructure' && targetOwner !== 'infrastructure') {
        problems.push(`${path.relative(sourceRoot, file)} -> ${specifier}: global Infrastructure must stay semantic-free`);
      }
      if (owner !== targetOwner && PRIVATE_LAYERS.has(ownerRelativeParts(target)[0])) {
        problems.push(`${path.relative(sourceRoot, file)} -> ${specifier}: ${targetOwner} private layer`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('生产模块依赖图无环，Bootstrap 只作为组合根不计入业务依赖', () => {
  const graph: any = new Map();
  for (const file of sourceFiles()) {
    const owner: any = moduleOwner(file);
    if (owner === 'bootstrap' || owner === 'infrastructure') continue;
    if (!graph.has(owner)) graph.set(owner, new Set());
    for (const { target } of imports(file)) {
      const targetOwner: any = moduleOwner(target);
      if (targetOwner === owner || targetOwner === 'bootstrap' || targetOwner === 'infrastructure') continue;
      graph.get(owner).add(targetOwner);
    }
  }

  const visiting: any = new Set();
  const visited: any = new Set();
  const stack: any[] = [];
  const cycles: any[] = [];
  function visit(owner: any): any  {
    if (visiting.has(owner)) {
      const start: any = stack.indexOf(owner);
      cycles.push([...stack.slice(start), owner].join(' -> '));
      return;
    }
    if (visited.has(owner)) return;
    visiting.add(owner);
    stack.push(owner);
    for (const dependency of graph.get(owner) || []) visit(dependency);
    stack.pop();
    visiting.delete(owner);
    visited.add(owner);
  }
  for (const owner of graph.keys()) visit(owner);
  assert.deepEqual(cycles, []);
});
