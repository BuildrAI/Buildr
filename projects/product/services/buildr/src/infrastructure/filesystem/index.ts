import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { BOOTSTRAP_CONTRACT_RESOURCE, RESOURCE_WORKSPACE_ROOT } from '../product-layout.ts';
import { resolveProductRoot } from '../product-resources/index.ts';
export { acquireExclusiveFileLock, releaseExclusiveFileLock, withExclusiveFileLock } from './exclusive-file-lock.ts';
import { parseYamlDocument, parseYamlValue, quoteYaml } from './yaml.ts';
export { parseYamlDocument, parseYamlValue, quoteYaml } from './yaml.ts';
import { atomicWriteFile, atomicWriteJson } from './atomic-files.ts';
import { ensureRootRequiredBlock, rootRequiredBlockStatus } from './required-block.ts';
import { assertInitializedBuildrWorkspace, buildrWorkspaceIdentity, isInitializedBuildrWorkspace } from './workspace-identity.ts';
import { addDoctorFinding } from '../contracts/diagnostic-finding.ts';
import { createWorkspaceMutation } from './workspace-mutation.ts';
import { assertSafeAssetTarget as assertSafeAssetTargetValue, pathIsEqualOrInside } from './path-safety.ts';
import { createGitIdentity } from '../git/identity.ts';
import { workspaceSymlinkSegment } from './workspace-path.ts';
import { collectFiles } from './tree-files.ts';

export { atomicWriteFile, atomicWriteJson } from './atomic-files.ts';


export function registerWorkspaceInfrastructure(runtime: any): any  {
  function trackWrite(targetRoot: string, file: string, content: string, created: string[]): void {
    if (writeIfMissing(file, content)) created.push(path.relative(targetRoot, file).split(path.sep).join('/'));
  }

  function ensureDirectory(dir: any): any  {
    fs.mkdirSync(dir, { recursive: true });
  }

  function copyDirectory(source: any, target: any): any  {
    fs.cpSync(source, target, { recursive: true });
  }

  function removePath(target: any): any  {
    fs.rmSync(target, { recursive: true, force: true });
  }
  const {
    mutationStateRoot, mutationLockPath, mutationRecoveryReceiptPath, snapshotMutationPath,
    removeMutationRestoreTarget, mutationPathFingerprint, restoreMutationSnapshot, withWorkspaceMutation,
  } = createWorkspaceMutation({ ensureDirectory, existsFile: (file) => existsFile(file), toPosixRelative: (root, file) => toPosixRelative(root, file), workspaceSymlinkSegment });
  const { normalizedGitIdentity, sameGitIdentity } = createGitIdentity();
  const assertSafeAssetTarget = (targetRoot: string, target: string, containerRoot: string, label = 'Managed asset target') => assertSafeAssetTargetValue(targetRoot, target, containerRoot, label, { productRoot, workspaceSymlinkSegment });



  function productRoot(): any  {
    return resolveProductRoot();
  }

  function resourcesRoot(): any  {
    return path.join(productRoot(), 'resources');
  }

  function resourceWorkspaceRoot(): any  {
    return path.join(productRoot(), RESOURCE_WORKSPACE_ROOT);
  }

  function bootstrapContractPath(): any  {
    return path.join(productRoot(), BOOTSTRAP_CONTRACT_RESOURCE);
  }

  function developmentWorkspaceRoot(): any  {
    const root = productRoot();
    const parent = path.resolve(root, '..');
    if (
      path.basename(root) === 'product' &&
      existsFile(path.join(parent, 'AGENTS.md')) &&
      existsDirectory(path.join(parent, 'rules'))
    ) {
      return parent;
    }
    return null;
  }

  function renderTemplate(content: any, variables: any): any  {
    return content.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_: any, key: any) => {
      if (variables[key] === undefined) {
        throw new Error(`Missing template variable: ${key}`);
      }
      return variables[key];
    });
  }

  function writeIfMissing(file: any, content: any): any  {
    if (fs.existsSync(file)) return false;
    atomicWriteFile(file, content);
    return true;
  }

  function writeMappedFileIfMissing(targetRoot: any, outputRoot: any, entry: any, variables: any, created: any): any  {
    const sourceFile = path.resolve(productRoot(), entry.source);
    const targetFile = path.join(outputRoot, entry.target);
    const sourceContent = fs.readFileSync(sourceFile, 'utf8');
    const content = entry.mode === 'render' ? renderTemplate(sourceContent, variables) : sourceContent;
    trackWrite(targetRoot, targetFile, content, created);
  }

  function appendGitignoreEntries(file: any, entries: any): any  {
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const lines: any = new Set(existing.split(/\r?\n/).filter(Boolean));
    const missing = entries.filter((entry: any) => !lines.has(entry));
    if (missing.length === 0) return false;

    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    atomicWriteFile(file, `${existing}${prefix}${missing.join('\n')}\n`);
    return true;
  }

  function toPosixRelative(from: any, to: any): any  {
    const relative = path.relative(from, to).split(path.sep).join('/');
    return relative || '.';
  }

  function existsDirectory(dir: any): any  {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  }

  function existsFile(file: any): any  {
    return fs.existsSync(file) && fs.statSync(file).isFile();
  }


  function writeFileIfChanged(file: any, content: any): any  {
    if (existsFile(file) && fs.readFileSync(file, 'utf8') === content) return false;
    atomicWriteFile(file, content, 'utf8');
    return true;
  }

  function copyFileIfChanged(sourceFile: any, targetFile: any): any  {
    return writeFileIfChanged(targetFile, fs.readFileSync(sourceFile, 'utf8'));
  }

  function copyDirectoryIfChanged(sourceDir: any, targetDir: any): any  {
    let changed = false;
    for (const sourceFile of collectFiles(sourceDir)) {
      const relative = path.relative(sourceDir, sourceFile);
      const targetFile = path.join(targetDir, relative);
      if (copyFileIfChanged(sourceFile, targetFile)) changed = true;
    }
    return changed;
  }



  Object.assign(runtime, { ensureDirectory, copyDirectory, removePath, collectFiles, atomicWriteFile, atomicWriteJson, parseYamlDocument, quoteYaml, parseYamlValue, mutationStateRoot, mutationLockPath, mutationRecoveryReceiptPath, pathIsEqualOrInside, assertSafeAssetTarget, workspaceSymlinkSegment, normalizedGitIdentity, sameGitIdentity, snapshotMutationPath, removeMutationRestoreTarget, mutationPathFingerprint, restoreMutationSnapshot, withWorkspaceMutation, productRoot, resourcesRoot, resourceWorkspaceRoot, bootstrapContractPath, developmentWorkspaceRoot, renderTemplate, writeIfMissing, trackWrite, writeMappedFileIfMissing, appendGitignoreEntries, toPosixRelative, existsDirectory, existsFile, ensureRootRequiredBlock, rootRequiredBlockStatus, writeFileIfChanged, copyFileIfChanged, copyDirectoryIfChanged, buildrWorkspaceIdentity, isInitializedBuildrWorkspace, assertInitializedBuildrWorkspace, addDoctorFinding });
  return runtime;
}
