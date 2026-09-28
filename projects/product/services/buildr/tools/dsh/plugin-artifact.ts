import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { inventoryGeneratedArtifact } from '../build/generated-artifacts.ts';

/** Only an unbound, compiled bundle may enter a shared Buildr payload. */
export function assertUnboundDshPlugin(root: string) {
  const files = inventoryGeneratedArtifact(root);
  const paths = new Set(files.map(file => file.path));
  for (const required of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js']) {
    if (!paths.has(required)) throw new Error(`dsh_plugin_artifact_missing: ${required}`);
  }
  if (files.some(file => /\.(?:ts|tsx|mts|cts)$/.test(file.path) && !/\.d\.(?:ts|mts|cts)$/.test(file.path))) {
    throw new Error('dsh_plugin_artifact_contains_typescript_source');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (manifest.name !== '@buildr-ai/dsh-plugin' || manifest.dsh?.bundle?.patch !== 'cordis.patch.yml'
      || Object.keys(manifest.scripts ?? {}).length !== 0) throw new Error('dsh_plugin_artifact_manifest_invalid');
  const patch = YAML.parse(fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8'));
  const rows = Array.isArray(patch) && patch.length === 1 ? patch[0]?.insert : undefined;
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== 'buildr' || rows[0]?.name !== manifest.name
      || rows[0]?.disabled !== true || rows[0]?.config !== undefined) throw new Error('dsh_plugin_artifact_must_be_unbound_insert');
  return files;
}
