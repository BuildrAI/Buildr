import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
test('standalone shell uses public UI composition without Development business or DSH loader imports', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(metadata.name,'@buildr-ai/buildr-harness-web');
  assert.equal(metadata.dependencies['@buildr-ai/buildr-harness-ui'],undefined);
  assert.equal(metadata.dependencies['@buildr-ai/buildr'], undefined);
  for (const file of fs.globSync('src/**/*.{ts,tsx}', {cwd: root})) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/gu)) {
      assert.doesNotMatch(match[1]!, /(?:buildr-web|dsh-plugin|\/buildr\/src|features\/task)/u, file);
    }
  }
  for (const file of ['index.html', 'mermaid-renderer.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(html, /(?:src|href)=["']https?:/iu, 'scripts and styles remain locally bundled');
  }
});
