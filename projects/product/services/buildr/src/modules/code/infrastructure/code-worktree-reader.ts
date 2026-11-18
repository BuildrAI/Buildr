import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizeFilesystemPath, sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { observeGitCheckoutReadIdentity, observeGitCheckoutReadIdentityAsync } from '../../../infrastructure/git/checkout-read-identity.ts';
import { codeFailure, codeGit, codeGitAsync, gitCommonDirectory, gitCommonDirectoryAsync } from './code-file-reader.ts';

export type CodeGitWorktree = { worktreeId: string; name: string; location: string; isMain: boolean; isRegistered: boolean; branch: string | null; head: string | null };
export type CodeGitWorktrees = { commonDirectory: string; worktrees: CodeGitWorktree[] };
type CheckoutIdentity = ReturnType<typeof observeGitCheckoutReadIdentity>;
const actualPath = (value:string) => {try{return fs.realpathSync(value);}catch{return path.resolve(value);}};
const actualPathAsync = async (value: string) => { try { return await fs.promises.realpath(value); } catch { return path.resolve(value); } };
const WORKTREE_IDENTITY_CONCURRENCY = 6;

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function unavailableWorktreeId(commonDirectory: string, location: string) {
  // An unavailable Git member remains visible, but this placeholder cannot select a live checkout.
  return 'checkout-' + crypto.createHash('sha256').update(JSON.stringify({ unavailable: true, common: normalizeFilesystemPath(commonDirectory), path: normalizeFilesystemPath(location) })).digest('hex');
}

function parseWorktreeRecord(record: string) {
  const fields = record.split('\0'), declared = fields.find(field => field.startsWith('worktree '))?.slice(9);
  if (!declared || !path.isAbsolute(declared)) throw codeFailure('code_worktree_list_invalid', 'Git 工作树清单包含无效目录。', 409);
  const branch = fields.find(field => field.startsWith('branch '))?.slice(7);
  const head = fields.find(field => field.startsWith('HEAD '))?.slice(5) || null;
  return { declared, branch: branch?.startsWith('refs/heads/') ? branch.slice(11) : null, head };
}

/** Git's registration is the inventory; live identities are shared with the code explorer. */
function observeCodeWorktrees(registeredLocation: string, observedCommonDirectory?: string) {
  const commonDirectory = observedCommonDirectory ?? gitCommonDirectory(registeredLocation);
  const identities = new Map<string, CheckoutIdentity>();
  const records = codeGit(registeredLocation, ['worktree', 'list', '--porcelain', '-z'], 8 * 1024 * 1024).toString('utf8').split('\0\0').filter(Boolean);
  const worktrees = records.map((record, index) => {
    const parsed = parseWorktreeRecord(record);
    const location = actualPath(parsed.declared);
    let worktreeId: string;
    try {
      const identity = observeGitCheckoutReadIdentity(location);
      if (!sameFilesystemPath(identity.commonDirectory, commonDirectory)) throw Error('foreign checkout');
      worktreeId = identity.id;
      identities.set(worktreeId, identity);
    } catch {
      worktreeId = unavailableWorktreeId(commonDirectory, location);
    }
    return { worktreeId, name: path.basename(location) || location, location, isMain: index === 0, isRegistered: sameFilesystemPath(location, registeredLocation), branch: parsed.branch, head: parsed.head };
  });
  return { commonDirectory, worktrees, identities };
}

