import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { applyProductTypography, productIconSizes, productTypography } from '../src/typography.ts';

registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/theme.ts') && specifier === './typography') {
      return next(specifier + '.ts', context);
    }
    return next(specifier, context);
  },
});
const { softProductTheme } = await import('../src/theme.ts');
const sourceRoot = path.resolve(import.meta.dirname, '../src');
function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

test('theme and CSS roles share a single readable scale; icon geometry is separate', () => {
  assert.ok(productTypography.meta < productTypography.secondary);
  assert.ok(productTypography.secondary < productTypography.body);
  assert.ok(productTypography.body < productTypography.reading);
  assert.ok(productTypography.meta >= 12, 'ordinary metadata stays readable');
  const properties = new Map();
  applyProductTypography({ setProperty: (name, value) => properties.set(name, value) });
  for (const [role, size] of Object.entries(productTypography)) {
    assert.equal(properties.get(`--font-size-${role}`), `${size}px`);
  }
  for (const [role, size] of Object.entries(productIconSizes)) {
    assert.equal(properties.get(`--icon-size-${role}`), `${size}px`);
  }
  assert.equal(softProductTheme.token.fontSize, productTypography.body);
  assert.equal(softProductTheme.token.fontSizeSM, productTypography.meta);
  assert.equal(softProductTheme.token.fontSizeHeading1, productTypography.page);
});

test('all page, editor and existing prototype sizes use declared roles, not local absolute values', () => {
  const supported = new Set([
    ...Object.keys(productTypography).map(role => `--font-size-${role}`),
    ...Object.keys(productIconSizes).map(role => `--icon-size-${role}`),
  ]);
  const failures = [];
  for (const file of sourceFiles(sourceRoot)) {
    if (!/\.(css|tsx?|html)$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const label = path.relative(sourceRoot, file);
    for (const match of source.matchAll(/var\((--(?:font-size|icon-size)-[\w-]+)/g)) {
      if (!supported.has(match[1])) failures.push(`${label}: undeclared ${match[1]}`);
    }
    if (file.endsWith('.css')) {
      for (const match of source.matchAll(/(?:^|[;{])\s*(font-size|font)\s*:\s*([^;}]+)/g)) {
        if (/(?:^|\s)\d*\.?\d+(?:px|rem|pt)(?=[/\s]|$)/.test(match[2])) {
          failures.push(`${label}: ${match[1]}: ${match[2]}`);
        }
      }
    } else if (/fontSize\s*:\s*(?:\d|['"]\d*\.?\d+(?:px|rem|pt))/.test(source)) {
      failures.push(`${label}: absolute inline fontSize`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
