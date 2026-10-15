import { codeGit, type CodeSource } from '../infrastructure/code-file-reader.ts';
import crypto from 'node:crypto';
import { assertCodeRevision } from '../infrastructure/source-control-git-reader.ts';
import { readCodePushSnapshot, type CodePushSnapshot } from '../infrastructure/code-commit-snapshot.ts';
import { runCodeGitMutation } from '../infrastructure/code-git-mutation-runner.ts';
import type { CodeCommitLocation, CodeGitMutationResult } from './code-commit-model.ts';

const safeMessage = (value: string) => value.replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[redacted]@').trim().slice(0, 4000);

export async function pushObservedCodeSource(root: string, input: CodeCommitLocation, observed: CodePushSnapshot, source: (root: string, input: CodeCommitLocation) => CodeSource, run: typeof runCodeGitMutation = runCodeGitMutation): Promise<CodeGitMutationResult['push']> {
  if (!observed.available || !observed.head || !observed.url || !observed.destinationRef) return { status: 'unavailable', target: observed.target, message: observed.reason || '当前没有可核对的推送目标。', retry: null };
  const currentSource = source(root, input), before = readCodePushSnapshot(currentSource);
  assertCodeRevision(before.revision, observed.revision);
  // get-url has already applied insteadOf/pushInsteadOf. Do not rewrite its result again.
  const transportAlias = 'buildr-push-' + crypto.randomUUID() + ':';
  const transportEnv = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'url.' + observed.url + '.insteadOf', GIT_CONFIG_VALUE_0: transportAlias };
  async function updateObservedUpstream() {
    if (!observed.upstreamRef || !observed.upstreamHead) return true;
    try {
      const current = source(root, input);
      assertCodeRevision(readCodePushSnapshot(current).revision, observed.revision);
      let symbolic = false;
      try { symbolic = !!codeGit(current.location, ['symbolic-ref', '--quiet', observed.upstreamRef]).toString().trim(); } catch { /* A direct ref is not symbolic. */ }
      if (symbolic) return false;
      return (await run(current, ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', 'update-ref', '--no-deref', observed.upstreamRef, observed.head!, observed.upstreamHead])).ok;
    } catch { return false; }
  }
  const advertised = await run(currentSource, ['ls-remote', '--refs', '--', transportAlias, observed.destinationRef], { timeoutMs: 15_000, env: transportEnv });
  if (!advertised.ok) return { status: 'failed', target: observed.target, message: safeMessage(advertised.stderr) || '尚无法核对远端分支，未开始推送。', retry: { expectedHead: observed.head, expectedPushRevision: observed.revision } };
  const remoteHead = advertised.stdout.split('\n').find(line => line.split(/\s+/)[1] === observed.destinationRef)?.split(/\s+/)[0] || null;
  assertCodeRevision(readCodePushSnapshot(source(root, input)).revision, observed.revision);
  if (remoteHead === observed.head) {
    const updated = await updateObservedUpstream();
    return { status: 'succeeded', target: observed.target, message: '已核对远端包含当前提交，无需重复推送。' + (updated ? '' : ' 本机上游记录未确认，请刷新核对。'), retry: null };
  }
  if (remoteHead !== observed.upstreamHead) return { status: 'unavailable', target: observed.target, message: '远端分支已变化，未按陈旧范围推送；请同步并重新核对目标。', retry: null };
  const result = await run(currentSource, ['push', '--porcelain', '--no-follow-tags', '--recurse-submodules=no', '--', transportAlias, observed.head + ':' + observed.destinationRef], { timeoutMs: 60_000, env: transportEnv });
  let succeeded = result.ok, remoteConfirmed = result.ok;
  if (!succeeded) {
    const remote = await run(currentSource, ['ls-remote', '--refs', '--', transportAlias, observed.destinationRef], { timeoutMs: 15_000, env: transportEnv });
    remoteConfirmed = remote.ok;
    succeeded = remote.ok && remote.stdout.split('\n').some(line => line.split(/\s+/)[0] === observed.head && line.split(/\s+/)[1] === observed.destinationRef);
  }
  if (succeeded) {
    const updated = await updateObservedUpstream();
    return { status: 'succeeded', target: observed.target, message: '已推送当前分支的全部待推送提交。' + (updated ? '' : ' 本机上游记录未确认，请刷新核对。'), retry: null };
  }
  if (result.timedOut || !remoteConfirmed) return { status: 'unknown', target: observed.target, message: '推送结果尚无法从远端确认；请刷新核对后再决定。', retry: null };
  let retry: CodeGitMutationResult['push']['retry'] = null;
  try { const after = readCodePushSnapshot(source(root, input)); if (after.revision === observed.revision) retry = { expectedHead: observed.head, expectedPushRevision: after.revision }; } catch { /* A changed or unavailable source cannot be retried from this observation. */ }
  return { status: 'failed', target: observed.target, message: safeMessage(result.stderr) || 'Git 未完成推送，已成立的本机提交保留。', retry };
}
