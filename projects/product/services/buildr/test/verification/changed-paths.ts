import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { normalizeProductPath } from './planner.ts';
import { VERIFICATION_GOVERNED_REPOSITORY_INPUTS } from './ownership.ts';
import { sameFilesystemPath } from '../../src/infrastructure/git/checkout-identity.ts';

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
  git(gitRoot, ['rev-parse', '--verify', `${head}^{commit}`]);
  const pathspecs: any[] = [projectPrefix || '.', ...VERIFICATION_GOVERNED_REPOSITORY_INPUTS];
  const commands: any = options.head ? [
    ['diff', '--name-only', '-z', `${base}...${head}`, '--', ...pathspecs],
  ] : [
    ['diff', '--name-only', '-z', `${base}...HEAD`, '--', ...pathspecs],
    ['diff', '--cached', '--name-only', '-z', '--', ...pathspecs],
    ['diff', '--name-only', '-z', '--', ...pathspecs],
    ['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspecs],
  ];
  const workspacePaths: any = commands.flatMap((args: any) => zeroSeparated(git(gitRoot, args)));
  const paths: any[] = [];
  for (const workspacePath of workspacePaths) {
    const normalizedWorkspacePath: any = workspacePath.replaceAll('\\', '/');
    let relative: any;
    if (!productPrefix || normalizedWorkspacePath === productPrefix || normalizedWorkspacePath.startsWith(`${productPrefix}/`)) {
      relative = productPrefix ? normalizedWorkspacePath.slice(productPrefix.length + 1) : normalizedWorkspacePath;
    } else if (!projectPrefix || normalizedWorkspacePath === projectPrefix || normalizedWorkspacePath.startsWith(`${projectPrefix}/`)) {
      relative = projectPrefix ? normalizedWorkspacePath.slice(projectPrefix.length + 1) : normalizedWorkspacePath;
    } else if (VERIFICATION_GOVERNED_REPOSITORY_INPUTS.includes(normalizedWorkspacePath)) {
      relative = normalizedWorkspacePath;
    } else continue;
    if (relative) paths.push(normalizeProductPath(relative));
  }
  const uniquePaths: any = [...new Set(paths)].sort();
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
  return { base, head, paths: uniquePaths, source: 'git', versionOnlyPackagePaths, selectionOnlyPaths: [...new Set(selectionOnlyPaths)].sort(), selectionReasons };
}
