import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizeFilesystemPath, sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { observeGitCheckoutReadIdentity } from '../../../infrastructure/git/checkout-read-identity.ts';
import { codeFailure, codeGit, gitCommonDirectory } from './code-file-reader.ts';

export type CodeGitWorktree = { worktreeId: string; name: string; location: string; isMain: boolean; isRegistered: boolean; branch: string | null; head: string | null };
export type CodeGitWorktrees = { commonDirectory: string; worktrees: CodeGitWorktree[] };
type CheckoutIdentity = ReturnType<typeof observeGitCheckoutReadIdentity>;
const actualPath = (value:string) => {try{return fs.realpathSync(value);}catch{return path.resolve(value);}};

/** Git's registration is the inventory; live identities are shared with the code explorer. */
function observeCodeWorktrees(registeredLocation:string) {
  const commonDirectory=gitCommonDirectory(registeredLocation);
  const identities=new Map<string,CheckoutIdentity>();
  const records=codeGit(registeredLocation,['worktree','list','--porcelain','-z'],8*1024*1024).toString('utf8').split('\0\0').filter(Boolean);
  const worktrees=records.map((record,index)=>{
    const fields=record.split('\0'),declared=fields.find(field=>field.startsWith('worktree '))?.slice(9);
    if(!declared||!path.isAbsolute(declared))throw codeFailure('code_worktree_list_invalid','Git 工作树清单包含无效目录。',409);
    const location=actualPath(declared),branch=fields.find(field=>field.startsWith('branch '))?.slice(7),head=fields.find(field=>field.startsWith('HEAD '))?.slice(5)||null;
    let worktreeId:string;
    try {
      const identity=observeGitCheckoutReadIdentity(location);
      if(!sameFilesystemPath(identity.commonDirectory,commonDirectory))throw Error('foreign checkout');
      worktreeId=identity.id;
      identities.set(worktreeId,identity);
    } catch {
      // An unavailable Git member remains visible, but this placeholder cannot select a live checkout.
      worktreeId='checkout-'+crypto.createHash('sha256').update(JSON.stringify({unavailable:true,common:normalizeFilesystemPath(commonDirectory),path:normalizeFilesystemPath(location)})).digest('hex');
    }
    return {worktreeId,name:path.basename(location)||location,location,isMain:index===0,isRegistered:sameFilesystemPath(location,registeredLocation),branch:branch?.startsWith('refs/heads/')?branch.slice(11):null,head};
  });
  return {commonDirectory,worktrees,identities};
}

export function enumerateCodeWorktrees(registeredLocation:string,_repositoryId:string):CodeGitWorktrees {
  const {identities:_,...listing}=observeCodeWorktrees(registeredLocation);
  return listing;
}

export function resolveCodeWorktree(registeredLocation:string,repositoryId:string,worktreeId:string) {
  if(!/^checkout-[a-f0-9]{64}$/.test(worktreeId))throw codeFailure('code_worktree_invalid','工作树身份无效。');
  const listing=enumerateCodeWorktrees(registeredLocation,repositoryId),worktree=listing.worktrees.find(worktree=>worktree.worktreeId===worktreeId);
  if(!worktree)throw codeFailure('code_worktree_not_registered','所选工作树已移除或不属于这个登记代码库，请刷新清单。',409);
  let identity:ReturnType<typeof observeGitCheckoutReadIdentity>;
  try{identity=observeGitCheckoutReadIdentity(worktree.location);}catch{throw codeFailure('code_worktree_unavailable','Git 已登记的工作树目录当前不可读取。',404);}
  if(identity.id!==worktreeId||!sameFilesystemPath(identity.commonDirectory,listing.commonDirectory)||!sameFilesystemPath(identity.root,worktree.location))throw codeFailure('code_worktree_identity_changed','工作树目录已不再属于该代码库，不能读取替代目录。',409);
  return {...worktree,location:identity.root};
}

/** One catalog read owns its inventory; only the selected member is re-observed around each status read. */
export function createCodeWorktreeReadSession(registeredLocation: string, _repositoryId: string, options: {reuseInitialIdentity?:boolean} = {}) {
  const registeredDirectory=fs.statSync(registeredLocation,{bigint:true});
  const {identities,...listing} = observeCodeWorktrees(registeredLocation);
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
  function verify(worktreeId: string, currentRegisteredLocation: string) {
    const worktree = listing.worktrees.find(member => member.worktreeId === worktreeId)!;
    const currentDirectory=fs.statSync(currentRegisteredLocation,{bigint:true});
    if(currentDirectory.dev!==registeredDirectory.dev||currentDirectory.ino!==registeredDirectory.ino||currentDirectory.birthtimeNs!==registeredDirectory.birthtimeNs)throw codeFailure('code_worktree_identity_changed','读取期间代码库目录身份已变化，请刷新后继续。',409);
    // The selected checkout closes its own Git identity below. When it differs
    // from the registered source, that source's .git may have been redirected.
    if(!sameFilesystemPath(currentRegisteredLocation,worktree.location)&&!sameFilesystemPath(gitCommonDirectory(currentRegisteredLocation),listing.commonDirectory))throw codeFailure('code_worktree_identity_changed','读取期间代码库 Git 来源已变化，请刷新后继续。',409);
    const fields = codeGit(currentRegisteredLocation, ['worktree', 'list', '--porcelain', '-z'], 8 * 1024 * 1024).toString('utf8').split('\0');
    if (!fields.some(field => field.startsWith('worktree ') && sameFilesystemPath(field.slice(9), worktree.location))) throw codeFailure('code_worktree_not_registered', '所选工作树已移除或不属于这个登记代码库，请刷新清单。', 409);
    resolve(worktreeId,true);
  }
  return { ...listing, resolve, verify };
}