async function observeCodeWorktreesAsync(registeredLocation: string, observedCommonDirectory?: string) {
  const [commonDirectory, listBuffer] = await Promise.all([
    observedCommonDirectory ? Promise.resolve(observedCommonDirectory) : gitCommonDirectoryAsync(registeredLocation),
    codeGitAsync(registeredLocation, ['worktree', 'list', '--porcelain', '-z'], 8 * 1024 * 1024),
  ]);
  const records = listBuffer.toString('utf8').split('\0\0').filter(Boolean);
  const identities = new Map<string, CheckoutIdentity>();
  const worktrees = await mapConcurrent(records, WORKTREE_IDENTITY_CONCURRENCY, async (record, index) => {
    const parsed = parseWorktreeRecord(record);
    const location = await actualPathAsync(parsed.declared);
    let worktreeId: string;
    try {
      const identity = await observeGitCheckoutReadIdentityAsync(location);
      if (!sameFilesystemPath(identity.commonDirectory, commonDirectory)) throw Error('foreign checkout');
      worktreeId = identity.id;
      identities.set(worktreeId, identity);
    } catch {
      worktreeId = unavailableWorktreeId(commonDirectory, location);
    }
    return { worktreeId, name: path.basename(location) || location, location, isMain: index === 0, isRegistered: sameFilesystemPath(location, registeredLocation), branch: parsed.branch, head: parsed.head };
  });
  return { commonDirectory, worktrees, identities };
}

export function enumerateCodeWorktrees(registeredLocation:string,_repositoryId:string):CodeGitWorktrees {
  const {identities:_,...listing}=observeCodeWorktrees(registeredLocation);
  return listing;
}

export function resolveCodeWorktree(registeredLocation:string,repositoryId:string,worktreeId:string) {
  if(!/^checkout-[a-f0-9]{64}$/.test(worktreeId))throw codeFailure('code_worktree_invalid','工作树身份无效。');
  // The registered checkout is a common action target. Resolve its exact ID
  // before discovering peer identities; peer discovery grows with task count.
  let registered: CheckoutIdentity | undefined;
  try { registered = observeGitCheckoutReadIdentity(registeredLocation); } catch { /* Preserve the full resolver's diagnostics below. */ }
  if (registered?.id === worktreeId) {
    const records = codeGit(registeredLocation, ['worktree', 'list', '--porcelain', '-z'], 8 * 1024 * 1024).toString('utf8').split('\0\0').filter(Boolean);
    const position = records.findIndex(record => record.split('\0').some(field => field.startsWith('worktree ') && sameFilesystemPath(field.slice(9), registered!.root)));
    if (position < 0) throw codeFailure('code_worktree_not_registered', '所选工作树已移除或不属于这个登记代码库，请刷新清单。', 409);
    let closing: CheckoutIdentity;
    try { closing = observeGitCheckoutReadIdentity(registeredLocation); }
    catch { throw codeFailure('code_worktree_unavailable', 'Git 已登记的工作树目录当前不可读取。', 404); }
    if (closing.id !== registered.id) throw codeFailure('code_worktree_identity_changed', '工作树目录已不再属于该代码库，不能读取替代目录。', 409);
    const fields = records[position].split('\0'), branch = fields.find(field => field.startsWith('branch '))?.slice(7);
    return {worktreeId, name:path.basename(closing.root)||closing.root, location:closing.root, isMain:position === 0, isRegistered:true,
      branch:branch?.startsWith('refs/heads/') ? branch.slice(11) : null, head:fields.find(field => field.startsWith('HEAD '))?.slice(5)||null};
  }
  const listing=enumerateCodeWorktrees(registeredLocation,repositoryId),worktree=listing.worktrees.find(worktree=>worktree.worktreeId===worktreeId);
  if(!worktree)throw codeFailure('code_worktree_not_registered','所选工作树已移除或不属于这个登记代码库，请刷新清单。',409);
  let identity:ReturnType<typeof observeGitCheckoutReadIdentity>;
  try{identity=observeGitCheckoutReadIdentity(worktree.location);}catch{throw codeFailure('code_worktree_unavailable','Git 已登记的工作树目录当前不可读取。',404);}
  if(identity.id!==worktreeId||!sameFilesystemPath(identity.commonDirectory,listing.commonDirectory)||!sameFilesystemPath(identity.root,worktree.location))throw codeFailure('code_worktree_identity_changed','工作树目录已不再属于该代码库，不能读取替代目录。',409);
  return {...worktree,location:identity.root};
}

