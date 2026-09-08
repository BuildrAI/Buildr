import fs from 'node:fs';
import path from 'node:path';

function existsDirectory(directory: string): boolean {
  return Boolean(fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory());
}

function existsFile(file: string): boolean {
  return Boolean(fs.statSync(file, { throwIfNoEntry: false })?.isFile());
}

export function buildrWorkspaceIdentity(targetRoot: string) {
  const assets = {
    agentsFile: existsFile(path.join(targetRoot, 'AGENTS.md')),
    metadataFile: existsFile(path.join(targetRoot, '.buildr', 'workspace.yml')),
    rootOrganization: existsDirectory(path.join(targetRoot, 'projects')),
  };
  const required = ['AGENTS.md', '.buildr/workspace.yml', 'projects'];
  const missing = [
    ...(!assets.agentsFile ? ['AGENTS.md'] : []),
    ...(!assets.metadataFile ? ['.buildr/workspace.yml'] : []),
    ...(!assets.rootOrganization ? ['projects'] : []),
  ];
  return {
    state: missing.length === 0 ? 'valid' : required.length === missing.length ? 'absent' : 'incomplete',
    required, missing, ...assets,
  };
}

export function isInitializedBuildrWorkspace(targetRoot: string): boolean {
  return buildrWorkspaceIdentity(targetRoot).state === 'valid';
}

export function assertInitializedBuildrWorkspace(targetRoot: string): void {
  if (!isInitializedBuildrWorkspace(targetRoot)) throw new Error(`Target is not an initialized Buildr workspace: ${targetRoot}. 请先运行 buildr init。`);
}
