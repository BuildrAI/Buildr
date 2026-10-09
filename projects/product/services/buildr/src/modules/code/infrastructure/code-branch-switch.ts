import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { codeFailure, codeGit, type CodeSource } from './code-file-reader.ts';
import { codeRevision } from './source-control-git-reader.ts';

export function readCodeCheckoutFilterConfig(source: CodeSource) {
  const config = codeGit(source.location, ['config', '--null', '--list'], 1024 * 1024).toString();
  const external = new Set<string>(), records: string[] = [];
  for (const record of config.split('\0')) {
    const boundary = record.indexOf('\n'), key = record.slice(0, boundary), value = record.slice(boundary + 1);
    const match = /^filter\.(.+)\.(?:clean|smudge|process)$/.exec(key);
    if (match && value.trim()) { external.add(match[1]); records.push(record); }
  }
  // Only the branch-specific observation uses raw bytes to find potentially
  // affected paths. It never represents these raw values as converted file contents.
  const overrides = [...external].flatMap(name => ['filter.' + name + '.clean=', 'filter.' + name + '.smudge=', 'filter.' + name + '.process=', 'filter.' + name + '.required=false']);
  return { external, overrides, revision: codeRevision(records) };
}

/** Check the paths this checkout would change or inspect for dirty-content preservation. */
export function assertNoExternalCheckoutFilters(source: CodeSource, targetHash: string, dirtyPaths: string[] = []) {
  const { external } = readCodeCheckoutFilterConfig(source);
  if (!external.size) return;
  let currentHash: string | null = null;
  try { currentHash = codeGit(source.location, ['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim(); } catch { /* An unborn HEAD has no tracked base. */ }
  const treePaths = codeGit(source.location, currentHash ? ['diff-tree', '-r', '--name-only', '--no-ext-diff', '--no-textconv', '-z', currentHash, targetHash, '--'] : ['ls-tree', '-r', '--name-only', '-z', targetHash], 8 * 1024 * 1024).toString().split('\0').filter(Boolean);
  const paths = [...new Set([...treePaths, ...dirtyPaths])];
  if (!paths.length) return;
  if (paths.length > 1000) throw codeFailure('code_branch_filter_scan_limit', '本次切换超过 1000 个路径，尚无法有界核对外部文件转换，请交给智能体（Agent）处理。', 409);
  const scopes = [[], ['--cached'], ['--source=' + targetHash], ...(currentHash ? [['--source=' + currentHash]] : [])];
  for (const scope of scopes) {
    let attributes: string[];
    try { attributes = codeGit(source.location, ['check-attr', ...scope, '-z', '--stdin', 'filter'], 1024 * 1024, paths.join('\0') + '\0').toString().split('\0'); }
    catch { throw codeFailure('code_branch_filter_unconfirmed', '当前 Git 无法核对目标与当前位置的文件转换属性，不能安全切换此项。', 409); }
    for (let index = 0; index + 2 < attributes.length; index += 3) if (external.has(attributes[index + 2])) {
      const error = codeFailure('code_branch_external_filter', '此项切换需要执行外部文件转换，可能涉及网络或其他副作用，请交给智能体（Agent）处理。', 409);
      Object.assign(error, { details: { filter: attributes[index + 2], path: attributes[index] } }); throw error;
    }
  }
}

function overwrittenFiles(message: string): string[] {
  if (!message.includes('would be overwritten by checkout:')) return [];
  const files: string[] = []; let listing = false, pending: string | null = null;
  const retain = () => {
    if (pending === null) return;
    let file = pending; pending = null;
    if (file.startsWith('"')) { try { file = JSON.parse(file); } catch { return; } }
    files.push(file);
  };
  for (const line of message.split('\n')) {
    if (line.includes('would be overwritten by checkout:')) { retain(); listing = true; continue; }
    if (!listing) continue;
    if (line.startsWith('\t')) { retain(); pending = line.slice(1); continue; }
    if (/^(Please |Aborting|error:|fatal:|$)/.test(line)) retain();
    else pending = null; // An unquoted multiline path cannot be inferred from this fragment.
    listing = false;
  }
  return [...new Set(files)];
}

/** The only Git write in the code module. Never invokes checkout hooks or submodule updates. */
export function switchCodeBranch(source: CodeSource, ref: string, createLocal?: string, changedPaths: string[] = []) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const args = ['--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', '-C', source.location,
    'switch', '--no-guess', '--no-recurse-submodules', '--no-overwrite-ignore', ...(createLocal ? ['--create', createLocal, '--track'] : []), '--', ref];
  const result = spawnSync('git', args, { env: { ...env, LC_ALL: 'C', LANG: 'C', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' }, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status === 0 && !result.error) return;
  const detail = String(result.stderr || '').trim().slice(0, 4000);
  const timeout = result.error && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT';
  const error = codeFailure(timeout ? 'code_branch_switch_timeout' : 'code_branch_switch_blocked', timeout ? '切换超过 15 秒，请刷新核对当前位置。' : 'Git 未完成切换，请查看当前位置及阻碍切换的改动。', 409);
  // Git can print literal newlines in a path. Keep exact observed paths, and never
  // invent a path from a partial diagnostic line. Plain ignored files may not be in status.
  const affectedFiles = [...new Set([
    ...changedPaths.filter(file => detail.includes('would be overwritten by checkout:') && (detail.includes('\t' + file + '\n') || detail.includes('\t' + JSON.stringify(file) + '\n'))),
    ...overwrittenFiles(detail).filter(file => changedPaths.includes(file) || fs.existsSync(path.join(source.location, file))),
  ])];
  Object.assign(error, { details: { gitMessage: detail, ...(affectedFiles.length ? { affectedFiles } : {}) } });
  throw error;
}
