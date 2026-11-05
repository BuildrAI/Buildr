import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { VERIFICATION_GOVERNED_REPOSITORY_INPUTS } from './ownership.ts';

/** A full source inventory works for both full runs and subsequent dirty repairs.
 * Bytes are read on every observation; metadata never attests unchanged content. */
export function collectVerificationContentSnapshot(options: any, previous: any = null): any {
  const productRoot = fs.realpathSync(options.productRoot);
  const projectRoot = fs.realpathSync(options.projectRoot);
  const git = (args: string[], cwd = productRoot) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const repositoryRoot = fs.realpathSync(git(['rev-parse', '--show-toplevel']).trim());
  const relative = (root: string) => path.relative(repositoryRoot, root).split(path.sep).join('/');
  const productPrefix = relative(productRoot), projectPrefix = relative(projectRoot);
  if (projectPrefix === '..' || projectPrefix.startsWith('../')) throw new Error('Snapshot project is outside repository.');
  if (previous && (previous.version !== 2 || previous.productRoot !== productRoot || typeof previous.base !== 'string' || !previous.base
    || !previous.files || typeof previous.files !== 'object' || Array.isArray(previous.files))) throw new Error('Failure evidence snapshot does not match this checkout.');
  const names = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', projectPrefix || '.', 'skills/buildr-release/', ...VERIFICATION_GOVERNED_REPOSITORY_INPUTS], repositoryRoot).split('\0').filter(Boolean);
  if (previous && Object.values(previous.files).some(value => typeof value !== 'string' || value !== 'absent' && !/^[a-f0-9]{64}$/.test(value))) throw new Error('Invalid failure evidence content digest.');
  const files: Record<string, string> = Object.create(null);
  const hash = (file: string) => {
    const absolute = path.resolve(repositoryRoot, file);
    const within = path.relative(repositoryRoot, absolute);
    if (path.isAbsolute(file) || within.startsWith('..' + path.sep) || within === '..') throw new Error(`Invalid snapshot path: ${file}`);
    try {
      const stat = fs.lstatSync(absolute);
      const digest = crypto.createHash('sha256').update(String(stat.mode));
      if (stat.isSymbolicLink()) digest.update(fs.readlinkSync(absolute));
      else if (stat.isFile()) digest.update(fs.readFileSync(absolute));
      else throw new Error(`Unsupported snapshot input: ${file}`);
      return digest.digest('hex');
    } catch (error: any) { if (error.code === 'ENOENT') return 'absent'; throw error; }
  };
  for (const file of new Set<string>([...names, ...Object.keys(previous?.files ?? {})])) files[file] = hash(file);
  const toProduct = (file: string) => {
    if (file.startsWith(productPrefix + '/')) return file.slice(productPrefix.length + 1);
    if (file.startsWith(projectPrefix + '/')) return file.slice(projectPrefix.length + 1);
    return file;
  };
  const variables = [...new Set<string>(['TZ', 'LANG', 'LC_ALL', 'NODE_OPTIONS', 'BUILDR_VERIFICATION_PROFILE', 'BUILDR_VERIFICATION_NETWORK_MODE', ...(options.environmentInputs ?? [])])].sort();
  const environment = crypto.createHash('sha256').update(JSON.stringify([process.version, process.platform, process.arch, variables.map(key => [key, (options.env ?? process.env)[key] ?? ''])])).digest('hex');
  return { version: 2, productRoot, base: options.base, previousBase: previous?.base ?? null, files, environment,
    environmentChanged: Boolean(previous && previous.environment !== environment),
    changedSincePrevious: previous ? Object.keys(files).filter(file => files[file] !== previous.files[file]).map(toProduct).sort() : [] };
}
