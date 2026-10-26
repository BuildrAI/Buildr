// Each platform-specific check names the actual OS contract and its smallest proof.
// Selection paths are triggers, never a substitute for complete reuse inputs.
export const WINDOWS_PLATFORM_BOUNDARIES = Object.freeze([
  { id: 'command-shim', stepId: 'integration-windows-native',
    dependency: 'Windows cmd.exe, PATHEXT and case-insensitive PATH',
    risk: 'A .cmd/.bat entry cannot start or loses quoted arguments / the selected Node.',
    proof: 'test/integration/windows-boundaries.test.ts: native command shims',
    inputs: ['src/infrastructure/process.ts', 'bin/**', 'tools/development/**'] },
  { id: 'filesystem-identity', stepId: 'integration-windows-native',
    dependency: 'Native Windows realpath, junctions, case-insensitive paths and hard links',
    risk: 'An alias is treated as another owner, or cleanup follows a junction outside its root.',
    proof: 'test/integration/windows-boundaries.test.ts: native directory aliases and exclusive locks',
    inputs: ['src/infrastructure/filesystem/**', 'src/infrastructure/git/**', 'src/modules/task/infrastructure/git-worktree-*.ts'] },
  { id: 'git-path-and-crlf', stepId: 'integration-windows-native',
    dependency: 'Real Git worktrees with Windows case aliases, hard links and core.autocrlf',
    risk: 'The same repository is duplicated or cleanup rejects unchanged CRLF checkout bytes.',
    proof: 'test/e2e/worktree-create.test.ts: 项目与服务共享实际仓库时两种选择顺序均去重，冲突集成引用零效果拒绝',
    inputs: ['src/modules/task/infrastructure/**', 'test/e2e/worktree-create.test.ts'] },
  { id: 'process-cleanup', stepId: 'integration-windows-native',
    dependency: 'Windows taskkill process-tree termination and file/port release',
    risk: 'A failed check leaves a descendant, socket or locked temporary directory alive.',
    proof: 'test/integration/windows-boundaries.test.ts: owned process tree releases resources',
    inputs: ['test/verification/support/owned-process.ts', 'test/verification/support/process-executor.ts', 'src/infrastructure/filesystem/exclusive-file-lock.ts'] },
  { id: 'readonly-handle-proof', stepId: 'integration-windows-native',
    dependency: 'System Windows PowerShell 5.1/.NET, CreateFileW share modes, GetFinalPathNameByHandleW and 128-bit FILE_ID_INFO',
    risk: 'A reparse point, replaced root/leaf or incompatible writer exposes unproved bytes, or a file/root-local failure discards independent reads.',
    proof: 'test/integration/windows-readonly-boundaries.test.ts: actual handles, concurrent junction replacement, writer exclusion, timeout/close and strict Skill source caller',
    inputs: [
      'src/infrastructure/filesystem/verified-readonly-file.ts',
      'src/infrastructure/filesystem/verified-readonly-file-windows.ts',
      'src/infrastructure/filesystem/required-block.ts',
      'src/modules/agent-assets/interfaces/cli/source-inspect.ts',
      'src/modules/agent-assets/persistence/skill-content-repository.ts',
      'src/modules/agent-assets/application/connection-skill-source.ts',
      'src/modules/workspace/persistence/workspace-manifest-repository.ts',
      'src/modules/workspace/persistence/project-manifest-repository.ts',
      'src/modules/task/materials/application/task-project-document-reader.ts',
      'src/modules/openspec/application/change-assets.ts',
      'src/modules/code/infrastructure/code-commit-material.ts',
      'test/helpers/verified-readonly-fixture.ts',
    ] },
  { id: 'installed-launcher', stepId: 'release-tarball-consumption',
    dependency: 'Real Windows npm installation, PowerShell .lnk creation/invocation and product shutdown',
    risk: 'Installed bytes cannot launch, preserve paths with spaces, reach readiness or shut down cleanly.',
    proof: 'test/verification/release/package-consumption.ts --platform-launcher',
    inputs: ['src/modules/installation/**', 'src/web/**', 'test/verification/release/**'] },
]);

export const WINDOWS_SOURCE_BOUNDARY_INPUTS = Object.freeze([...new Set([
  'test/integration/windows-boundaries.test.ts', 'test/integration/windows-readonly-boundaries.test.ts', 'test/verification/platform-boundaries.ts',
  ...WINDOWS_PLATFORM_BOUNDARIES.filter(item => item.stepId === 'integration-windows-native').flatMap(item => item.inputs),
])]);

export const WINDOWS_PLATFORM_REUSE = 'Complete success on actual Windows with matching check inputs and environment; installed checks additionally require identical package bytes. Other OS results never substitute.';

export const MACOS_PLATFORM_BOUNDARIES = Object.freeze([
  { id: 'descriptor-proof', stepId: 'integration-macos-native',
    dependency: 'macOS directory descriptors, O_NOFOLLOW and bounded /usr/sbin/lsof kernel identity queries',
    risk: 'Missing, replaced or untrusted descriptor records expose bytes outside the observed root.',
    proof: 'test/integration/macos-readonly-boundaries.test.ts',
    inputs: ['src/infrastructure/filesystem/verified-readonly-file.ts', 'test/helpers/verified-readonly-fixture.ts'] },
  { id: 'development-shell-entry', stepId: 'integration-macos-native',
    dependency: 'POSIX executable bits, shell wrappers, symbolic Node links and colon-separated PATH',
    risk: 'Development wrappers choose another Node, lose arguments or overwrite the installed Buildr entry.',
    proof: 'test/integration/macos-development-entry.test.ts',
    inputs: ['tools/development/**', 'bin/**', 'src/modules/connection-skills/infrastructure/program.ts'] },
  { id: 'development-launcher-shell', stepId: 'integration-macos-native',
    dependency: 'macOS application shell wrapper and its private helper PATH',
    risk: 'The generated application wrapper loses its selected Node or invokes another helper.',
    proof: 'test/integration/macos-launcher-boundaries.test.ts',
    inputs: ['tools/build/launcher/**', 'tools/development/**', 'src/modules/connection-skills/infrastructure/program.ts'] },
  { id: 'installed-launcher', stepId: 'release-tarball-consumption',
    dependency: 'Real macOS npm installation and /usr/bin/open application invocation',
    risk: 'Installed bytes cannot launch, preserve their binding, reach readiness or shut down cleanly.',
    proof: 'test/verification/release/package-consumption.ts --platform-launcher',
    inputs: ['src/modules/installation/**', 'src/web/**', 'test/verification/release/**'] },
]);

export const MACOS_SOURCE_BOUNDARY_INPUTS = Object.freeze([...new Set([
  'test/integration/macos-*.test.ts', 'test/verification/platform-boundaries.ts',
  ...MACOS_PLATFORM_BOUNDARIES.filter(item => item.stepId === 'integration-macos-native').flatMap(item => item.inputs),
])]);
