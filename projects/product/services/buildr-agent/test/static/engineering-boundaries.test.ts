import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { nativeProgramPolicies } from '../../src/executors/program-policy.ts';

const root = path.resolve(import.meta.dirname, '../..');

function extractStringLiterals(source: string): Array<{ value: string; line: number }> {
  const literals: Array<{ value: string; line: number }> = [];
  let index = 0;
  let line = 1;
  while (index < source.length) {
    const ch = source[index]!;
    const next = source[index + 1];
    if (ch === '\n') {
      line++;
      index++;
      continue;
    }
    if (ch === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index++;
      continue;
    }
    if (ch === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n') line++;
        index++;
      }
      index += 2;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      const quote = ch;
      const startLine = line;
      index++;
      let value = '';
      let hasInterpolation = false;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\') {
          if (source[index + 1] === '\n') line++;
          value += source[index + 1] ?? '';
          index += 2;
          continue;
        }
        if (quote === '`' && source[index] === '$' && source[index + 1] === '{') {
          hasInterpolation = true;
          index += 2;
          let depth = 1;
          while (index < source.length && depth > 0) {
            if (source[index] === '\n') line++;
            else if (source[index] === '{') depth++;
            else if (source[index] === '}') depth--;
            index++;
          }
          continue;
        }
        if (source[index] === '\n') line++;
        value += source[index]!;
        index++;
      }
      index++;
      if (!hasInterpolation) literals.push({ value, line: startLine });
      continue;
    }
    index++;
  }
  return literals;
}

test('production dependencies remain in the service and consume the host only through injected ports', () => {
  const files = fs.globSync('src/**/*.ts', { cwd: root }).map(file => path.join(root, file));
  assert.ok(files.length > 0, `No service production sources found under ${root}`);
  const issues: string[] = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const imports = source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/gu);
    for (const match of imports) {
        const name = match[1]!;
        if (name.startsWith('.') && !path.resolve(path.dirname(file), name).startsWith(path.join(root, 'src') + path.sep)) issues.push(`${path.relative(root, file)} -> ${name}`);
        if (name === '@buildr-ai/buildr' || name.startsWith('@buildr-ai/buildr/')) issues.push(`${path.relative(root, file)} -> ${name}`);
    }
  }
  assert.deepEqual(issues, [], 'service production code cannot import the Buildr host or neighbouring source');
});

test('the package exposes one compiled public runtime entry and has no separately publishable surface', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(metadata.private, true);
  assert.equal(metadata.exports['.'].import, './build/index.js');
  assert.equal(metadata.exports['.'].types, './build/index.d.ts');
  assert.deepEqual(Object.keys(metadata.exports).sort(), ['.', './package.json']);
  assert.ok(!metadata.files.includes('src/'));
  assert.ok(!metadata.scripts.publish);
});

test('shared orchestration layers do not branch on executor brand literals', () => {
  const forbidden = new Set<string>([
    'codex',
    'dsh',
    'qoder',
    'qoder-cn',
    'claude-code',
    'antigravity',
    ...Object.keys(nativeProgramPolicies),
  ]);
  for (const id of [...forbidden]) forbidden.add(`native-${id}`);

  const patterns = [
    'src/application/**/*.ts',
    'src/model-access/application.ts',
    'src/storage/native-content.ts',
    'src/executors/index.ts',
    'src/executors/model-gateway.ts',
    'src/executors/program-*.ts',
  ];
  const files = [...new Set(patterns.flatMap(pattern => fs.globSync(pattern, { cwd: root })))].sort();
  assert.ok(files.length >= 15, 'expected shared orchestration files to be scanned');
  const violations: string[] = [];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const literal of extractStringLiterals(source)) {
      if (forbidden.has(literal.value)) {
        violations.push(`${relative}:${literal.line} -> '${literal.value}'`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    'shared agent-service orchestration layers must consume declarative executor/provider capabilities instead of executor brand literals',
  );
});
