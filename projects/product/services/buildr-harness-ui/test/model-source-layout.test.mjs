import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/components/model-picker.css', import.meta.url), 'utf8');

test('模型来源快捷行保持单行并可横向滚动', () => {
  const rule = css.match(/\.ac-model-source-nav\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /flex-wrap:nowrap/);
  assert.doesNotMatch(rule, /flex-wrap:wrap/);
  assert.match(rule, /overflow-x:auto/);
  assert.match(css, /\.ac-model-source-nav \.ant-btn\{[^}]*flex:none[^}]*white-space:nowrap/);
});
