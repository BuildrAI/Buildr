import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { normalizeProductPath } from './planner.ts';
import { VERIFICATION_GOVERNED_REPOSITORY_INPUTS, isVerificationGovernedRepositoryInput } from './ownership.ts';
import { sameFilesystemPath } from '../../src/infrastructure/git/checkout-identity.ts';
import { sourceChangeEvidence, type SourceChangeEvidence } from './source-diff.ts';

const require: any = createRequire(import.meta.url);

function git(gitRoot: any, args: any, options: any = {}): any  {
  return execFileSync('git', args, { cwd: gitRoot, encoding: options.encoding ?? 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function zeroSeparated(output: any): any  {
  return output.split('\0').filter(Boolean);
}

function withoutAllowedVersionFields(productPath: any, text: any): any  {
  const value: any = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${productPath} must contain a JSON object`);
  delete value.version;
  if (productPath === 'package-lock.json' && value.packages?.[''] && typeof value.packages[''] === 'object') {
    delete value.packages[''].version;
  }
  return value;
}

export function isVersionOnlyPackageMetadataChange(productPath: any, baseText: any, currentText: any): any  {
  if (!['package.json', 'package-lock.json'].includes(productPath)) return false;
  try {
    return isDeepStrictEqual(
      withoutAllowedVersionFields(productPath, baseText),
      withoutAllowedVersionFields(productPath, currentText),
    );
  } catch {
    return false;
  }
}

const PACKAGE_PRESENTATION_FIELDS: any = Object.freeze([
  'description', 'keywords', 'author', 'contributors', 'homepage', 'bugs', 'license', 'repository', 'funding',
]);

function withoutPackagePresentationFields(productPath: any, text: any): any  {
  const value: any = withoutAllowedVersionFields(productPath, text);
  if (productPath !== 'package.json') return value;
  for (const field of PACKAGE_PRESENTATION_FIELDS) delete value[field];
  return value;
}

export function isSelectionOnlyPackageMetadataChange(productPath: any, baseText: any, currentText: any): any  {
  if (!['package.json', 'package-lock.json'].includes(productPath)) return false;
  try {
    return isDeepStrictEqual(
      withoutPackagePresentationFields(productPath, baseText),
      withoutPackagePresentationFields(productPath, currentText),
    );
  } catch {
    return false;
  }
}

function withoutVerificationPresentationFields(text: any): any  {
  // CI plans run before npm ci. Missing YAML keeps the declaration change
  // conservative through isVerificationDeclarationMetadataOnlyChange's catch.
  const YAML: any = require('yaml');
  const value: any = YAML.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('verification.yml must contain a mapping');
  for (const resource of value.resources ?? []) delete resource.title;
  for (const capability of value.capabilities ?? []) {
    delete capability.title;
    delete capability.proves;
  }
  return value;
}

export function isVerificationDeclarationMetadataOnlyChange(baseText: any, currentText: any): any  {
  try {
    return isDeepStrictEqual(
      withoutVerificationPresentationFields(baseText),
      withoutVerificationPresentationFields(currentText),
    );
  } catch {
    return false;
  }
}

/** Only event configuration is exempt; execution and unknown fields stay exact. */
export function isVerificationWorkflowTriggerOnlyChange(baseText: string, currentText: string): boolean {
  try {
    const YAML = require('yaml');
    const execution = (text: string) => {
      const value = YAML.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)
        || !Object.hasOwn(value, 'on') || !value.on
        || !value.jobs || typeof value.jobs !== 'object' || Array.isArray(value.jobs)
        || Object.keys(value.jobs).length === 0) throw new Error('Invalid verification workflow');
      delete value.on;
      return value;
    };
    return isDeepStrictEqual(execution(baseText), execution(currentText));
  } catch {
    return false;
  }
}

export function resolveVerificationBase(gitRoot: any, requestedBase: any): any  {
  const candidates: any = requestedBase ? [requestedBase] : [];
  if (!requestedBase) {
    try {
      const upstream: any = git(gitRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).trim();
      if (upstream) candidates.push(upstream);
    } catch {}
    candidates.push('origin/dev');
  }
  for (const candidate of candidates) {
    try {
      git(gitRoot, ['rev-parse', '--verify', `${candidate}^{commit}`]);
      return candidate;
    } catch {}
  }
  throw new Error(requestedBase ? `Unknown Git base: ${requestedBase}` : 'Unable to resolve verification base; pass --base <ref>');
}

export function collectChangedProductPaths(options: any): any  {
  const productRoot: any = fs.realpathSync(path.resolve(options.productRoot));
  const projectRoot: any = fs.realpathSync(path.resolve(options.projectRoot ?? productRoot));
  if ((options.explicitPaths ?? []).length > 0) {
    return { base: null, paths: [...new Set(options.explicitPaths.map(normalizeProductPath))].sort(), source: 'explicit', versionOnlyPackagePaths: [], selectionOnlyPaths: [], selectionReasons: [] };
  }
  const gitRoot: any = fs.realpathSync(git(productRoot, ['rev-parse', '--show-toplevel']).trim());
  const projectGitRoot: any = git(projectRoot, ['rev-parse', '--show-toplevel']).trim();
  if (!sameFilesystemPath(gitRoot, projectGitRoot)) throw new Error('Project root is outside Product Git root');
  const productPrefix: any = git(productRoot, ['rev-parse', '--show-prefix']).trim().replace(/\/+$/u, '');
  const projectPrefix: any = git(projectRoot, ['rev-parse', '--show-prefix']).trim().replace(/\/+$/u, '');
  const base: any = resolveVerificationBase(gitRoot, options.base);
  const head: any = options.head ?? 'HEAD';
  const baseCommit: any = git(gitRoot, ['rev-parse', '--verify', `${base}^{commit}`]).trim();
  const headCommit: any = git(gitRoot, ['rev-parse', '--verify', `${head}^{commit}`]).trim();
  const mergeBase: any = git(gitRoot, ['merge-base', baseCommit, headCommit]).trim();
  const comparison: any = Object.freeze({
    base: baseCommit,
    head: headCommit,
    mergeBase,
    // A base equal to or descending from HEAD makes `base...head` empty even
    // when the working tree contains the delivery. Agents must not read that
    // silent empty diff as proof that no related checks are needed.
    containsHead: mergeBase === headCommit,
  });
  const pathspecs: any[] = [projectPrefix || '.', 'skills/buildr-release/', ...VERIFICATION_GOVERNED_REPOSITORY_INPUTS];
  const commands: any = options.head ? [
    ['diff', '--no-renames', '--name-only', '-z', `${base}...${head}`, '--', ...pathspecs],
  ] : [
    ['diff', '--no-renames', '--name-only', '-z', `${base}...HEAD`, '--', ...pathspecs],
    ['diff', '--cached', '--no-renames', '--name-only', '-z', '--', ...pathspecs],
    ['diff', '--no-renames', '--name-only', '-z', '--', ...pathspecs],
    ['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspecs],
  ];
  const workspacePaths: any = commands.flatMap((args: any) => zeroSeparated(git(gitRoot, args)));
  const paths: any[] = [];
  for (const workspacePath of workspacePaths) {
    const normalizedWorkspacePath: any = workspacePath.replaceAll('\\', '/');
    let relative: any;
    if (normalizedWorkspacePath.startsWith('skills/buildr-release/')) {
      relative = normalizedWorkspacePath;
    } else if (!productPrefix || normalizedWorkspacePath === productPrefix || normalizedWorkspacePath.startsWith(`${productPrefix}/`)) {
      relative = productPrefix ? normalizedWorkspacePath.slice(productPrefix.length + 1) : normalizedWorkspacePath;
    } else if (!projectPrefix || normalizedWorkspacePath === projectPrefix || normalizedWorkspacePath.startsWith(`${projectPrefix}/`)) {
      relative = projectPrefix ? normalizedWorkspacePath.slice(projectPrefix.length + 1) : normalizedWorkspacePath;
    } else if (isVerificationGovernedRepositoryInput(normalizedWorkspacePath)) {
      relative = normalizedWorkspacePath;
    } else continue;
    if (relative) paths.push(normalizeProductPath(relative));
  }
  const uniquePaths: any = [...new Set(paths)].sort();
  const contentChanges: SourceChangeEvidence[] = [];
  // Read exact comparison bytes, not a task's prose or a path-only assertion.
  // Use the merge base, matching the triple-dot discovery above.
  for (const productPath of uniquePaths.filter((file: string) => /\.[cm]?tsx?$/u.test(file))) {
    try {
      const workspacePath = workspacePaths.find((file: string) => normalizeProductPath(
        file.startsWith(`${productPrefix}/`) ? file.slice(productPrefix.length + 1)
          : file.startsWith(`${projectPrefix}/`) ? file.slice(projectPrefix.length + 1) : file,
      ) === productPath);
      if (!workspacePath) continue;
      const read = (file: string, version: 'before' | 'after') => {
        if (path.posix.isAbsolute(file) || file.split('/').includes('..')) throw new Error('Invalid source path');
        if (version === 'before' || options.head) {
          const ref = version === 'before' ? mergeBase : headCommit;
          if (!/^100644 blob /u.test(git(gitRoot, ['ls-tree', ref, '--', file]))) throw new Error('Unknown source mode');
          return git(gitRoot, ['show', `${ref}:${file}`]);
        }
        const absolute = path.join(gitRoot, file), stat = fs.lstatSync(absolute);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o111) throw new Error('Unknown source mode');
        return fs.readFileSync(absolute, 'utf8');
      };
      const evidence = sourceChangeEvidence(productPath, read(workspacePath, 'before'), read(workspacePath, 'after'),
        (specifier, version) => {
          if (!specifier.startsWith('./') && !specifier.startsWith('../')) throw new Error('External barrel');
          return read(path.posix.normalize(path.posix.join(path.posix.dirname(workspacePath), specifier)), version);
        });
      if (evidence) contentChanges.push(evidence);
    } catch { /* New, deleted, unreadable or opaque source retains broad ownership. */ }
  }
  const versionOnlyPackagePaths: any[] = [];
  const selectionOnlyPaths: any[] = [];
  const selectionReasons: any[] = [];
  for (const productPath of uniquePaths.filter((item: any) => ['package.json', 'package-lock.json'].includes(item))) {
    try {
      const workspacePath: any = productPrefix ? `${productPrefix}/${productPath}` : productPath;
      const baseText: any = git(gitRoot, ['show', `${base}:${workspacePath}`]);
      const currentText: any = options.head ? git(gitRoot, ['show', `${head}:${workspacePath}`]) : fs.readFileSync(path.join(productRoot, productPath), 'utf8');
      if (isVersionOnlyPackageMetadataChange(productPath, baseText, currentText)) {
        versionOnlyPackagePaths.push(productPath);
        selectionOnlyPaths.push(productPath);
        selectionReasons.push({ path: productPath, code: 'version-only-package-metadata' });
      } else if (isSelectionOnlyPackageMetadataChange(productPath, baseText, currentText)) {
        selectionOnlyPaths.push(productPath);
        selectionReasons.push({ path: productPath, code: 'package-presentation-metadata-change' });
      }
    } catch {}
  }
  if (uniquePaths.includes('verification.yml')) {
    try {
      const workspacePath: any = productPrefix ? `${productPrefix}/verification.yml` : 'verification.yml';
      const baseText: any = git(gitRoot, ['show', `${base}:${workspacePath}`]);
      const currentText: any = options.head ? git(gitRoot, ['show', `${head}:${workspacePath}`]) : fs.readFileSync(path.join(productRoot, 'verification.yml'), 'utf8');
      if (isVerificationDeclarationMetadataOnlyChange(baseText, currentText)) {
        selectionOnlyPaths.push('verification.yml');
        selectionReasons.push({ path: 'verification.yml', code: 'verification-presentation-metadata-change' });
      }
    } catch {}
  }
  const workflowPath = '.github/workflows/verify.yml';
  if (uniquePaths.includes(workflowPath)) {
    try {
      const baseText = git(gitRoot, ['show', `${base}:${workflowPath}`]);
      const currentText = options.head ? git(gitRoot, ['show', `${head}:${workflowPath}`])
        : fs.readFileSync(path.join(gitRoot, workflowPath), 'utf8');
      if (isVerificationWorkflowTriggerOnlyChange(baseText, currentText)) {
        selectionOnlyPaths.push(workflowPath);
        selectionReasons.push({ path: workflowPath, code: 'workflow-trigger-only-change' });
      }
    } catch {}
  }
  return { base, head, comparison, paths: uniquePaths, source: 'git', contentChanges, versionOnlyPackagePaths, selectionOnlyPaths: [...new Set(selectionOnlyPaths)].sort(), selectionReasons };
}

/** A proof observed before snapshot collection must not narrow different
 * execution bytes. Failed reads/modes fall back to declared ownership. */
export function contentChangesAtSnapshot(changed: any, snapshot: any, options: any): SourceChangeEvidence[] {
  if (!snapshot?.files || ![1, 2].includes(snapshot.version)) return [];
  const productRoot = fs.realpathSync(options.productRoot), projectRoot = fs.realpathSync(options.projectRoot);
  const repository = fs.realpathSync(git(productRoot, ['rev-parse', '--show-toplevel']).trim());
  return (changed.contentChanges ?? []).filter((evidence: SourceChangeEvidence) => {
    try {
      const file = normalizeProductPath(evidence.path);
      const projectOwned = /^(?:services|knowledge|openspec|docs)\//u.test(file);
      const absolute = path.resolve(projectOwned ? projectRoot : productRoot, file);
      const relative = path.relative(repository, absolute).replaceAll('\\', '/');
      if (relative.startsWith('../') || path.isAbsolute(relative)) return false;
      const stat = fs.lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o111) return false;
      const bytes = fs.readFileSync(absolute);
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== evidence.afterDigest) return false;
      const hash = crypto.createHash('sha256').update(String(stat.mode));
      if (snapshot.version === 1) hash.update('\0');
      return hash.update(bytes).digest('hex') === snapshot.files[snapshot.version === 1 ? file : relative];
    } catch { return false; }
  });
}

/** Capture changed contents so a repair compares against the actual preceding run,
 * including its dirty files, rather than reselecting the entire delivery diff. */
export function collectImpactSnapshot(changed: any, options: any, previous: any = null): any {
  if (previous && (previous.version !== 1 || previous.productRoot !== fs.realpathSync(options.productRoot)
    || previous.base !== changed.base || !previous.files || typeof previous.files !== 'object' || Array.isArray(previous.files))) {
    throw new Error('Failure evidence snapshot does not match this checkout and comparison base.');
  }
  const paths = [...new Set<string>([...changed.paths, ...Object.keys(previous?.files ?? {})])].sort();
  const files: Record<string, string> = {};
  for (const file of paths) {
    const normalized = normalizeProductPath(file);
    if (normalized !== file || path.isAbsolute(file) || file.split('/').includes('..')) throw new Error(`Invalid snapshot path: ${file}`);
    const projectOwned = /^(?:services|knowledge|openspec|docs)\//u.test(file) || file === 'verification.yml';
    const root = projectOwned ? options.projectRoot : options.productRoot;
    const absolute = file.startsWith('skills/buildr-release/') || isVerificationGovernedRepositoryInput(file)
      ? path.resolve(git(options.productRoot, ['rev-parse', '--show-toplevel']).trim(), file) : path.resolve(root, file);
    try {
      const stat = fs.lstatSync(absolute);
      files[file] = crypto.createHash('sha256').update(String(stat.mode)).update('\0').update(stat.isSymbolicLink() ? fs.readlinkSync(absolute) : fs.readFileSync(absolute)).digest('hex');
    } catch (error: any) { if (error.code !== 'ENOENT') throw error; files[file] = 'absent'; }
  }
  return { version: 1, productRoot: fs.realpathSync(options.productRoot), base: changed.base, files,
    changedSincePrevious: previous ? paths.filter(file => files[file] !== previous.files[file]) : changed.paths };
}