/** One catalog read owns its inventory; only the selected member is re-observed around each status read. */
export function createCodeWorktreeReadSession(registeredLocation: string, _repositoryId: string, options: {reuseInitialIdentity?:boolean; observedCommonDirectory?:string} = {}) {
  const registeredDirectory=fs.statSync(registeredLocation,{bigint:true});
  const {identities,...listing} = observeCodeWorktrees(registeredLocation, options.observedCommonDirectory);
  function resolve(worktreeId: string, fresh = false) {
    const worktree = listing.worktrees.find(member => member.worktreeId === worktreeId);
    if (!worktree) throw codeFailure('code_worktree_not_registered', '所选工作树已移除或不属于这个登记代码库，请刷新清单。', 409);
    let identity: CheckoutIdentity;
    // Enumeration already observed every member before its first status read.
    // Consume that observation once; all closing and later boundaries stay live.
    try { identity = !fresh&&options.reuseInitialIdentity&&identities.has(worktreeId)?identities.get(worktreeId)!:observeGitCheckoutReadIdentity(worktree.location);identities.delete(worktreeId); }
    catch { throw codeFailure('code_worktree_unavailable', 'Git 已登记的工作树目录当前不可读取。', 404); }
    if (identity.id !== worktreeId || !sameFilesystemPath(identity.commonDirectory, listing.commonDirectory) || !sameFilesystemPath(identity.root, worktree.location)) throw codeFailure('code_worktree_identity_changed', '工作树目录已不再属于该代码库，不能读取替代目录。', 409);
    return { ...worktree, location: identity.root };
  }
  function prepareVerification(currentRegisteredLocation: string, worktreeIds: string[]) {
    const currentDirectory=fs.statSync(currentRegisteredLocation,{bigint:true});
    if(currentDirectory.dev!==registeredDirectory.dev||currentDirectory.ino!==registeredDirectory.ino||currentDirectory.birthtimeNs!==registeredDirectory.birthtimeNs)throw codeFailure('code_worktree_identity_changed','读取期间代码库目录身份已变化，请刷新后继续。',409);
    // The selected checkout closes its own Git identity below. When it differs
    // from the registered source, that source's .git may have been redirected.
    if(worktreeIds.some(id => !listing.worktrees.find(member => member.worktreeId === id)?.isRegistered) && !sameFilesystemPath(gitCommonDirectory(currentRegisteredLocation),listing.commonDirectory))throw codeFailure('code_worktree_identity_changed','读取期间代码库 Git 来源已变化，请刷新后继续。',409);
    const fields = codeGit(currentRegisteredLocation, ['worktree', 'list', '--porcelain', '-z'], 8 * 1024 * 1024).toString('utf8').split('\0');
    const locations = fields.filter(field => field.startsWith('worktree ')).map(field => field.slice(9));
    return (worktreeId: string) => {
      const worktree = listing.worktrees.find(member => member.worktreeId === worktreeId);
      if (!worktree || !locations.some(location => sameFilesystemPath(location, worktree.location))) throw codeFailure('code_worktree_not_registered', '所选工作树已移除或不属于这个登记代码库，请刷新清单。', 409);
      resolve(worktreeId, true);
    };
  }
  return { ...listing, resolve, prepareVerification };
}

