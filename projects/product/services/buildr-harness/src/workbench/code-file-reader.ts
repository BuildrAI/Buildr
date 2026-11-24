import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { insideFilesystemPath } from './filesystem-path-identity.ts';
import { codeGitEnvironment } from './code-git-environment.ts';
export const CODE_LIMITS = Object.freeze({ entries: 1000, textBytes: 5 * 1024 * 1024, pageBytes: 512 * 1024, readMs: 15000, imageBytes: 8 * 1024 * 1024, matches: 100, matchLines: 200, searchOutputBytes: 8 * 1024 * 1024, searchMs: 15000 });
export type CodeSource = { repositoryId:string; worktreeId?:string|null; taskId:string|null; commitHash:string|null; checkoutId:string|null;worktreeGroupId:string|null;location:string; version:string; kind:'default'|'task'|'worktree'|'commit'; allowNonGit?: true };
export type DirectoryEntry = { name:string; path:string; kind:'directory'|'file'|'link'; ignored:boolean };
export function codeFailure(code:string,message:string,status=400): Error & {code:string;status:number} { return Object.assign(new Error(message),{code,status}); }
export function relativeCodePath(value:string, allowEmpty=false) {
  if ((!value && !allowEmpty) || value.includes('\\') || value.includes('\0') || value.includes('//') || path.posix.isAbsolute(value) || value.split('/').some(p=>p==='..'||p==='.'||p.toLowerCase()==='.git') || /^[A-Za-z]:/.test(value)) throw codeFailure('code_path_forbidden','文件路径必须位于所选代码库内。');
  return value.replace(/\/$/,'');
}
function codeGitArgs(root: string, args: string[], config: string[] = []) {
  return ['--literal-pathspecs', '--no-optional-locks', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'core.fsmonitor=false', ...config.flatMap(value => ['-c', value]), '-C', root, ...args];
}
const codeGitOptions = (maxBuffer: number) => ({env: {...codeGitEnvironment(), GIT_OPTIONAL_LOCKS: '0'}, timeout: 4000, maxBuffer});
const unavailableGit = () => codeFailure('code_git_unavailable', '该代码库的指定 Git 内容当前不可读取。', 404);

export function codeGit(root:string,args:string[],maxBuffer=CODE_LIMITS.imageBytes+1,input?:string|Buffer,config: string[] = []): Buffer {
  try { return execFileSync('git', codeGitArgs(root,args,config), {...codeGitOptions(maxBuffer),input,stdio:[input===undefined?'ignore':'pipe','pipe','ignore']}); }
  catch { throw unavailableGit(); }
}

