import crypto from 'node:crypto';
import { observeGitCheckoutReadIdentity } from '../../../infrastructure/git/checkout-read-identity.ts';
import { codeFailure, codeGit, type CodeSource } from '../infrastructure/code-file-reader.ts';
import { runCodeGitMutation } from '../infrastructure/code-git-mutation-runner.ts';
import { acquireCodeGitOperation } from '../infrastructure/code-git-operation-lock.ts';
import { fetchCodeRemoteRefs } from '../infrastructure/code-fetch-refs.ts';

export type CodeFetchStatus = 'succeeded' | 'failed' | 'unavailable' | 'unknown';
export type CodeFetchTarget = { repositoryId: string; expectedGitId: string | null; expectedCheckoutId: string | null };
export type CodeFetchInput = { repositories: CodeFetchTarget[] };
export type CodeFetchRemoteResult = { name: string; status: CodeFetchStatus; message: string };
export type CodeFetchRepositoryResult = { repositoryId: string; gitId: string | null; status: CodeFetchStatus; message: string; remotes: CodeFetchRemoteResult[] };
export type CodeFetchResponse = { readAt: string; repositories: CodeFetchRepositoryResult[] };
type Dependencies = { registeredLocation(root: string, repositoryId: string): string; run?: typeof runCodeGitMutation };
type Remote = { name: string; url: string; refspecs: string[]; valid: boolean };
type Observation = { target: CodeFetchTarget; source: CodeSource; gitId: string; commonDirectory: string; configuration: string; remoteRevision: string; remotes: Remote[] };
type ParsedConfiguration = { remotes: Array<{ name: string; refspecs: string[] }>; validRefs: Map<string, boolean> };
type ConfigurationParses = Map<string, ParsedConfiguration>;
const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const result = (target: CodeFetchTarget, status: CodeFetchStatus, message: string, gitId: string | null = target.expectedGitId, remotes: CodeFetchRemoteResult[] = []): CodeFetchRepositoryResult => ({ repositoryId: target.repositoryId, gitId, status, message, remotes });

