import { codeFailure, gitCommonDirectory, type CodeSource } from './code-file-reader.ts';

const operations = new Map<string, symbol>();

/** Serializes this application's writes across all checkouts sharing Git refs. */
export function acquireCodeGitOperation(source: CodeSource): () => void {
  const common = gitCommonDirectory(source.location);
  if (operations.has(common)) throw codeFailure('code_git_operation_in_progress', '该代码库已有 Git 操作进行中，请等待完成后刷新。', 409);
  const token = Symbol(common);
  operations.set(common, token);
  return () => { if (operations.get(common) === token) operations.delete(common); };
}