export function codeGitAsync(root: string, args: string[], maxBuffer: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile('git', codeGitArgs(root,args), {...codeGitOptions(maxBuffer),encoding:'buffer'}, (error, stdout) => {
      if (error) reject(unavailableGit());
      else resolve(stdout);
    });
    child.stdin?.end();
  });
}
export function gitCommonDirectory(root:string) { const value=codeGit(root,['rev-parse','--git-common-dir']).toString().trim(); return fs.realpathSync(path.resolve(root,value)); }
export async function gitCommonDirectoryAsync(root: string): Promise<string> {
  const value = (await codeGitAsync(root, ['rev-parse', '--git-common-dir'], 64 * 1024)).toString().trim();
  return fs.promises.realpath(path.resolve(root, value));
}
const metadataLocations=new WeakMap<CodeSource,string>();
function verifyResolvedPath(source: CodeSource, real: string, metadata: string) {
  if (!insideFilesystemPath(source.location, real)) throw codeFailure('code_path_forbidden', '符号链接指向所选代码库之外。', 403);
  const actualRelative = path.relative(source.location, real);
  if (actualRelative.split(path.sep).some(p => p.toLowerCase() === '.git') || (metadata && insideFilesystemPath(metadata, real))) {
    throw codeFailure('code_path_forbidden', '不能读取 Git 管理目录。', 403);
  }
  return real;
}
export function localPath(source:CodeSource,relative:string) {
  const root=source.location;
  const candidate=path.join(root,relative);
  let real:string; try { real=fs.realpathSync(candidate); } catch { throw codeFailure('code_file_missing','所选目录或文件不存在，或当前不可读取。',404); }
  if (!insideFilesystemPath(root,real)) throw codeFailure('code_path_forbidden','符号链接指向所选代码库之外。',403);
  let metadata=metadataLocations.get(source);if (metadata === undefined) {
    try { metadata = gitCommonDirectory(root); }
    catch (error) { if (!source.allowNonGit) throw error; metadata = ''; }
    metadataLocations.set(source, metadata);
  }
  return verifyResolvedPath(source, real, metadata);
}
export async function localPathAsync(source: CodeSource, relative: string, preVerifiedGitCommonDir?: string): Promise<string> {
  const root = source.location;
  const candidate = path.join(root, relative);
  let real: string;
  try { real = await fs.promises.realpath(candidate); }
  catch { throw codeFailure('code_file_missing', '所选目录或文件不存在，或当前不可读取。', 404); }
  if (!insideFilesystemPath(root, real)) throw codeFailure('code_path_forbidden', '符号链接指向所选代码库之外。', 403);
  let metadata = metadataLocations.get(source);
  if (metadata === undefined) {
    if (preVerifiedGitCommonDir !== undefined) {
      metadata = preVerifiedGitCommonDir;
    } else {
      try { metadata = await gitCommonDirectoryAsync(root); }
      catch (error) { if (!source.allowNonGit) throw error; metadata = ''; }
    }
    metadataLocations.set(source, metadata);
  }
  return verifyResolvedPath(source, real, metadata);
}
export const fallbackIgnored = new Set(['node_modules','dist','build','web-dist','.worktrees','.buildr']);
function applyFallbackIgnored(paths: string[], ignored: Set<string>) {
  for (const value of paths) if (value.split('/').some(p => fallbackIgnored.has(p))) ignored.add(value);
  return ignored;
}
function ignoredPaths(root:string,paths:string[]) {
  const ignored=new Set<string>();
  if (paths.length) {
    try {
      const output=execFileSync('git',['-C',root,'check-ignore','--no-index','-z','--stdin'],{env:{...codeGitEnvironment(),GIT_OPTIONAL_LOCKS:'0'},input:Buffer.from(paths.join('\0')+'\0'),timeout:1500,maxBuffer:2*1024*1024,stdio:['pipe','pipe','ignore']});
      for(const item of output.toString().split('\0'))if(item)ignored.add(item);
    } catch { /* No ignored matches is git status 1; common build directories remain bounded. */ }
  }
  return applyFallbackIgnored(paths, ignored);
}
async function ignoredPathsAsync(root: string, paths: string[]): Promise<Set<string>> {
  const ignored = new Set<string>();
  if (paths.length) {
    await new Promise<void>(resolve => {
      const child = execFile('git', ['-C', root, 'check-ignore', '--no-index', '-z', '--stdin'], {
        env: { ...codeGitEnvironment(), GIT_OPTIONAL_LOCKS: '0' },
        timeout: 1500,
        maxBuffer: 2 * 1024 * 1024,
        encoding: 'buffer',
      }, (error, stdout) => {
        if (!error && stdout) {
          for (const item of stdout.toString('utf8').split('\0')) if (item) ignored.add(item);
        }
        resolve();
      });
      child.stdin?.end(Buffer.from(paths.join('\0') + '\0'));
    });
  }
  return applyFallbackIgnored(paths, ignored);
}
function formatCommitTreeEntries(bytes: Buffer, relative: string): DirectoryEntry[] {
  return bytes.toString().split('\0').filter(Boolean).map(line => {
    const separator = line.indexOf('\t'), meta = line.slice(0, separator), name = line.slice(separator + 1);
    const [mode, type] = meta.split(' ');
    return { name, path: relative ? relative + '/' + name : name, kind: mode === '120000' || mode === '160000' ? 'link' : type === 'tree' ? 'directory' : 'file', ignored: false };
  });
}
function finalizeDirectoryListing(source: CodeSource, relative: string, entries: DirectoryEntry[], enumerationTruncated: boolean, showIgnored: boolean) {
  const filtered = entries
    .filter(e => e.name.toLowerCase() !== '.git' && (showIgnored || !e.ignored))
    .sort((a, b) => Number(a.kind !== 'directory') - Number(b.kind !== 'directory') || a.name.localeCompare(b.name));
  return { source, path: relative, entries: filtered.slice(0, CODE_LIMITS.entries), truncated: enumerationTruncated || filtered.length > CODE_LIMITS.entries, limit: CODE_LIMITS.entries, observedAt: new Date().toISOString() };
}
export function readCodeDirectory(source:CodeSource,relative='',showIgnored=false) {
  relativeCodePath(relative,true);
  let entries:DirectoryEntry[]=[],enumerationTruncated=false;
  if (source.commitHash) {
    const tree=source.commitHash+(relative?':'+relative:'');
    entries=formatCommitTreeEntries(codeGit(source.location,['ls-tree','-z',tree],4*1024*1024), relative);
  } else {
    const dir=localPath(source,relative); if(!fs.statSync(dir).isDirectory())throw codeFailure('code_directory_expected','所选路径不是目录。');
    const handle=fs.opendirSync(dir),names:fs.Dirent[]=[];
    try {let item:fs.Dirent|null;while((item=handle.readSync())){if(names.length>=CODE_LIMITS.entries*2){enumerationTruncated=true;break;}names.push(item);}}finally{handle.closeSync();}
    entries=names.map(item=>({name:item.name,path:relative?relative+'/'+item.name:item.name,kind:item.isSymbolicLink()?'link':item.isDirectory()?'directory':'file',ignored:false}));
    const ignored=ignoredPaths(source.location,entries.map(e=>e.path));for(const entry of entries)entry.ignored=ignored.has(entry.path);
  }
  return finalizeDirectoryListing(source, relative, entries, enumerationTruncated, showIgnored);
}
/** Filesystem-only view. Keep Git administration paths out without spawning Git. */
export async function readWorkspaceDirectory(source: CodeSource, relative: string, showIgnored: boolean) {
  relativeCodePath(relative, true);
  const candidate = await localPathAsync(source, relative, '');
  for (let directory = candidate; ; directory = path.dirname(directory)) {
    if (path.basename(directory).toLowerCase() === '.git') {
      throw codeFailure('code_path_forbidden', '不能读取 Git 管理目录。', 403);
    }
    // A separate/bare Git directory, or a relocated administrative worktree directory.
    const [head, objects, refs, common] = await Promise.all(['HEAD', 'objects', 'refs', 'commondir'].map(name =>
      fs.promises.lstat(path.join(directory, name)).catch(error => {
        if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
        throw error;
      })));
    if (head && ((objects && refs) || common)) {
      throw codeFailure('code_path_forbidden', '不能读取 Git 管理目录。', 403);
    }
    if (path.dirname(directory) === directory) break;
  }
  return listLocalDirectory(source, candidate, relative, showIgnored, false);
}