export function createCodeFetchApplication(dependencies: Dependencies) {
  const run = dependencies.run || runCodeGitMutation;
  function configuration(location: string, parses: ConfigurationParses) {
    const raw = codeGit(location, ['config', '--null', '--list'], 1024 * 1024);
    const revision = crypto.createHash('sha256').update(raw).digest('hex'), cacheKey = location + '\0' + revision;
    const bytes = raw.toString('utf8');
    let parsed = parses.get(cacheKey);
    if (!parsed) {
      const rows = bytes.split('\0').filter(Boolean).map(row => { const index = row.indexOf('\n'); return [row.slice(0, index), row.slice(index + 1)] as const; });
      const names = [...new Set(rows.filter(([key]) => key.startsWith('remote.') && key.endsWith('.url')).map(([key]) => key.slice(7, -4)))];
      parsed = { remotes: names.map(name => ({ name, refspecs: rows.filter(([key]) => key === 'remote.' + name + '.fetch').map(([, value]) => value) })), validRefs: new Map() };
      parses.set(cacheKey, parsed);
    }
    const parsedConfiguration = parsed;
    // Only exact configuration bytes and context-free ref syntax are reused in
    // this fetch call. URL expansion and current symbolic destinations stay fresh.
    const symbolicRefs = new Map(codeGit(location, ['for-each-ref', '--format=%(refname)%00%(symref)', 'refs/']).toString('utf8').split('\n').filter(Boolean).map(line => line.split('\0') as [string,string]));
    const safeDestination = (destination: string) => {
      const pattern = new RegExp('^' + destination.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      for (const [name, target] of symbolicRefs) {
        if (!target || !pattern.test(name)) continue;
        const seen = new Set<string>(); let current = name;
        while (symbolicRefs.get(current)) { if (seen.has(current)) return false; seen.add(current); current = symbolicRefs.get(current)!; if (!current.startsWith('refs/remotes/')) return false; }
      }
      return true;
    };
    const remotes: Remote[] = parsedConfiguration.remotes.map(({ name, refspecs }) => {
      if (!name || /[\0\r\n]/.test(name) || name.length > 1024) return { name: '无效远程名称', url: '', refspecs: [], valid: false };
      const urls = codeGit(location, ['remote', 'get-url', '--all', '--', name], 64 * 1024).toString('utf8').replace(/\n$/, '').split('\n');
      const validRef = (ref: string) => {
        if (!ref.startsWith('refs/') || /[\0\r\n]/.test(ref) || (ref.match(/\*/g) || []).length > 1) return false;
        const cached = parsedConfiguration.validRefs.get(ref); if (cached !== undefined) return cached;
        let valid = false; try { codeGit(location, ['check-ref-format', ref.replace('*', 'buildr-wildcard')]); valid = true; } catch { /* Invalid ref syntax stays unavailable. */ }
        parsedConfiguration.validRefs.set(ref, valid); return valid;
      };
      const valid = !!urls[0] && !/[\0\r\n]/.test(urls[0]) && refspecs.length > 0 && refspecs.every(spec => {
        if (spec.startsWith('^')) return !spec.includes(':') && validRef(spec.slice(1));
        const fields = spec.replace(/^\+/, '').split(':');
        return fields.length === 2 && fields[1].startsWith('refs/remotes/') && validRef(fields[0]) && validRef(fields[1]) && safeDestination(fields[1]) && (fields[0].includes('*') === fields[1].includes('*'));
      });
      return { name, url: urls[0], refspecs, valid };
    });
    return { revision, remoteRevision: digest(remotes), remotes };
  }
  function observe(root: string, target: CodeFetchTarget, parses: ConfigurationParses): Observation {
    if (!target.expectedGitId || !target.expectedCheckoutId) throw codeFailure('code_fetch_source_unconfirmed', '代码库身份尚未确认，请先刷新本机状态。', 409);
    const identity = observeGitCheckoutReadIdentity(dependencies.registeredLocation(root, target.repositoryId));
    const gitId = 'sha256-' + crypto.createHash('sha256').update(identity.commonDirectory).digest('hex');
    if (gitId !== target.expectedGitId || identity.id !== target.expectedCheckoutId) throw codeFailure('code_fetch_source_changed', '登记来源或 Git 身份已变化，未获取；请重新观察。', 409);
    const config = configuration(identity.root, parses);
    const source: CodeSource = { repositoryId: target.repositoryId, taskId: null, commitHash: null, checkoutId: identity.id, worktreeId: identity.id, worktreeGroupId: 'main', location: identity.root, version: '当前文件', kind: 'default' };
    return { target, source, gitId, commonDirectory: identity.commonDirectory, configuration: config.revision, remoteRevision: config.remoteRevision, remotes: config.remotes };
  }
  function verify(root: string, observed: Observation, parses: ConfigurationParses) {
    const now = observe(root, observed.target, parses);
    if (now.source.location !== observed.source.location || now.configuration !== observed.configuration || now.remoteRevision !== observed.remoteRevision) throw codeFailure('code_fetch_configuration_changed', '来源或远程配置已变化，本次不继续获取；请重新观察。', 409);
  }
  async function fetchGroup(root: string, group: Observation[], parses: ConfigurationParses): Promise<CodeFetchRepositoryResult[]> {
    const first = group[0];
    if (group.some(item => item.remoteRevision !== first.remoteRevision)) return group.map(item => result(item.target, 'unavailable', '同一 Git 仓库的登记位置具有不同远程配置，未选择其中一个执行。', item.gitId));
    let release: () => void;
    try { release = acquireCodeGitOperation(first.source); }
    catch { return group.map(item => result(item.target, 'unavailable', '该 Git 仓库正在获取远程或执行其他 Git 操作，请等待当前操作结束。', item.gitId)); }
    const remotes: CodeFetchRemoteResult[] = [];
    try {
      for (const remote of first.remotes) {
        if (!remote.valid) { remotes.push({ name: remote.name, status: 'unavailable', message: '远程获取映射缺失或包含不支持的目标；只支持远程跟踪引用，未修改配置。' }); continue; }
        try { for (const item of group) verify(root, item, parses); }
        catch { remotes.push({ name: remote.name, status: 'unavailable', message: '来源或远程配置已变化，未执行该远程获取。' }); continue; }
        let remoteResult: CodeFetchRemoteResult;
        try {
          const value = await fetchCodeRemoteRefs(first.source, remote, { run, verify: () => { for (const item of group) verify(root, item, parses); } });
          remoteResult = { name: remote.name, ...value };
        } catch { remoteResult = { name: remote.name, status: 'unknown', message: '获取执行结果尚未确认，请刷新核对；不会自动重试。' }; }
        try { for (const item of group) verify(root, item, parses); }
        catch { remoteResult = { name: remote.name, status: 'unknown', message: '获取后来源或配置发生变化，已发生的远程记录更新保留，请刷新核对。' }; }
        remotes.push(remoteResult);
      }
      const status: CodeFetchStatus = remotes.some(item => item.status === 'unknown') ? 'unknown' : remotes.some(item => item.status === 'failed') ? 'failed' : remotes.some(item => item.status === 'unavailable') || !remotes.length ? 'unavailable' : 'succeeded';
      const message = !remotes.length ? '没有已配置的远程。' : status === 'succeeded' ? '已获取全部已配置远程，当前分支和未提交内容保留。' : '部分远程尚未完成，请查看各远程结果；已完成的更新保留。';
      return group.map(item => result(item.target, status, message, item.gitId, remotes));
    } finally { release(); }
  }
  async function fetch(root: string, input: CodeFetchInput): Promise<CodeFetchResponse> {
    if (!input || !Array.isArray(input.repositories) || input.repositories.length < 1 || input.repositories.length > 128 || new Set(input.repositories.map(item => item?.repositoryId)).size !== input.repositories.length || input.repositories.some(item => !item || typeof item.repositoryId !== 'string' || !item.repositoryId || !(item.expectedGitId === null || /^sha256-[a-f0-9]{64}$/.test(item.expectedGitId)) || !(item.expectedCheckoutId === null || /^checkout-[a-f0-9]{64}$/.test(item.expectedCheckoutId)))) throw codeFailure('code_fetch_input_invalid', '获取必须指定 1–128 个不同的已观察代码库及 Git 身份。');
    const groups = new Map<string, Observation[]>(), results = new Map<string, CodeFetchRepositoryResult>(), parses: ConfigurationParses = new Map();
    for (const target of input.repositories) {
      try { const observed = observe(root, target, parses), group = groups.get(observed.commonDirectory) || []; group.push(observed); groups.set(observed.commonDirectory, group); }
      catch { results.set(target.repositoryId, result(target, 'unavailable', '代码库未登记、不可读取或已观察身份变化，未执行获取；请刷新本机状态。')); }
    }
    const pending = [...groups.values()];
    await Promise.all(Array.from({ length: Math.min(2, pending.length) }, async () => {
      for (;;) { const group = pending.shift(); if (!group) return; for (const item of await fetchGroup(root, group, parses)) results.set(item.repositoryId, item); }
    }));
    return { readAt: new Date().toISOString(), repositories: input.repositories.map(target => results.get(target.repositoryId)!) };
  }
  return Object.freeze({ fetch });
}
