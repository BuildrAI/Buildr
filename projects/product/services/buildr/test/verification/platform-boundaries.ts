// Each Windows repeat must name the actual OS contract and its smallest proof.
// Selection paths are triggers, never a substitute for complete reuse inputs.
export const WINDOWS_PLATFORM_BOUNDARIES = Object.freeze([
  { id: 'command-shim', stepId: 'system-windows-platform',
    dependency: 'Windows cmd.exe, PATHEXT and case-insensitive PATH',
    risk: 'A .cmd/.bat entry cannot start or loses quoted arguments / the selected Node.',
    proof: 'test/platform/windows-boundaries.test.ts: native command shims',
    inputs: ['src/infrastructure/process.ts', 'bin/**', 'tools/development/**'] },
  { id: 'filesystem-identity', stepId: 'system-windows-platform',
    dependency: 'Native Windows realpath, junctions, case-insensitive paths and hard links',
    risk: 'An alias is treated as another owner, or cleanup follows a junction outside its root.',
    proof: 'test/platform/windows-boundaries.test.ts: native directory aliases and exclusive locks',
    inputs: ['src/infrastructure/filesystem/**', 'src/infrastructure/git/**', 'src/modules/task/infrastructure/git-worktree-*.ts'] },
  { id: 'git-path-and-crlf', stepId: 'system-windows-platform',
    dependency: 'Real Git worktrees with Windows case aliases, hard links and core.autocrlf',
    risk: 'The same repository is duplicated or cleanup rejects unchanged CRLF checkout bytes.',
    proof: 'test/system/worktree-create.test.ts: 项目与服务共享实际仓库时两种选择顺序均去重，冲突集成引用零效果拒绝',
    inputs: ['src/modules/task/infrastructure/**', 'test/system/worktree-create.test.ts'] },
  { id: 'process-cleanup', stepId: 'system-windows-platform',
    dependency: 'Windows taskkill process-tree termination and file/port release',
    risk: 'A failed check leaves a descendant, socket or locked temporary directory alive.',
    proof: 'test/platform/windows-boundaries.test.ts: owned process tree releases resources',
    inputs: ['test/verification/support/owned-process.ts', 'test/verification/support/process-executor.ts', 'src/infrastructure/filesystem/exclusive-file-lock.ts'] },
  { id: 'installed-launcher', stepId: 'release-tarball-smoke',
    dependency: 'Real Windows npm installation, PowerShell .lnk creation/invocation and product shutdown',
    risk: 'Installed bytes cannot launch, preserve paths with spaces, reach readiness or shut down cleanly.',
    proof: 'test/verification/release/release-smoke.ts --platform-launcher',
    inputs: ['src/modules/installation/**', 'src/web/**', 'test/verification/release/**'] },
]);

export const WINDOWS_SOURCE_BOUNDARY_INPUTS = Object.freeze([...new Set([
  'test/platform/windows-boundaries.test.ts', 'test/verification/platform-boundaries.ts',
  ...WINDOWS_PLATFORM_BOUNDARIES.filter(item => item.stepId === 'system-windows-platform').flatMap(item => item.inputs),
])]);

export const WINDOWS_PLATFORM_REUSE = 'Complete success on actual Windows with matching check inputs and environment; installed checks additionally require identical package bytes. Other OS results never substitute.';