async function listLocalDirectory(source: CodeSource, dir: string, relative: string, showIgnored: boolean, useGitIgnore: boolean) {
  if (!(await fs.promises.stat(dir)).isDirectory()) throw codeFailure('code_directory_expected', '所选路径不是目录。');
  const handle = await fs.promises.opendir(dir);
  const entries: DirectoryEntry[] = [];
  let truncated = false;
  for await (const item of handle) {
    if (entries.length >= CODE_LIMITS.entries * 2) { truncated = true; break; }
    entries.push({ name: item.name, path: relative ? `${relative}/${item.name}` : item.name,
      kind: item.isSymbolicLink() ? 'link' : item.isDirectory() ? 'directory' : 'file', ignored: false });
  }
  const paths = entries.map(entry => entry.path);
  const ignored = useGitIgnore ? await ignoredPathsAsync(source.location, paths) : applyFallbackIgnored(paths, new Set());
  for (const entry of entries) entry.ignored = ignored.has(entry.path);
  return finalizeDirectoryListing(source, relative, entries, truncated, showIgnored);
}

export async function readCodeDirectoryAsync(source: CodeSource, relative = '', showIgnored = false, preVerifiedGitCommonDir?: string) {
  relativeCodePath(relative, true);
  if (!source.commitHash) {
    const directory = await localPathAsync(source, relative, preVerifiedGitCommonDir);
    return listLocalDirectory(source, directory, relative, showIgnored, true);
  }
  const tree = source.commitHash + (relative ? ':' + relative : '');
  const entries = formatCommitTreeEntries(await codeGitAsync(source.location, ['ls-tree', '-z', tree], 4 * 1024 * 1024), relative);
  return finalizeDirectoryListing(source, relative, entries, false, showIgnored);
}
