// Runs against the exact declared external installation, never a second PATH entry.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function main() {
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
input.projectRoot = fs.realpathSync.native(input.projectRoot);
input.changeRoot = fs.realpathSync.native(input.changeRoot);
let entry = fs.realpathSync(input.executable);
if (path.basename(path.dirname(entry)).toLowerCase() === '.bin') {
  const shim = fs.readFileSync(entry, 'utf8').replaceAll('\\', '/');
  const candidates = [path.resolve(path.dirname(entry), '../@fission-ai/openspec'), path.join(path.dirname(entry), 'node_modules/@fission-ai/openspec')];
  const root = candidates.find(candidate => fs.existsSync(path.join(candidate, 'package.json')) && shim.includes('@fission-ai/openspec/bin/openspec.js'));
  if (!root) throw new Error('Unsupported OpenSpec executable shim.');
  entry = fs.realpathSync(path.join(root, 'bin/openspec.js'));
}
let packageRoot = path.dirname(entry);
while (true) {
  const manifest = path.join(packageRoot, 'package.json');
  if (fs.existsSync(manifest)) {
    const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (metadata.name === '@fission-ai/openspec') {
      if (metadata.version !== '1.13.0') throw new Error(`Unsupported OpenSpec package: ${metadata.version}`);
      break;
    }
  }
  const parent = path.dirname(packageRoot);
  if (parent === packageRoot) throw new Error('Declared executable is not an OpenSpec package entry.');
  packageRoot = parent;
}
const load = (relative: string) => import(pathToFileURL(path.join(packageRoot, 'dist', relative)).href);
const { findSpecUpdates, buildUpdatedSpec } = await load('core/specs-apply.js');
const { parseDeltaSpec } = await load('core/parsers/requirement-blocks.js');
const { Validator } = await load('core/validation/validator.js');
const updates = await findSpecUpdates(input.changeRoot, path.join(input.projectRoot, 'openspec', 'specs'));
const capabilities = [];
const files = [];
const diagnostics = [];
for (const update of updates) {
  const content = fs.readFileSync(update.source, 'utf8');
  const item: { capability: string; file: string; content: string; operations: unknown[] } = { capability: update.id, file: update.source, content, operations: [] };
  capabilities.push(item);
  try {
    const parsed = parseDeltaSpec(content);
    for (const [key, type] of [['added', 'ADDED'], ['modified', 'MODIFIED']]) {
      for (const block of parsed[key]) item.operations.push({ capability: update.id, type, title: block.name, requirement: block.raw });
    }
    for (const title of parsed.removed) item.operations.push({ capability: update.id, type: 'REMOVED', title, requirement: '' });
    for (const rename of parsed.renamed) item.operations.push({ capability: update.id, type: 'RENAMED', from: rename.from, to: rename.to });
    if (!item.operations.length) throw new Error('Delta spec contains no standard Requirement operations.');
    if (input.operation !== 'plan') continue;
    const built = await buildUpdatedSpec(update, path.basename(input.changeRoot), { silent: true });
    // Retirement remains wholly upstream-owned; the preview uses its validator.
    const { readRetireCapabilitiesMarker } = await load('utils/change-metadata.js');
    const { isRetirableSpec } = await load('core/archive.js');
    const marker = readRetireCapabilitiesMarker(input.changeRoot);
    const retire = marker.declared && (!update.exists || built.counts.removed > 0) && built.noRequirementBlocks && built.unaccountedContent.length === 0 && await isRetirableSpec(update.id, built.rebuilt);
    const expectedExists = !retire;
    if (expectedExists) {
      const validation = await new Validator().validateSpecContent(update.id, built.rebuilt);
      if (!validation.valid) throw new Error(JSON.stringify(validation.issues));
    }
    const target = fs.existsSync(update.target)
      ? fs.realpathSync.native(update.target)
      : path.join(fs.realpathSync.native(path.dirname(update.target)), path.basename(update.target));
    const relative = path.relative(input.projectRoot, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Spec target escapes selected project.');
    const beforeContent = update.exists ? fs.readFileSync(update.target, 'utf8') : '';
    const hasChanges = Object.values(built.counts).some(count => Number(count) > 0);
    // Upstream deliberately skips normalization-only writes when already synced.
    const expectedContent = expectedExists ? (!hasChanges && update.exists ? beforeContent : built.rebuilt) : '';
    files.push({ path: relative.split(path.sep).join('/'), beforeExists: update.exists, beforeContent, expectedExists, expectedContent });
  } catch (error) {
    diagnostics.push({ capability: update.id, code: 'upstream-spec-invalid', message: error instanceof Error ? error.message : String(error) });
  }
}
process.stdout.write(JSON.stringify({ capabilities, files, diagnostics }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