export async function createCodeWorktreeReadSessionAsync(registeredLocation: string, _repositoryId: string, options: {reuseInitialIdentity?:boolean; observedCommonDirectory?:string} = {}) {
  const [registeredDirectory, observed] = await Promise.all([
    fs.promises.stat(registeredLocation, { bigint: true }),
    observeCodeWorktreesAsync(registeredLocation, options.observedCommonDirectory),
  ]);
  const { identities, ...listing } = observed;
  function resolve(worktreeId: string) {
    const worktree = listing.worktrees.find(member => member.worktreeId === worktreeId);
    if (!worktree) throw codeFailure('code_worktree_not_registered', '所选工作树已移除或不属于这个登记代码库，请刷新清单。', 409);
    let identity: CheckoutIdentity;
    try { identity = options.reuseInitialIdentity && identities.has(worktreeId) ? identities.get(worktreeId)! : observeGitCheckoutReadIdentity(worktree.location); identities.delete(worktreeId); }
    catch { throw codeFailure('code_worktree_unavailable', 'Git 已登记的工作树目录当前不可读取。', 404); }
    if (identity.id !== worktreeId || !sameFilesystemPath(identity.commonDirectory, listing.commonDirectory) || !sameFilesystemPath(identity.root, worktree.location)) throw codeFailure('code_worktree_identity_changed', '工作树目录已不再属于该代码库，不能读取替代目录。', 409);
    return { ...worktree, location: identity.root };
  }
  async function prepareVerificationAsync(currentRegisteredLocation: string, worktreeIds: string[]) {
    const currentDirectory = await fs.promises.stat(currentRegisteredLocation, { bigint: true });
    if (currentDirectory.dev !== registeredDirectory.dev || currentDirectory.ino !== registeredDirectory.ino || currentDirectory.birthtimeNs !== registeredDirectory.birthtimeNs) {
      throw codeFailure('code_worktree_identity_changed', '读取期间代码库目录身份已变化，请刷新后继续。', 409);
    }
    const needsCommonCheck = worktreeIds.some(id => !listing.worktrees.find(member => member.worktreeId === id)?.isRegistered);
    const [currentCommon, listBuffer] = await Promise.all([
      needsCommonCheck ? gitCommonDirectoryAsync(currentRegisteredLocation) : Promise.resolve(listing.commonDirectory),
      codeGitAsync(currentRegisteredLocation, ['worktree', 'list', '--porcelain', '-z'], 8 * 1024 * 1024),
    ]);
    if (needsCommonCheck && !sameFilesystemPath(currentCommon, listing.commonDirectory)) {
      throw codeFailure('code_worktree_identity_changed', '读取期间代码库 Git 来源已变化，请刷新后继续。', 409);
    }
    const fields = listBuffer.toString('utf8').split('\0');
    const locations = fields.filter(field => field.startsWith('worktree ')).map(field => field.slice(9));
    const uniqueTargets = [...new Set(worktreeIds)]
      .map(id => listing.worktrees.find(member => member.worktreeId === id))
      .filter((member): member is CodeGitWorktree => Boolean(member && locations.some(location => sameFilesystemPath(location, member.location))));
    const verified = new Map<string, { identity?: CheckoutIdentity; unavailable?: true }>();
    await mapConcurrent(uniqueTargets, WORKTREE_IDENTITY_CONCURRENCY, async member => {
      try {
        verified.set(member.worktreeId, { identity: await observeGitCheckoutReadIdentityAsync(member.location) });
      } catch {
        verified.set(member.worktreeId, { unavailable: true });
      }
    });
    return (worktreeId: string) => {
      const worktree = listing.worktrees.find(member => member.worktreeId === worktreeId);
      if (!worktree || !locations.some(location => sameFilesystemPath(location, worktree.location))) {
        throw codeFailure('code_worktree_not_registered', '所选工作树已移除或不属于这个登记代码库，请刷新清单。', 409);
      }
      const outcome = verified.get(worktreeId);
      if (!outcome || outcome.unavailable || !outcome.identity) {
        throw codeFailure('code_worktree_unavailable', 'Git 已登记的工作树目录当前不可读取。', 404);
      }
      identities.delete(worktreeId);
      const { identity } = outcome;
      if (identity.id !== worktreeId || !sameFilesystemPath(identity.commonDirectory, listing.commonDirectory) || !sameFilesystemPath(identity.root, worktree.location)) {
        throw codeFailure('code_worktree_identity_changed', '工作树目录已不再属于该代码库，不能读取替代目录。', 409);
      }
    };
  }
  return { ...listing, resolve, prepareVerificationAsync };
}
