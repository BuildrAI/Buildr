import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createRuntime } from '../../../src/bootstrap/runtime.ts';
import {
  GIT_REPOSITORY_CONTEXT_KEY,
  PROJECT_FOUNDATION_CONTEXT_KEY,
  WORKSPACE_FOUNDATION_CONTEXT_KEY,
} from '../profiles.ts';

export {
  GIT_REPOSITORY_CONTEXT_KEY,
  PROJECT_FOUNDATION_CONTEXT_KEY,
  WORKSPACE_FOUNDATION_CONTEXT_KEY,
};

function providerError(provider: any, operation: any, message: any): any  {
  const error: Error & Record<string, any> = new Error(`test_context_prepare_failed: ${provider} failed during ${operation}: ${message}`);
  error.code = 'test_context_prepare_failed';
  error.details = { provider, operation, cause: message };
  return error;
}

function setupOperation(provider: any, operation: any, invoke: any): any  {
  const previousLog: any = console.log;
  console.log = () => {};
  try {
    return invoke();
  } catch (error: any) {
    throw providerError(provider, operation, error.message);
  } finally {
    console.log = previousLog;
  }
}

function runGit(provider: any, operation: any, args: any, cwd: any): any  {
  const result: any = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw providerError(provider, operation, result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`);
  return result.stdout.trim();
}

function assertProviderData(marker: any, expected: any): any  {
  for (const [key, value] of Object.entries(expected)) {
    if (marker.providerData?.[key] !== value) {
      const error: Error & Record<string, any> = new Error(`test_context_provider_data_invalid: ${marker.provider} Context marker is incomplete.`);
      error.code = 'test_context_provider_data_invalid';
      throw error;
    }
  }
}

function assertFile(root: any, relativePath: any, provider: any): any  {
  if (!fs.statSync(path.join(root, relativePath), { throwIfNoEntry: false })?.isFile()) {
    const error: Error & Record<string, any> = new Error(`test_context_provider_data_invalid: ${provider} is missing ${relativePath}.`);
    error.code = 'test_context_provider_data_invalid';
    throw error;
  }
}

export function createWorkspaceFoundationContextProvider({ runtime = createRuntime() }: any = {}): any  {
  return Object.freeze({
    key: WORKSPACE_FOUNDATION_CONTEXT_KEY,
    isolationMode: 'sandbox',
    resetStrategy: 'recreate',
    parallelSafety: 'worker-safe',
    footprints: Object.freeze(['filesystem', 'workspace-lifecycle']),
    prepare({ seedRoot }: any): any  {
      setupOperation(WORKSPACE_FOUNDATION_CONTEXT_KEY, 'workspace.init', () => runtime.initBuildr([
        '--target', seedRoot,
        '--name', 'prepared-workspace',
        '--description', 'Immutable Workspace foundation for tests',
        '--profile', 'team',
      ]));
      return { workspaceInitialized: true };
    },
    inspect({ seedRoot, marker }: any): any  {
      assertProviderData(marker, { workspaceInitialized: true });
      assertFile(seedRoot, '.buildr/workspace.yml', WORKSPACE_FOUNDATION_CONTEXT_KEY);
      assertFile(seedRoot, 'projects/manifest.yml', WORKSPACE_FOUNDATION_CONTEXT_KEY);
    },
  });
}

export function createProjectFoundationContextProvider({ runtime = createRuntime() }: any = {}): any  {
  return Object.freeze({
    key: PROJECT_FOUNDATION_CONTEXT_KEY,
    isolationMode: 'sandbox',
    resetStrategy: 'recreate',
    parallelSafety: 'worker-safe',
    footprints: Object.freeze(['filesystem', 'workspace-lifecycle']),
    prepare({ seedRoot }: any): any  {
      setupOperation(PROJECT_FOUNDATION_CONTEXT_KEY, 'workspace.init', () => runtime.initBuildr([
        '--target', seedRoot,
        '--name', 'prepared-project-workspace',
        '--description', 'Immutable Project foundation for tests',
        '--profile', 'team',
      ]));
      setupOperation(PROJECT_FOUNDATION_CONTEXT_KEY, 'project.create:demo', () => runtime.createProject([
        'demo',
        '--target', seedRoot,
        '--name', 'Demo',
        '--description', 'Prepared Project foundation',
      ]));
      return { workspaceInitialized: true, projectCode: 'demo' };
    },
    inspect({ seedRoot, marker }: any): any  {
      assertProviderData(marker, { workspaceInitialized: true, projectCode: 'demo' });
      assertFile(seedRoot, '.buildr/workspace.yml', PROJECT_FOUNDATION_CONTEXT_KEY);
      assertFile(seedRoot, 'projects/manifest.yml', PROJECT_FOUNDATION_CONTEXT_KEY);
      if (!fs.statSync(path.join(seedRoot, 'projects', 'demo'), { throwIfNoEntry: false })?.isDirectory()) {
        const error: Error & Record<string, any> = new Error(`test_context_provider_data_invalid: ${PROJECT_FOUNDATION_CONTEXT_KEY} is missing Project demo.`);
        error.code = 'test_context_provider_data_invalid';
        throw error;
      }
    },
  });
}

export function createGitRepositoryContextProvider(): any  {
  return Object.freeze({
    key: GIT_REPOSITORY_CONTEXT_KEY,
    isolationMode: 'sandbox',
    resetStrategy: 'recreate',
    parallelSafety: 'worker-safe',
    footprints: Object.freeze(['filesystem', 'git']),
    prepare({ contextRoot, seedRoot }: any): any  {
      const sourceRoot: any = path.join(contextRoot, 'source');
      const repositoryRoot: any = path.join(seedRoot, 'repository.git');
      fs.mkdirSync(sourceRoot);
      runGit(GIT_REPOSITORY_CONTEXT_KEY, 'git.init', ['init', '-b', 'dev'], sourceRoot);
      fs.writeFileSync(path.join(sourceRoot, 'README.md'), '# prepared repository\n');
      runGit(GIT_REPOSITORY_CONTEXT_KEY, 'git.add', ['add', 'README.md'], sourceRoot);
      runGit(GIT_REPOSITORY_CONTEXT_KEY, 'git.commit', ['-c', 'user.name=Buildr Test', '-c', 'user.email=buildr@example.com', 'commit', '-m', 'prepared baseline'], sourceRoot);
      const baselineCommit: any = runGit(GIT_REPOSITORY_CONTEXT_KEY, 'git.rev-parse', ['rev-parse', 'HEAD'], sourceRoot);
      runGit(GIT_REPOSITORY_CONTEXT_KEY, 'git.clone-bare', ['clone', '--bare', sourceRoot, repositoryRoot], contextRoot);
      fs.rmSync(sourceRoot, { recursive: true, force: false });
      return { branch: 'dev', baselineCommit };
    },
    inspect({ seedRoot, marker }: any): any  {
      assertProviderData(marker, { branch: 'dev' });
      const repositoryRoot: any = path.join(seedRoot, 'repository.git');
      assertFile(repositoryRoot, 'HEAD', GIT_REPOSITORY_CONTEXT_KEY);
      const actualCommit: any = runGit(GIT_REPOSITORY_CONTEXT_KEY, 'git.inspect', ['--git-dir', repositoryRoot, 'rev-parse', 'refs/heads/dev'], seedRoot);
      if (actualCommit !== marker.providerData?.baselineCommit) {
        const error: Error & Record<string, any> = new Error(`test_context_provider_data_invalid: ${GIT_REPOSITORY_CONTEXT_KEY} baseline commit changed.`);
        error.code = 'test_context_provider_data_invalid';
        throw error;
      }
    },
    materialize({ context, sandboxRoot }: any): any  {
      fs.cpSync(context.seedRoot, sandboxRoot, { recursive: true });
      const repositoryRoot: any = path.join(sandboxRoot, 'repository.git');
      const attachedRoot: any = path.join(sandboxRoot, 'attached');
      runGit(GIT_REPOSITORY_CONTEXT_KEY, 'git.clone-attached', ['clone', '--branch', 'dev', repositoryRoot, attachedRoot], sandboxRoot);
      runGit(GIT_REPOSITORY_CONTEXT_KEY, 'git.configure-name', ['config', 'user.name', 'Buildr Test'], attachedRoot);
      runGit(GIT_REPOSITORY_CONTEXT_KEY, 'git.configure-email', ['config', 'user.email', 'buildr@example.com'], attachedRoot);
    },
  });
}

export const workspaceFoundationContextProvider: any = createWorkspaceFoundationContextProvider();
export const projectFoundationContextProvider: any = createProjectFoundationContextProvider();
export const gitRepositoryContextProvider: any = createGitRepositoryContextProvider();
