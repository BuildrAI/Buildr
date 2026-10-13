import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { observeGitCheckoutReadIdentity } from '../../../infrastructure/git/checkout-read-identity.ts';
import { codeGit, type CodeSource } from './code-file-reader.ts';
import { runCodeGitMutation } from './code-git-mutation-runner.ts';

type Remote = { url: string; refspecs: string[] };
type Result = { status: 'succeeded' | 'failed' | 'unavailable' | 'unknown'; message: string };
type Ref = { name: string; hash: string; symbolic: string };
/** Fetch into an owned namespace, then publish without following symbolic refs into local branches. */
export async function fetchCodeRemoteRefs(source: CodeSource, remote: Remote, options: { run: typeof runCodeGitMutation; verify(): void }): Promise<Result> {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-code-fetch-'));
  const prefix = 'refs/buildr-fetch/' + crypto.randomUUID() + '/';
  const gitOptions = ['-c', 'core.hooksPath=' + path.join(temporary, 'hooks'), '-c', 'core.fsmonitor=false'];
  const readRefs = (namespace: string): Ref[] => codeGit(source.location, ['for-each-ref', '--format=%(refname)%00%(objectname)%00%(symref)', namespace]).toString('utf8').split('\n').filter(Boolean).map(line => { const [name, hash, symbolic] = line.split('\0'); return { name, hash, symbolic }; });
  const staged = () => readRefs(prefix).filter(ref => ref.name.startsWith(prefix));
  const sameSource = () => observeGitCheckoutReadIdentity(source.location).id === source.checkoutId;
  try {
    options.verify();
    const existing = new Map(readRefs('refs/remotes/').map(ref => [ref.name, ref]));
    if (staged().length) return { status: 'unavailable', message: '临时获取范围已被占用，未执行。' };
    const refspecs = remote.refspecs.map(spec => {
      if (spec.startsWith('^')) return spec;
      const index = spec.indexOf(':'); return spec.slice(0, index + 1) + prefix + spec.slice(index + 1 + 'refs/remotes/'.length);
    });
    // A unique exact alias pins the already expanded URL without applying insteadOf a second time.
    const transportAlias = 'buildr-fetch-' + crypto.randomUUID() + ':';
    const fetched = await options.run(source, [...gitOptions, 'fetch', '--atomic', '--no-tags', '--no-prune', '--no-prune-tags', '--recurse-submodules=no', '--no-write-fetch-head', '--refmap=', '--', transportAlias, ...refspecs], { timeoutMs: 60_000, env: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'url.' + remote.url + '.insteadOf', GIT_CONFIG_VALUE_0: transportAlias } });
    if (!fetched.ok) return { status: fetched.timedOut ? 'unknown' : 'failed', message: fetched.timedOut ? '获取超时，可能已下载远程内容；请刷新核对，不会自动重试。' : '远程获取未完成，请核对网络、认证和本机远程配置；其他已完成的更新保留。' };
    options.verify();
    const refs = staged();
    const commands: string[] = ['start'];
    for (const ref of refs) {
      if (ref.symbolic || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(ref.hash)) return { status: 'unknown', message: '临时获取记录身份异常，未发布到远程跟踪引用。' };
      const destination = 'refs/remotes/' + ref.name.slice(prefix.length);
      // symbolic-ref also observes dangling refs, which for-each-ref omits.
      let symbolic = false; try { symbolic = !!codeGit(source.location, ['symbolic-ref', '--quiet', destination]).toString().trim(); } catch { /* A normal direct or absent ref is not symbolic. */ }
      if (symbolic) return { status: 'unavailable', message: '远程跟踪目标是符号引用，未更新本地分支或该目标；请核对本机引用。' };
      const old = existing.get(destination)?.hash || '0'.repeat(ref.hash.length);
      commands.push('update ' + destination + ' ' + ref.hash + ' ' + old, 'delete ' + ref.name + ' ' + ref.hash);
    }
    if (refs.length) {
      options.verify();
      const changed = await options.run(source, [...gitOptions, 'update-ref', '--no-deref', '--stdin'], { input: [...commands, 'prepare', 'commit', ''].join('\n'), timeoutMs: 15_000 });
      if (!changed.ok) return { status: changed.timedOut ? 'unknown' : 'failed', message: '远程跟踪引用发布未确认，可能与其他操作冲突；本地分支和工作内容保留，请刷新核对。' };
    }
    return { status: 'succeeded', message: '已更新本机远程跟踪记录。' };
  } catch {
    return { status: 'unknown', message: '获取期间来源或配置发生变化，已发生的效果保留；请刷新核对，不会自动重试。' };
  } finally {
    // Cleanup only refs in this invocation's unique namespace and the same observed checkout.
    try {
      if (sameSource()) {
        const refs = staged();
        if (refs.length) await options.run(source, [...gitOptions, 'update-ref', '--no-deref', '--stdin'], { input: ['start', ...refs.map(ref => 'delete ' + ref.name + (ref.symbolic ? '' : ' ' + ref.hash)), 'prepare', 'commit', ''].join('\n'), timeoutMs: 15_000 });
      }
    } catch { /* Failed cleanup cannot negate a confirmed publication or authorize another repository write. */ }
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* Own empty hook directory only. */ }
  }
}
