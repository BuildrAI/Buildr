import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const generatedArtifactManifestSchema = 'buildr.generated-artifacts/v1';

export type GeneratedArtifactFile = {
  path: string;
  mode: number;
  size: number;
  sha256: string;
};

export type GeneratedArtifact = {
  id: string;
  files: GeneratedArtifactFile[];
};

export type GeneratedArtifactManifest = {
  schemaVersion: typeof generatedArtifactManifestSchema;
  inputs: Record<string, string>;
  artifacts: GeneratedArtifact[];
  identity: string;
};

const digest = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');

function normalizedInputs(inputs: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(inputs).sort(([left], [right]) => left.localeCompare(right)));
}

export function inventoryGeneratedArtifact(root: string, relative = ''): GeneratedArtifactFile[] {
  const resolvedRoot = path.resolve(root);
  const current = relative ? path.join(resolvedRoot, relative) : resolvedRoot;
  const stat = fs.lstatSync(current, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error(`generated_artifact_root_invalid: ${resolvedRoot}`);
  const files: GeneratedArtifactFile[] = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    const child = path.join(resolvedRoot, childRelative);
    if (entry.isSymbolicLink()) throw new Error(`generated_artifact_entry_invalid: ${childRelative}`);
    if (entry.isDirectory()) files.push(...inventoryGeneratedArtifact(resolvedRoot, childRelative));
    else if (entry.isFile()) {
      const bytes = fs.readFileSync(child);
      files.push({
        path: childRelative.split(path.sep).join('/'),
        mode: fs.statSync(child).mode & 0o777,
        size: bytes.length,
        sha256: digest(bytes),
      });
    } else throw new Error(`generated_artifact_entry_invalid: ${childRelative}`);
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function createGeneratedArtifactManifest(input: {
  inputs: Record<string, string>;
  artifacts: { id: string; root: string }[];
}): GeneratedArtifactManifest {
  const artifacts = input.artifacts
    .map((artifact) => ({ id: artifact.id, files: inventoryGeneratedArtifact(artifact.root) }))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length) throw new Error('generated_artifact_id_duplicate');
  const unsigned: Omit<GeneratedArtifactManifest, 'identity'> = {
    schemaVersion: generatedArtifactManifestSchema,
    inputs: normalizedInputs(input.inputs),
    artifacts,
  };
  return { ...unsigned, identity: `sha256-${digest(JSON.stringify(unsigned))}` };
}

export function assertGeneratedArtifactManifest(manifest: GeneratedArtifactManifest, roots: Record<string, string>): GeneratedArtifactManifest {
  const unsigned = { schemaVersion: manifest.schemaVersion, inputs: normalizedInputs(manifest.inputs), artifacts: manifest.artifacts };
  if (manifest.schemaVersion !== generatedArtifactManifestSchema || manifest.identity !== `sha256-${digest(JSON.stringify(unsigned))}`) {
    throw new Error('generated_artifact_manifest_identity_mismatch');
  }
  const expectedIds = Object.keys(roots).sort();
  const actualIds = manifest.artifacts.map((artifact) => artifact.id).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) throw new Error('generated_artifact_manifest_inventory_mismatch');
  for (const artifact of manifest.artifacts) {
    const actual = inventoryGeneratedArtifact(roots[artifact.id]);
    if (JSON.stringify(actual) !== JSON.stringify(artifact.files)) throw new Error(`generated_artifact_bytes_mismatch: ${artifact.id}`);
  }
  return manifest;
}

export function assertGeneratedArtifactEntry(manifest: GeneratedArtifactManifest, id: string, root: string): GeneratedArtifactFile[] {
  const unsigned = { schemaVersion: manifest.schemaVersion, inputs: normalizedInputs(manifest.inputs), artifacts: manifest.artifacts };
  if (manifest.schemaVersion !== generatedArtifactManifestSchema || manifest.identity !== `sha256-${digest(JSON.stringify(unsigned))}`) {
    throw new Error('generated_artifact_manifest_identity_mismatch');
  }
  const artifact = manifest.artifacts.find((candidate) => candidate.id === id);
  if (!artifact) throw new Error(`generated_artifact_manifest_entry_missing: ${id}`);
  const actual = inventoryGeneratedArtifact(root);
  if (JSON.stringify(actual) !== JSON.stringify(artifact.files)) throw new Error(`generated_artifact_bytes_mismatch: ${id}`);
  return actual;
}

export function createOwnedArtifactStaging(parent: string, prefix = 'buildr-generated-artifacts-'): {
  root: string;
  cleanup: () => void;
} {
  const resolvedParent = fs.realpathSync(path.resolve(parent));
  const root = fs.mkdtempSync(path.join(resolvedParent, prefix));
  let cleaned = false;
  return {
    root,
    cleanup() {
      if (cleaned) return;
      const relative = path.relative(resolvedParent, root);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('generated_artifact_cleanup_outside_owner');
      fs.rmSync(root, { recursive: true, force: true });
      cleaned = true;
    },
  };
}
