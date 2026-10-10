/** Verify the complete portable package bytes; real official-Host lifecycle is tested separately. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function member(root: string, path: string): string {
  assert.equal(typeof path, 'string');
  assert.ok(path && !isAbsolute(path) && !path.includes('\\') && !path.split('/').some(part => part === '..' || part === '.'), 'invalid package member');
  const file = resolve(root, path); assert.ok(relative(root, file) && !relative(root, file).startsWith('..'));
  return file;
}
export async function verifyComposition(bundle: string): Promise<{ entry: string; fileCount: number }> {
  bundle = resolve(bundle);
  const metadata = JSON.parse(await readFile(join(bundle, 'package.json'), 'utf8'));
  assert.equal(metadata.buildrComposition?.schemaVersion, 'buildr.dsh-composition/v1');
  assert.equal(metadata.dsh.bundle.patch, 'cordis.patch.yml');
  assert.equal(metadata.scripts, undefined, 'composition must not run installation hooks');
  assert.equal(metadata.binding, undefined); assert.equal(metadata.sourceBinding, undefined);
  const entry = member(bundle, metadata.buildrComposition.entryDirectory);
  const inner = JSON.parse(await readFile(join(entry, 'package.json'), 'utf8'));
  assert.equal(inner.name, metadata.name); assert.equal(inner.version, metadata.version);
  assert.deepEqual(metadata.buildrCompatibility, inner.buildrCompatibility);
  assert.deepEqual(metadata.buildrDshSourceSdk, inner.buildrDshSourceSdk);
  const main = resolve(bundle, metadata.main);
  assert.ok(relative(entry, main) && !relative(entry, main).startsWith('..'), 'public Host entry must forward to the packaged gateway');
  assert.ok((await lstat(main)).isFile());
  const report = JSON.parse(await readFile(join(bundle, 'composition.json'), 'utf8'));
  assert.equal(report.schemaVersion, metadata.buildrComposition.schemaVersion);
  assert.equal(report.patchSha256, metadata.buildrDshSourceSdk.sourcePatchSha256);
  const actual = new Map<string, string>();
  async function visit(directory: string): Promise<void> {
    for (const name of await readdir(directory)) {
      const file = join(directory, name), state = await lstat(file);
      assert.equal(state.isSymbolicLink(), false, 'package must contain physical files');
      if (state.isDirectory()) await visit(file);
      else {
        assert.ok(state.isFile(), 'package has a non-regular member');
        const path = relative(bundle, file).split('\\').join('/');
        if (path !== 'composition.json') actual.set(path, digest(await readFile(file)));
        if (name === 'package.json') {
          const nested = JSON.parse(await readFile(file, 'utf8'));
          assert.equal(nested.scripts, undefined, `packaged component has scripts: ${path}`);
        }
      }
    }
  }
  await visit(bundle);
  const expected = new Map<string, string>();
  for (const row of report.files) {
    member(bundle, row.path); assert.equal(expected.has(row.path), false, 'duplicate manifest member');
    expected.set(row.path, row.sha256);
  }
  assert.deepEqual([...actual].sort(), [...expected].sort(), 'complete composition bytes differ from their inventory');
  const definition = JSON.parse(await readFile(join(bundle, 'runtime-composition/definition.json'), 'utf8'));
  for (const target of [...Object.values(definition.modules), definition.presetOwner] as string[]) {
    assert.equal(typeof target, 'string'); assert.ok(!isAbsolute(target) && !/^[a-z]+:/i.test(target), 'runtime definition contains a machine binding');
    const file = resolve(bundle, 'runtime-composition', target);
    assert.ok(!relative(bundle, file).startsWith('..') && (await lstat(file)).isFile(), 'runtime definition must resolve inside installed package');
  }
  return { entry, fileCount: actual.size + 1 };
}
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--bundle') throw Error('Usage: verify-composition.ts --bundle <composition>');
  console.log(JSON.stringify({ status: 'passed', ...await verifyComposition(args[1]!) }));
}
