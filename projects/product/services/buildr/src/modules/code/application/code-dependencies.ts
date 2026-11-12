import type { CodeDependencies } from './code-application.ts';

type Workspace = Pick<CodeDependencies, 'assetCatalog' | 'assetCatalogVersion' | 'repositoryCloneStatus' | 'repositoryCloneRequest'>;
type Projects = Pick<CodeDependencies, 'resolveSourceRoot' | 'projectDetail' | 'projectDocumentImageContext'>;
type Worktrees = Pick<CodeDependencies, 'gitWorktreeEvidencePath' | 'gitWorktreeEvidenceDirectories' | 'createGitWorktreeEvidenceReader' | 'readGitWorktreeEvidence'>;
type ReadTask = (root: string, id: string) => {
  record: { taskId: string; title: string; scope: ReturnType<CodeDependencies['readTaskScope']> };
};

export function createCodeDependencies(
  workspace: Workspace,
  projects: Projects,
  readTask: ReadTask,
  worktrees: Worktrees,
  builtinManagedFiles: CodeDependencies['builtinManagedFiles'],
): CodeDependencies {
  return {
    assetCatalog: workspace.assetCatalog,
    assetCatalogVersion: workspace.assetCatalogVersion,
    repositoryCloneStatus: workspace.repositoryCloneStatus,
    repositoryCloneRequest: workspace.repositoryCloneRequest,
    resolveSourceRoot: projects.resolveSourceRoot,
    projectDetail: projects.projectDetail,
    projectDocumentImageContext: projects.projectDocumentImageContext,
    readTaskScope: (root, id) => readTask(root, id).record.scope,
    readTask: (root, id) => {
      const { taskId, title } = readTask(root, id).record;
      return { taskId, title };
    },
    gitWorktreeEvidencePath: worktrees.gitWorktreeEvidencePath,
    gitWorktreeEvidenceDirectories: worktrees.gitWorktreeEvidenceDirectories,
    createGitWorktreeEvidenceReader: worktrees.createGitWorktreeEvidenceReader,
    readGitWorktreeEvidence: worktrees.readGitWorktreeEvidence,
    builtinManagedFiles,
  };
}
