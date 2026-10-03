import { isCodeImagePath, readCodeFile } from './code-file-content.ts';
import type { CodeSource } from './code-file-reader.ts';
import { readIndexEntry } from './source-control-git-reader.ts';
import type { CodeChange } from '../domain/source-control.ts';

export type CodeImageFile = Awaited<ReturnType<typeof readCodeFile>>;
export type CodeImagePreview = { before: CodeImageFile | null; after: CodeImageFile | null };

/** The caller owns the checkout/SCM observation before and after this bounded read. */
export async function readSourceControlImages(source:CodeSource,file:CodeChange,baseHash:string|null,commitHash?:string,knownAfter?:CodeImageFile):Promise<CodeImagePreview|null> {
  if (file.status === 'conflicted' || ![file.path, file.previousPath].some(relative => relative && isCodeImagePath(relative))) return null;
  const previousPath = file.previousPath || file.path;
  const historic = (hash:string) => ({ ...source, commitHash:hash, kind:'commit' as const, version:hash+' · 历史文件' });
  const indexed = async (relative:string) => {
    const object = readIndexEntry(source,relative);
    return readCodeFile({ ...source, commitHash:null, version:(source.version.split(' · ')[0] || '')+' · 已暂存版本 · '+object.hash },relative,{indexBlob:object});
  };
  let before:CodeImageFile|null = null, after:CodeImageFile|null = null;
  // Missing sides come from Git's actual change kind, never from swallowing read failures.
  if (file.area !== 'untracked' && file.status !== 'added') {
    before = file.area === 'unstaged' ? await indexed(previousPath) : baseHash ? await readCodeFile(historic(baseHash),previousPath) : null;
  }
  if (file.status !== 'deleted') {
    after = knownAfter || (file.area === 'staged' ? await indexed(file.path) : file.area === 'commit' ? await readCodeFile(historic(commitHash!),file.path) : await readCodeFile(source,file.path));
  }
  return {before,after};
}
