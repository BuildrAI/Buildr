import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

/** Construct the pre-global layout only from an isolated, empty current catalog. */
export function useLegacyAssetCatalog(root: string): void {
  const files = [
    ['services/manifest.yml', 'buildr.services/v3', 'services'],
    ['repositories/manifest.yml', 'buildr.repositories/v1', 'repositories'],
  ];
  for (const [file, schemaVersion, key] of files) {
    assert.deepEqual(YAML.parse(fs.readFileSync(path.join(root, file), 'utf8')), { schemaVersion, [key]: {} }, `Legacy fixture requires an empty current catalog: ${file}`);
  }
  for (const [file] of files) fs.rmSync(path.join(root, file));
}
