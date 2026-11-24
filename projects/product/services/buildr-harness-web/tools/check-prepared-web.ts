import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const web = path.join(root, 'dist');
const packaged = path.resolve(root, '../buildr/node_modules/@buildr-ai/buildr-harness/build/harness-web-dist');
for (const name of ['index.html', 'mermaid-renderer.html']) {
  assert.ok(fs.statSync(path.join(web, name)).size > 0, `Empty production entry: ${name}`);
}
// Digest the same relative layout, not the two distinct absolute paths.
const content = (directory: string) => fs.readdirSync(directory, { recursive: true })
  .sort().map(name => {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    assert.ok(stat.isFile() || stat.isDirectory(), `Unexpected production entry: ${name}`);
    return [name, stat.isFile() ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null];
  });
assert.deepEqual(content(packaged), content(web), 'The packaged Harness must contain the verified production assets');
